-- 0060: reservation workflow hardening (from the full audit).
--
--  1. release_expired_holds() could be called by ANYONE, signed in or not,
--     and canceled every hold past its original 24 hours — including
--     parties weeks out that owe nothing yet. Locked down.
--  2. A customer's own booking insert could set the price, the deposit,
--     "approved", a fake card on file, the setup/cleanup buffer, a package
--     (which books every package room), or the companion link that skips
--     the package's other rooms. Customer inserts are now forced to safe
--     values; the room's notice window, the room being active, and a sane
--     length are checked here too, not just in the browser.
--  3. The add-on double-booking check only saw the customer's own bookings
--     (it ran with their permissions) and ignored setup/cleanup time. It
--     now sees every booking, pads both windows, and takes a lock so two
--     simultaneous requests for the one inflatable can't both win.
--  4. Moving an unpaid hold resets its 24-hour clock, so a party moved
--     back out past 14 days isn't removed on the old deadline.
--  5. One Stripe payment can't be recorded twice (webhook + return page).
--  6. Customers can't cancel or move a single extra room of a package,
--     can't cancel after the event has started, and canceling twice no
--     longer relabels a staff cancel as theirs.
--  7. Approving a change request no longer quietly approves the booking.
--  8. Desk payments show in the customer's account.
--  9. Columns for pre-event reminders; finished events are closed out.
-- 10. Desk bookings are adopted by a new login only once its email is
--     confirmed.
-- Run after 0059_agreement_files.sql.

-- ── 1 ─────────────────────────────────────────────────────────
revoke execute on function release_expired_holds() from public, anon, authenticated;

-- ── 2 ─────────────────────────────────────────────────────────
create or replace function bookings_guard_customer_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  f facilities%rowtype;
  p event_packages%rowtype;
  v_email text;
  v_hours numeric;
