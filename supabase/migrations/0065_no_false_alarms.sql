-- 0065: no false alarms, nothing changed behind anyone's back (audit).
--
-- An admin was being emailed change requests customers said they never
-- made. The rental-agreement and "new time" fixes for that are in the app;
-- this closes the database side of the same audit:
--
--  1. Standing reservations: the hourly job re-booked a week that staff
--     had canceled (a holiday) or moved. Each occurrence now remembers its
--     date, and a date that already has an occurrence — in any state,
--     canceled or moved included — is never booked again by the job.
--  2. Reinstating a booking brings back only the extra rooms that were
--     canceled together with it, never a room an approved change dropped.
--  3. Approving a change request is refused if the booking's rooms or
--     add-ons changed since it was asked (it already was for the time), so
--     an old request can't quietly undo a staff edit.
--  4. "Request a new time" for the time the booking already has is
--     refused, and asking for the same new time twice files it once.
--  5. A booking a staff member places — even through the public store —
--     is not a customer request: it's approved as it's made, so it never
--     sends "a customer booked — needs approval".
--  6. Reports whether the duplicate-payment guard from 0060 is in place.
-- Run after 0064_card_required_to_request.sql.

-- ── 1 ─────────────────────────────────────────────────────────
alter table bookings add column if not exists standing_on date;

create or replace function standing_book_range(p_id uuid, p_from date, p_through date)
returns table (created int, blocked int, blocked_on date[])
language plpgsql security definer set search_path = public as $$
declare
  r standing_reservations%rowtype;
  v_setup int;
  v_cleanup int;
  d date;
  v_from timestamptz;
  v_to timestamptz;
  v_created int := 0;
  v_blocked int := 0;
  v_blocked_dates date[] := '{}';
begin
  select * into r from standing_reservations where id = p_id;
  if not found or not r.active then
    return query select 0, 0, '{}'::date[];
    return;
  end if;
  select coalesce(setup_min, 0), coalesce(cleanup_min, 0) into v_setup, v_cleanup
    from facilities where id = r.facility_id;

  for d in select * from standing_dates_all(p_id, p_from, p_through) loop
    -- This date already has its occurrence — booked, moved, or canceled
    -- on purpose. Leave it exactly as staff left it.
    if exists (
      select 1 from bookings
       where standing_id = p_id
         and (standing_on = d
              or (standing_on is null and (lower(during) at time zone 'America/Chicago')::date = d))
    ) then
      continue;
    end if;

    v_from := (d + make_interval(mins => round(r.start_h * 60)::int)) at time zone 'America/Chicago';
    v_to := v_from + make_interval(mins => round(r.hours * 60)::int);

    begin
      insert into bookings (
        org_id, facility_id, title, client_name, during, status,
        price_cents, standing_id, standing_on, approved_at, note, setup_min, cleanup_min
      ) values (
        r.org_id, r.facility_id, r.title,
        coalesce(nullif(r.group_name, ''), r.title),
        tstzrange(v_from, v_to, '[)'), 'confirmed',
        r.price_cents, r.id, d, now(),
        'Standing reservation', v_setup, v_cleanup
      );
      v_created := v_created + 1;
    exception when exclusion_violation then
      v_blocked := v_blocked + 1;
      v_blocked_dates := array_append(v_blocked_dates, d);
    end;
  end loop;

  return query select v_created, v_blocked, v_blocked_dates;
end $$;
revoke execute on function standing_book_range(uuid, date, date) from public, anon, authenticated;

-- Existing occurrences remember the date they were booked for (where it
-- can still be told — one already moved to another day keeps its new one).
update bookings set standing_on = (lower(during) at time zone 'America/Chicago')::date
 where standing_id is not null and standing_on is null;

-- ── 2 ─────────────────────────────────────────────────────────
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
  if new.approved_at is distinct from old.approved_at then
    update bookings set approved_at = new.approved_at, approved_by = new.approved_by
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
    elsif new.status in ('hold', 'confirmed') and old.status in ('hold', 'confirmed') then
      update bookings set status = new.status
       where lead_booking_id = new.id and status in ('hold', 'confirmed');
    elsif old.status = 'canceled' and new.status in ('hold', 'confirmed') then
      update bookings
         set status = new.status, during = new.during,
             canceled_at = null, canceled_via = null, canceled_by = null
       where lead_booking_id = new.id and status = 'canceled'
         -- only the rooms canceled WITH it — never a room dropped earlier
         -- by an approved change, which would come back unasked.
         and canceled_at is not distinct from old.canceled_at;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists bookings_sync_companions on bookings;
