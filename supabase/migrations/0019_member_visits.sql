-- ── Member visits: self check-in / check-out ─────────────────
-- Members mark themselves in and out of the building from their account
-- page; the gap between the two is their workout time. Run after
-- 0018_messages.sql.

alter table check_ins add column account_id uuid references client_accounts(id) on delete set null;
alter table check_ins add column checked_out_at timestamptz;
create index check_ins_account_idx on check_ins (account_id, at desc);

-- Members can record and read their own visits (staff policies already
-- cover everything for the dashboard).
create policy "member self check in" on check_ins
  for insert with check (account_id in (select my_account_ids()));
create policy "member read own check ins" on check_ins
  for select using (account_id in (select my_account_ids()));
create policy "member check out" on check_ins
  for update using (account_id in (select my_account_ids()))
  with check (account_id in (select my_account_ids()));
