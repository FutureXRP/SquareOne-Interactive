import type Stripe from 'stripe'
import { serviceDb, sendAndLog, stripe } from '@/lib/server/billing'
import { bookingPayment } from '@/lib/server/emails'
import { bookingFacts } from '@/lib/server/booking-facts'

// Turning a Stripe payment into a row in our ledger. Lives here rather
// than in the webhook because the webhook is not the only way these
// arrive: an event can be missed — a bad endpoint URL, a deploy mid-flight,
// a signature mismatch — and when that happens the money is real and the
// booking still says unpaid. The reconcile route replays the same work
// from Stripe's own record, so a missed event is a delay rather than a
// permanent hole.
//
// Every function here is idempotent on the Stripe id, so replaying costs
// nothing.

// What the customer actually paid with. Stripe Checkout can complete via
// card, Cash App Pay, or whatever else the dashboard enables — the ledger
// and the receipt should say which, not assume 'Card'.
async function howTheyPaid(ref: string | Stripe.PaymentIntent):
  Promise<{ ledger: 'stripe' | 'cashapp'; label: string }> {
  try {
    const pi = typeof ref === 'string'
      ? await stripe().paymentIntents.retrieve(ref, { expand: ['latest_charge'] })
      : ref
    let charge = pi.latest_charge
    if (typeof charge === 'string') charge = await stripe().charges.retrieve(charge)
    const type = charge && typeof charge !== 'string' ? charge.payment_method_details?.type : undefined
    if (type === 'cashapp') return { ledger: 'cashapp', label: 'Cash App' }
    return { ledger: 'stripe', label: 'Card' }
  } catch {
    // Never lose a payment record over a labelling lookup.
    return { ledger: 'stripe', label: 'Card' }
  }
}

// Record a Stripe invoice payment in our payments ledger, so membership
// charges (first signup and every monthly renewal) show on Payments and
// Reports beside desk payments. Idempotent on the invoice id.
export async function recordInvoicePayment(invoice: Stripe.Invoice): Promise<void> {
  if (!invoice.id || !invoice.amount_paid || invoice.amount_paid <= 0) return
  const db = serviceDb()
  const { data: existing } = await db
    .from('payments')
    .select('id')
    .eq('stripe_payment_intent_id', invoice.id)
    .maybeSingle()
  if (existing) return
  const customerId = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id
  let accountId: string | null = null
  if (customerId) {
    const { data: acct } = await db.from('client_accounts').select('id').eq('stripe_customer_id', customerId).maybeSingle()
    accountId = (acct as { id: string } | null)?.id ?? null
  }
  const { data: org } = await db.from('organizations').select('id').limit(1).single()
  const what = invoice.lines?.data?.[0]?.description || 'Fitness membership'
  await db.from('payments').insert({
    org_id: (org as { id: string }).id,
    account_id: accountId,
    booking_id: null,
    method: 'stripe',
    status: 'paid',
    amount_cents: invoice.amount_paid,
    memo: `${invoice.customer_name ?? 'Member'} · ${what}`,
    stripe_payment_intent_id: invoice.id,
  })
}

