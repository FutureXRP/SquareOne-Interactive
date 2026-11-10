-- 0055: no room can be double-booked, whichever way the booking is made.
--
-- The no-overlap constraint has always guarded one room per booking row.
-- What slipped through was the second, third, … room of a booking that
-- spans several:
--
--   * A party package (gym + gaming room) only ever booked its FIRST room,
--     online and at the desk — the gym was never checked or held.
--   * "Also hold these rooms" companions weren't linked to their lead
--     booking: moving the lead left them behind (the new time sat open in
--     those rooms), and canceling it left them blocking for nothing.
--   * Package requests skipped the room's setup/cleanup buffer.
--   * Calendar events from before 0046 — or whose room hold failed —
--     held no room at all.
--
-- The fix lives in the database, so no screen has to remember it:
--
--   1. bookings.lead_booking_id links a companion room to its lead.
--   2. Inserting a booking that carries a package books every other room
--      in that package as a linked companion, in the same transaction —
--      if any one of them is taken, the whole booking is refused.
--   3. Moving, canceling, completing, or reinstating a lead does the same
--      to its companions, in the same statement. A move that would land a
--      companion on someone else's time is refused as a whole.
--   4. A booking inserted with no setup/cleanup gets its room's buffers.
--   5. Existing companions are linked, existing future package bookings
--      get their missing rooms, and future calendar events that name a
--      room get their hold — wherever the room is still free.
--
-- The last statement lists anything that is ALREADY double-booked and
-- couldn't be fixed automatically: a person needs to call those customers.
-- Run after 0054_hold_deadline_booking_waivers.sql.

alter table bookings add column lead_booking_id uuid references bookings(id) on delete cascade;
create index bookings_lead_idx on bookings (lead_booking_id);

-- ── 4. Room buffers on every insert ──────────────────────────
create or replace function bookings_default_buffers()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if coalesce(new.setup_min, 0) = 0 and coalesce(new.cleanup_min, 0) = 0 then
    select coalesce(f.setup_min, 0), coalesce(f.cleanup_min, 0)
      into new.setup_min, new.cleanup_min
      from facilities f where f.id = new.facility_id;
    new.setup_min := coalesce(new.setup_min, 0);
    new.cleanup_min := coalesce(new.cleanup_min, 0);
  end if;
  return new;
end $$;
create trigger bookings_default_buffers before insert on bookings
  for each row execute function bookings_default_buffers();

-- ── 2. A package books all of its rooms ──────────────────────
-- Security definer: a member's own insert is limited to holds on their
-- account, but the companion rows are the house's to write.
create or replace function bookings_package_rooms()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.package_id is null or new.lead_booking_id is not null
     or new.status not in ('hold', 'confirmed') then
    return new;
  end if;
  insert into bookings (org_id, facility_id, account_id, title, client_name, during, status,
                        price_cents, created_by, approved_at, lead_booking_id, note)
  select new.org_id, r.facility_id, new.account_id, new.title, new.client_name, new.during,
         'confirmed', 0, new.created_by, coalesce(new.approved_at, now()), new.id,
         'Package room — part of ' || new.code || ', priced on that booking.'
    from event_package_rooms r
   where r.package_id = new.package_id
     and r.facility_id <> new.facility_id
     and not exists (select 1 from bookings c where c.lead_booking_id = new.id and c.facility_id = r.facility_id);
  return new;
end $$;
create trigger bookings_package_rooms after insert on bookings
  for each row execute function bookings_package_rooms();

-- ── 3. Companions follow their lead ──────────────────────────
create or replace function bookings_sync_companions()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.lead_booking_id is not null then
    return new;
  end if;
  if new.during is distinct from old.during then
    update bookings set during = new.during
     where lead_booking_id = new.id and status in ('hold', 'confirmed');
  end if;
  if new.status is distinct from old.status then
    if new.status = 'canceled' then
      update bookings
         set status = 'canceled', canceled_at = coalesce(new.canceled_at, now()),
             canceled_via = new.canceled_via, canceled_by = new.canceled_by
       where lead_booking_id = new.id and status in ('hold', 'confirmed');
    elsif new.status = 'completed' then
      update bookings set status = 'completed'
       where lead_booking_id = new.id and status in ('hold', 'confirmed');
    elsif old.status = 'canceled' and new.status in ('hold', 'confirmed') then
      -- Reinstated: its rooms come back too, at the lead's time (and the
      -- constraint refuses it if somebody has taken them since).
      update bookings
         set status = 'confirmed', during = new.during,
             canceled_at = null, canceled_via = null, canceled_by = null
       where lead_booking_id = new.id and status = 'canceled';
    end if;
  end if;
  return new;
end $$;
create trigger bookings_sync_companions after update of during, status on bookings
  for each row execute function bookings_sync_companions();

