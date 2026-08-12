-- ── Add-on hourly pricing + photos ───────────────────────────
-- Add-ons can now charge like rooms do: one price for the first hour and
-- a different rate for each additional hour (inflatable: $100 first hour,
-- $25/hr after). extra_hour_cents null keeps the old behavior — one flat
-- charge no matter the rental length. Photos live in the existing public
-- room-photos bucket under addons/, so no new storage policies needed.
-- Run after 0020_family_members.sql.

alter table addons add column extra_hour_cents int check (extra_hour_cents >= 0);
alter table addons add column photo_url text;