create trigger bookings_sync_companions after update of during, status, approved_at on bookings
  for each row execute function bookings_sync_companions();

-- ── 3 ─────────────────────────────────────────────────────────
create or replace function approve_booking_change(p_request uuid, p_note text default null)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  r booking_change_requests%rowtype;
  b bookings%rowtype;
  v_staff uuid;
  v_rooms text[];
  v_lead_room text;
  v_room text;
  v_now_rooms text[];
begin
  if not can_decide_changes() then
    raise exception 'only an owner, admin, or manager can approve changes' using errcode = '42501';
  end if;
  select id into v_staff from staff where user_id = auth.uid() and active limit 1;
  select * into r from booking_change_requests where id = p_request for update;
  if not found or r.status <> 'pending' then
    raise exception 'that request has already been answered' using errcode = '22023';
  end if;
  select * into b from bookings where id = r.booking_id for update;
  if b.status not in ('hold', 'confirmed') then
    raise exception 'that booking is no longer active' using errcode = '22023';
  end if;
  -- The request was made against the booking as it was then. If staff
  -- have moved it since, approving would undo their change.
  if r.old_during is not null and r.old_during is distinct from b.during then
    raise exception 'the booking has changed since this request — decline it and talk with the customer'
      using errcode = '22023';
  end if;
  -- The same for rooms and add-ons: approving an older request must never
  -- quietly undo a change staff made since.
  if r.new_room_ids is not null and r.old_room_ids is not null then
    v_now_rooms := booking_room_ids(b.id);
    if not (v_now_rooms @> r.old_room_ids and r.old_room_ids @> v_now_rooms) then
      raise exception 'the booking''s rooms have changed since this request — decline it and talk with the customer'
        using errcode = '22023';
    end if;
  end if;
  if r.new_addon_ids is not null and r.old_addon_ids is not null
     and not (coalesce(b.addon_ids, '{}') @> r.old_addon_ids and r.old_addon_ids @> coalesce(b.addon_ids, '{}')) then
    raise exception 'the booking''s add-ons have changed since this request — decline it and talk with the customer'
      using errcode = '22023';
  end if;

  if r.new_during is not null and r.new_during is distinct from b.during then
    update bookings set during = r.new_during where id = b.id;
  end if;

  if r.new_room_ids is not null and array_length(r.new_room_ids, 1) > 0 then
    v_rooms := r.new_room_ids;
    v_lead_room := case when b.facility_id = any(v_rooms) then b.facility_id else v_rooms[1] end;
    update bookings set status = 'canceled', canceled_at = now(), canceled_via = 'staff', canceled_by = v_staff
     where lead_booking_id = b.id and status in ('hold', 'confirmed')
       and (not (facility_id = any(v_rooms)) or facility_id = v_lead_room);
    if v_lead_room <> b.facility_id then
      update bookings
         set facility_id = v_lead_room,
             setup_min = coalesce((select setup_min from facilities where id = v_lead_room), 0),
             cleanup_min = coalesce((select cleanup_min from facilities where id = v_lead_room), 0)
       where id = b.id;
    end if;
    foreach v_room in array v_rooms loop
      if v_room <> v_lead_room and not exists (
        select 1 from bookings where lead_booking_id = b.id and facility_id = v_room and status in ('hold', 'confirmed')
      ) then
        insert into bookings (org_id, facility_id, account_id, title, client_name, during, status,
                              price_cents, created_by, approved_at, lead_booking_id, note)
        select org_id, v_room, account_id, title, client_name, during, status, 0, v_staff, approved_at, id,
               'Companion room — part of ' || code || ', priced on that booking.'
          from bookings where id = b.id;
      end if;
    end loop;
  end if;

  if r.new_addon_ids is not null then
    update bookings set addon_ids = r.new_addon_ids where id = b.id;
  end if;

  update booking_change_requests
     set status = 'approved', decided_at = now(), decided_by = v_staff, decision_note = nullif(trim(p_note), '')
   where id = r.id;
  return true;
