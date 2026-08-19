-- 0043: staff-editable wording on every outgoing email.
-- One row per email kind ('booking.confirmed', 'membership.welcome', …).
-- Staff can replace the subject line ({default} inside it inserts the
-- automatic one, which carries the room and date) and add their own
-- words above and below the generated body. The generated middle — the
-- amounts, dates, codes, and links — stays machine-written, so no edit
-- can ever make a receipt lie. An empty field means "use the default";
-- deleting the row restores the stock email entirely.
--
-- Run after 0042_coupon_duration.sql.

create table email_templates (
  kind text primary key,
  org_id uuid not null references organizations(id) on delete cascade,
  subject text not null default '',
  top_note text not null default '',
  bottom_note text not null default '',
  updated_at timestamptz not null default now()
);

alter table email_templates enable row level security;
create policy "staff all email templates" on email_templates
  for all using (is_staff()) with check (is_staff());
