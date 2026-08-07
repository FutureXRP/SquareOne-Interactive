-- ============================================================
-- SquareOne Interactive — 0002: live-app helpers
-- Run ONCE, after 0001_init.sql.
--
-- Members can't (and shouldn't) write directly into client_accounts,
-- so signup and plan changes go through security-definer RPCs that
-- act only on the caller's own rows. Availability is exposed as bare
-- time ranges so the booking flow never sees other people's details.
-- ============================================================

-- ── Member self-service ──────────────────────────────────────

-- Create (or fetch) the caller's account + client row. Called right
-- after auth signup/signin. Generates the member door code.
create or replace function ensure_my_account(p_full_name text)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_client clients%rowtype;
  v_account uuid;
  v_code text;
  v_name text := nullif(trim(p_full_name), '');
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select * into v_client from clients where user_id = auth.uid();
  if found then
    if v_name is not null and v_client.full_name is distinct from v_name then
      update clients set full_name = v_name where id = v_client.id;
    end if;
    return json_build_object('account_id', v_client.account_id, 'member_code', v_client.member_code);
  end if;

  insert into client_accounts (org_id, name)
  values ((select id from organizations limit 1), coalesce(v_name, 'Member'))
  returning id into v_account;

  loop
    v_code := 'SQ-' || (floor(random() * 9000) + 1000)::int || '-' || (floor(random() * 900) + 100)::int;
    exit when not exists (select 1 from clients where member_code = v_code);
  end loop;

  insert into clients (account_id, user_id, full_name, email, member_code, is_primary)
  values (v_account, auth.uid(), coalesce(v_name, 'Member'),
          coalesce(auth.jwt() ->> 'email', ''), v_code, true);

  return json_build_object('account_id', v_account, 'member_code', v_code);
end $$;
grant execute on function ensure_my_account(text) to authenticated;

-- Everything the member portal needs about the caller, in one call.
create or replace function my_profile()
returns json
language sql stable security definer set search_path = public as $$
  select json_build_object(
    'account_id', c.account_id,
    'full_name', c.full_name,
    'email', c.email,
    'member_code', c.member_code,
    'since', to_char(c.created_at, 'FMMonth YYYY'),
    'plan_id', s.plan_id,
    'status', s.status,
    'renews_on', to_char(s.current_period_end, 'FMMonth FMDD, YYYY'),
    'balance_cents', coalesce((select sum(l.amount_cents) from ledger_entries l where l.account_id = c.account_id), 0)
  )
  from clients c
  left join member_subscriptions s on s.account_id = c.account_id
  where c.user_id = auth.uid()
  limit 1;
$$;
grant execute on function my_profile() to authenticated;

-- Choose / switch the caller's plan (one subscription per account).
create or replace function set_my_plan(p_plan_id text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_account uuid;
begin
  select account_id into v_account from clients where user_id = auth.uid();
  if v_account is null then raise exception 'no account — call ensure_my_account first'; end if;
  if not exists (select 1 from membership_plans where id = p_plan_id and active) then
    raise exception 'unknown plan %', p_plan_id;
  end if;

  if exists (select 1 from member_subscriptions where account_id = v_account) then
    update member_subscriptions
    set plan_id = p_plan_id, status = 'active',
        current_period_end = (current_date + interval '1 month')::date
    where account_id = v_account;
  else
    insert into member_subscriptions (account_id, plan_id, status, current_period_end)
    values (v_account, p_plan_id, 'active', (current_date + interval '1 month')::date);
  end if;
end $$;
grant execute on function set_my_plan(text) to authenticated;

create or replace function cancel_my_membership()
returns void
language sql security definer set search_path = public as $$
  update member_subscriptions set status = 'canceling'
  where account_id in (select account_id from clients where user_id = auth.uid())
    and status = 'active';
$$;
grant execute on function cancel_my_membership() to authenticated;

create or replace function resume_my_membership()
returns void
language sql security definer set search_path = public as $$
  update member_subscriptions set status = 'active'
  where account_id in (select account_id from clients where user_id = auth.uid())
    and status = 'canceling';
$$;
grant execute on function resume_my_membership() to authenticated;

-- ── Availability (privacy-safe) ──────────────────────────────
-- Busy time ranges for a facility on one day — no names, no details.
-- Powers the booking flow's real availability for everyone.
create or replace function facility_busy(p_facility_id text, p_from timestamptz, p_to timestamptz)
returns table (busy_from timestamptz, busy_to timestamptz)
language sql stable security definer set search_path = public as $$
  select lower(during), upper(during)
  from bookings
  where facility_id = p_facility_id
    and status in ('hold', 'confirmed')
    and during && tstzrange(p_from, p_to);
$$;
grant execute on function facility_busy(text, timestamptz, timestamptz) to anon, authenticated;

-- ── Staff administration ─────────────────────────────────────
-- Owners/managers link a staff row to a login by email (auth.users is
-- not readable from the client).
create or replace function link_staff_login(p_staff_id uuid, p_email text)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid;
begin
  if not is_staff_admin() then raise exception 'owners and managers only'; end if;
  select id into v_user from auth.users where lower(email) = lower(trim(p_email)) limit 1;
  if v_user is null then return false; end if;
  update staff set user_id = v_user where id = p_staff_id;
  return true;
end $$;
grant execute on function link_staff_login(uuid, text) to authenticated;

-- The caller's own staff row (null if not staff) — used by the admin gate.
create or replace function my_staff()
returns json
language sql stable security definer set search_path = public as $$
  select json_build_object('id', id, 'name', name, 'role', role)
  from staff where user_id = auth.uid() and active limit 1;
$$;
grant execute on function my_staff() to authenticated;
