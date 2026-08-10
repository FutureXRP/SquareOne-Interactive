-- ── Booking defaults: 48-hour notice, 1-hour minimum rental ──
-- Run after 0013_notice_and_responses.sql.
--
-- Every room (gym and dining areas included) requires 48 hours' notice
-- for online bookings, and rentals start at 1 hour (up to 6 in the store).

update facilities set min_notice_hours = 48;
alter table facilities alter column min_notice_hours set default 48;

update facilities set min_hours = 1;
alter table facilities alter column min_hours set default 1;
