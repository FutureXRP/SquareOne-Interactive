-- 0050: every booking carries a phone number the desk can call.
-- Bookings already carry contact_email (0029); the phone now rides the
-- same way, so a party booked by a guest with no account is still one
-- tap from a phone call — on the Bookings tab and in the run-by email.
-- The store requires it at booking time; staff can override knowingly.
-- Run after 0049_client_phone.sql.

alter table bookings add column contact_phone text;
