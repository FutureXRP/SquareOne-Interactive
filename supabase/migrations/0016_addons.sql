-- ── Rental add-ons ───────────────────────────────────────────
-- One-off extras (inflatable, photo booth, …) built on the Add Ons tab.
-- Each room chooses which add-ons it offers; shoppers pick them while
-- booking and the flat price joins the rental total.
-- Run after 0015_stripe.sql.

create table addons (
  id text primary key,  -- slug: 'inflatable', 'photo-booth', …
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  blurb text not null default '',
  price_cents int not null default 0 check (price_cents >= 0),
  active boolean not null default true,
  sort int not null default 0,
  updated_at timestamptz not null default now()
);
create trigger addons_updated before update on addons
  for each row execute function set_updated_at();

alter table addons enable row level security;
create policy "public read active addons" on addons for select using (active or is_staff());
create policy "admin write addons" on addons
  for all using (is_staff_admin()) with check (is_staff_admin());

-- Which add-ons each room offers.
alter table facilities add column addon_ids text[] not null default '{}';
