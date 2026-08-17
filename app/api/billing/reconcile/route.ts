import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { stripe, stripeConfigured, serviceDb } from '@/lib/server/billing'
import { recordInvoicePayment, recordBookingCheckout } from '@/lib/server/record-payments'

// Pulls in any payment Stripe took that never reached our ledger.
//
// The webhook is the normal path, but it is a delivery, and deliveries
// fail: an endpoint pointed at a domain that isn't live yet, a signing
// secret that doesn't match, a deploy mid-flight. When that happens the
// customer's money is real and the booking still reads unpaid, which is
// the worst possible pairing. This asks Stripe what it actually charged
// and replays anything missing.
//
// Every record step is idempotent on the Stripe id, so running it twice
// changes nothing the second time.

async function callerStaff(req: Request): Promise<boolean> {
  const token = req.headers.get('authorization')?.replace(/^Bearer /, '')
  if (!token) return false
  const anon = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
    { global: { headers: { Authorization: `Bearer ${token}` } } },
  )
  const { data } = await anon.auth.getUser()
  const userId = data?.user?.id
  if (!userId) return false
  const { data: row } = await serviceDb().from('staff').select('active').eq('user_id', userId).maybeSingle()
  return !!(row as { active: boolean } | null)?.active
}

export interface Recovered {
  kind: 'booking' | 'membership'
  amountCents: number
  reference: string
  detail: string
}

export async function POST(req: Request) {
  if (!stripeConfigured()) return NextResponse.json({ error: 'stripe_not_configured' }, { status: 501 })
  if (!(await callerStaff(req))) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { days } = (await req.json().catch(() => ({}))) as { days?: number }
  const lookback = Math.min(Math.max(days ?? 30, 1), 90)
  const since = Math.floor(Date.now() / 1000) - lookback * 86400

  const recovered: Recovered[] = []
  let checked = 0

  try {
    const s = stripe()
    const db = serviceDb()

    // ── Booking payments ─────────────────────────────────────
    // Checkout sessions carry the booking_id we set when the link was made.
    for await (const session of s.checkout.sessions.list({ created: { gte: since }, limit: 100 })) {
      if (session.payment_status !== 'paid') continue
      if (session.metadata?.kind !== 'booking' || !session.metadata?.booking_id) continue
      checked += 1
      const ref = typeof session.payment_intent === 'string' ? session.payment_intent : session.id
      const { data: already } = await db.from('payments').select('id').eq('stripe_payment_intent_id', ref).maybeSingle()
      if (already) continue

      // Same code path the webhook uses — the payment row, the booking
      // status, and the receipt email all happen exactly once.
      await recordBookingCheckout(session)

      const { data: landed } = await db.from('payments')
        .select('id, memo').eq('stripe_payment_intent_id', ref).maybeSingle()
      if (landed) {
        recovered.push({
          kind: 'booking',
          amountCents: session.amount_total ?? 0,
          reference: ref,
          detail: (landed as { memo: string | null }).memo ?? 'Booking payment',
        })
      }
    }

    // ── Membership charges ───────────────────────────────────
    for await (const invoice of s.invoices.list({ created: { gte: since }, status: 'paid', limit: 100 })) {
      if (!invoice.id || !invoice.amount_paid || invoice.amount_paid <= 0) continue
      checked += 1
      const { data: already } = await db.from('payments').select('id').eq('stripe_payment_intent_id', invoice.id).maybeSingle()
      if (already) continue

      await recordInvoicePayment(invoice)

      const { data: landed } = await db.from('payments')
        .select('id, memo').eq('stripe_payment_intent_id', invoice.id).maybeSingle()
      if (landed) {
        recovered.push({
          kind: 'membership',
          amountCents: invoice.amount_paid,
          reference: invoice.id,
          detail: (landed as { memo: string | null }).memo ?? 'Membership charge',
        })
      }
    }

    return NextResponse.json({
      ok: true,
      checked,
      recovered,
      totalCents: recovered.reduce((n, r) => n + r.amountCents, 0),
      lookbackDays: lookback,
    })
  } catch (e) {
    console.error('[reconcile]', e)
    return NextResponse.json({
      error: 'reconcile_failed',
      message: e instanceof Error ? e.message : 'Could not reach Stripe.',
    }, { status: 500 })
  }
}
