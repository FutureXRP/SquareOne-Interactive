-- 0062: clients may arrive 1 hour before their booking — every room's
-- setup window is now at least 60 minutes, as the Event Rental Agreement
-- says ("Renter may arrive 1 hour before the scheduled start time").
--
-- The setup window is what the booking page, the agreement's "Setup time
-- (arrive)", the emails' "arrive as early as", and the staff schedule all
-- read — and the calendar holds it so nobody else is booked into it.
--
-- Rooms below an hour go to an hour. Upcoming live bookings below an hour
-- go to an hour too, one by one: where the extra time would overlap a
-- booking right before it, that booking is left as it was and listed at
-- the end so a person can sort it out. Calendar events' $0 room holds
-- (tours, meetings) are left alone — they aren't rentals.
-- Run after 0061_workflow_consistency.sql.

update facilities set setup_min = 60 where setup_min < 60;

create temp table arrival_conflicts (booking text, customer text, room text, starts timestamptz, conflicts_with text)
  on commit preserve rows;

do $$
declare b record;
begin
  for b in
    select id, code, client_name, facility_id, during, setup_min, cleanup_min from bookings
     where status in ('hold', 'confirmed') and lower(during) > now()
       and setup_min < 60
       and (price_cents > 0 or lead_booking_id is not null)
     order by lower(during)
  loop
    begin
      update bookings set setup_min = 60 where id = b.id;
    exception when exclusion_violation then
      insert into arrival_conflicts
        select b.code, b.client_name, b.facility_id, lower(b.during),
               coalesce((select string_agg(x.code || ' ' || x.title || ' (' || x.client_name || ')', '; ')
                           from bookings x
                          where x.facility_id = b.facility_id and x.id <> b.id and x.status in ('hold', 'confirmed')
                            and booking_block(x.during, x.setup_min, x.cleanup_min)
                                && booking_block(b.during, 60, b.cleanup_min)), 'the booking before it');
    end;
  end loop;
end $$;

-- New $0 room holds for calendar events keep no setup window of their own
-- (the room's buffers are for rentals).
create or replace function bookings_default_buffers()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if coalesce(new.price_cents, 0) = 0 and new.lead_booking_id is null then
    return new;
  end if;
  if coalesce(new.setup_min, 0) = 0 and coalesce(new.cleanup_min, 0) = 0 then
    select coalesce(f.setup_min, 0), coalesce(f.cleanup_min, 0)
      into new.setup_min, new.cleanup_min
      from facilities f where f.id = new.facility_id;
    new.setup_min := coalesce(new.setup_min, 0);
    new.cleanup_min := coalesce(new.cleanup_min, 0);
  end if;
  return new;
end $$;

-- Anything below means two bookings are now too close for a 1-hour
-- arrival — call the later customer, or move one of them. Empty = all set.
select booking, customer, room,
       to_char(starts at time zone 'America/Chicago', 'Dy Mon DD, HH12:MI AM') as starts, conflicts_with
  from arrival_conflicts order by starts;
