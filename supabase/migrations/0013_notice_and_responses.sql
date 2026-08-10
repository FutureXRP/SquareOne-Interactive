-- ── Booking notice + form responses ──────────────────────────
-- Run after 0012_rate_rules.sql.
--
-- 1) Each room gets a minimum booking notice: how far ahead people must
--    book online. Rooms default to 6 hours; set event spaces to 48.
alter table facilities add column min_notice_hours int not null default 6
  check (min_notice_hours >= 0);

-- 2) Form submissions can carry answers to the form's fields — e.g. which
--    spaces a client checked in a multiple-choice question.
alter table form_submissions add column responses jsonb;
