-- ============================================================
-- SquareOne Interactive — Phase 1 schema
-- Run ONCE on a fresh Supabase project (SQL Editor → New query).
--
-- House rules encoded here:
--   * All money is integer cents. No floats, ever.
--   * Client balance = SUM(ledger_entries), never a mutable column.
--   * Double-booking is impossible at the DB level (EXCLUDE USING gist).
--   * Holds carry an expiry; unpaid holds are releasable by a job.
--   * RLS boundary: staff see/manage everything; members see their own.
-- ============================================================

create extension if not exists pgcrypto;
create extension if not exists btree_gist;

-- ── Enums ────────────────────────────────────────────────────
create type staff_role as enum ('owner', 'manager', 'front_desk', 'coach');
create type booking_status as enum ('hold', 'confirmed', 'canceled', 'completed');
create type payment_method as enum ('stripe', 'cash', 'cashapp', 'ach', 'check');
create type payment_status as enum ('paid', 'pending', 'failed', 'refunded');
create type membership_status as enum ('active', 'canceling', 'past_due', 'canceled');
create type door_outcome as enum ('in', 'denied', 'flagged');
create type form_status as enum ('active', 'draft');
create type coupon_kind as enum ('percent', 'amount');

-- ── updated_at helper ────────────────────────────────────────
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ── Organization & site config ───────────────────────────────
create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table site_config (
  org_id uuid primary key references organizations(id) on delete cascade,
  address text not null default '',
  phone text not null default '',
  weekday_label text not null default 'Mon – Sat',
  weekday_open_min int not null default 330,   -- minutes after midnight (5:30 AM)
  weekday_close_min int not null default 1320, -- 10:00 PM
  sunday_label text not null default 'Sunday',
  sunday_open_min int not null default 780,    -- 1:00 PM
  sunday_close_min int not null default 1320,
  updated_at timestamptz not null default now()
);
create trigger site_config_updated before update on site_config
  for each row execute function set_updated_at();

-- ── Staff ────────────────────────────────────────────────────
create table staff (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  user_id uuid unique references auth.users(id) on delete set null,
  name text not null,
  role staff_role not null default 'front_desk',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Security-definer helpers keep RLS policies simple and non-recursive.
create or replace function is_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from staff where user_id = auth.uid() and active);
$$;

create or replace function is_staff_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from staff
    where user_id = auth.uid() and active and role in ('owner', 'manager')
  );
$$;

create or replace function can_take_bookings()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from staff
    where user_id = auth.uid() and active and role in ('owner', 'manager', 'front_desk')
  );
$$;

-- ── Rooms / facilities (admin-editable, store reads live) ────
create table facilities (
  id text primary key,  -- slug: 'gym', 'gaming', …
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  color text not null,
  blurb text not null default '',
  capacity_label text not null default '',
  min_hours int not null default 1 check (min_hours between 1 and 12),
  per_hour_cents int not null default 0 check (per_hour_cents >= 0),
  active boolean not null default true,
  sort int not null default 0,
  updated_at timestamptz not null default now()
);
create trigger facilities_updated before update on facilities
  for each row execute function set_updated_at();

create table facility_prices (
  id uuid primary key default gen_random_uuid(),
  facility_id text not null references facilities(id) on delete cascade,
  label text not null,
  cents int not null check (cents >= 0),
  sort int not null default 0
);

-- ── Event packages ───────────────────────────────────────────
create table event_packages (
  id text primary key,
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  blurb text not null default '',
  price_cents int not null check (price_cents >= 0),
  hours int not null default 2 check (hours between 1 and 12),
  capacity_label text not null default '',
  featured boolean not null default false,
  active boolean not null default true,
  sort int not null default 0,
  updated_at timestamptz not null default now()
);
create trigger event_packages_updated before update on event_packages
  for each row execute function set_updated_at();

create table event_package_rooms (
  package_id text not null references event_packages(id) on delete cascade,
  facility_id text not null references facilities(id) on delete cascade,
  primary key (package_id, facility_id)
);

create table event_package_items (
  id uuid primary key default gen_random_uuid(),
  package_id text not null references event_packages(id) on delete cascade,
  label text not null,
  sort int not null default 0
);

