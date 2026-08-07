-- ── Per-room booking schedules ───────────────────────────────
-- Which days of the week and what hours each room can be booked.
-- Run after 0007_staff_roles.sql.
--
-- booking_hours is null when the room simply follows the business hours
-- set in Settings. Otherwise it's a 7-entry array indexed Sunday(0) to
-- Saturday(6): [{ "closed": false, "openH": 8, "closeH": 22 }, ...]
-- Hours are decimal (8.5 = 8:30 AM), matching the site-hours format.

alter table facilities add column booking_hours jsonb;
