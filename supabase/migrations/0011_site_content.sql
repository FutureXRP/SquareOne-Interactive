-- ── Editable site content ────────────────────────────────────
-- Every headline, tile, section label, and nav tab in the store becomes
-- editable from the dashboard. Overrides live here as key/value rows;
-- anything without a row falls back to the built-in wording.
-- Run after 0010_site_hours.sql.

create table site_content (
  key text primary key,
  org_id uuid not null references organizations(id) on delete cascade,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
create trigger site_content_updated before update on site_content
  for each row execute function set_updated_at();

alter table site_content enable row level security;
create policy "public read site content" on site_content for select using (true);
create policy "admin write site content" on site_content
  for all using (is_staff_admin()) with check (is_staff_admin());
