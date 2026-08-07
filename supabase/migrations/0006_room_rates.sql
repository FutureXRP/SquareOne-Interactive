-- ── First-hour / additional-hour room rates ──────────────────
-- Each room charges one rate for the first hour and another for every
-- additional hour. Run after 0005_room_photos.sql.

alter table facilities add column first_hour_cents int;
update facilities set first_hour_cents = per_hour_cents;
alter table facilities alter column first_hour_cents set not null;
alter table facilities add constraint facilities_first_hour_cents_check
  check (first_hour_cents >= 0);

-- Current schedule: the gym is $100 for the first hour, $25 each additional.
update facilities set first_hour_cents = 10000, per_hour_cents = 2500 where id = 'gym';

-- The party package ($279 for 2 hours, $99 per extra hour) expressed in the
-- same model: $180 first hour + $99 each additional, 2-hour minimum.
update facilities set first_hour_cents = 18000, per_hour_cents = 9900 where id = 'party';

-- Refresh the gym's advertised price chips to match the new schedule.
delete from facility_prices where facility_id = 'gym';
insert into facility_prices (facility_id, label, cents, sort) values
  ('gym', 'First hour', 10000, 0),
  ('gym', 'Each additional hour', 2500, 1);
