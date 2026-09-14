-- 0047: every member's login email reaches the desk.
-- Signup stamped clients.email once at row creation — and '' if the JWT
-- didn't carry it at that instant. Members created before that, or whose
-- first stamp came up empty, showed "no email on file" on their bookings
-- forever, even though they sign in with that address every visit.
-- Two fixes: backfill every linked client row from auth.users now, and
-- teach ensure_my_account (runs at each sign-in) to repair a blank email
-- from the live JWT so this never goes stale again.
-- Run after 0046_event_room_hold.sql.

update clients c
set email = u.email
from auth.users u
where c.user_id = u.id
  and u.email is not null
  and (c.email is null or btrim(c.email) = '');

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

  return json_build_object('account_id', v_account, 'member_code', v_code);
end $$;
grant execute on function ensure_my_account(text) to authenticated;
