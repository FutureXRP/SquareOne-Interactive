-- 0053: the Event Rental Agreement goes online, and every booking can
-- carry a card on file for damages.
--
-- rental_agreements holds one signed agreement per booking: what the
-- renter filled in (answers), what they were shown when they signed
-- (snapshot — event details and totals as they stood), their typed
-- signature, and the SquareOne representative's countersignature.
-- Written only by the server (token-authorized pay page, staff routes);
-- staff read everything, members read their own bookings' agreements.
--
-- The card columns on bookings record the Stripe payment method saved
-- for that booking — by the agreement page's "add a card" step or by an
-- online payment — so staff can charge cleaning, damage, storage, or
-- overtime fees later, as the agreement says. No card number is stored
-- here: just Stripe's reference, the brand, and the last four digits.
-- Run after 0052_offline_card.sql.

create table rental_agreements (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  booking_id uuid not null unique references bookings(id) on delete cascade,
  answers jsonb not null default '{}',
  snapshot jsonb not null default '{}',
  signature text not null,
  signed_at timestamptz not null default now(),
  rep_staff_id uuid references staff(id) on delete set null,
  rep_name text,
  rep_signed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table rental_agreements enable row level security;
create policy "staff all rental_agreements" on rental_agreements
  for all using (is_staff()) with check (is_staff());
create policy "member read own rental_agreements" on rental_agreements
  for select using (
    booking_id in (select id from bookings where account_id in (select my_account_ids()))
  );

alter table bookings add column card_customer_id text;
alter table bookings add column card_pm_id text;
alter table bookings add column card_brand text;
alter table bookings add column card_last4 text;
alter table bookings add column card_saved_at timestamptz;
