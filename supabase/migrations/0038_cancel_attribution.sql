-- ── Who canceled a booking ───────────────────────────────────
-- BK-3320 taught the lesson: a booking was paid, then canceled, and nobody
-- could say who had done it or whether the customer knew. There are three
-- ways a booking dies — a staff member cancels it, the customer cancels
-- their own, or an unpaid hold quietly expires — and until now the row
-- recorded none of them.
--
-- Run after 0037_booking_pay_links.sql.

alter table bookings add column canceled_at timestamptz;
alter table bookings add column canceled_by uuid references staff(id) on delete set null;
-- 'staff' | 'member' | 'hold_expired'
alter table bookings add column canceled_via text
  check (canceled_via in ('staff', 'member', 'hold_expired'));

-- Existing canceled rows: we honestly don't know, so the fields stay null
-- and the UI says "before this was tracked" rather than inventing history.

-- The member's own cancel now stamps itself.
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
  update bookings
     set status = 'canceled',
         canceled_at = now(),
         canceled_by = null,
         canceled_via = 'member'
   where id = p_id;
  return true;
end $$;
grant execute on function member_cancel_booking(uuid) to authenticated;

-- Expired holds stamp themselves too.
create or replace function release_expired_holds()
returns int language sql security definer set search_path = public as $$
  with released as (
    update bookings
    set status = 'canceled',
        note = coalesce(note || ' · ', '') || 'hold expired',
        canceled_at = now(),
        canceled_via = 'hold_expired'
    where status = 'hold' and hold_expires_at is not null and hold_expires_at < now()
    returning 1
  )
  select count(*)::int from released;
$$;
