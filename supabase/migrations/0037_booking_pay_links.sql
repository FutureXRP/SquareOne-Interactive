-- ── Direct pay links in booking emails ───────────────────────
-- Emails pointed at /account, which asks the customer to find their
-- booking themselves — and is useless to the walk-in whose booking was
-- taken at the desk against nothing but an email address, since they have
-- no login at all.
--
-- Every booking now carries an unguessable token, so its emails can link
-- straight to a page that pays that one booking. Same idea as the payment
-- link on an invoice: holding the link is the authorisation.
--
-- What the token can do is deliberately narrow. It reads one booking and
-- starts a payment for it. It cannot cancel, move, or reprice anything,
-- cannot reach the account behind it, and cannot list other bookings —
-- so a forwarded email costs the customer nothing worse than a stranger
-- paying their balance.
--
-- Run after 0036_standing_autoroll.sql.

alter table bookings add column pay_token uuid not null default gen_random_uuid();
create unique index bookings_pay_token_idx on bookings (pay_token);

-- Nobody reads this through RLS. The pay page runs server-side with the
-- service role and looks the booking up by token, so no anon or
-- authenticated policy grants access to it.
