-- 0056: every change a customer makes to their own booking reaches staff.
--
-- A client moved their event's time (My bookings → Move) and asked for
-- different rooms on the rental agreement, and nobody here heard about
-- either: the move only emailed the client, and the agreement's room
-- checkboxes went nowhere at all.
--
-- booking_changes is the record of what changed, who did it, and when —
-- written by the database itself on every move, room change, and cancel,
-- so no screen can forget to. Each customer change waits with alerted_at
-- null until staff have been emailed about it; the email goes out right
-- away, and the hourly job sends any that slipped through. Staff read the
-- history on the booking.
-- Run after 0055_no_double_booking.sql.

create table booking_changes (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references bookings(id) on delete cascade,
  changed_at timestamptz not null default now(),
  -- 'moved' | 'room' | 'canceled' | 'spaces_requested'
  kind text not null check (kind in ('moved', 'room', 'canceled', 'spaces_requested')),
  -- who: the customer (signed in, not staff), a staff member, or the system
  -- (pay link, scheduled jobs, the house's own server routes)
  actor text not null check (actor in ('customer', 'staff', 'system')),
  changed_by uuid,
  old_during tstzrange,
  new_during tstzrange,
  old_facility_id text,
  new_facility_id text,
  detail jsonb,
  alerted_at timestamptz
);
create index booking_changes_booking_idx on booking_changes (booking_id, changed_at desc);
create index booking_changes_unalerted_idx on booking_changes (changed_at) where alerted_at is null and actor = 'customer';

alter table booking_changes enable row level security;
create policy "staff read booking changes" on booking_changes for select using (is_staff());

create or replace function bookings_log_changes()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_actor text;
begin
  -- Companion rooms follow their lead; the lead's row tells the story.
  if new.lead_booking_id is not null then
    return new;
  end if;
  v_actor := case
    when v_uid is null or coalesce(auth.role(), '') = 'service_role' then 'system'
    when is_staff() then 'staff'
    else 'customer'
  end;
  if new.during is distinct from old.during then
    insert into booking_changes (booking_id, kind, actor, changed_by, old_during, new_during,
                                 old_facility_id, new_facility_id)
    values (new.id, 'moved', v_actor, v_uid, old.during, new.during, old.facility_id, new.facility_id);
  end if;
  if new.facility_id is distinct from old.facility_id then
    insert into booking_changes (booking_id, kind, actor, changed_by, old_during, new_during,
                                 old_facility_id, new_facility_id)
    values (new.id, 'room', v_actor, v_uid, old.during, new.during, old.facility_id, new.facility_id);
  end if;
  if new.status is distinct from old.status and new.status = 'canceled' then
    insert into booking_changes (booking_id, kind, actor, changed_by, old_during, new_during)
    values (new.id, 'canceled', v_actor, v_uid, old.during, new.during);
  end if;
  return new;
end $$;
create trigger bookings_log_changes after update of during, facility_id, status on bookings
  for each row execute function bookings_log_changes();
