-- 0051: scheduled shifts — "be here 8:30 to 6", not a puzzle of events.
-- Managers post one shift per person per day (arrive, leave, note), and
-- My Schedule shows it as the day's working hours with the assigned
-- events as details inside it. Separate from staff_shifts, which is the
-- time clock's record of hours actually worked.
-- Run after 0050_booking_phone.sql.

create table scheduled_shifts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  staff_id uuid not null references staff(id) on delete cascade,
  day date not null,
  start_min int not null check (start_min between 0 and 1439),
  end_min int not null check (end_min between 1 and 1439),
  note text not null default '',
  created_by uuid references staff(id) on delete set null,
  created_at timestamptz not null default now(),
  check (end_min > start_min)
);

alter table scheduled_shifts enable row level security;
create policy "staff all scheduled_shifts" on scheduled_shifts
  for all using (is_staff()) with check (is_staff());

create index scheduled_shifts_day_idx on scheduled_shifts (day);
create index scheduled_shifts_staff_day_idx on scheduled_shifts (staff_id, day);
