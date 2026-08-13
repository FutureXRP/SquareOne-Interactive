-- ── Transactional email ──────────────────────────────────────
-- Confirmations for every account event: bookings, receipts, changes,
-- cancellations, refunds. Guest bookings taken at the desk can carry an
-- email so walk-ins get their confirmation too, and every send is logged
-- so staff can answer "did they get it?".
-- Run after 0028_addon_included_hours.sql.

alter table bookings add column contact_email text;

create table email_log (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  kind text not null,               -- 'booking.hold', 'payment.receipt', …
  to_email text not null,
  subject text not null,
  ok boolean not null default true,
  error text,
  account_id uuid references client_accounts(id) on delete set null,
  booking_id uuid references bookings(id) on delete set null,
  created_at timestamptz not null default now()
);
create index email_log_at_idx on email_log (created_at desc);

alter table email_log enable row level security;
create policy "staff read email log" on email_log for select using (is_staff());
