-- ── Rental deposits ──────────────────────────────────────────
-- Each room can require a deposit with a default amount; every booking
-- carries its own deposit figure that staff can adjust per booking.
-- Partial payments were already supported (payments accumulate against a
-- booking) — the deposit is the amount that locks the slot in.
-- Run after 0008_room_schedules.sql.

alter table facilities add column deposit_cents int not null default 0
  check (deposit_cents >= 0);
alter table facilities add column deposit_required boolean not null default false;

-- Per-booking deposit: stamped from the room default when the booking is
-- created, adjustable per booking. Null = no deposit due (or legacy row).
alter table bookings add column deposit_cents int check (deposit_cents >= 0);
