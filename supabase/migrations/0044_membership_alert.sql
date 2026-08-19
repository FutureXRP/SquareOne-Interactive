-- 0044: a heads-up email to the house every time someone joins the
-- fitness membership. The address is chosen on the Settings tab; blank
-- means nobody gets alerted. Run after 0043_email_wording.sql.

alter table site_config add column membership_alert_email text not null default '';
