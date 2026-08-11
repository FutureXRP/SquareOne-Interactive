-- ── Mass communication ───────────────────────────────────────
-- Messages staff send to member segments, with a permanent send log.
-- Run after 0017_waiver_targets.sql.

create table messages (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  audience text not null check (audience in ('members', 'bookers', 'everyone')),
  subject text not null,
  body text not null,
  recipient_count int not null default 0,
  sent_by text not null default '',
  created_at timestamptz not null default now()
);

alter table messages enable row level security;
create policy "staff read messages" on messages for select using (is_staff());
create policy "admin write messages" on messages
  for all using (is_staff_admin()) with check (is_staff_admin());
