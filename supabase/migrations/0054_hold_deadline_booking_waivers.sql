-- 0054: unpaid holds get a real 24-hour deadline, and waivers are
-- signed against the booking itself.
--
-- hold_warned_at stamps the moment the customer was told "pay within 24
-- hours or this booking is removed" (and the admins were told it's
-- unpaid). The deadline itself lives in the existing hold_expires_at,
-- which is reset to 24 hours from that warning. Nothing is ever released
-- without a warning first: the hourly job only cancels a hold whose
-- hold_warned_at is set and whose hold_expires_at has passed. Any
-- payment confirms the booking and stops the clock.
--
-- form_submissions.booking_id ties a waiver signature to the booking it
-- was signed for. The pay link uses it so a guest booked at the desk —
-- no account — signs the room's waiver before paying, and an "every
-- booking" waiver is known to be signed for this booking specifically.
-- Run after 0053_rental_agreement_card_on_file.sql.

alter table bookings add column hold_warned_at timestamptz;

alter table form_submissions
  add column booking_id uuid references bookings(id) on delete set null;
create index form_submissions_booking_idx on form_submissions (booking_id);

-- Members can read signatures filed against their own bookings, the same
-- as the ones filed against their account.
create policy "member read own booking submissions" on form_submissions for select
  using (booking_id in (select id from bookings where account_id in (select my_account_ids())));

-- A member signing in the store may only file a signature against their
-- own booking (the pay link files guests' through the server).
drop policy "member sign forms" on form_submissions;
create policy "member sign forms" on form_submissions for insert
  with check (
    (account_id is null or account_id in (select my_account_ids()))
    and (booking_id is null or booking_id in (select id from bookings where account_id in (select my_account_ids())))
  );
