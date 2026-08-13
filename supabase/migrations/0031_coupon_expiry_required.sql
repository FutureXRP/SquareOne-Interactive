-- ── Every coupon expires ─────────────────────────────────────
-- No open-ended discounts: a code without an end date is a liability
-- nobody remembers. Anything already on the books without one gets 90
-- days from today, then the column is required from here on.
-- Run after 0030_coupons.sql.

update coupons set expires_on = current_date + interval '90 days'
  where expires_on is null;

alter table coupons alter column expires_on set not null;
alter table coupons alter column expires_on set default (current_date + interval '90 days');