-- ── 5. Backfill ──────────────────────────────────────────────
create temp table double_booked (
  problem text, booking text, customer text, room text, starts timestamptz, detail text
) on commit preserve rows;

-- Companions made by "Also hold these rooms" carry their lead's code in
-- the note; link them.
update bookings c
   set lead_booking_id = l.id
  from bookings l
 where c.lead_booking_id is null
   and c.price_cents = 0
   and c.note like 'Companion room hold — priced on %'
   and l.code = trim(trailing '.' from substring(c.note from 'priced on (.*)$'))
   and l.id <> c.id;

-- Companions of a canceled lead were left blocking; release them.
update bookings c
   set status = 'canceled', canceled_at = coalesce(l.canceled_at, now()), canceled_via = l.canceled_via
  from bookings l
 where c.lead_booking_id = l.id
   and l.status = 'canceled' and c.status in ('hold', 'confirmed');

-- A companion that sits at a different time than its lead (the lead was
-- moved): move it along, or report it.
do $$
declare r record;
begin
  for r in
    select c.id, c.during as c_during, l.during as l_during, l.code, l.client_name, c.facility_id
      from bookings c join bookings l on l.id = c.lead_booking_id
     where c.status in ('hold', 'confirmed') and l.status in ('hold', 'confirmed')
       and c.during <> l.during and upper(l.during) > now()
  loop
    begin
      update bookings set during = r.l_during where id = r.id;
    exception when exclusion_violation then
      insert into double_booked values ('Lead booking was moved; its extra room is taken at the new time',
        r.code, r.client_name, r.facility_id, lower(r.l_during), 'Extra room left at its old time');
    end;
  end loop;
end $$;

-- Future package bookings that never got their other rooms.
do $$
declare
  b record;
  r record;
begin
  for b in
    select * from bookings
     where package_id is not null and lead_booking_id is null
       and status in ('hold', 'confirmed') and upper(during) > now()
  loop
    for r in
      select pr.facility_id from event_package_rooms pr
       where pr.package_id = b.package_id and pr.facility_id <> b.facility_id
         and not exists (select 1 from bookings c where c.lead_booking_id = b.id and c.facility_id = pr.facility_id)
    loop
      begin
        insert into bookings (org_id, facility_id, account_id, title, client_name, during, status,
                              price_cents, created_by, approved_at, lead_booking_id, note)
        values (b.org_id, r.facility_id, b.account_id, b.title, b.client_name, b.during, 'confirmed',
                0, b.created_by, coalesce(b.approved_at, now()), b.id,
                'Package room — part of ' || b.code || ', priced on that booking.');
      exception when exclusion_violation then
        insert into double_booked
          select 'Package room already taken', b.code, b.client_name, r.facility_id, lower(b.during),
                 coalesce((select string_agg(x.code || ' ' || x.title || ' (' || x.client_name || ')', '; ')
                             from bookings x
                            where x.facility_id = r.facility_id and x.status in ('hold', 'confirmed')
                              and booking_block(x.during, x.setup_min, x.cleanup_min) && b.during), 'another booking');
      end;
    end loop;
  end loop;
end $$;

-- Future calendar events that name a room but hold nothing.
do $$
declare
  e record;
  v_id uuid;
begin
  for e in
    select * from staff_events
     where facility_id is not null and hold_booking_id is null
       and status = 'scheduled' and ends_at > now()
  loop
    begin
      insert into bookings (org_id, facility_id, title, client_name, during, status, price_cents,
                            created_by, approved_at, note)
      values (e.org_id, e.facility_id, initcap(e.kind) || ' (room held)',
              coalesce(nullif(e.guest_name, ''), 'SquareOne staff'),
              tstzrange(e.starts_at, e.ends_at, '[)'), 'confirmed', 0, e.created_by, now(),
              'Room held for a scheduled ' || e.kind || ' on the Calendar')
      returning id into v_id;
      update staff_events set hold_booking_id = v_id where id = e.id;
    exception when exclusion_violation then
      insert into double_booked
        select 'Calendar event overlaps a booking', e.title, coalesce(nullif(e.guest_name, ''), '—'),
               e.facility_id, e.starts_at,
               coalesce((select string_agg(x.code || ' ' || x.title || ' (' || x.client_name || ')', '; ')
                           from bookings x
                          where x.facility_id = e.facility_id and x.status in ('hold', 'confirmed')
                            and booking_block(x.during, x.setup_min, x.cleanup_min) && tstzrange(e.starts_at, e.ends_at)), 'a booking');
    end;
  end loop;
end $$;

-- What still needs a person: empty means nothing is double-booked.
select problem, booking, customer, room,
       to_char(starts at time zone 'America/Chicago', 'Dy Mon DD, HH12:MI AM') as starts,
       detail as conflicts_with
  from double_booked order by starts;