-- ── Fitness membership plans ─────────────────────────────────
create table membership_plans (
  id text primary key,
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  tagline text not null default '',
  price_cents int not null check (price_cents >= 0),
  period text not null default 'month',
  featured boolean not null default false,
  active boolean not null default true,
  sort int not null default 0,
  stripe_price_id text,
  updated_at timestamptz not null default now()
);
create trigger membership_plans_updated before update on membership_plans
  for each row execute function set_updated_at();

create table membership_plan_features (
  id uuid primary key default gen_random_uuid(),
  plan_id text not null references membership_plans(id) on delete cascade,
  label text not null,
  sort int not null default 0
);

-- ── Coupons (validated via RPC, never listed publicly) ───────
create table coupons (
  code text primary key check (code = upper(code) and code ~ '^[A-Z0-9]+$'),
  org_id uuid not null references organizations(id) on delete cascade,
  kind coupon_kind not null,
  value int not null check (value > 0),  -- percent (1–100) or cents
  note text not null default '',
  active boolean not null default true,
  check (kind <> 'percent' or value <= 100)
);

create or replace function validate_coupon(p_code text)
returns table (code text, kind coupon_kind, value int, note text)
language sql stable security definer set search_path = public as $$
  select c.code, c.kind, c.value, c.note
  from coupons c
  where c.active and c.code = upper(trim(p_code));
$$;
grant execute on function validate_coupon(text) to anon, authenticated;

-- ── Clients & accounts ───────────────────────────────────────
create table client_accounts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  flag text,
  created_at timestamptz not null default now()
);

create table clients (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references client_accounts(id) on delete cascade,
  user_id uuid unique references auth.users(id) on delete set null,
  full_name text not null,
  email text,
  member_code text unique,  -- e.g. SQ-4821-337, the barcode credential
  is_primary boolean not null default false,
  created_at timestamptz not null default now()
);

create or replace function my_account_ids()
returns setof uuid language sql stable security definer set search_path = public as $$
  select account_id from clients where user_id = auth.uid();
$$;

create table member_subscriptions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references client_accounts(id) on delete cascade,
  plan_id text not null references membership_plans(id),
  status membership_status not null default 'active',
  current_period_end date,
  stripe_subscription_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger member_subscriptions_updated before update on member_subscriptions
  for each row execute function set_updated_at();

-- ── Bookings (holds live here, with expiry) ──────────────────
create sequence booking_code_seq start with 3201;

