-- ── Setup and cleanup time around bookings ───────────────────
-- A 6 PM party needs the room from 5 PM (setup) to 8:30-plus-cleanup, but
-- the customer books, sees, and pays for 6–8:30 only. The buffer is real
-- occupancy that must not be double-booked, and free time that must not
-- be billed.
--
-- The mechanism keeps both true at once: `during` stays the customer's
-- hours — what emails say, what pricing charges, what the calendar shows —
-- and the no-overlap exclusion constraint is rebuilt over the PADDED
-- window, so the database itself refuses anything that lands in setup or
-- cleanup. No code path has to remember buffers exist; the same
-- constraint that has always been the gatekeeper simply guards more time.
--
-- Buffers are copied onto each booking when it's made. That's deliberate:
-- changing a room's buffer later must not silently invalidate live
-- bookings that were checked under the old rule.
--
-- Run after 0038_cancel_attribution.sql.

alter table facilities add column setup_min int not null default 0 check (setup_min >= 0 and setup_min <= 480);
alter table facilities add column cleanup_min int not null default 0 check (cleanup_min >= 0 and cleanup_min <= 480);

alter table bookings add column setup_min int not null default 0 check (setup_min >= 0);
alter table bookings add column cleanup_min int not null default 0 check (cleanup_min >= 0);

-- The padded window a booking really occupies.
create or replace function booking_block(during tstzrange, setup_min int, cleanup_min int)
returns tstzrange
language sql immutable as $$
  select tstzrange(
    lower(during) - make_interval(mins => setup_min),
    upper(during) + make_interval(mins => cleanup_min),
    '[)'
  );
$$;

-- Rebuild the gatekeeper over the padded window. Live bookings all have
-- zero buffers right now, so the new constraint checks the same ranges the
-- old one did and cannot fail to apply.
alter table bookings drop constraint bookings_no_overlap;
alter table bookings add constraint bookings_no_overlap
  exclude using gist (
    facility_id with =,
    booking_block(during, setup_min, cleanup_min) with &&
  ) where (status in ('hold', 'confirmed'));

-- The store's slot picker greys out what's actually occupied, buffers
-- included — otherwise it would offer times the constraint then refuses.
create or replace function facility_busy(p_facility_id text, p_from timestamptz, p_to timestamptz)
returns table (busy_from timestamptz, busy_to timestamptz)
language sql stable security definer set search_path = public as $$
  select lower(booking_block(during, setup_min, cleanup_min)),
         upper(booking_block(during, setup_min, cleanup_min))
  from bookings
  where facility_id = p_facility_id
    and status in ('hold', 'confirmed')
    and booking_block(during, setup_min, cleanup_min) && tstzrange(p_from, p_to);
$$;
grant execute on function facility_busy(text, timestamptz, timestamptz) to anon, authenticated;

-- Standing reservations pick up the room's buffers as they book.
create or replace function standing_book_range(p_id uuid, p_from date, p_through date)
returns table (created int, blocked int, blocked_on date[])
language plpgsql security definer set search_path = public as $$
declare
  r standing_reservations%rowtype;
  v_setup int;
  v_cleanup int;
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
  select coalesce(setup_min, 0), coalesce(cleanup_min, 0) into v_setup, v_cleanup
    from facilities where id = r.facility_id;

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
        price_cents, standing_id, approved_at, note, setup_min, cleanup_min
      ) values (
        r.org_id, r.facility_id, r.title,
        coalesce(nullif(r.group_name, ''), r.title),
        tstzrange(v_from, v_to, '[)'), 'confirmed',
        r.price_cents, r.id, now(),
        'Standing reservation', v_setup, v_cleanup
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
