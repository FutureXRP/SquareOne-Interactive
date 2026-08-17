-- ── Direct Cash App payments, honestly recorded ──────────────
-- Cash App Pay through Stripe is unavailable to this account, and Cash App
-- itself has no API and no webhooks — nothing can machine-confirm that a
-- payment to our $cashtag arrived. So the flow tells the truth end to end:
--
--   customer pays our $cashtag → taps "I've sent it" → a CLAIM is filed →
--   staff check the actual Cash App app → confirm → THEN it's a payment,
--   the booking flips, and the receipt email goes out.
--
-- A claim is never a payment. The desk confirming against the real app is
-- the step that makes it one — the same rule that keeps every other
-- payment in this system real.
--
-- Run after 0039_setup_cleanup_buffers.sql.

alter table site_config add column cashapp_cashtag text not null default '';

create table payment_claims (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  booking_id uuid not null references bookings(id) on delete cascade,
  amount_cents int not null check (amount_cents > 0),
  method text not null default 'cashapp' check (method in ('cashapp')),
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'rejected')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references staff(id) on delete set null
);
create index payment_claims_pending_idx on payment_claims (created_at) where status = 'pending';

alter table payment_claims enable row level security;
-- Claims are filed by the pay page server-side (service role, no policy
-- needed). Staff read and resolve them; customers never read claims —
-- their booking's paid state is the truth they see.
create policy "staff read claims" on payment_claims for select using (is_staff());
create policy "staff resolve claims" on payment_claims for update using (is_staff()) with check (is_staff());
