import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { stripe, stripeConfigured, serviceDb, sendAndLog } from '@/lib/server/billing'
import { refundIssued } from '@/lib/server/emails'
import { createClient } from '@supabase/supabase-js'

// Refunds a card payment through Stripe and records it. Cash and Cash App
// refunds never reach here — the desk hands the money back and records it
// straight to the refunds table. Any amount up to what's still refundable.

// The caller must be staff — verified against their bearer token, then all
// writes go through the service role.
async function callerStaffId(req: Request): Promise<string | null> {
  const token = req.headers.get('authorization')?.replace(/^Bearer /, '')
  if (!token) return null
  const anon = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
    { global: { headers: { Authorization: `Bearer ${token}` } } },
  )
  const { data: userData } = await anon.auth.getUser()
  const userId = userData?.user?.id
  if (!userId) return null
  const { data } = await serviceDb().from('staff').select('id, active').eq('user_id', userId).maybeSingle()
  const row = data as { id: string; active: boolean } | null
  return row?.active ? row.id : null
}

// Payments store whichever Stripe id created them: a payment intent for
// checkouts, an invoice id for recurring membership charges. Both lead to
// a payment intent we can refund.
async function paymentIntentFor(sb: Stripe, stripeId: string): Promise<string | null> {
  if (stripeId.startsWith('pi_')) return stripeId
  if (stripeId.startsWith('in_')) {
    const invoice = await sb.invoices.retrieve(stripeId)
    const pi = (invoice as unknown as { payment_intent: string | { id: string } | null }).payment_intent
    return typeof pi === 'string' ? pi : pi?.id ?? null
  }
  if (stripeId.startsWith('cs_')) {
    const session = await sb.checkout.sessions.retrieve(stripeId)
    const pi = session.payment_intent
    return typeof pi === 'string' ? pi : pi?.id ?? null
  }
  return null
}

export async function POST(req: Request) {
  const staffId = await callerStaffId(req)
  if (!staffId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { paymentId, amountCents, reason } = (await req.json().catch(() => ({}))) as {
    paymentId?: string; amountCents?: number; reason?: string
  }
  if (!paymentId || !amountCents || amountCents <= 0) {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 })
  }

  const db = serviceDb()
  const { data: payment, error } = await db
    .from('payments')
    .select('id, org_id, account_id, booking_id, amount_cents, method, stripe_payment_intent_id')
    .eq('id', paymentId)
    .single()
  if (error || !payment) return NextResponse.json({ error: 'payment_not_found' }, { status: 404 })
  const p = payment as {
    id: string; org_id: string; account_id: string | null; booking_id: string | null
    amount_cents: number; method: string; stripe_payment_intent_id: string | null
  }

  // Never let the total refunded pass what was collected.
  const { data: priorRows } = await db.from('refunds').select('amount_cents').eq('payment_id', p.id)
  const prior = ((priorRows ?? []) as { amount_cents: number }[]).reduce((n, r) => n + r.amount_cents, 0)
  const refundable = p.amount_cents - prior
  if (amountCents > refundable) {
    return NextResponse.json({ error: 'exceeds_refundable', refundable }, { status: 400 })
  }

  let stripeRefundId: string | null = null
  if (p.method === 'stripe') {
    if (!stripeConfigured()) {
      return NextResponse.json({ error: 'stripe_not_configured' }, { status: 501 })
    }
    if (!p.stripe_payment_intent_id) {
      return NextResponse.json({ error: 'no_stripe_reference' }, { status: 422 })
    }
    try {
      const sb = stripe()
      const pi = await paymentIntentFor(sb, p.stripe_payment_intent_id)
      if (!pi) return NextResponse.json({ error: 'no_stripe_reference' }, { status: 422 })
      const refund = await sb.refunds.create({
        payment_intent: pi,
        amount: amountCents,
        metadata: { squareone_payment: p.id, reason: reason ?? '' },
      })
      stripeRefundId = refund.id
    } catch (e) {
      const message = e instanceof Error ? e.message : 'refund failed at Stripe'
      console.error('[billing/refund]', message)
      return NextResponse.json({ error: 'stripe_refund_failed', message }, { status: 502 })
    }
  }

  const { error: insertErr } = await db.from('refunds').insert({
    org_id: p.org_id,
    payment_id: p.id,
    account_id: p.account_id,
    booking_id: p.booking_id,
    amount_cents: amountCents,
    method: p.method,
    reason: reason ?? '',
    stripe_refund_id: stripeRefundId,
    refunded_by: staffId,
  })
  if (insertErr) {
    console.error('[billing/refund]', insertErr.message)
    // The card money is already back with the customer if Stripe succeeded;
    // say so plainly rather than pretending nothing happened.
    return NextResponse.json({
      error: stripeRefundId ? 'recorded_at_stripe_not_here' : 'record_failed',
      message: insertErr.message,
      stripeRefundId,
    }, { status: 500 })
  }

  // Tell the customer their money is coming back.
  if (p.account_id) {
    const { data: people } = await db.from('clients')
      .select('full_name, email, is_primary')
      .eq('account_id', p.account_id)
      .order('is_primary', { ascending: false }).limit(1)
    const person = (people as { full_name: string; email: string | null }[] | null)?.[0]
    if (person?.email) {
      const { data: pay } = await db.from('payments').select('memo').eq('id', p.id).maybeSingle()
      await sendAndLog('refund.issued', person.email, refundIssued({
        name: person.full_name,
        amountCents,
        method: p.method,
        what: (pay as { memo: string | null } | null)?.memo ?? 'your booking',
        reason: reason ?? '',
      }), { accountId: p.account_id, bookingId: p.booking_id })
    }
  }

  return NextResponse.json({ ok: true, stripeRefundId })
}