create table bookings (
  id uuid primary key default gen_random_uuid(),
  code text unique not null default ('BK-' || nextval('booking_code_seq')::text),
  org_id uuid not null references organizations(id) on delete cascade,
  facility_id text not null references facilities(id),
  account_id uuid references client_accounts(id) on delete set null,
  title text not null,
  client_name text not null,  -- display name, kept even if account unlinked
  during tstzrange not null check (not isempty(during)),
  status booking_status not null default 'hold',
  price_cents int not null default 0 check (price_cents >= 0),
  hold_expires_at timestamptz,
  note text,
  created_by uuid references staff(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Hard double-booking prevention: two live bookings can never overlap
  -- in the same facility. Buffers belong inside `during`.
  constraint bookings_no_overlap exclude using gist (
    facility_id with =,
    during with &&
  ) where (status in ('hold', 'confirmed'))
);
create index bookings_during_idx on bookings using gist (during);
create index bookings_account_idx on bookings (account_id);
create trigger bookings_updated before update on bookings
  for each row execute function set_updated_at();

-- Release expired unpaid holds (call from a scheduled job or before reads).
create or replace function release_expired_holds()
returns int language sql security definer set search_path = public as $$
  with released as (
    update bookings
    set status = 'canceled', note = coalesce(note || ' · ', '') || 'hold expired'
    where status = 'hold' and hold_expires_at is not null and hold_expires_at < now()
    returning 1
  )
  select count(*)::int from released;
$$;

-- ── Payments & ledger (double-entry source of truth) ─────────
create sequence payment_code_seq start with 8842;

create table payments (
  id uuid primary key default gen_random_uuid(),
  code text unique not null default ('PM-' || nextval('payment_code_seq')::text),
  org_id uuid not null references organizations(id) on delete cascade,
  account_id uuid references client_accounts(id) on delete set null,
  booking_id uuid references bookings(id) on delete set null,
  method payment_method not null,
  status payment_status not null default 'paid',
  amount_cents int not null check (amount_cents > 0),
  memo text,
  taken_by uuid references staff(id),
  stripe_payment_intent_id text,
  created_at timestamptz not null default now()
);

create table ledger_entries (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references client_accounts(id) on delete cascade,
  amount_cents int not null check (amount_cents <> 0),  -- + owed, − paid/credit
  reason text not null,
  booking_id uuid references bookings(id) on delete set null,
  payment_id uuid references payments(id) on delete set null,
  created_by uuid references staff(id),
  created_at timestamptz not null default now()
);
create index ledger_account_idx on ledger_entries (account_id);

-- Balance is ALWAYS this view, never a stored column.
create view account_balances
with (security_invoker = true) as
  select account_id, coalesce(sum(amount_cents), 0)::int as balance_cents
  from ledger_entries
  group by account_id;

-- ── Programs & registrations ─────────────────────────────────
create table programs (
  id text primary key,
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  schedule_label text not null default '',
  coach text not null default 'Staff',
  capacity int not null default 12 check (capacity > 0),
  fee_cents int not null default 0 check (fee_cents >= 0),
  fee_period text not null default 'per month',
  active boolean not null default true,
  sort int not null default 0,
  updated_at timestamptz not null default now()
);
create trigger programs_updated before update on programs
  for each row execute function set_updated_at();

create table registrations (
  id uuid primary key default gen_random_uuid(),
  program_id text not null references programs(id) on delete cascade,
  account_id uuid references client_accounts(id) on delete set null,
  participant_name text not null,
  waiver_signed boolean not null default false,
  waitlisted boolean not null default false,
  created_at timestamptz not null default now()
);

-- ── Forms & submissions (waivers) ────────────────────────────
create table forms (
  id text primary key,
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  status form_status not null default 'draft',
  linked_to text not null default '',
  fields jsonb not null default '[]',
  updated_at timestamptz not null default now()
);
create trigger forms_updated before update on forms
  for each row execute function set_updated_at();

create table form_submissions (
  id uuid primary key default gen_random_uuid(),
  form_id text not null references forms(id) on delete cascade,
  account_id uuid references client_accounts(id) on delete set null,
  signed_by text not null,
  participant text not null,
  signature text not null,
  signed_at timestamptz not null default now()
);
create index form_submissions_account_idx on form_submissions (account_id);

-- ── Door check-ins ───────────────────────────────────────────
create table check_ins (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  client_id uuid references clients(id) on delete set null,
  who text not null,
  context text not null default '',
  entry_point text not null default 'Main',
  method text not null default 'fob',
  outcome door_outcome not null,
  reason text,
  at timestamptz not null default now()
);
create index check_ins_at_idx on check_ins (at desc);

-- ============================================================
-- Row Level Security
--   staff: everything · members: their own · public: active catalogs
-- ============================================================
alter table organizations enable row level security;
alter table site_config enable row level security;
alter table staff enable row level security;
alter table facilities enable row level security;
alter table facility_prices enable row level security;
alter table event_packages enable row level security;
alter table event_package_rooms enable row level security;
alter table event_package_items enable row level security;
alter table membership_plans enable row level security;
alter table membership_plan_features enable row level security;
alter table coupons enable row level security;
alter table client_accounts enable row level security;
alter table clients enable row level security;
alter table member_subscriptions enable row level security;
alter table bookings enable row level security;
alter table payments enable row level security;
alter table ledger_entries enable row level security;
alter table programs enable row level security;
alter table registrations enable row level security;
alter table forms enable row level security;
alter table form_submissions enable row level security;
alter table check_ins enable row level security;

-- Public (anon + authed) can read active catalog content.
create policy "public read org" on organizations for select using (true);
create policy "public read site config" on site_config for select using (true);
create policy "public read active facilities" on facilities for select using (active or is_staff());
create policy "public read facility prices" on facility_prices for select using (true);
create policy "public read active packages" on event_packages for select using (active or is_staff());
create policy "public read package rooms" on event_package_rooms for select using (true);
create policy "public read package items" on event_package_items for select using (true);
create policy "public read active plans" on membership_plans for select using (active or is_staff());
create policy "public read plan features" on membership_plan_features for select using (true);
create policy "public read active forms" on forms for select using (status = 'active' or is_staff());

-- Coupons: staff only (shoppers use validate_coupon()).
create policy "staff read coupons" on coupons for select using (is_staff());

-- Staff manage all operational + catalog data.
create policy "staff write site config" on site_config for all using (is_staff()) with check (is_staff());
create policy "staff write facilities" on facilities for all using (is_staff()) with check (is_staff());
create policy "staff write facility prices" on facility_prices for all using (is_staff()) with check (is_staff());
create policy "staff write packages" on event_packages for all using (is_staff()) with check (is_staff());
create policy "staff write package rooms" on event_package_rooms for all using (is_staff()) with check (is_staff());
create policy "staff write package items" on event_package_items for all using (is_staff()) with check (is_staff());
create policy "staff write plans" on membership_plans for all using (is_staff()) with check (is_staff());
create policy "staff write plan features" on membership_plan_features for all using (is_staff()) with check (is_staff());
create policy "staff write coupons" on coupons for all using (is_staff()) with check (is_staff());
create policy "staff write forms" on forms for all using (is_staff()) with check (is_staff());
create policy "staff write programs" on programs for all using (is_staff()) with check (is_staff());
create policy "public read active programs" on programs for select using (active or is_staff());

-- Staff directory: any staff can read; owners/managers manage.
create policy "staff read staff" on staff for select using (is_staff());
create policy "admin write staff" on staff for all using (is_staff_admin()) with check (is_staff_admin());

-- Clients: staff everything; members see their own account family.
create policy "staff all accounts" on client_accounts for all using (is_staff()) with check (is_staff());
create policy "member read own account" on client_accounts for select using (id in (select my_account_ids()));
create policy "staff all clients" on clients for all using (is_staff()) with check (is_staff());
create policy "member read own clients" on clients for select using (account_id in (select my_account_ids()));
create policy "staff all subscriptions" on member_subscriptions for all using (is_staff()) with check (is_staff());
create policy "member read own subscription" on member_subscriptions for select using (account_id in (select my_account_ids()));

-- Bookings: booking-capable staff manage; members read their own and may
-- request holds on their own account.
create policy "staff read bookings" on bookings for select using (is_staff());
create policy "desk write bookings" on bookings for insert with check (can_take_bookings());
create policy "desk update bookings" on bookings for update using (can_take_bookings()) with check (can_take_bookings());
create policy "member read own bookings" on bookings for select using (account_id in (select my_account_ids()));
create policy "member request hold" on bookings for insert
  with check (status = 'hold' and account_id in (select my_account_ids()));

-- Money: desk staff record; members read their own.
create policy "staff read payments" on payments for select using (is_staff());
create policy "desk write payments" on payments for insert with check (can_take_bookings());
create policy "member read own payments" on payments for select using (account_id in (select my_account_ids()));
create policy "staff read ledger" on ledger_entries for select using (is_staff());
create policy "desk write ledger" on ledger_entries for insert with check (can_take_bookings());
create policy "member read own ledger" on ledger_entries for select using (account_id in (select my_account_ids()));

-- Registrations & waiver submissions.
create policy "staff all registrations" on registrations for all using (is_staff()) with check (is_staff());
create policy "member read own registrations" on registrations for select using (account_id in (select my_account_ids()));
create policy "staff read submissions" on form_submissions for select using (is_staff());
create policy "member read own submissions" on form_submissions for select using (account_id in (select my_account_ids()));
create policy "member sign forms" on form_submissions for insert
  with check (account_id is null or account_id in (select my_account_ids()));

-- Door log: staff only.
create policy "staff all check ins" on check_ins for all using (is_staff()) with check (is_staff());

-- ============================================================
-- Seed data — mirrors the app's current catalogs
-- ============================================================
insert into organizations (id, name) values
  ('00000000-0000-0000-0000-000000000001', 'SquareOne Compassion');

insert into site_config (org_id, address, phone) values
  ('00000000-0000-0000-0000-000000000001', '5323 S 65th W Ave, Tulsa, OK 74107', '(918) 555-0142');

insert into staff (org_id, name, role) values
  ('00000000-0000-0000-0000-000000000001', 'A. Blair', 'owner'),
  ('00000000-0000-0000-0000-000000000001', 'M. Santos', 'manager'),
  ('00000000-0000-0000-0000-000000000001', 'K. Reyes', 'coach'),
  ('00000000-0000-0000-0000-000000000001', 'D. Fields', 'front_desk');

insert into facilities (id, org_id, name, color, blurb, capacity_label, min_hours, per_hour_cents, sort) values
  ('gym',        '00000000-0000-0000-0000-000000000001', 'Gym',              '#b8860b', 'Full-court gymnasium for basketball, volleyball, and leagues — plus parties, banquets, receptions, and meetings.', 'Up to 120', 1, 6000, 1),
  ('gaming',     '00000000-0000-0000-0000-000000000001', 'Gaming Zone',      '#cf4436', 'Console and VR gaming floor — tournaments, parties, and open play.', 'Up to 30', 2, 4500, 2),
  ('dining',     '00000000-0000-0000-0000-000000000001', 'Dining Hall',      '#2e8b57', 'Dining hall for parties, banquets, receptions, and meetings.', 'Up to 150', 2, 7500, 3),
  ('multiball',  '00000000-0000-0000-0000-000000000001', 'Multiball Zone',   '#2f6db8', 'Interactive multiball arena — dodgeball, PE groups, and team play.', 'Up to 40', 1, 6000, 4),
  ('adventure',  '00000000-0000-0000-0000-000000000001', 'Adventure Zone',   '#1d9a8f', 'Climbing and adventure zone with certified staff on every rental.', 'Up to 25', 1, 7000, 5),
  ('multisport', '00000000-0000-0000-0000-000000000001', 'Multisport Zone',  '#8a4bbf', 'Turf multisport court — soccer, pickleball, agility training.', 'Up to 30', 1, 5500, 6),
  ('party',      '00000000-0000-0000-0000-000000000001', 'Party Arcade Zone','#e07020', 'Party arcade rooms — birthday packages with a dedicated host.', 'Up to 20 kids', 2, 9900, 7),
  ('billiards',  '00000000-0000-0000-0000-000000000001', 'Billiards Zone',   '#c2478f', 'Billiards hall — per-table rentals and league nights.', '8 tables', 1, 2500, 8);

insert into facility_prices (facility_id, label, cents, sort) values
  ('gym', 'Per hour', 6000, 1), ('gym', '3-hour block', 15000, 2),
  ('gaming', '2-hour block', 8000, 1), ('gaming', 'Per hour', 4500, 2),
  ('dining', 'Per hour', 7500, 1), ('dining', 'Evening (3 hr)', 19500, 2),
  ('multiball', 'Per hour', 6000, 1), ('multiball', '2-hour block', 11000, 2),
  ('adventure', 'Per hour', 7000, 1),
  ('multisport', 'Per hour', 5500, 1),
  ('party', 'Party package (2 hr)', 27900, 1), ('party', 'Extra hour', 9900, 2),
  ('billiards', 'Per table / hour', 2500, 1);

insert into event_packages (id, org_id, name, blurb, price_cents, hours, capacity_label, featured, sort) values
  ('ultimate-birthday', '00000000-0000-0000-0000-000000000001', 'Ultimate Birthday Bash', 'The big one — arcade party room plus the Gaming Zone, with a dedicated host from setup to cleanup.', 39900, 3, 'Up to 20 kids', true, 1),
  ('team-celebration',  '00000000-0000-0000-0000-000000000001', 'Team Celebration', 'End-of-season parties done right — full-court gym time plus the Dining Hall for the awards and the cake.', 49900, 4, 'Up to 60', false, 2),
  ('family-fun-night',  '00000000-0000-0000-0000-000000000001', 'Family Fun Night', 'A two-hour sampler — climb in the Adventure Zone, then burn it off in the Multiball Zone.', 24900, 2, 'Up to 15', false, 3);

insert into event_package_rooms (package_id, facility_id) values
  ('ultimate-birthday', 'party'), ('ultimate-birthday', 'gaming'),
  ('team-celebration', 'gym'), ('team-celebration', 'dining'),
  ('family-fun-night', 'adventure'), ('family-fun-night', 'multiball');

insert into event_package_items (package_id, label, sort) values
  ('ultimate-birthday', 'Dedicated party host', 1),
  ('ultimate-birthday', 'Arcade play for every guest', 2),
  ('ultimate-birthday', 'Console & VR gaming hour', 3),
  ('ultimate-birthday', 'Tables, setup & cleanup', 4),
  ('ultimate-birthday', 'Pizza & drinks for the group', 5),
  ('team-celebration', 'Full-court gym block', 1),
  ('team-celebration', 'Dining Hall for meals & awards', 2),
  ('team-celebration', 'Tables, chairs & AV setup', 3),
  ('team-celebration', 'Staff on site throughout', 4),
  ('family-fun-night', 'Adventure Zone hour with staff', 1),
  ('family-fun-night', 'Multiball Zone hour', 2),
  ('family-fun-night', 'Water & snacks included', 3);

insert into membership_plans (id, org_id, name, tagline, price_cents, featured, sort) values
  ('individual', '00000000-0000-0000-0000-000000000001', 'Individual', 'One member, full access', 2500, false, 1),
  ('family',     '00000000-0000-0000-0000-000000000001', 'Family', 'Everyone in your household', 7500, true, 2);

insert into membership_plan_features (plan_id, label, sort) values
  ('individual', 'Unlimited gym & open-play access', 1),
  ('individual', 'Door access with your member code', 2),
  ('individual', 'Member pricing on rentals & programs', 3),
  ('individual', 'Cancel anytime', 4),
  ('family', 'Up to 6 household members', 1),
  ('family', 'Unlimited gym & open-play access', 2),
  ('family', 'Door access for every member', 3),
  ('family', 'Member pricing on rentals, parties & programs', 4),
  ('family', 'Cancel anytime', 5);

insert into coupons (code, org_id, kind, value, note) values
  ('WELCOME10', '00000000-0000-0000-0000-000000000001', 'percent', 10, '10% off — new member welcome'),
  ('PARTY25',   '00000000-0000-0000-0000-000000000001', 'amount', 2500, '$25 off any party or rental');

insert into programs (id, org_id, name, schedule_label, coach, capacity, fee_cents, fee_period, sort) values
  ('speed-agility',    '00000000-0000-0000-0000-000000000001', 'Speed & Agility', 'Mon/Wed/Thu 4:00 PM', 'Coach Reyes', 16, 8500, 'per month', 1),
  ('youth-basketball', '00000000-0000-0000-0000-000000000001', 'Youth Basketball Skills', 'Tue 5:30 PM', 'Coach Bell', 12, 6500, 'per month', 2),
  ('homeschool-pe',    '00000000-0000-0000-0000-000000000001', 'Homeschool PE', 'Fri 10:00 AM', 'Staff', 30, 1000, 'drop-in', 3),
  ('senior-fitness',   '00000000-0000-0000-0000-000000000001', 'Senior Fitness', 'Tue/Thu 9:00 AM', 'Coach Ama', 15, 4000, 'per month', 4);

insert into forms (id, org_id, name, status, linked_to, fields) values
  ('fitness-v1', '00000000-0000-0000-0000-000000000001', 'Fitness Center Waiver', 'active', 'Signed during fitness membership signup',
   '[{"label":"Waiver terms","type":"paragraph","required":false},{"label":"Full legal name","type":"text","required":true},{"label":"I agree to the terms","type":"checkbox","required":true},{"label":"Signature","type":"signature","required":true}]'),
  ('rental-v1', '00000000-0000-0000-0000-000000000001', 'Facility Rental Waiver', 'active', 'Signed with room & facility rentals',
   '[{"label":"Waiver terms","type":"paragraph","required":false},{"label":"Renter full legal name","type":"text","required":true},{"label":"I agree to the terms","type":"checkbox","required":true},{"label":"Signature","type":"signature","required":true}]'),
  ('party-agreement', '00000000-0000-0000-0000-000000000001', 'Party Booking Agreement', 'active', 'Attached to Party Arcade Zone bookings',
   '[{"label":"Host name","type":"text","required":true},{"label":"Contact email","type":"email","required":true},{"label":"Party date","type":"date","required":true},{"label":"I agree to the house rules","type":"checkbox","required":true},{"label":"Signature","type":"signature","required":true}]'),
  ('media-release', '00000000-0000-0000-0000-000000000001', 'Photo & Media Release', 'draft', 'Optional at registration',
   '[{"label":"Participant name","type":"text","required":true},{"label":"I consent to photos","type":"checkbox","required":true},{"label":"Signature","type":"signature","required":true}]');

-- ============================================================
-- AFTER you sign up in the app with your own email, link your
-- login to the owner staff row (edit the email if different):
--
--   update staff
--   set user_id = (select id from auth.users where email = 'the5blairsworld@gmail.com')
--   where role = 'owner' and user_id is null;
-- ============================================================
