-- ── Open-ended standing reservations that stay open-ended ────
-- A standing reservation with no end date promises the group their slot
-- indefinitely, but 0035 only wrote occurrences as far as whatever date a
-- human last pressed "book more dates" through. Past that horizon the
-- fencing club's Tuesdays simply stop existing, and the store would
-- cheerfully rent the gym out from under them.
--
-- This makes the promise true: the scheduler rolls every active
-- reservation forward on its own, so the calendar always holds the next
-- six months.
--
-- The booking loop moves into an internal function so it has exactly one
-- implementation, called two ways — by staff from the Calendar tab, and by
-- the scheduler, which has no auth.uid() and therefore cannot pass
-- is_staff(). Run after 0035_standing_reservations.sql.

-- The date generator, minus the is_staff() gate, for the same reason.
-- standing_dates() stays as the staff-facing preview and now delegates here.
create or replace function standing_dates_all(p_id uuid, p_from date, p_through date)
returns setof date
language plpgsql stable security definer set search_path = public as $$
declare
  r standing_reservations%rowtype;
  d date;
  v_dow int;
  v_nth int;
  v_from date;
begin
  select * into r from standing_reservations where id = p_id;
  if not found then return; end if;

  v_from := greatest(p_from, r.starts_on);
  -- No end date means it simply keeps going; the caller's horizon is the
  -- only limit.
  if r.ends_on is not null then p_through := least(p_through, r.ends_on); end if;

  d := v_from;
  while d <= p_through loop
    v_dow := extract(dow from d)::int;
    if v_dow = any(r.days) then
      if r.pattern = 'weekly' then
        if r.week_interval <= 1
           or (floor((d - date_trunc('week', r.starts_on::timestamp)::date) / 7)::int % r.week_interval) = 0 then
          return next d;
        end if;
      else
        v_nth := floor((extract(day from d)::int - 1) / 7)::int + 1;
        if v_nth = any(r.monthly_nths)
           or (-1 = any(r.monthly_nths)
               and extract(day from d)::int + 7 > extract(day from (date_trunc('month', d::timestamp) + interval '1 month - 1 day'))::int) then
          return next d;
        end if;
      end if;
    end if;
    d := d + 1;
  end loop;
end $$;
revoke execute on function standing_dates_all(uuid, date, date) from public, anon, authenticated;

-- The loop itself. No permission check: it is not reachable from a
-- browser (execute is revoked below) and both callers do their own.
create or replace function standing_book_range(p_id uuid, p_from date, p_through date)
returns table (created int, blocked int, blocked_on date[])
language plpgsql security definer set search_path = public as $$
declare
  r standing_reservations%rowtype;
  d date;
  v_from timestamptz;
  v_to timestamptz;
  v_created int := 0;
  v_blocked int := 0;
  v_blocked_dates date[] := '{}';
begin
  select * into r from standing_reservations where id = p_id;
  if not found or not r.active then
    return query select 0, 0, '{}'::date[];
    return;
  end if;

  for d in select * from standing_dates_all(p_id, p_from, p_through) loop
    v_from := (d + make_interval(mins => round(r.start_h * 60)::int)) at time zone 'America/Chicago';
    v_to := v_from + make_interval(mins => round(r.hours * 60)::int);

    if exists (
      select 1 from bookings
       where standing_id = p_id and during = tstzrange(v_from, v_to, '[)')
         and status in ('hold', 'confirmed')
    ) then
      continue;
    end if;

    begin
      insert into bookings (
        org_id, facility_id, title, client_name, during, status,
        price_cents, standing_id, approved_at, note
      ) values (
        r.org_id, r.facility_id, r.title,
        coalesce(nullif(r.group_name, ''), r.title),
        tstzrange(v_from, v_to, '[)'), 'confirmed',
        r.price_cents, r.id, now(),
        'Standing reservation'
      );
      v_created := v_created + 1;
    exception when exclusion_violation then
      v_blocked := v_blocked + 1;
      v_blocked_dates := array_append(v_blocked_dates, d);
    end;
  end loop;

  return query select v_created, v_blocked, v_blocked_dates;
end $$;
revoke execute on function standing_book_range(uuid, date, date) from public, anon, authenticated;

-- Staff-facing preview, unchanged in behaviour.
create or replace function standing_dates(p_id uuid, p_from date, p_through date)
returns setof date
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_staff() then return; end if;
  return query select * from standing_dates_all(p_id, p_from, p_through);
end $$;
grant execute on function standing_dates(uuid, date, date) to authenticated;

-- Staff-facing booking, unchanged in behaviour.
create or replace function extend_standing_reservation(p_id uuid, p_through date)
returns table (created int, blocked int, blocked_on date[])
language plpgsql security definer set search_path = public as $$
begin
  if not is_staff() then
    raise exception 'staff only' using errcode = '42501';
  end if;
  return query select * from standing_book_range(p_id, current_date, p_through);
end $$;
grant execute on function extend_standing_reservation(uuid, date) to authenticated;

-- ── The scheduler's job ──────────────────────────────────────
-- Keeps every live reservation booked out p_days ahead. Reservations that
-- have passed their end date are skipped; ones with no end date roll
-- forward forever, which is the whole point. Safe to run as often as you
-- like — already-booked dates are left alone.
create or replace function roll_standing_reservations(p_days int default 180)
returns table (reservations int, created int, blocked int)
language plpgsql security definer set search_path = public as $$
declare
  rec record;
  res record;
  v_seen int := 0;
  v_created int := 0;
  v_blocked int := 0;
begin
  for rec in
    select id from standing_reservations
     where active and (ends_on is null or ends_on >= current_date)
  loop
    select * into res from standing_book_range(rec.id, current_date, current_date + p_days);
    v_seen := v_seen + 1;
    v_created := v_created + coalesce(res.created, 0);
    v_blocked := v_blocked + coalesce(res.blocked, 0);
  end loop;
  return query select v_seen, v_created, v_blocked;
end $$;
-- The scheduler calls this with the service role. No browser should be
-- able to, so nobody else gets execute.
revoke execute on function roll_standing_reservations(int) from public, anon, authenticated;

-- Catch up anything that was already sitting short of the horizon.
select * from roll_standing_reservations(180);
