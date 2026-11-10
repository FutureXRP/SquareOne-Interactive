-- 0059: a booking's rental agreement can be one signed OUTSIDE the
-- system — a PDF e-signed elsewhere (DocuSign, Adobe, a scan of the paper
-- form) — uploaded by staff and attached to the booking. It counts as the
-- signed agreement everywhere the online one does: the booking page, the
-- staff board, emails, the "before your event" checklist.
--
-- source says which kind a row is: 'online' (signed on the booking page,
-- the default for every row so far) or 'uploaded'. file_path points at
-- the PDF in the private "agreements" storage bucket, which only the
-- server reads and writes; renters and staff download it through the app.
-- Run after 0058_deposit_window.sql.

alter table rental_agreements
  add column source text not null default 'online' check (source in ('online', 'uploaded'));
alter table rental_agreements add column file_path text;
alter table rental_agreements add column file_name text;
alter table rental_agreements add column uploaded_by uuid references staff(id) on delete set null;

insert into storage.buckets (id, name, public)
values ('agreements', 'agreements', false)
on conflict (id) do nothing;
