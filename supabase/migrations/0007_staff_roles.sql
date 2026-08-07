-- ── Staff roles: Owner, Admin, Manager, Staff ────────────────
-- Owner and Admin can edit everything. Manager and Staff run day-to-day
-- operations (bookings, payments, clients, schedules, check-ins) but cannot
-- change the store's structure: rooms, prices, plans, coupons, packages,
-- forms, programs, products, company info, or staff.
-- Run after 0006_room_rates.sql (needs the products table from 0003 and the
-- room-photos policies from 0005).

-- 1) Convert the role column to text with the new role set.
--    Existing front_desk and coach staff become 'staff'; managers stay managers.
alter table staff alter column role drop default;
alter table staff alter column role type text using role::text;
drop type if exists staff_role;
update staff set role = 'staff' where role in ('front_desk', 'coach');
alter table staff add constraint staff_role_check
  check (role in ('owner', 'admin', 'manager', 'staff'));
alter table staff alter column role set default 'staff';

-- 2) Owner + Admin are the structural editors.
create or replace function is_staff_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from staff
    where user_id = auth.uid() and active and role in ('owner', 'admin')
  );
$$;

-- Every active staff member can take bookings and payments.
create or replace function can_take_bookings()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from staff where user_id = auth.uid() and active);
$$;

-- Linking staff logins follows is_staff_admin(); refresh its error message.
create or replace function link_staff_login(p_staff_id uuid, p_email text)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid;
begin
  if not is_staff_admin() then raise exception 'owners and admins only'; end if;
  select id into v_user from auth.users where lower(email) = lower(trim(p_email)) limit 1;
  if v_user is null then return false; end if;
  update staff set user_id = v_user where id = p_staff_id;
  return true;
end $$;

-- 3) Structural tables: writes become Owner/Admin only.
--    (Reads are unchanged; day-to-day tables — bookings, payments, ledger,
--    clients, accounts, subscriptions, registrations, check-ins — keep their
--    existing all-staff policies.)
drop policy "staff write site config" on site_config;
create policy "admin write site config" on site_config
  for all using (is_staff_admin()) with check (is_staff_admin());

drop policy "staff write facilities" on facilities;
create policy "admin write facilities" on facilities
  for all using (is_staff_admin()) with check (is_staff_admin());

drop policy "staff write facility prices" on facility_prices;
create policy "admin write facility prices" on facility_prices
  for all using (is_staff_admin()) with check (is_staff_admin());

drop policy "staff write packages" on event_packages;
create policy "admin write packages" on event_packages
  for all using (is_staff_admin()) with check (is_staff_admin());

drop policy "staff write package rooms" on event_package_rooms;
create policy "admin write package rooms" on event_package_rooms
  for all using (is_staff_admin()) with check (is_staff_admin());

drop policy "staff write package items" on event_package_items;
create policy "admin write package items" on event_package_items
  for all using (is_staff_admin()) with check (is_staff_admin());

drop policy "staff write plans" on membership_plans;
create policy "admin write plans" on membership_plans
  for all using (is_staff_admin()) with check (is_staff_admin());

drop policy "staff write plan features" on membership_plan_features;
create policy "admin write plan features" on membership_plan_features
  for all using (is_staff_admin()) with check (is_staff_admin());

drop policy "staff write coupons" on coupons;
create policy "admin write coupons" on coupons
  for all using (is_staff_admin()) with check (is_staff_admin());

drop policy "staff write forms" on forms;
create policy "admin write forms" on forms
  for all using (is_staff_admin()) with check (is_staff_admin());

drop policy "staff write programs" on programs;
create policy "admin write programs" on programs
  for all using (is_staff_admin()) with check (is_staff_admin());

drop policy "staff write products" on products;
create policy "admin write products" on products
  for all using (is_staff_admin()) with check (is_staff_admin());

-- Room photos: uploading/replacing is structural too.
drop policy "staff insert room photos" on storage.objects;
create policy "admin insert room photos" on storage.objects
  for insert with check (bucket_id = 'room-photos' and public.is_staff_admin());

drop policy "staff update room photos" on storage.objects;
create policy "admin update room photos" on storage.objects
  for update using (bucket_id = 'room-photos' and public.is_staff_admin());

drop policy "staff delete room photos" on storage.objects;
create policy "admin delete room photos" on storage.objects
  for delete using (bucket_id = 'room-photos' and public.is_staff_admin());
