-- ── Party-package staff payouts ──────────────────────────────
-- Packages pay the staff who run them too — flat $ or a percent of the
-- package, configured on the admin Event Packages tab only (never shown
-- in the store). Bookings link to the package they sell so the payout
-- panel knows which rule applies: the package's rule beats the room's.
-- Run after 0025_time_clock.sql.

alter table event_packages add column payout_kind text not null default 'none'
  check (payout_kind in ('none', 'flat', 'percent'));
alter table event_packages add column payout_value int not null default 0 check (payout_value >= 0);

alter table bookings add column package_id text references event_packages(id) on delete set null;
