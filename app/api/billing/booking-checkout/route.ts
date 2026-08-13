import { NextResponse } from 'next/server'
import { stripe, stripeConfigured, getCaller, ensureCustomer, siteUrl, serviceDb } from '@/lib/server/billing'

// A member paying for their own room/party booking from their account —
// a deposit to lock it in, or the balance before the day of. No staff, no
// phone call.
//
// The browser names the booking and which half it's paying; the amount is
// computed here from the booking row, so a shopper can't talk the price
// down by posting a smaller number.

interface BookingRow {
  id: string
  code: string
  title: string
  price_cents: number
  status: string
  account_id: string | null
  deposit_cents?: number | null
  payments: { amount_cents: number; status: string }[]
}

const COL_SETS = [
  'id, code, title, price_cents, status, account_id, deposit_cents, payments(amount_cents, status)',
  'id, code, title, price_cents, status, account_id, payments(amount_cents, status)',
]

export async function POST(req: Request) {
  if (!stripeConfigured()) return NextResponse.json({ error: 'stripe_not_configured' }, { status: 501 })
  const caller = await getCaller(req)
  if (!caller) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { bookingId, which } = (await req.json().catch(() => ({}))) as
    { bookingId?: string; which?: 'deposit' | 'balance' }
  if (!bookingId) return NextResponse.json({ error: 'missing bookingId' }, { status: 400 })

  try {
    const db = serviceDb()
    let b: BookingRow | null = null
    for (const cols of COL_SETS) {
      const { data, error } = await db.from('bookings').select(cols).eq('id', bookingId).maybeSingle()
      if (!error && data) { b = data as unknown as BookingRow; break }
    }
    if (!b) return NextResponse.json({ error: 'not_found' }, { status: 404 })
    // Someone else's booking is none of this caller's business.
    if (b.account_id !== caller.accountId) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    if (b.status === 'canceled') return NextResponse.json({ error: 'canceled' }, { status: 409 })

    const paid = (b.payments ?? []).filter((p) => p.status === 'paid').reduce((n, p) => n + p.amount_cents, 0)
    const balance = Math.max(0, b.price_cents - paid)
    if (balance <= 0) return NextResponse.json({ error: 'already_paid' }, { status: 409 })

    // A deposit only means something while it's still smaller than what's
    // left; past that point "deposit" and "balance" are the same button.
    const depositDue = b.deposit_cents && b.deposit_cents > 0 ? Math.max(0, b.deposit_cents - paid) : 0
    const amount = which === 'deposit' && depositDue > 0 ? Math.min(depositDue, balance) : balance
    if (amount <= 0) return NextResponse.json({ error: 'nothing_due' }, { status: 409 })

    const customer = await ensureCustomer(caller)
    const base = siteUrl(req)
    const label = amount < balance ? 'Deposit' : 'Balance'

    const session = await stripe().checkout.sessions.create({
      mode: 'payment',
      customer,
      line_items: [{
        quantity: 1,
        price_data: {
          currency: 'usd',
          unit_amount: amount,
          product_data: {
            name: `${b.title} — ${label}`,
            description: `Booking ${b.code}`,
          },
        },
      }],
      payment_intent_data: {
        metadata: { booking_id: b.id, account_id: caller.accountId, kind: 'booking' },
      },
      metadata: { booking_id: b.id, account_id: caller.accountId, kind: 'booking' },
      success_url: `${base}/account?paid=${b.code}`,
      cancel_url: `${base}/account`,
    })

    return NextResponse.json({ url: session.url, amountCents: amount })
  } catch (e) {
    console.error('[billing/booking-checkout]', e)
    return NextResponse.json({ error: 'checkout_failed' }, { status: 500 })
  }
}
