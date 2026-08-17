import { NextResponse } from 'next/server'
import { stripe, stripeConfigured, siteUrl } from '@/lib/server/billing'
import { bookingForToken } from '@/lib/server/pay-links'

// Starts Stripe Checkout from a booking's pay link. No sign-in: holding
// the link is the authorisation, the same way a payment link on an invoice
// works. The token identifies exactly one booking and nothing else, and
// the amount is computed here from that booking's own row — a caller can
// choose deposit or balance, never a number.

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  if (!stripeConfigured()) return NextResponse.json({ error: 'stripe_not_configured' }, { status: 501 })
  const { token } = await params
  const { which } = (await req.json().catch(() => ({}))) as { which?: 'deposit' | 'balance' }

  const found = await bookingForToken(token)
  if (!found) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  const { row, target } = found

  if (row.status === 'canceled') {
    return NextResponse.json({ error: 'canceled', message: 'That booking has been canceled. Give us a call if that’s a surprise.' }, { status: 409 })
  }
  if (target.balanceCents <= 0) {
    return NextResponse.json({ error: 'already_paid', message: 'This booking is already paid in full.' }, { status: 409 })
  }

  const amount = which === 'deposit' && target.depositDueCents > 0
    ? Math.min(target.depositDueCents, target.balanceCents)
    : target.balanceCents
  if (amount <= 0) return NextResponse.json({ error: 'nothing_due' }, { status: 409 })

  try {
    const base = siteUrl(req)
    const label = amount < target.balanceCents ? 'Deposit' : 'Balance'
    // When the booking belongs to an account with a Stripe customer, tie
    // the payment to it and save the card for later desk charges.
    const { serviceDb } = await import('@/lib/server/billing')
    let customer: string | undefined
    if (row.account_id) {
      const { data: acct } = await serviceDb().from('client_accounts')
        .select('stripe_customer_id').eq('id', row.account_id).maybeSingle()
      customer = (acct as { stripe_customer_id: string | null } | null)?.stripe_customer_id ?? undefined
    }
    const session = await stripe().checkout.sessions.create({
      mode: 'payment',
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
