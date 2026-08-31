-- 0046: a tour or staff event that names a room actually holds the room.
-- The event carries the id of a $0 confirmed booking created alongside
-- it. That row is what the store's slot picker and the database's
-- no-overlap constraint both see — so nobody can book the space out from
-- under a scheduled tour, and a tour can't land on an already-booked
-- room either. Free events stay free: the hold prices at zero and never
-- shows in the unpaid queue.
-- Run after 0045_booking_alert.sql.

alter table staff_events add column hold_booking_id uuid references bookings(id) on delete set null;
