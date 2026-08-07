-- ── Room photos ──────────────────────────────────────────────
-- Each room can have a photo used as its card and page background.
-- Run after 0004_form_assignments.sql.

alter table facilities add column photo_url text;

-- Public bucket: anyone can view room photos, only staff can manage them.
insert into storage.buckets (id, name, public)
values ('room-photos', 'room-photos', true)
on conflict (id) do nothing;

create policy "public read room photos" on storage.objects
  for select using (bucket_id = 'room-photos');
create policy "staff insert room photos" on storage.objects
  for insert with check (bucket_id = 'room-photos' and public.is_staff());
create policy "staff update room photos" on storage.objects
  for update using (bucket_id = 'room-photos' and public.is_staff());
create policy "staff delete room photos" on storage.objects
  for delete using (bucket_id = 'room-photos' and public.is_staff());
