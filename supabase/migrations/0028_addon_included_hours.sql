-- ── Add-ons: hours included in the base price ────────────────
-- An add-on is booked out for a block of time: the base price covers N
-- hours, and each hour past that costs the additional-hour rate.
-- Inflatable at $100 for the first 2 hours then $25/hr = base 10000,
-- included_hours 2, extra_hour_cents 2500. Existing add-ons default to
-- 1 included hour, which is exactly how they price today.
-- Run after 0027_refunds.sql.

alter table addons add column included_hours int not null default 1
  check (included_hours >= 1 and included_hours <= 24);
