-- ── Coupons that actually do something ───────────────────────
-- The original coupons table only did percent/amount off in the shop
-- cart. Now a code can also grant free months of membership (how current
-- members move over from the old system), can be limited to memberships,
-- rentals, or the shop, can expire, can be capped, and every redemption
-- is recorded.
-- Run after 0029_email_notifications.sql.

alter table coupons add column applies_to text not null default 'all'
  check (applies_to in ('all', 'memberships', 'rentals', 'shop'));
alter table coupons add column free_months int not null default 0
  check (free_months >= 0 and free_months <= 12);
alter table coupons add column max_redemptions int check (max_redemptions is null or max_redemptions > 0);
alter table coupons add column once_per_account boolean not null default true;
alter table coupons add column expires_on date;
alter table coupons add column plan_ids text[] not null default '{}';  -- empty = every plan

-- No new enum value needed: free_months > 0 is what makes a code a
-- free-months code, and it can stand alone or ride along with a discount.

create table coupon_redemptions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  code text not null references coupons(code) on delete cascade,
  account_id uuid references client_accounts(id) on delete set null,
  booking_id uuid references bookings(id) on delete set null,
  payment_id uuid references payments(id) on delete set null,
  discount_cents int not null default 0,
  free_months int not null default 0,
  note text not null default '',
  redeemed_at timestamptz not null default now()
);
create index coupon_redemptions_code_idx on coupon_redemptions (code, redeemed_at desc);

alter table coupon_redemptions enable row level security;
create policy "staff all redemptions" on coupon_redemptions
  for all using (is_staff()) with check (is_staff());
create policy "member read own redemptions" on coupon_redemptions
  for select using (account_id in (select my_account_ids()));
create policy "member record own redemption" on coupon_redemptions
  for insert with check (account_id in (select my_account_ids()));

-- One place that decides whether a code is good right now: active,
-- in date, not used up, allowed for this context and plan, and not
-- already used by this account when it's one-per-account. Anyone may
-- ask (it only echoes back a code they already typed).
create or replace function check_coupon(p_code text, p_context text default 'all', p_plan_id text default null)
returns json
language plpgsql stable security definer set search_path = public as $$
declare
  c coupons%rowtype;
  v_used int;
  v_mine int;
begin
  select * into c from coupons where code = upper(trim(p_code));
  if not found or not c.active then
    return json_build_object('ok', false, 'reason', 'not_found');
  end if;
  if c.expires_on is not null and c.expires_on < current_date then
    return json_build_object('ok', false, 'reason', 'expired');
  end if;
  if c.applies_to <> 'all' and p_context <> 'all' and c.applies_to <> p_context then
    return json_build_object('ok', false, 'reason', 'wrong_context', 'applies_to', c.applies_to);
  end if;
  if p_plan_id is not null and array_length(c.plan_ids, 1) is not null
     and array_length(c.plan_ids, 1) > 0 and not (p_plan_id = any(c.plan_ids)) then
    return json_build_object('ok', false, 'reason', 'wrong_plan');
  end if;
  if c.max_redemptions is not null then
    select count(*) into v_used from coupon_redemptions r where r.code = c.code;
    if v_used >= c.max_redemptions then
      return json_build_object('ok', false, 'reason', 'used_up');
    end if;
  end if;
  if c.once_per_account and auth.uid() is not null then
    select count(*) into v_mine from coupon_redemptions r
      where r.code = c.code and r.account_id in (select my_account_ids());
    if v_mine > 0 then
      return json_build_object('ok', false, 'reason', 'already_used');
    end if;
  end if;
  return json_build_object(
    'ok', true,
    'code', c.code,
    'kind', c.kind,
    'value', c.value,
    'note', c.note,
    'free_months', c.free_months,
    'applies_to', c.applies_to
  );
end $$;
grant execute on function check_coupon(text, text, text) to anon, authenticated;
