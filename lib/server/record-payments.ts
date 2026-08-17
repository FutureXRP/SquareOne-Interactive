import type Stripe from 'stripe'
import { serviceDb, sendAndLog } from '@/lib/server/billing'
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
    .select('id, code, title, account_id').eq('id', bookingId).maybeSingle()
  const b = bookingRow as { id: string; code: string; title: string; account_id: string | null } | null
  if (!b) return

  const { data: org } = await db.from('organizations').select('id').limit(1).single()
  const { data: paymentRow } = await db.from('payments').insert({
    org_id: (org as { id: string }).id,
    account_id: b.account_id,
    booking_id: b.id,
    method: 'stripe',
    status: 'paid',
    amount_cents: amount,
    memo: `${b.title} · ${b.code}`,
    stripe_payment_intent_id: ref,
  }).select('id, code').single()

  await db.from('bookings').update({ status: 'confirmed', hold_expires_at: null }).eq('id', b.id)

  // The receipt reads as a deposit or a paid-in-full note depending on
  // what's left, built from the booking row rather than anything Stripe sent.
  const paymentCode = (paymentRow as { id: string; code?: string } | null)?.code
  const resolved = await bookingFacts(b.id)
  if (resolved) {
    await sendAndLog('booking.payment', resolved.to.email, bookingPayment(resolved.facts, {
      amountCents: amount,
      method: 'Card',
      code: paymentCode ?? b.code,
    }), { accountId: b.account_id, bookingId: b.id })
  }
}
