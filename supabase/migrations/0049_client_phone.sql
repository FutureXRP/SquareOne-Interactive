-- 0049: clients get a phone number — and the desk can finally see it.
-- The clients table never had a phone column, yet the admin contact
-- lookup selected one; that query has been failing quietly since day
-- one, which is part of why staff "can't see client information".
-- Signup never asked for a phone either, so there was nothing to show.
-- This adds the column, and teaches ensure_my_account to accept an
-- optional phone at signup (and to fill a blank one at sign-in) the
-- same way it handles email. Staff edit any person's email and phone
-- from the Clients tab under their existing "staff all clients" policy.
-- Run after 0048_adopt_bookings_on_signup.sql.

alter table clients add column phone text;

-- The two-argument form replaces the old one-argument function so calls
-- with or without a phone both resolve cleanly.
drop function if exists ensure_my_account(text);

create function ensure_my_account(p_full_name text, p_phone text default null)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_client clients%rowtype;
  v_account uuid;
  v_code text;
  v_name text := nullif(trim(p_full_name), '');
  v_email text := nullif(trim(coalesce(auth.jwt() ->> 'email', '')), '');
  v_phone text := nullif(trim(coalesce(p_phone, '')), '');
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select * into v_client from clients where user_id = auth.uid();
  if found then
    if v_name is not null and v_client.full_name is distinct from v_name then
      update clients set full_name = v_name where id = v_client.id;
    end if;
    -- Blanks heal themselves at sign-in; filled values are left alone.
    if v_email is not null and (v_client.email is null or btrim(v_client.email) = '') then
      update clients set email = v_email where id = v_client.id;
    end if;
    if v_phone is not null and (v_client.phone is null or btrim(v_client.phone) = '') then
      update clients set phone = v_phone where id = v_client.id;
    end if;
    -- Claim any desk bookings taken against this login address.
    if v_email is not null then
      update bookings set account_id = v_client.account_id
       where account_id is null
         and contact_email is not null
         and lower(contact_email) = lower(v_email);
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

  insert into clients (account_id, user_id, full_name, email, phone, member_code, is_primary)
  values (v_account, auth.uid(), coalesce(v_name, 'Member'),
          coalesce(v_email, ''), v_phone, v_code, true);

  -- Brand-new account: adopt the bookings that were waiting for it.
  if v_email is not null then
    update bookings set account_id = v_account
     where account_id is null
       and contact_email is not null
       and lower(contact_email) = lower(v_email);
  end if;

  return json_build_object('account_id', v_account, 'member_code', v_code);
end $$;
grant execute on function ensure_my_account(text, text) to authenticated;
