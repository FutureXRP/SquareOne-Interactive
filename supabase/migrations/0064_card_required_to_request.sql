-- 0064: a customer's reservation request needs a card on file BEFORE it
-- reaches our team.
--
-- Until now a customer could book a room or package online, and the
-- request went straight to staff for approval with no card saved — adding
-- one was a "before the day" step they could skip.
--
-- Now every booking a customer places online starts out "waiting on a
-- card" (awaiting_card_since). The store takes them straight to a secure
-- card page (Stripe — nothing is charged). Once the card is saved, the
-- request is sent: the customer gets their "request received" email and
-- the admins get the approval alert. Until then:
--   * staff don't get an approval alert, and the booking is shown on the
--     Bookings page as "Unfinished request — no card yet", with no Approve
--     button;
--   * the time stays held for the customer for about an hour, so nobody
--     else takes it while they're entering their card;
--   * after that, an unfinished request is released (canceled_via
--     'no_card') and the customer is emailed that it was never sent. These
--     were never submitted, so staff have nothing to decide on.
-- Bookings staff place at the desk are not affected.
-- Run after 0063_deposit_decision.sql.

alter table bookings add column if not exists awaiting_card_since timestamptz;

-- A request released because the card step was never finished.
alter table bookings drop constraint if exists bookings_canceled_via_check;
alter table bookings add constraint bookings_canceled_via_check
  check (canceled_via in ('staff', 'member', 'hold_expired', 'no_card'));

-- Set by the database, not the browser: a booking a signed-in customer
-- inserts themselves waits on a card. Anyone else (staff, the server, a
-- package's extra rooms made by trigger) never does.
create or replace function bookings_await_card()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.lead_booking_id is null
     and pg_trigger_depth() <= 1
     and auth.uid() is not null
     and coalesce(auth.role(), '') <> 'service_role'
     and not is_staff() then
    new.awaiting_card_since := now();
  else
    new.awaiting_card_since := null;
  end if;
  return new;
end $$;
drop trigger if exists bookings_await_card on bookings;
create trigger bookings_await_card before insert on bookings
  for each row execute function bookings_await_card();

create index if not exists bookings_awaiting_card_idx on bookings (awaiting_card_since)
  where awaiting_card_since is not null;
