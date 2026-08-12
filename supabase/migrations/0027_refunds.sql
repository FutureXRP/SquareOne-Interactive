-- ── Refunds ──────────────────────────────────────────────────
-- Any payment can be refunded in part or in full, as many times as
-- needed, up to what was collected. Refunds are their own rows rather
-- than negative payments, so gross collected stays honest and
-- net = payments − refunds. Card refunds also go back through Stripe;
-- cash refunds come out of the cash bag.
-- Run after 0026_package_payouts.sql.

create table refunds (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  payment_id uuid not null references payments(id) on delete cascade,
  account_id uuid references client_accounts(id) on delete set null,
  booking_id uuid references bookings(id) on delete set null,
  amount_cents int not null check (amount_cents > 0),
  method payment_method not null,
  reason text not null default '',
  stripe_refund_id text,
  refunded_by uuid references staff(id),
  created_at timestamptz not null default now()
);
create index refunds_payment_idx on refunds (payment_id);
create index refunds_at_idx on refunds (created_at desc);

alter table refunds enable row level security;
create policy "staff all refunds" on refunds
  for all using (is_staff()) with check (is_staff());
create policy "member read own refunds" on refunds
  for select using (account_id in (select my_account_ids()));

-- Guard rail: the database itself refuses to refund more than was paid.
create or replace function enforce_refund_total()
returns trigger language plpgsql as $$
declare
  v_paid int;
  v_refunded int;
begin
  select amount_cents into v_paid from payments where id = new.payment_id;
  select coalesce(sum(amount_cents), 0) into v_refunded
    from refunds where payment_id = new.payment_id and id <> new.id;
  if new.amount_cents + v_refunded > v_paid then
    raise exception 'refund_exceeds_payment: % already refunded of %', v_refunded, v_paid
      using errcode = '23514';
  end if;
  return new;
end $$;

create trigger refunds_within_payment before insert or update on refunds
  for each row execute function enforce_refund_total();
