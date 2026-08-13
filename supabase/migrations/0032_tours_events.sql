-- ── Tours & scheduled events ─────────────────────────────────
-- Things that go on the calendar but aren't room rentals: a family
-- touring the building before they book, a staff meeting, a maintenance
-- window. Each one can name the staff member responsible, and reminders
-- go to them (and to the guest) before it starts.
-- Run after 0031_coupon_expiry_required.sql.

create table staff_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  kind text not null default 'tour'
    check (kind in ('tour', 'event', 'meeting', 'maintenance', 'other')),
  title text not null,
  -- Who's coming in, when it's a tour or an outside visitor
  guest_name text not null default '',
  guest_email text,
  guest_phone text,
  party_size int,
  -- Optional: where in the building. Tours roam, so this is a hint on the
  -- calendar rather than a room reservation — it does not block bookings.
  facility_id text references facilities(id) on delete set null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  assigned_staff_id uuid references staff(id) on delete set null,
  notes text not null default '',
  status text not null default 'scheduled'
    check (status in ('scheduled', 'completed', 'canceled', 'no_show')),
  created_by uuid references staff(id) on delete set null,
  -- Stamped once a reminder has gone out, so the hourly run never repeats
  staff_reminder_sent_at timestamptz,
  guest_reminder_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index staff_events_when_idx on staff_events (starts_at);
create index staff_events_staff_idx on staff_events (assigned_staff_id, starts_at);

create trigger staff_events_updated before update on staff_events
  for each row execute function set_updated_at();

alter table staff_events enable row level security;

-- Scheduling a tour is day-to-day work, so every active staff member can
-- create and manage them — same as bookings.
create policy "staff all events" on staff_events
  for all using (is_staff()) with check (is_staff());
