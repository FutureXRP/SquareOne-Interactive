-- ── Form / waiver assignment ─────────────────────────────────
-- Where each form is required and how often. Run after 0003_products.sql.
--   assign_to:       'none' | 'fitness' (membership signup) | 'rentals' (room bookings)
--   assign_room_ids: for 'rentals' — empty array means every room
--   frequency:       'once' | 'annual' (re-sign after 12 months) | 'every_time'

alter table forms
  add column assign_to text not null default 'none'
    check (assign_to in ('none', 'fitness', 'rentals')),
  add column assign_room_ids text[] not null default '{}',
  add column frequency text not null default 'once'
    check (frequency in ('once', 'annual', 'every_time'));

-- The two built-in waivers keep doing what they already do.
update forms set assign_to = 'fitness', linked_to = 'Fitness membership signup' where id = 'fitness-v1';
update forms set assign_to = 'rentals', linked_to = 'Room rentals · all rooms' where id = 'rental-v1';
