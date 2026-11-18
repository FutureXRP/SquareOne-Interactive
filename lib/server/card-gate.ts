import { serviceDb, sendAndLog, stripeConfigured } from '@/lib/server/billing'
import { bookingFacts } from '@/lib/server/booking-facts'
import { requestUnfinished } from '@/lib/server/emails'

// A customer's online request needs a card on file before it reaches our
// team (0064). The database marks every booking a customer places as
// awaiting_card_since; this module decides when that ends:
//
//   * the card is saved (Stripe's "save a card" page, or an online payment
//     that saved the card)  → the request is sent (submitAwaitingRequest);
//   * card payments aren't switched on at all → there's no way to take a
//     card, so the request is sent as before (cardGate);
//   * staff send it without a card (a customer who called in);
//   * nobody finishes it within the hour → released (releaseUnfinishedRequests).

// How long the time stays held while the customer adds their card.
export const CARD_HOLD_MINUTES = 60

// Is this booking still waiting on its card? Undefined before 0064.
export async function awaitingCard(bookingId: string): Promise<boolean | undefined> {
  const { data, error } = await serviceDb().from('bookings').select('awaiting_card_since').eq('id', bookingId).maybeSingle()
  if (error) return undefined
  return !!(data as { awaiting_card_since: string | null } | null)?.awaiting_card_since
}

// Clear the wait — conditional, so only one caller "sends" the request.
async function claimSubmission(bookingId: string): Promise<boolean> {
  const { data, error } = await serviceDb().from('bookings')
    .update({ awaiting_card_since: null })
    .eq('id', bookingId).not('awaiting_card_since', 'is', null)
    .select('id')
  return !error && (data ?? []).length > 0
}

// Before any "request received" email: may this booking's request go out
// now? 'send' when it isn't waiting (or card payments are off, in which
// case the wait is lifted here); 'wait' while the card is still owed.
export async function cardGate(bookingId: string): Promise<'send' | 'wait'> {
  const waiting = await awaitingCard(bookingId)
  if (!waiting) return 'send'
  if (stripeConfigured()) return 'wait'
  await claimSubmission(bookingId)
  return 'send'
}

// The card is on file: send the request to our team (and the customer's
// "request received") — once, however many callers notice the card.
export async function submitAwaitingRequest(bookingId: string): Promise<boolean> {
  if (!(await claimSubmission(bookingId))) return false
  // Imported here, not at the top: hold-emails reaches back into this
  // module for cardGate.
  const { sendHoldEmails } = await import('@/lib/server/hold-emails')
  await sendHoldEmails(bookingId).catch((e) => console.error('[card-gate] hold emails', e))
  return true
}

// The hourly pass: a request still without a card an hour after it was
// started is released, and the customer is told it was never sent. Never
// touches a booking staff approved, or one with money paid on it (that
// one is sent instead — paying shows they meant it).
export async function releaseUnfinishedRequests(now = Date.now()): Promise<number> {
  if (!stripeConfigured()) return 0
  const db = serviceDb()
  const cutoff = new Date(now - CARD_HOLD_MINUTES * 60_000).toISOString()
  const { data, error } = await db.from('bookings')
    .select('id, note, approved_at, payments(amount_cents, status)')
    .eq('status', 'hold').is('lead_booking_id', null)
    .not('awaiting_card_since', 'is', null).lte('awaiting_card_since', cutoff)
    .limit(100)
  if (error || !data) return 0 // pre-0064
  let released = 0
  for (const r of data as { id: string; note: string | null; approved_at: string | null; payments: { amount_cents: number; status: string }[] }[]) {
    const paid = (r.payments ?? []).some((p) => p.status === 'paid')
    if (paid || r.approved_at) {
      await submitAwaitingRequest(r.id)
      continue
    }
    const { data: gone } = await db.from('bookings')
      .update({
        status: 'canceled', canceled_at: new Date(now).toISOString(), canceled_via: 'no_card',
        note: `${r.note ? `${r.note} · ` : ''}request not sent — no card added within ${CARD_HOLD_MINUTES} minutes`,
      })
      .eq('id', r.id).eq('status', 'hold').not('awaiting_card_since', 'is', null)
      .select('id')
    if ((gone ?? []).length === 0) continue
    released += 1
    const resolved = await bookingFacts(r.id)
    if (resolved) {
      await sendAndLog('booking.request_unfinished', resolved.to.email, requestUnfinished(resolved.facts),
        { accountId: resolved.b.account_id, bookingId: r.id })
    }
  }
  return released
}
