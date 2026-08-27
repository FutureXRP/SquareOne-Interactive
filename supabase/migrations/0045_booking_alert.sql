-- 0045: a heads-up email to the house when a customer reservation lands
-- and is waiting on approval. The address is chosen on the Settings tab;
-- blank means nobody is emailed (the Bookings tab's approval queue and
-- sidebar badge still show it). Run after 0044_membership_alert.sql.

alter table site_config add column booking_alert_email text not null default '';
