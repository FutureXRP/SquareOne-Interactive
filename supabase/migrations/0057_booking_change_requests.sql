-- 0057: a customer's change to their booking is a REQUEST until an admin
-- approves it.
--
-- Until now "Move" in My bookings moved the booking on the spot, and the
-- rental agreement's room/extras checkboxes changed nothing at all. Now
-- both file a change request: the booking stays exactly as it was, the
-- customer hears "your request has been submitted and will be reviewed",
-- and an owner, admin, or manager approves or declines it. Approving
-- applies the whole change in one transaction — new time, new rooms (the
-- lead room and its linked companions), new extras — and the database's
-- no-overlap rules refuse it if anything is no longer free. Either way the
-- customer gets a second email with the answer.
--
-- Staff changes still apply directly; cancellations still take effect
-- immediately.
-- Run after 0056_booking_change_log.sql.

create table booking_change_requests (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references bookings(id) on delete cascade,
  created_at timestamptz not null default now(),
  -- 'reschedule' (My bookings → Move) | 'agreement' (rooms/extras on the agreement)
  source text not null check (source in ('reschedule', 'agreement')),
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined', 'withdrawn')),
  requested_by uuid,
  -- What it was when asked, and what's asked for. A null "new_" means
  -- that part isn't being changed.
  old_during tstzrange,
  new_during tstzrange,
  old_room_ids text[],
  new_room_ids text[],
  old_addon_ids text[],
  new_addon_ids text[],
  customer_note text,
  decided_at timestamptz,
  decided_by uuid references staff(id) on delete set null,
  decision_note text,
  -- Emails: the "received" pair (customer + staff), then the answer.
  alerted_at timestamptz,
  decision_emailed_at timestamptz
);
create index booking_change_requests_booking_idx on booking_change_requests (booking_id, created_at desc);
create index booking_change_requests_pending_idx on booking_change_requests (created_at) where status = 'pending';

alter table booking_change_requests enable row level security;
create policy "staff read change requests" on booking_change_requests for select using (is_staff());
create policy "member read own change requests" on booking_change_requests for select
  using (booking_id in (select id from bookings where account_id in (select my_account_ids())));

-- Who may say yes or no: owners, admins, managers.
create or replace function can_decide_changes()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from staff where user_id = auth.uid() and active and role in ('owner', 'admin', 'manager'));
$$;

-- The rooms a booking holds right now: its own and its live companions.
create or replace function booking_room_ids(p_booking uuid)
returns text[] language sql stable security definer set search_path = public as $$
  select array(
    select facility_id from bookings where id = p_booking
    union
    select facility_id from bookings where lead_booking_id = p_booking and status in ('hold', 'confirmed')
  );
$$;

-- Which of these rooms are taken in this window by someone else (the
-- booking and its own companions don't count against themselves).
create or replace function booking_group_conflicts(p_booking uuid, p_during tstzrange, p_rooms text[])
returns text[] language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(distinct x.facility_id), '{}')
    from bookings x
    join facilities f on f.id = any(p_rooms) and f.id = x.facility_id
   where x.status in ('hold', 'confirmed')
     and x.id <> p_booking
     and (x.lead_booking_id is distinct from p_booking)
     and booking_block(x.during, x.setup_min, x.cleanup_min)
         && booking_block(p_during, coalesce(f.setup_min, 0), coalesce(f.cleanup_min, 0));
$$;
grant execute on function booking_group_conflicts(uuid, tstzrange, text[]) to authenticated;

-- My bookings → Move now files a request instead of moving anything. Same
-- checks as before (theirs, still movable, notice window), plus an honest
-- availability check so they aren't told "submitted" for a time that's
-- already gone. A newer request replaces their older pending one.
create or replace function member_reschedule_booking(p_id uuid, p_from timestamptz, p_to timestamptz)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_account uuid;
  v_status booking_status;
  v_facility text;
  v_during tstzrange;
  v_notice int;
  v_rooms text[];
  v_taken text[];
begin
  select account_id, status, facility_id, during into v_account, v_status, v_facility, v_during
    from bookings where id = p_id;
  if v_account is null or v_account not in (select my_account_ids()) then
    raise exception 'not your booking' using errcode = '42501';
  end if;
  if v_status in ('completed', 'canceled') then
    raise exception 'that booking can no longer be moved' using errcode = '22023';
  end if;
  if p_to <= p_from then
    raise exception 'end must come after start' using errcode = '22023';
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

-- Yes: apply everything asked for, atomically. Any room or extra that is
-- no longer free raises, and nothing changes.
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

  -- Time first: companions follow the lead (0055).
  if r.new_during is not null and r.new_during is distinct from b.during then
    update bookings set during = r.new_during where id = b.id;
  end if;

  -- Rooms: the lead keeps its room if it's still wanted; otherwise it
  -- takes the first room asked for. Then companions are added/released
  -- so the booking holds exactly the rooms asked for.
  if r.new_room_ids is not null and array_length(r.new_room_ids, 1) > 0 then
    v_rooms := r.new_room_ids;
    v_lead_room := case when b.facility_id = any(v_rooms) then b.facility_id else v_rooms[1] end;
    -- Release companions no longer wanted, or about to become the lead's room.
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
        select org_id, v_room, account_id, title, client_name, during, 'confirmed', 0, v_staff, now(), id,
               'Companion room — part of ' || code || ', priced on that booking.'
          from bookings where id = b.id;
      end if;
    end loop;
  end if;

  if r.new_addon_ids is not null then
    update bookings set addon_ids = r.new_addon_ids where id = b.id;
  end if;

  update bookings set approved_at = coalesce(approved_at, now()), approved_by = coalesce(approved_by, v_staff)
   where id = b.id;
  update booking_change_requests
     set status = 'approved', decided_at = now(), decided_by = v_staff, decision_note = nullif(trim(p_note), '')
   where id = r.id;
  return true;
end $$;
grant execute on function approve_booking_change(uuid, text) to authenticated;

create or replace function decline_booking_change(p_request uuid, p_note text default null)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_staff uuid;
begin
  if not can_decide_changes() then
    raise exception 'only an owner, admin, or manager can decline changes' using errcode = '42501';
  end if;
  select id into v_staff from staff where user_id = auth.uid() and active limit 1;
  update booking_change_requests
     set status = 'declined', decided_at = now(), decided_by = v_staff, decision_note = nullif(trim(p_note), '')
   where id = p_request and status = 'pending';
  if not found then
    raise exception 'that request has already been answered' using errcode = '22023';
  end if;
  return true;
end $$;
grant execute on function decline_booking_change(uuid, text) to authenticated;

-- A canceled booking has nothing left to change.
create or replace function bookings_withdraw_requests()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'canceled' and old.status is distinct from 'canceled' then
    update booking_change_requests set status = 'withdrawn', decided_at = now()
     where booking_id = new.id and status = 'pending';
  end if;
  return new;
end $$;
create trigger bookings_withdraw_requests after update of status on bookings
  for each row execute function bookings_withdraw_requests();