begin
  -- Staff, the server, and scheduled jobs write what they mean — and so
  -- does the database itself (a package's extra rooms, inserted by the
  -- package trigger inside the customer's own insert).
  if auth.uid() is null or coalesce(auth.role(), '') = 'service_role' or is_staff()
     or pg_trigger_depth() > 1 then
    return new;
  end if;
  if new.lead_booking_id is not null then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select * into f from facilities where id = new.facility_id;
  if not found or not f.active then
    raise exception 'that room is not available to book' using errcode = '22023';
  end if;
  if lower(new.during) < now() + make_interval(hours => coalesce(f.min_notice_hours, 48)) then
    raise exception 'that time is inside the % hour notice window', coalesce(f.min_notice_hours, 48)
      using errcode = '22023';
  end if;
  v_hours := extract(epoch from (upper(new.during) - lower(new.during))) / 3600;

  -- What only the house decides.
  new.org_id := (select id from organizations limit 1);
  new.code := 'BK-' || nextval('booking_code_seq')::text;
  new.pay_token := gen_random_uuid();
  new.status := 'hold';
  new.approved_at := null;
  new.approved_by := null;
  new.created_by := null;
  new.hold_warned_at := null;
  new.hold_expires_at := null;
  new.card_customer_id := null;
  new.card_pm_id := null;
  new.card_brand := null;
  new.card_last4 := null;
  new.card_saved_at := null;
  new.run_by_staff_id := null;
  new.payout_cents := null;
  new.payout_paid_at := null;
  new.payout_method := null;
  new.canceled_at := null;
  new.canceled_by := null;
  new.canceled_via := null;
  new.standing_id := null;
  new.setup_min := coalesce(f.setup_min, 0);
  new.cleanup_min := coalesce(f.cleanup_min, 0);
  -- Emails go to the address they signed in with.
  select email into v_email from auth.users where id = auth.uid();
  if v_email is not null and v_email <> '' then
    new.contact_email := v_email;
  end if;

  if new.package_id is not null then
    select * into p from event_packages where id = new.package_id;
    if not found or not p.active
       or not exists (select 1 from event_package_rooms where package_id = p.id and facility_id = new.facility_id) then
      raise exception 'that package is not available' using errcode = '22023';
    end if;
    if v_hours <= 0 or v_hours > p.hours + 0.01 then
      raise exception 'that package is % hours', p.hours using errcode = '22023';
    end if;
    new.price_cents := p.price_cents;
  else
    if v_hours < 0.5 or v_hours > 12 then
      raise exception 'bookings run from 30 minutes to 12 hours' using errcode = '22023';
    end if;
    -- A priced room can't be requested for free; the exact figure is
    -- checked by staff when they approve the request.
    if f.per_hour_cents > 0 and new.price_cents <= 0 then
      raise exception 'that booking is missing its price' using errcode = '22023';
    end if;
  end if;
  new.deposit_cents := case
    when f.deposit_required and f.deposit_cents > 0 then least(f.deposit_cents, new.price_cents)
    else null end;
  return new;
end $$;
-- Named to run before every other BEFORE INSERT trigger on bookings, so
-- buffers and add-on checks see the forced values.
create trigger bookings_0_guard_customer_insert before insert on bookings
  for each row execute function bookings_guard_customer_insert();

-- ── 3 ─────────────────────────────────────────────────────────
create or replace function enforce_addon_availability()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.addon_ids <> '{}' and new.status in ('hold', 'confirmed') then
    -- One at a time, so two simultaneous requests can't both pass.
    perform pg_advisory_xact_lock(hashtext('bookings.addon_ids'));
    if exists (
      select 1 from bookings b
       where b.id <> new.id
         and b.status in ('hold', 'confirmed')
         and b.addon_ids && new.addon_ids
         and booking_block(b.during, b.setup_min, b.cleanup_min)
             && booking_block(new.during, coalesce(new.setup_min, 0), coalesce(new.cleanup_min, 0))
    ) then
      raise exception 'addon_conflict: an add-on on this booking is already booked for an overlapping time'
        using errcode = '23P01';
    end if;
  end if;
  return new;
end $$;

-- ── 4 ─────────────────────────────────────────────────────────
create or replace function bookings_reset_hold_clock()
returns trigger language plpgsql as $$
begin
  if new.status = 'hold' and new.during is distinct from old.during then
    new.hold_warned_at := null;
    new.hold_expires_at := null;
  end if;
  return new;
end $$;
create trigger bookings_reset_hold_clock before update of during on bookings
  for each row execute function bookings_reset_hold_clock();

-- ── 5 ─────────────────────────────────────────────────────────
-- Only if no duplicates already exist; otherwise they're listed for a
-- person to sort out, and the app's own check keeps working.
do $$
begin
  if exists (
    select stripe_payment_intent_id from payments
     where stripe_payment_intent_id is not null
     group by stripe_payment_intent_id having count(*) > 1
  ) then
    raise notice 'Duplicate Stripe payments exist — not adding the unique index yet: %',
      (select string_agg(stripe_payment_intent_id, ', ') from (
         select stripe_payment_intent_id from payments where stripe_payment_intent_id is not null
          group by stripe_payment_intent_id having count(*) > 1) d);
  else
    create unique index payments_stripe_ref_unique on payments (stripe_payment_intent_id)
      where stripe_payment_intent_id is not null;
  end if;
end $$;

-- ── 6 ─────────────────────────────────────────────────────────
create or replace function member_cancel_booking(p_id uuid)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_account uuid;
  v_status booking_status;
  v_lead uuid;
  v_during tstzrange;
begin
  select account_id, status, lead_booking_id, during into v_account, v_status, v_lead, v_during
    from bookings where id = p_id;
  if v_account is null or v_account not in (select my_account_ids()) then
    raise exception 'not your booking' using errcode = '42501';
  end if;
  if v_lead is not null then
    raise exception 'that room is part of another booking — cancel that booking instead' using errcode = '22023';
  end if;
  if v_status = 'canceled' then
    return true; -- already canceled; keep who did it
  end if;
  if v_status = 'completed' or lower(v_during) <= now() then
    raise exception 'that booking already happened' using errcode = '22023';
  end if;
  update bookings
     set status = 'canceled', canceled_at = now(), canceled_by = null, canceled_via = 'member'
   where id = p_id;
  return true;
end $$;
grant execute on function member_cancel_booking(uuid) to authenticated;

create or replace function member_reschedule_booking(p_id uuid, p_from timestamptz, p_to timestamptz)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_account uuid;
  v_status booking_status;
  v_facility text;
  v_during tstzrange;
  v_lead uuid;
  v_notice int;
  v_rooms text[];
  v_taken text[];
begin
  select account_id, status, facility_id, during, lead_booking_id
    into v_account, v_status, v_facility, v_during, v_lead
    from bookings where id = p_id;
  if v_account is null or v_account not in (select my_account_ids()) then
    raise exception 'not your booking' using errcode = '42501';
  end if;
  if v_lead is not null then
    raise exception 'that room is part of another booking — move that booking instead' using errcode = '22023';
  end if;
  if v_status in ('completed', 'canceled') then
    raise exception 'that booking can no longer be moved' using errcode = '22023';
  end if;
  if p_to <= p_from then
    raise exception 'end must come after start' using errcode = '22023';
  end if;
  if extract(epoch from (p_to - p_from)) / 3600 > 12 then
    raise exception 'bookings run up to 12 hours' using errcode = '22023';
  end if;
  select coalesce(min_notice_hours, 48) into v_notice from facilities where id = v_facility;
  if p_from < now() + make_interval(hours => coalesce(v_notice, 48)) then
    raise exception 'that time is inside the % hour notice window', coalesce(v_notice, 48)
      using errcode = '22023';
  end if;

  v_rooms := booking_room_ids(p_id);
  v_taken := booking_group_conflicts(p_id, tstzrange(p_from, p_to, '[)'), v_rooms);
  if array_length(v_taken, 1) > 0 then
    raise exception 'conflict: % already booked at that time', array_to_string(v_taken, ', ')
      using errcode = '23P01';
  end if;

  update booking_change_requests set status = 'withdrawn', decided_at = now()
   where booking_id = p_id and status = 'pending' and source = 'reschedule';
  insert into booking_change_requests (booking_id, source, requested_by, old_during, new_during, old_room_ids)
  values (p_id, 'reschedule', auth.uid(), v_during, tstzrange(p_from, p_to, '[)'), v_rooms);
  return true;
end $$;
grant execute on function member_reschedule_booking(uuid, timestamptz, timestamptz) to authenticated;

-- ── 7 ─────────────────────────────────────────────────────────
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
        select org_id, v_room, account_id, title, client_name, during, 'confirmed', 0, v_staff, now(), id,
               'Companion room — part of ' || code || ', priced on that booking.'
          from bookings where id = b.id;
      end if;
    end loop;
  end if;

  if r.new_addon_ids is not null then
    update bookings set addon_ids = r.new_addon_ids where id = b.id;
  end if;

  -- The booking's own review (approved_at) is left exactly as it was: a
  -- yes to the change is not a yes to a reservation nobody reviewed.
  update booking_change_requests
     set status = 'approved', decided_at = now(), decided_by = v_staff, decision_note = nullif(trim(p_note), '')
   where id = r.id;
  return true;
end $$;
grant execute on function approve_booking_change(uuid, text) to authenticated;

-- ── 8 ─────────────────────────────────────────────────────────
update payments p set account_id = b.account_id
  from bookings b
 where p.booking_id = b.id and p.account_id is null and b.account_id is not null;
create policy "member read own booking payments" on payments for select
  using (booking_id in (select id from bookings where account_id in (select my_account_ids())));

-- ── 9 ─────────────────────────────────────────────────────────
alter table bookings add column reminder_week_sent_at timestamptz;
alter table bookings add column reminder_day_sent_at timestamptz;
alter table bookings add column staff_reminder_sent_at timestamptz;

-- Finished events close out: confirmed → completed; a hold whose event
-- came and went without being secured → canceled. Run by the hourly job
-- (service role only).
create or replace function close_out_past_bookings()
returns table (completed int, released int)
language plpgsql security definer set search_path = public as $$
declare
  v_done int;
  v_gone int;
begin
  with d as (
    update bookings set status = 'completed'
     where status = 'confirmed' and lead_booking_id is null and upper(during) < now() - interval '2 hours'
    returning 1
  ) select count(*) into v_done from d;
  with g as (
    update bookings
       set status = 'canceled', canceled_at = now(), canceled_via = 'hold_expired',
           note = coalesce(note || ' · ', '') || 'never secured; event date passed'
     where status = 'hold' and lead_booking_id is null and upper(during) < now() - interval '2 hours'
    returning 1
  ) select count(*) into v_gone from g;
  return query select v_done, v_gone;
end $$;
revoke execute on function close_out_past_bookings() from public, anon, authenticated;

-- ── 10 ────────────────────────────────────────────────────────
create or replace function ensure_my_account(p_full_name text)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_client clients%rowtype;
  v_account uuid;
  v_code text;
  v_name text := nullif(trim(p_full_name), '');
  v_email text := nullif(trim(coalesce(auth.jwt() ->> 'email', '')), '');
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

  insert into clients (account_id, user_id, full_name, email, member_code, is_primary)
  values (v_account, auth.uid(), coalesce(v_name, 'Member'),
          coalesce(v_email, ''), v_code, true);

  if v_email is not null and v_confirmed then
    update bookings set account_id = v_account
     where account_id is null
       and contact_email is not null
       and lower(contact_email) = lower(v_email);
  end if;

  return json_build_object('account_id', v_account, 'member_code', v_code);
end $$;
grant execute on function ensure_my_account(text) to authenticated;
