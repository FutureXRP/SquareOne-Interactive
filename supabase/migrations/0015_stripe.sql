-- ── Stripe billing ───────────────────────────────────────────
-- Links accounts to Stripe customers for recurring card payments.
-- (member_subscriptions.stripe_subscription_id exists since 0001.)
-- Run after 0014_booking_defaults.sql.

alter table client_accounts add column stripe_customer_id text;
create index client_accounts_stripe_idx on client_accounts (stripe_customer_id);
