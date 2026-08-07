-- ── Per-day business hours + holiday closures ────────────────
-- Every day of the week gets its own hours (or is closed), and specific
-- dates can be closed for holidays. Run after 0009_deposits.sql.
--
-- hours_by_day: 7-entry array indexed Sunday(0)–Saturday(6):
--   [{ "closed": false, "openH": 5.5, "closeH": 22 }, ...]
-- closures: [{ "date": "2026-12-25", "label": "Christmas Day" }, ...]

alter table site_config add column hours_by_day jsonb;
alter table site_config add column closures jsonb not null default '[]';

-- Backfill each day from the existing weekday/Sunday columns.
update site_config set hours_by_day = jsonb_build_array(
  jsonb_build_object('closed', false, 'openH', sunday_open_min / 60.0,  'closeH', sunday_close_min / 60.0),
  jsonb_build_object('closed', false, 'openH', weekday_open_min / 60.0, 'closeH', weekday_close_min / 60.0),
  jsonb_build_object('closed', false, 'openH', weekday_open_min / 60.0, 'closeH', weekday_close_min / 60.0),
  jsonb_build_object('closed', false, 'openH', weekday_open_min / 60.0, 'closeH', weekday_close_min / 60.0),
  jsonb_build_object('closed', false, 'openH', weekday_open_min / 60.0, 'closeH', weekday_close_min / 60.0),
  jsonb_build_object('closed', false, 'openH', weekday_open_min / 60.0, 'closeH', weekday_close_min / 60.0),
  jsonb_build_object('closed', false, 'openH', weekday_open_min / 60.0, 'closeH', weekday_close_min / 60.0)
);
