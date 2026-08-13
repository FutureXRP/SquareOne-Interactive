-- ── Waiver records that stay put ─────────────────────────────
-- A signed waiver is the record of what a person actually agreed to, so
-- it can't depend on a form nobody has edited since. These columns take a
-- snapshot at signing: the waiver's name and the exact paragraphs that
-- were on screen. Edit the form afterward and old signatures still show
-- the language they were given.
--
-- Staff can also delete a signature now — the one way a waiver record ever
-- leaves an account. Everything else keeps it forever.
-- Run after 0033_booking_review.sql.

alter table form_submissions add column form_name text;
alter table form_submissions add column signed_terms jsonb;

-- Backfill the name from the form so existing records read properly. The
-- terms can't be backfilled honestly — we don't know what the form said
-- when they signed — so those stay null and the UI says so.
update form_submissions s
   set form_name = f.name
  from forms f
 where f.id = s.form_id and s.form_name is null;

create policy "staff delete submissions" on form_submissions for delete using (is_staff());
