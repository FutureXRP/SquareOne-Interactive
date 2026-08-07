-- ── Shop products ────────────────────────────────────────────
-- Merch catalog, fully editable from the dashboard. Money is integer cents.
-- Run this in the Supabase SQL editor after 0002_live_app.sql.

create table products (
  id text primary key,  -- slug: 'tee', 'hoodie', …
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  price_cents int not null default 0 check (price_cents >= 0),
  tag text,             -- optional badge shown on the card ('bestseller', 'new')
  color_a text not null default '#182740',  -- product-art gradient until photos arrive
  color_b text not null default '#2f6db8',
  active boolean not null default true,
  sort int not null default 0,
  updated_at timestamptz not null default now()
);
create trigger products_updated before update on products
  for each row execute function set_updated_at();

alter table products enable row level security;
create policy "public read active products" on products for select using (active or is_staff());
create policy "staff write products" on products for all using (is_staff()) with check (is_staff());

-- Seed the current catalog so the store isn't empty on cutover.
insert into products (id, org_id, name, price_cents, tag, color_a, color_b, sort)
select p.id, o.id, p.name, p.price_cents, p.tag, p.color_a, p.color_b, p.sort
from (values
  ('tee',       'SquareOne Tee',     2200, 'bestseller', '#182740', '#2f6db8', 0),
  ('hoodie',    'SquareOne Hoodie',  4500, null,         '#182740', '#64748c', 1),
  ('youth-tee', 'Youth Tee',         1800, null,         '#2f6db8', '#e8a13a', 2),
  ('cap',       'Logo Cap',          1800, null,         '#182740', '#e8a13a', 3),
  ('bottle',    'Water Bottle',      1400, null,         '#2f6db8', '#1d9a8f', 4),
  ('stickers',  'Sticker Pack',       600, null,         '#e8a13a', '#c2478f', 5)
) as p(id, name, price_cents, tag, color_a, color_b, sort)
cross join (select id from organizations limit 1) as o
on conflict (id) do nothing;
