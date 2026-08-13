-- ── Standing reservations ────────────────────────────────────
-- Groups that use the building on a schedule: the fencing club two nights
-- a week, the American Legion one Saturday a month in the dining hall, the
-- VR group two Wednesdays a month.
--
-- The important design choice is that these do NOT become a second kind of
-- schedule the rest of the app has to remember to check. Each occurrence is
-- written into `bookings` like any other booking, so the no-overlap
-- exclusion constraint that has always guarded the calendar guards these
-- too — automatically, everywhere. The store greys the slots out, the desk
-- can't book over them, a member can't reschedule into them, and the Board
-- and Calendar show them without knowing what a recurrence is.
--
-- Run after 0034_waiver_records.sql.

create table standing_reservations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  facility_id text not null references facilities(id),
  title text not null,
  group_name text not null default '',
  contact_email text,
  -- 'weekly'  → every week (or every Nth week) on the chosen weekdays
  -- 'monthly' → the chosen weekdays, but only on the chosen occurrences
  --             of that weekday in the month (1st, 2nd, 3rd, 4th, last)
  pattern text not null default 'weekly' check (pattern in ('weekly', 'monthly')),
  days int[] not null default '{}',          -- 0=Sunday … 6=Saturday
  week_interval int not null default 1 check (week_interval between 1 and 4),
  monthly_nths int[] not null default '{}',  -- 1,2,3,4 and -1 for "last"
  start_h numeric(4,2) not null check (start_h >= 0 and start_h < 24),
  hours numeric(4,2) not null check (hours > 0 and hours <= 24),
  starts_on date not null,
  ends_on date,                              -- null = keeps going
  price_cents int not null default 0 check (price_cents >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger standing_reservations_updated before update on standing_reservations
  for each row execute function set_updated_at();

-- Which standing reservation put a booking on the calendar. Null for every
-- normal booking.
alter table bookings add column standing_id uuid references standing_reservations(id) on delete set null;
create index bookings_standing_idx on bookings (standing_id) where standing_id is not null;

alter table standing_reservations enable row level security;
create policy "staff all standing" on standing_reservations for all
  using (is_staff()) with check (is_staff());
-- Members never read the rule, only its effect on the calendar, which they
-- already see through facility_busy.

-- ── Occurrence dates ─────────────────────────────────────────
-- The dates a reservation lands on between two days. Kept as its own
-- function so the UI can preview a schedule before committing it.
create or replace function standing_dates(p_id uuid, p_from date, p_through date)
returns setof date
language plpgsql stable security definer set search_path = public as $$
declare
  r standing_reservations%rowtype;
  d date;
  v_dow int;
  v_nth int;
  v_from date;
begin
  if not is_staff() then return; end if;
  select * into r from standing_reservations where id = p_id;
  if not found then return; end if;

  v_from := greatest(p_from, r.starts_on);
  if r.ends_on is not null then p_through := least(p_through, r.ends_on); end if;

  d := v_from;
  while d <= p_through loop
    v_dow := extract(dow from d)::int;
    if v_dow = any(r.days) then
      if r.pattern = 'weekly' then
        -- Every Nth week, counted from the week the reservation starts.
        if r.week_interval <= 1
           or (floor((d - date_trunc('week', r.starts_on::timestamp)::date) / 7)::int % r.week_interval) = 0 then
          return next d;
        end if;
      else
        -- Which occurrence of this weekday it is inside its own month,
        -- with -1 meaning the last one.
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
grant execute on function standing_dates(uuid, date, date) to authenticated;

-- ── Writing them onto the calendar ───────────────────────────
-- Books every occurrence through a date. Anything already taken is
-- reported rather than forced — the calendar stays the gatekeeper, and
-- whoever booked first keeps the room.
create or replace function extend_standing_reservation(p_id uuid, p_through date)
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
  if not is_staff() then
    raise exception 'staff only' using errcode = '42501';
  end if;
  select * into r from standing_reservations where id = p_id;
  if not found or not r.active then
    return query select 0, 0, '{}'::date[];
    return;
  end if;

  for d in select * from standing_dates(p_id, current_date, p_through) loop
    v_from := (d + make_interval(mins => round(r.start_h * 60)::int)) at time zone 'America/Chicago';
    v_to := v_from + make_interval(mins => round(r.hours * 60)::int);

    -- Already on the calendar from an earlier run: leave it alone.
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
      -- Somebody already has the room then. Report it; don't overwrite.
      v_blocked := v_blocked + 1;
      v_blocked_dates := array_append(v_blocked_dates, d);
    end;
  end loop;

  return query select v_created, v_blocked, v_blocked_dates;
end $$;
grant execute on function extend_standing_reservation(uuid, date) to authenticated;

-- Take a standing reservation back off the calendar from a date forward.
-- Only the occurrences it created, only the ones still ahead of us — the
-- history of who used the building stays intact.
create or replace function clear_standing_reservation(p_id uuid, p_from date default null)
returns int
language plpgsql security definer set search_path = public as $$
declare
  v_from timestamptz;
  v_count int;
begin
  if not is_staff() then
    raise exception 'staff only' using errcode = '42501';
  end if;
  v_from := coalesce(p_from, current_date) at time zone 'America/Chicago';
  with gone as (
    delete from bookings
     where standing_id = p_id and lower(during) >= v_from
    returning 1
  ) select count(*)::int into v_count from gone;
  return v_count;
end $$;
grant execute on function clear_standing_reservation(uuid, date) to authenticated;
