-- ── Cash bag ─────────────────────────────────────────────────
-- A running ledger for the physical cash on hand: cash payments add to
-- it, cash payouts and bank deposits take from it, and staff can record
-- manual counts/corrections. Balance = sum of entries.
-- Run after 0023_staff_payouts.sql.

create table cash_drawer_entries (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  amount_cents int not null,  -- positive = into the bag, negative = out
  reason text not null,
  staff_id uuid references staff(id) on delete set null,
  created_at timestamptz not null default now()
);
create index cash_drawer_at_idx on cash_drawer_entries (created_at desc);

alter table cash_drawer_entries enable row level security;
create policy "staff all cash drawer" on cash_drawer_entries
  for all using (is_staff()) with check (is_staff());
