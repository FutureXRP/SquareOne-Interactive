-- ── Time-of-day / day-of-week room pricing ───────────────────
-- Each room can carry pricing rules that override its base rates for
-- certain days and hours, e.g. Multiball $25/hr 9 AM–5 PM weekdays,
-- $35/hr evenings, $35/hr all day on weekends.
-- Run after 0011_site_content.sql.
--
-- rate_rules: [{ "days": [1,2,3,4,5], "fromH": 17, "toH": 22,
--                "cents": 3500, "label": "Evenings" }, ...]
-- days use 0=Sunday … 6=Saturday; hours are decimal (17.5 = 5:30 PM).
-- Each rented hour is priced by the FIRST rule that matches its day and
-- time; hours no rule matches fall back to the room's base rates.

alter table facilities add column rate_rules jsonb not null default '[]';
