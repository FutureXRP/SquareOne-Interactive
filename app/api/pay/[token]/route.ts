import { NextResponse } from 'next/server'
import { stripe, stripeConfigured, siteUrl, serviceDb } from '@/lib/server/billing'
import { bookingForToken } from '@/lib/server/pay-links'
import { bookingDoc, ensureBookingCustomer } from '@/lib/server/booking-card'
import { waiversDueForBooking, WAIVER_FIRST_MESSAGE } from '@/lib/server/booking-waivers'

// Starts Stripe Checkout from a booking's pay link. No sign-in: holding
// the link is the authorisation, the same way a payment link on an invoice
// works. The token identifies exactly one booking and nothing else, and
// the amount is computed here from that booking's own row — a caller can
// choose deposit or balance, never a number.

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  if (!stripeConfigured()) return NextResponse.json({ error: 'stripe_not_configured' }, { status: 501 })
  const { token } = await params
  const { which, amountCents } = (await req.json().catch(() => ({}))) as { which?: 'deposit' | 'balance' | 'custom'; amountCents?: number }

  const found = await bookingForToken(token)
  if (!found) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  const { row, target } = found

  if (row.status === 'canceled') {
    return NextResponse.json({ error: 'canceled', message: 'That booking has been canceled. Give us a call if that’s a surprise.' }, { status: 409 })
  }
  if (target.balanceCents <= 0) {
    return NextResponse.json({ error: 'already_paid', message: 'This booking is already paid in full.' }, { status: 409 })
  }
  // Waivers are signed before any money moves — never at the door.
  if ((await waiversDueForBooking(row.id)).length > 0) {
    return NextResponse.json({ error: 'waiver_required', message: WAIVER_FIRST_MESSAGE }, { status: 409 })
  }

  // Partial payments: any amount from the deposit (or $10 when no deposit
  // is set) up to the balance. The floor keeps a token payment from
  // locking a room; the server clamps so the browser never names a price.
  const minPartial = target.depositDueCents > 0
    ? Math.min(target.depositDueCents, target.balanceCents)
    : Math.min(1000, target.balanceCents)
  let amount: number
  if (which === 'deposit' && target.depositDueCents > 0) {
    amount = Math.min(target.depositDueCents, target.balanceCents)
  } else if (which === 'custom') {
    const asked = Math.round(Number(amountCents) || 0)
    if (asked < minPartial) {
      return NextResponse.json({ error: 'too_small', message: `The minimum payment on this booking is ${(minPartial / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })}.` }, { status: 400 })
    }
    amount = Math.min(asked, target.balanceCents)
  } else {
    amount = target.balanceCents
  }
  if (amount <= 0) return NextResponse.json({ error: 'nothing_due' }, { status: 409 })

  try {
    const base = siteUrl(req)
    const label = which === 'custom' && amount < target.balanceCents
      ? 'Partial payment'
      : amount < target.balanceCents ? 'Deposit' : 'Balance'
    // Every payment is tied to a Stripe customer — the member's, or one
    // minted for a guest — and the card is saved for later use, so the
    // card they pay with doubles as the booking's card on file for
    // damages, as the rental agreement requires.
    let customer: string | undefined
    try {
      const doc = await bookingDoc(row.id)
      if (doc) customer = await ensureBookingCustomer(doc)
    } catch (e) {
      console.warn('[pay] customer for card on file unavailable', e)
    }
    // A checkout page shouldn't outlive the hold it pays for: when the
    // 24-hour deposit clock is running, the page closes at the deadline
    // (Stripe allows 30 minutes to 24 hours).
    let expiresAt: number | undefined
    try {
      const { data: h } = await serviceDb().from('bookings').select('status, hold_expires_at, hold_warned_at').eq('id', row.id).maybeSingle()
      const hold = h as { status: string; hold_expires_at: string | null; hold_warned_at: string | null } | null
      if (hold?.status === 'hold' && hold.hold_warned_at && hold.hold_expires_at) {
        const now = Math.floor(Date.now() / 1000)
        const deadline = Math.floor(new Date(hold.hold_expires_at).getTime() / 1000)
        expiresAt = Math.min(now + 24 * 3600 - 60, Math.max(now + 31 * 60, deadline))
      }
    } catch { /* pre-0054: no clock */ }
    const session = await stripe().checkout.sessions.create({
      mode: 'payment',
      ...(expiresAt ? { expires_at: expiresAt } : {}),
      ...(customer ? { customer } : {}),
      line_items: [{
        quantity: 1,
        price_data: {
          currency: 'usd',
          unit_amount: amount,
          product_data: { name: `${row.title} — ${label}`, description: `Booking ${row.code}` },
        },
      }],
      // The webhook records the payment against the booking off this
      // metadata, exactly as it does for a signed-in member.
      payment_intent_data: {
        metadata: { booking_id: row.id, account_id: row.account_id ?? '', kind: 'booking' },
        ...(customer ? { setup_future_usage: 'off_session' as const } : {}),
      },
      metadata: { booking_id: row.id, account_id: row.account_id ?? '', kind: 'booking' },
      success_url: `${base}/pay/${token}?paid=1`,
      cancel_url: `${base}/pay/${token}`,
    })
    return NextResponse.json({ url: session.url })
  } catch (e) {
    console.error('[pay]', e)
    return NextResponse.json({
      error: 'checkout_failed',
      message: e instanceof Error ? e.message : 'Could not start the payment.',
    }, { status: 500 })
  }
}
