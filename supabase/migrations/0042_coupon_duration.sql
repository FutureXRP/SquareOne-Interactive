-- 0042: how long a coupon's discount keeps applying to a membership.
--   1 = the first payment only (what every existing coupon does today)
--   N = that many monthly payments at the discounted rate — then Stripe
--       automatically bills the full plan price, no code watching for it
--   0 = forever (every payment — how staff memberships stay free)
--
-- Run after 0041_void_payments.sql.

alter table coupons add column if not exists discount_months int not null default 1
  check (discount_months >= 0 and discount_months <= 36);
