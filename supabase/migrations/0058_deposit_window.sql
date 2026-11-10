-- 0058: the party payment rule changes.
--
--   * Booked within 14 days of the event: at least the deposit within 24
--     hours of booking, or the booking is removed.
--   * Booked further out: nothing is due yet. When the event is 14 days
--     away the 24 hours start — at least the deposit, or it's removed.
--   * Paying in full is always welcome.
--
-- The hourly job now starts the 24-hour clock only once an event is
-- within 14 days (lib/payment-policy.ts). Holds that already got a
-- 24-hour notice under the old rule but are still more than 14 days out
-- have their clock cleared here, so none of them is removed early — they
-- get their 24 hours when the event is 14 days away.
-- Run after 0057_booking_change_requests.sql.

update bookings
   set hold_warned_at = null,
       hold_expires_at = null
 where status = 'hold'
   and hold_warned_at is not null
   and lower(during) - interval '14 days' > now();
