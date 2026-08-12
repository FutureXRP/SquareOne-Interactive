-- ── Staff time clock ─────────────────────────────────────────
-- Clock in / clock out shifts for every staff member. Pay is per event,
-- not per hour — this is the attendance record: who worked, when, and
-- for how long. Run after 0024_cash_drawer.sql.

create table staff_shifts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  staff_id uuid not null references staff(id) on delete cascade,
  clock_in timestamptz not null default now(),
  clock_out timestamptz,
  note text not null default ''
);
create index staff_shifts_idx on staff_shifts (staff_id, clock_in desc);

alter table staff_shifts enable row level security;
create policy "staff all shifts" on staff_shifts
  for all using (is_staff()) with check (is_staff());
