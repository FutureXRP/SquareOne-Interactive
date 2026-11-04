-- 0052: a payment method for card money collected OUTSIDE Stripe.
-- Bookings paid by credit card before the Stripe integration was live
-- need closing out: the money is real and belongs in "collected", but
-- recording it as 'stripe' would be a lie (no Stripe charge exists) and
-- 'check' would be a different lie. 'card' says exactly what happened:
-- a card payment, taken on other rails. The desk records it manually,
-- the same trust model as cash — and the UI labels it "Card (offline)"
-- so it can never be confused with a live Stripe charge.
-- Run after 0051_scheduled_shifts.sql.

alter type payment_method add value if not exists 'card';
