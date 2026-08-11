-- ── Waivers per plan ─────────────────────────────────────────
-- Fitness-signup waivers can now target specific membership plans, the
-- same way rental waivers target specific rooms. Empty = every plan.
-- Run after 0016_addons.sql.

alter table forms add column assign_plan_ids text[] not null default '{}';
