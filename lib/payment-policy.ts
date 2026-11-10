// The party payment rule, in one place, for the store, the emails, and the
// hourly job:
//
//   * Booked within 14 days of the event: at least the deposit within 24
//     hours of booking, or the booking is removed.
//   * Booked further out: nothing is due yet. When the event is 14 days
//     away, the 24 hours start — at least the deposit, or it's removed.
//   * Paying in full is always welcome, any time.
//
// Pure functions only — safe on the server and in the browser.

export const DEPOSIT_WINDOW_DAYS = 14
export const SECURE_HOURS = 24

const DAY_MS = 24 * 60 * 60 * 1000

// Is this event close enough that the 24-hour clock applies now?
export function withinDepositWindow(start: Date | number, now = Date.now()): boolean {
  const t = typeof start === 'number' ? start : start.getTime()
  return t - now <= DEPOSIT_WINDOW_DAYS * DAY_MS
}

// The moment the 24 hours start for an event this far out: now, or 14
// days before the event — whichever is later.
export function clockStartsAt(start: Date | number, now = Date.now()): Date {
  const t = typeof start === 'number' ? start : start.getTime()
  return new Date(Math.max(now, t - DEPOSIT_WINDOW_DAYS * DAY_MS))
}

// "the $50 deposit" / "a deposit" — how a sentence names what's owed.
export function depositPhrase(depositCents?: number | null): string {
  return depositCents && depositCents > 0 ? `the $${(depositCents / 100).toFixed(2).replace(/\.00$/, '')} deposit` : 'the deposit'
}

// The one-sentence rule for a booking, as the customer reads it.
export function depositRuleSentence(o: { start: Date | number; depositCents?: number | null; now?: number }): string {
  const dep = depositPhrase(o.depositCents)
  if (withinDepositWindow(o.start, o.now)) {
    return `Your event is within ${DEPOSIT_WINDOW_DAYS} days, so please pay at least ${dep} within ${SECURE_HOURS} hours to secure your rooms — otherwise the booking is removed. You're welcome to pay in full.`
  }
  const due = clockStartsAt(o.start, o.now).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'America/Chicago' })
  return `No payment is needed today. When your event is ${DEPOSIT_WINDOW_DAYS} days away (${due}), you'll have ${SECURE_HOURS} hours to pay at least ${dep} to secure your rooms — otherwise the booking is removed. You're welcome to pay part or all of it sooner.`
}

// The general rule, for pages that aren't about one booking.
export const DEPOSIT_RULE_GENERAL =
  `Parties booked within ${DEPOSIT_WINDOW_DAYS} days of the event must pay at least the deposit within ${SECURE_HOURS} hours to secure their rooms. ` +
  `Booked further out? Nothing is due yet — when your event is ${DEPOSIT_WINDOW_DAYS} days away, you'll have ${SECURE_HOURS} hours to pay at least the deposit. ` +
  `Unpaid bookings are removed after those ${SECURE_HOURS} hours. You can always pay in full.`
