-- 0063: an unpaid booking past its 24-hour deposit window is NOT removed
-- automatically any more — it goes to staff to decide: keep it without
-- the deposit, or cancel it.
--
-- deposit_overdue_at marks the moment the 24 hours ran out with no
-- deposit. The booking stays a live hold (the room stays held) and shows
-- on the Bookings page under "Deposit overdue — your decision". Staff
-- choose "Keep without deposit" (confirmed, deposit still owed) or
-- "Cancel booking". Any payment that secures it, or a move, clears it.
--
-- RESTORE: every upcoming booking the hourly job removed for a missing
-- deposit (canceled_via = 'hold_expired', event still ahead) is brought
-- back as an overdue hold, waiting for that decision. Its extra package
-- rooms come back with it. If someone else has since booked the room for
-- that time, it can't come back — it's listed at the end instead.
--
-- hold_expires_at is cleared on restored rows so the hourly job — even
-- the version running before this release deploys — leaves them alone.
-- Run after 0062_one_hour_arrival.sql.

alter table bookings add column if not exists deposit_overdue_at timestamptz;

create temp table restore_results (booking text, customer text, room text, starts timestamptz, result text)
  on commit preserve rows;

do $$
declare b record;
begin
  for b in
    select id, code, client_name, facility_id, during from bookings
     where status = 'canceled' and canceled_via = 'hold_expired'
       and lead_booking_id is null and lower(during) > now()
     order by lower(during)
  loop
    begin
      update bookings
         set status = 'hold',
             canceled_at = null, canceled_by = null, canceled_via = null,
             hold_expires_at = null,
             hold_warned_at = coalesce(hold_warned_at, now()),
             deposit_overdue_at = now(),
             note = nullif(regexp_replace(coalesce(note, ''), '( · )?hold expired — unpaid after 24 hours', '', 'g'), '')
       where id = b.id;
      insert into restore_results values (b.code, b.client_name, b.facility_id, lower(b.during),
        'Restored — waiting for your decision (keep without deposit, or cancel)');
    exception when exclusion_violation then
      insert into restore_results values (b.code, b.client_name, b.facility_id, lower(b.during),
        'NOT restored — the room has been booked by someone else for that time');
    end;
  end loop;
end $$;

-- Moving a hold resets its deposit clock — and its overdue flag.
create or replace function bookings_reset_hold_clock()
returns trigger language plpgsql as $$
begin
  if new.status = 'hold' and new.during is distinct from old.during then
    new.hold_warned_at := null;
    new.hold_expires_at := null;
    new.deposit_overdue_at := null;
  end if;
  if new.status is distinct from 'hold' then
    new.deposit_overdue_at := null;
  end if;
  return new;
end $$;
drop trigger if exists bookings_reset_hold_clock on bookings;
create trigger bookings_reset_hold_clock before update of during, status on bookings
  for each row execute function bookings_reset_hold_clock();

-- Closing out past events leaves a booking staff still have to decide on.
create or replace function close_out_past_bookings()
returns table (completed int, released int)
language plpgsql security definer set search_path = public as $$
declare
  v_done int;
  v_gone int;
begin
  with d as (
    update bookings b set status = 'completed'
     where b.lead_booking_id is null and upper(b.during) < now() - interval '2 hours'
       and (b.status = 'confirmed'
            or (b.status = 'hold' and exists (select 1 from payments p where p.booking_id = b.id and p.status = 'paid')))
    returning 1
  ) select count(*) into v_done from d;
  with g as (
    update bookings b
       set status = 'canceled', canceled_at = now(), canceled_via = 'hold_expired',
           note = coalesce(b.note || ' · ', '') || 'never secured; event date passed'
     where b.status = 'hold' and b.lead_booking_id is null and upper(b.during) < now() - interval '2 hours'
       and b.deposit_overdue_at is null
       and not exists (select 1 from payments p where p.booking_id = b.id and p.status = 'paid')
       and not exists (select 1 from payment_claims c where c.booking_id = b.id and c.status = 'pending')
    returning 1
  ) select count(*) into v_gone from g;
  return query select v_done, v_gone;
end $$;
revoke execute on function close_out_past_bookings() from public, anon, authenticated;

-- What happened to each removed booking.
select booking, customer, room,
       to_char(starts at time zone 'America/Chicago', 'Dy Mon DD, HH12:MI AM') as starts, result
  from restore_results order by restore_results.starts;