// A member paid for their own booking through Checkout. Record it in the
// payments ledger exactly the way the desk would, stop the hold from
// expiring, and mail the deposit/paid-in-full receipt. Idempotent on the
// Checkout session id, so a replayed webhook can't double-charge the
// ledger. Approval is deliberately untouched — paying doesn't confirm a
// reservation, a person does.
export async function recordBookingCheckout(session: Stripe.Checkout.Session): Promise<void> {
  const bookingId = session.metadata?.booking_id
  const amount = session.amount_total ?? 0
  if (!bookingId || amount <= 0) return
  const db = serviceDb()
  const ref = typeof session.payment_intent === 'string' ? session.payment_intent : session.id
  const { data: existing } = await db.from('payments').select('id').eq('stripe_payment_intent_id', ref).maybeSingle()
  if (existing) return

  const { data: bookingRow } = await db.from('bookings')
    .select('id, code, title, account_id, status').eq('id', bookingId).maybeSingle()
  const b = bookingRow as { id: string; code: string; title: string; account_id: string | null; status: string } | null
  if (!b) return
  const wasCanceled = b.status === 'canceled'

  const paidWith = await howTheyPaid(ref)
  const { data: org } = await db.from('organizations').select('id').limit(1).single()
  const { data: paymentRow } = await db.from('payments').insert({
    org_id: (org as { id: string }).id,
    account_id: b.account_id,
    booking_id: b.id,
    method: paidWith.ledger,
    status: 'paid',
    amount_cents: amount,
    memo: `${b.title} · ${b.code}`,
    stripe_payment_intent_id: ref,
  }).select('id, code').single()

  // A canceled booking stays canceled. This can genuinely happen — the
  // customer pays, the webhook is delayed, staff cancel in the meantime —
  // and quietly resurrecting the booking would put a room back on the
  // calendar that everyone believes is free. The payment above is still
  // recorded, because the money is real and somebody now owes a refund.
  if (!wasCanceled) {
    await db.from('bookings').update({ status: 'confirmed', hold_expires_at: null }).eq('id', b.id)
  }

  // The receipt reads as a deposit or a paid-in-full note depending on
  // what's left, built from the booking row rather than anything Stripe sent.
  // Nothing is sent for a canceled booking — "you're all set" would be a lie,
  // and the refund sends its own email once staff issue it.
  if (wasCanceled) return
  const paymentCode = (paymentRow as { id: string; code?: string } | null)?.code
  const resolved = await bookingFacts(b.id)
  if (resolved) {
    await sendAndLog('booking.payment', resolved.to.email, bookingPayment(resolved.facts, {
      amountCents: amount,
      method: paidWith.label,
      code: paymentCode ?? b.code,
    }), { accountId: b.account_id, bookingId: b.id })
  }
}

// Same recording, from a bare PaymentIntent — desk charges (card on file,
// phone orders through Elements) have no Checkout session around them.
// Idempotent on the intent id, so the webhook and the confirm endpoint can
// both fire without doubling the ledger.
export async function recordBookingIntent(pi: Stripe.PaymentIntent): Promise<boolean> {
  if (pi.status !== 'succeeded') return false
  const bookingId = pi.metadata?.booking_id
  const amount = pi.amount_received ?? 0
  if (!bookingId || amount <= 0) return false
  const db = serviceDb()
  const { data: existing } = await db.from('payments').select('id').eq('stripe_payment_intent_id', pi.id).maybeSingle()
  if (existing) return true

  const { data: bookingRow } = await db.from('bookings')
    .select('id, code, title, account_id, status').eq('id', bookingId).maybeSingle()
  const b = bookingRow as { id: string; code: string; title: string; account_id: string | null; status: string } | null
  if (!b) return false
  const wasCanceled = b.status === 'canceled'

  const paidWith = await howTheyPaid(pi)
  const { data: org } = await db.from('organizations').select('id').limit(1).single()
  await db.from('payments').insert({
    org_id: (org as { id: string }).id,
    account_id: b.account_id,
    booking_id: b.id,
    method: paidWith.ledger,
    status: 'paid',
    amount_cents: amount,
    memo: `${b.title} · ${b.code}`,
    stripe_payment_intent_id: pi.id,
  })

  if (wasCanceled) return true // money recorded; a canceled booking stays canceled
  await db.from('bookings').update({ status: 'confirmed', hold_expires_at: null }).eq('id', b.id)

  const resolved = await bookingFacts(b.id)
  if (resolved) {
    await sendAndLog('booking.payment', resolved.to.email, bookingPayment(resolved.facts, {
      amountCents: amount,
      method: paidWith.label,
      code: b.code,
    }), { accountId: b.account_id, bookingId: b.id })
  }
  return true
}
