-- 0061: make the reservation workflows agree with each other (second
-- audit, for contradictions).
--
--  1. URGENT — sign-in/sign-up. 0060 recreated the one-argument
--     ensure_my_account(text) that 0049 had replaced with
--     ensure_my_account(text, text default null). With both present the
--     database can't choose, so creating an account at sign-up/sign-in
--     failed. The one-argument version is dropped; the two-argument one
--     gets 0060's protection (desk bookings are adopted only by a login
--     whose email is confirmed).
--  2. "Secured" means one thing everywhere: at least the deposit paid
--     (any payment when the booking has no deposit). Closing out past
--     events never cancels a hold that had money paid or a Cash App claim
--     waiting — those are completed or left for the desk.
--  3. A package's extra rooms take their lead's status (hold/confirmed)
--     instead of always "confirmed", and follow it when the lead is
--     secured.
--  4. Approving a customer's change request is refused when the booking
--     has changed since they asked (a staff edit in the meantime), and a
--     finished booking's pending requests are withdrawn.
-- Run after 0060_reservation_hardening.sql.

-- ── 1 ─────────────────────────────────────────────────────────
drop function if exists ensure_my_account(text);

create or replace function ensure_my_account(p_full_name text, p_phone text default null)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_client clients%rowtype;
  v_account uuid;
  v_code text;
  v_name text := nullif(trim(p_full_name), '');
  v_email text := nullif(trim(coalesce(auth.jwt() ->> 'email', '')), '');
  v_phone text := nullif(trim(coalesce(p_phone, '')), '');
  -- Only a login that has proven it owns the address may claim bookings
  -- made against it at the desk.
  v_confirmed boolean := exists (select 1 from auth.users where id = auth.uid() and email_confirmed_at is not null);
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select * into v_client from clients where user_id = auth.uid();
  if found then
    if v_name is not null and v_client.full_name is distinct from v_name then
      update clients set full_name = v_name where id = v_client.id;
    end if;
    if v_email is not null and (v_client.email is null or btrim(v_client.email) = '') then
      update clients set email = v_email where id = v_client.id;
    end if;
    if v_phone is not null and (v_client.phone is null or btrim(v_client.phone) = '') then
      update clients set phone = v_phone where id = v_client.id;
    end if;
    if v_email is not null and v_confirmed then
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

  if v_email is not null and v_confirmed then
    update bookings set account_id = v_account
     where account_id is null
       and contact_email is not null
       and lower(contact_email) = lower(v_email);
  end if;

  return json_build_object('account_id', v_account, 'member_code', v_code);
end $$;
grant execute on function ensure_my_account(text, text) to authenticated;

-- ── 2 ─────────────────────────────────────────────────────────
create or replace function close_out_past_bookings()
returns table (completed int, released int)
language plpgsql security definer set search_path = public as $$
declare
  v_done int;
  v_gone int;
begin
  -- Confirmed, or a hold that had money paid on it: it happened.
  with d as (
    update bookings b set status = 'completed'
     where b.lead_booking_id is null and upper(b.during) < now() - interval '2 hours'
       and (b.status = 'confirmed'
            or (b.status = 'hold' and exists (select 1 from payments p where p.booking_id = b.id and p.status = 'paid')))
    returning 1
  ) select count(*) into v_done from d;
  -- A hold that was never secured, with nothing paid and no Cash App
  -- claim waiting on the desk, is released.
  with g as (
    update bookings b
       set status = 'canceled', canceled_at = now(), canceled_via = 'hold_expired',
           note = coalesce(b.note || ' · ', '') || 'never secured; event date passed'
     where b.status = 'hold' and b.lead_booking_id is null and upper(b.during) < now() - interval '2 hours'
       and not exists (select 1 from payments p where p.booking_id = b.id and p.status = 'paid')
       and not exists (select 1 from payment_claims c where c.booking_id = b.id and c.status = 'pending')
    returning 1
  ) select count(*) into v_gone from g;
  return query select v_done, v_gone;
end $$;
revoke execute on function close_out_past_bookings() from public, anon, authenticated;

-- ── 3 ─────────────────────────────────────────────────────────
create or replace function bookings_package_rooms()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.package_id is null or new.lead_booking_id is not null
     or new.status not in ('hold', 'confirmed') then
    return new;
  end if;
  insert into bookings (org_id, facility_id, account_id, title, client_name, during, status,
                        price_cents, created_by, approved_at, lead_booking_id, note)
  select new.org_id, r.facility_id, new.account_id, new.title, new.client_name, new.during,
         new.status, 0, new.created_by, new.approved_at, new.id,
         'Package room — part of ' || new.code || ', priced on that booking.'
    from event_package_rooms r
   where r.package_id = new.package_id
     and r.facility_id <> new.facility_id
     and not exists (select 1 from bookings c where c.lead_booking_id = new.id and c.facility_id = r.facility_id);
  return new;
end $$;

