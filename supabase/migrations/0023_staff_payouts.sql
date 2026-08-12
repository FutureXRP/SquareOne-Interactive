-- ── Staff payouts for running bookings ───────────────────────
-- A party package pays whoever runs it a flat amount or a percentage of
-- the booking, due once the customer has paid in full. Bookings get a
-- "run by" staff assignment; Owners/Admins are salaried and never accrue
-- a payout (enforced in the app by role). Payouts are settled by Cash
-- App (staff store their $cashtag) or marked paid in cash.
-- Run after 0022_addon_conflicts.sql.

alter table staff add column cashtag text;

alter table facilities add column payout_kind text not null default 'none'
  check (payout_kind in ('none', 'flat', 'percent'));
alter table facilities add column payout_value int not null default 0 check (payout_value >= 0);

alter table bookings add column run_by_staff_id uuid references staff(id) on delete set null;
alter table bookings add column payout_cents int check (payout_cents >= 0); -- override; null = room default
alter table bookings add column payout_paid_at timestamptz;
alter table bookings add column payout_method text; -- 'cash' | 'cashapp'
