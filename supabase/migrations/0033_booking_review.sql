-- ── Reservations in review + member self-service ─────────────
-- Every booking now waits for a person to confirm it. approved_at is the
-- staff sign-off; until it's set, the customer sees "reservation in
-- review" no matter what they've paid. Payment still stops the 24-hour
-- hold expiry, so a paid reservation never quietly disappears while it
-- waits on us.
--
-- Members also get to cancel and move their own bookings. That happens
-- through functions rather than a write policy, so a customer can change
-- the time but never the price, the room, or someone else's booking.
-- Run after 0032_tours_events.sql.

alter table bookings add column approved_at timestamptz;
alter table bookings add column approved_by uuid references staff(id) on delete set null;
create index bookings_in_review_idx on bookings (created_at) where approved_at is null;

-- Anything already confirmed was, in practice, approved when it was made.
update bookings set approved_at = created_at
  where status in ('confirmed', 'completed') and approved_at is null;

-- ── Member self-service ──────────────────────────────────────

-- Cancel my own booking. Staff handle any refund separately, so this
-- only changes the calendar.
create or replace function member_cancel_booking(p_id uuid)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_account uuid;
  v_status booking_status;
begin
  select account_id, status into v_account, v_status from bookings where id = p_id;
  if v_account is null or v_account not in (select my_account_ids()) then
    raise exception 'not your booking' using errcode = '42501';
  end if;
  if v_status = 'completed' then
    raise exception 'that booking already happened' using errcode = '22023';
  end if;
  update bookings set status = 'canceled' where id = p_id;
  return true;
end $$;
grant execute on function member_cancel_booking(uuid) to authenticated;

-- Move my own booking. The room's notice window still applies, the
-- exclusion constraint still blocks double-booking, and the move sends
-- it back into review because the new time needs a person to agree.
create or replace function member_reschedule_booking(p_id uuid, p_from timestamptz, p_to timestamptz)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_account uuid;
  v_status booking_status;
  v_facility text;
  v_notice int;
begin
  select account_id, status, facility_id into v_account, v_status, v_facility
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

  update bookings
     set during = tstzrange(p_from, p_to, '[)'),
         approved_at = null,
         approved_by = null
   where id = p_id;
  return true;
end $$;
grant execute on function member_reschedule_booking(uuid, timestamptz, timestamptz) to authenticated;
