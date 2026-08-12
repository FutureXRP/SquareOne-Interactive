-- ── Family members on one account ────────────────────────────
-- A family shares one login (the primary member's), but each person is
-- their own row in clients — so check-ins, door logs, and the "people
-- inside" count know exactly who is in the building. These policies let
-- the signed-in member add and remove non-login people on their own
-- account. Run after 0019_member_visits.sql.

create policy "member add family" on clients
  for insert with check (
    account_id in (select my_account_ids())
    and user_id is null
    and not is_primary
  );

create policy "member rename family" on clients
  for update using (
    account_id in (select my_account_ids())
    and user_id is null
    and not is_primary
  )
  with check (
    account_id in (select my_account_ids())
    and user_id is null
    and not is_primary
  );

create policy "member remove family" on clients
  for delete using (
    account_id in (select my_account_ids())
    and user_id is null
    and not is_primary
  );

create index if not exists clients_account_idx on clients (account_id);