create or replace function bookings_sync_companions()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.lead_booking_id is not null then
    return new;
  end if;
  if new.during is distinct from old.during then
    update bookings set during = new.during
     where lead_booking_id = new.id and status in ('hold', 'confirmed');
  end if;
  if new.approved_at is distinct from old.approved_at then
    update bookings set approved_at = new.approved_at, approved_by = new.approved_by
     where lead_booking_id = new.id and status in ('hold', 'confirmed');
  end if;
  if new.status is distinct from old.status then
    if new.status = 'canceled' then
      update bookings
         set status = 'canceled', canceled_at = coalesce(new.canceled_at, now()),
             canceled_via = new.canceled_via, canceled_by = new.canceled_by
       where lead_booking_id = new.id and status in ('hold', 'confirmed');
    elsif new.status = 'completed' then
      update bookings set status = 'completed'
       where lead_booking_id = new.id and status in ('hold', 'confirmed');
    elsif new.status in ('hold', 'confirmed') and old.status in ('hold', 'confirmed') then
      update bookings set status = new.status
       where lead_booking_id = new.id and status in ('hold', 'confirmed');
    elsif old.status = 'canceled' and new.status in ('hold', 'confirmed') then
      update bookings
         set status = new.status, during = new.during,
             canceled_at = null, canceled_via = null, canceled_by = null
       where lead_booking_id = new.id and status = 'canceled';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists bookings_sync_companions on bookings;
create trigger bookings_sync_companions after update of during, status, approved_at on bookings
  for each row execute function bookings_sync_companions();

-- Existing companions take their lead's status and review now.
update bookings c
   set status = l.status, approved_at = l.approved_at
  from bookings l
 where c.lead_booking_id = l.id
   and c.status in ('hold', 'confirmed') and l.status in ('hold', 'confirmed')
   and (c.status is distinct from l.status or c.approved_at is distinct from l.approved_at);

-- ── 4 ─────────────────────────────────────────────────────────
create or replace function approve_booking_change(p_request uuid, p_note text default null)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  r booking_change_requests%rowtype;
  b bookings%rowtype;
  v_staff uuid;
  v_rooms text[];
  v_lead_room text;
  v_room text;
begin
  if not can_decide_changes() then
    raise exception 'only an owner, admin, or manager can approve changes' using errcode = '42501';
  end if;
  select id into v_staff from staff where user_id = auth.uid() and active limit 1;
  select * into r from booking_change_requests where id = p_request for update;
  if not found or r.status <> 'pending' then
    raise exception 'that request has already been answered' using errcode = '22023';
  end if;
  select * into b from bookings where id = r.booking_id for update;
  if b.status not in ('hold', 'confirmed') then
    raise exception 'that booking is no longer active' using errcode = '22023';
  end if;
  -- The request was made against the booking as it was then. If staff
  -- have moved it since, approving would undo their change.
  if r.old_during is not null and r.old_during is distinct from b.during then
    raise exception 'the booking has changed since this request — decline it and talk with the customer'
      using errcode = '22023';
  end if;

  if r.new_during is not null and r.new_during is distinct from b.during then
    update bookings set during = r.new_during where id = b.id;
  end if;

  if r.new_room_ids is not null and array_length(r.new_room_ids, 1) > 0 then
    v_rooms := r.new_room_ids;
    v_lead_room := case when b.facility_id = any(v_rooms) then b.facility_id else v_rooms[1] end;
    update bookings set status = 'canceled', canceled_at = now(), canceled_via = 'staff', canceled_by = v_staff
     where lead_booking_id = b.id and status in ('hold', 'confirmed')
       and (not (facility_id = any(v_rooms)) or facility_id = v_lead_room);
    if v_lead_room <> b.facility_id then
      update bookings
         set facility_id = v_lead_room,
             setup_min = coalesce((select setup_min from facilities where id = v_lead_room), 0),
             cleanup_min = coalesce((select cleanup_min from facilities where id = v_lead_room), 0)
       where id = b.id;
    end if;
    foreach v_room in array v_rooms loop
      if v_room <> v_lead_room and not exists (
        select 1 from bookings where lead_booking_id = b.id and facility_id = v_room and status in ('hold', 'confirmed')
      ) then
        insert into bookings (org_id, facility_id, account_id, title, client_name, during, status,
                              price_cents, created_by, approved_at, lead_booking_id, note)
        select org_id, v_room, account_id, title, client_name, during, status, 0, v_staff, approved_at, id,
               'Companion room — part of ' || code || ', priced on that booking.'
          from bookings where id = b.id;
      end if;
    end loop;
  end if;

  if r.new_addon_ids is not null then
    update bookings set addon_ids = r.new_addon_ids where id = b.id;
  end if;

  update booking_change_requests
     set status = 'approved', decided_at = now(), decided_by = v_staff, decision_note = nullif(trim(p_note), '')
   where id = r.id;
  return true;
end $$;
grant execute on function approve_booking_change(uuid, text) to authenticated;

create or replace function bookings_withdraw_requests()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status in ('canceled', 'completed') and old.status is distinct from new.status then
    update booking_change_requests set status = 'withdrawn', decided_at = now()
     where booking_id = new.id and status = 'pending';
  end if;
  return new;
end $$;
