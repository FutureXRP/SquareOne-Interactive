import { NextResponse } from 'next/server'
import { stripe, stripeConfigured, siteUrl } from '@/lib/server/billing'
import { bookingForToken } from '@/lib/server/pay-links'
import { bookingDoc, ensureBookingCustomer } from '@/lib/server/booking-card'

// "Add a card on file" for one booking — the agreement's requirement that
// every reservation carry a card for damages or unpaid balances. Stripe
// Checkout in setup mode: the card is verified and saved, nothing is
// charged. Holding the booking link is the authorization, as with paying.
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  if (!stripeConfigured()) return NextResponse.json({ message: 'Card payments aren’t switched on yet.' }, { status: 501 })
  const { token } = await params
  const found = await bookingForToken(token)
  if (!found) return NextResponse.json({ message: 'This link isn’t valid.' }, { status: 404 })
  if (found.row.status === 'canceled') return NextResponse.json({ message: 'That booking has been canceled.' }, { status: 409 })

  try {
    const doc = await bookingDoc(found.row.id)
    if (!doc) return NextResponse.json({ message: 'Booking not found.' }, { status: 404 })
    const customer = await ensureBookingCustomer(doc)
    const base = siteUrl(req)
    const session = await stripe().checkout.sessions.create({
      mode: 'setup',
      customer,
      payment_method_types: ['card'],
      setup_intent_data: {
        description: `Card on file for ${doc.snapshot.eventType} — ${doc.code} (damages, cleaning, or unpaid balance)`,
        metadata: { booking_id: doc.id, kind: 'booking_card' },
      },
      metadata: { booking_id: doc.id, kind: 'booking_card' },
      // Stripe fills in the session id, so the return trip can save the
      // card itself without waiting on the webhook.
      success_url: `${base}/pay/${token}?card_session={CHECKOUT_SESSION_ID}`,
      cancel_url: `${base}/pay/${token}`,
    })
    return NextResponse.json({ url: session.url })
  } catch (e) {
    console.error('[pay/card]', e)
    return NextResponse.json({ message: e instanceof Error ? e.message : 'Could not start adding a card.' }, { status: 500 })
  }
}
