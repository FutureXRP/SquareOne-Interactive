-- ── Add-on double-booking protection ─────────────────────────
-- There is one inflatable — two parties can't rent it at the same time.
-- Bookings now carry their picked add-on ids, a trigger rejects any
-- booking whose time overlaps another booking holding the same add-on,
-- and shoppers can ask which add-ons are already spoken for in a window
-- so the picker greys them out before checkout.
-- Run after 0021_addon_hourly_pricing.sql.

alter table bookings add column addon_ids text[] not null default '{}';
create index bookings_addon_idx on bookings using gin (addon_ids);

-- The room EXCLUDE constraint stops room overlaps; this trigger does the
-- same job for add-ons, which can travel between rooms. Same errcode as
-- the room conflict (23P01) so every existing conflict handler works.
create or replace function enforce_addon_availability()
returns trigger language plpgsql as $$
begin
  if new.addon_ids <> '{}' and new.status <> 'canceled' then
    if exists (
      select 1 from bookings b
      where b.id <> new.id
        and b.status <> 'canceled'
        and b.during && new.during
        and b.addon_ids && new.addon_ids
    ) then
      raise exception 'addon_conflict: an add-on on this booking is already booked for an overlapping time'
        using errcode = '23P01';
    end if;
  end if;
  return new;
end $$;

create trigger bookings_addon_conflict before insert or update on bookings
  for each row execute function enforce_addon_availability();

-- Which add-ons are already booked during [p_from, p_to)? Anyone may ask
-- (it leaks nothing but add-on ids), so the store can grey out chips.
create or replace function addons_taken(p_from timestamptz, p_to timestamptz)
returns text[] language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(distinct a), '{}')
  from bookings b, unnest(b.addon_ids) a
  where b.status <> 'canceled' and b.during && tstzrange(p_from, p_to);
$$;
grant execute on function addons_taken(timestamptz, timestamptz) to anon, authenticated;
