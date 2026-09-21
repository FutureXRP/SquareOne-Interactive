-- 0048: "sign up to manage your booking" becomes literally true.
-- A staff-made booking taken against a bare email floats free of any
-- account (account_id null, contact_email set). The confirmation email
-- invites the customer to sign up with that same address — this makes
-- the promise real: every sign-in and signup now adopts any unclaimed
-- bookings whose contact email matches the caller's login address, so
-- they appear under My bookings the moment the account exists.
-- Only unclaimed rows (account_id is null) are touched — a booking
-- already linked to an account never moves.
-- Run after 0047_member_email_backfill.sql.

create or replace function ensure_my_account(p_full_name text)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_client clients%rowtype;
  v_account uuid;
  v_code text;
  v_name text := nullif(trim(p_full_name), '');
  v_email text := nullif(trim(coalesce(auth.jwt() ->> 'email', '')), '');
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select * into v_client from clients where user_id = auth.uid();
  if found then
    if v_name is not null and v_client.full_name is distinct from v_name then
      update clients set full_name = v_name where id = v_client.id;
    end if;
    -- A blank email heals itself at sign-in; a filled one is left alone
    -- (it may be a deliberately different contact address).
    if v_email is not null and (v_client.email is null or btrim(v_client.email) = '') then
      update clients set email = v_email where id = v_client.id;
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

  insert into clients (account_id, user_id, full_name, email, member_code, is_primary)
  values (v_account, auth.uid(), coalesce(v_name, 'Member'),
          coalesce(v_email, ''), v_code, true);

  -- Brand-new account: adopt the bookings that were waiting for it.
  if v_email is not null then
    update bookings set account_id = v_account
     where account_id is null
       and contact_email is not null
       and lower(contact_email) = lower(v_email);
  end if;

  return json_build_object('account_id', v_account, 'member_code', v_code);
end $$;
grant execute on function ensure_my_account(text) to authenticated;