end $$;
grant execute on function approve_booking_change(uuid, text) to authenticated;

-- ── 4 ─────────────────────────────────────────────────────────
create or replace function member_reschedule_booking(p_id uuid, p_from timestamptz, p_to timestamptz)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_account uuid;
  v_status booking_status;
  v_facility text;
  v_during tstzrange;
  v_lead uuid;
  v_notice int;
  v_rooms text[];
  v_taken text[];
begin
  select account_id, status, facility_id, during, lead_booking_id
    into v_account, v_status, v_facility, v_during, v_lead
    from bookings where id = p_id;
  if v_account is null or v_account not in (select my_account_ids()) then
    raise exception 'not your booking' using errcode = '42501';
  end if;
  if v_lead is not null then
    raise exception 'that room is part of another booking — move that booking instead' using errcode = '22023';
  end if;
  if v_status in ('completed', 'canceled') then
    raise exception 'that booking can no longer be moved' using errcode = '22023';
  end if;
  -- Asking for the time it already has is no request at all.
  if tstzrange(p_from, p_to, '[)') = v_during then
    raise exception 'that is already your booking''s time — pick a different date, start, or length'
      using errcode = '22023';
  end if;
  -- The same new time already waiting (a double click, a retry) — nothing
  -- new to file or announce.
  if exists (select 1 from booking_change_requests
              where booking_id = p_id and status = 'pending' and source = 'reschedule'
                and new_during = tstzrange(p_from, p_to, '[)')) then
    return true;
  end if;
  if p_to <= p_from then
    raise exception 'end must come after start' using errcode = '22023';
  end if;
  if extract(epoch from (p_to - p_from)) / 3600 > 12 then
    raise exception 'bookings run up to 12 hours' using errcode = '22023';
  end if;
  select coalesce(min_notice_hours, 48) into v_notice from facilities where id = v_facility;
  if p_from < now() + make_interval(hours => coalesce(v_notice, 48)) then
    raise exception 'that time is inside the % hour notice window', coalesce(v_notice, 48)
      using errcode = '22023';
  end if;

  v_rooms := booking_room_ids(p_id);
  v_taken := booking_group_conflicts(p_id, tstzrange(p_from, p_to, '[)'), v_rooms);
  if array_length(v_taken, 1) > 0 then
    raise exception 'conflict: % already booked at that time', array_to_string(v_taken, ', ')
      using errcode = '23P01';
  end if;

  update booking_change_requests set status = 'withdrawn', decided_at = now()
   where booking_id = p_id and status = 'pending' and source = 'reschedule';
  insert into booking_change_requests (booking_id, source, requested_by, old_during, new_during, old_room_ids)
  values (p_id, 'reschedule', auth.uid(), v_during, tstzrange(p_from, p_to, '[)'), v_rooms);
  return true;
end $$;
grant execute on function member_reschedule_booking(uuid, timestamptz, timestamptz) to authenticated;

-- ── 5 ─────────────────────────────────────────────────────────
create or replace function bookings_staff_approved()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_staff uuid;
begin
  if new.approved_at is null and new.lead_booking_id is null and pg_trigger_depth() <= 1
     and auth.uid() is not null and coalesce(auth.role(), '') <> 'service_role' and is_staff() then
    select id into v_staff from staff where user_id = auth.uid() and active limit 1;
    new.approved_at := now();
    new.approved_by := coalesce(new.approved_by, v_staff);
  end if;
  return new;
end $$;
drop trigger if exists bookings_staff_approved on bookings;
create trigger bookings_staff_approved before insert on bookings
  for each row execute function bookings_staff_approved();

-- ── 6 ─────────────────────────────────────────────────────────
select case when exists (select 1 from pg_indexes where indexname = 'payments_stripe_ref_unique')
            then 'OK — duplicate Stripe payments are blocked'
            else 'ATTENTION — duplicate Stripe payment rows exist; tell Claude so they can be cleaned up'
       end as payment_guard;
