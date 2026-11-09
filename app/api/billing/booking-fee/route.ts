import { NextResponse } from 'next/server'
import { stripe, stripeConfigured, serviceDb, getStaffCaller, sendAndLog } from '@/lib/server/billing'
import { bookingFactsAny } from '@/lib/server/booking-facts'
import { bookingFeeCharged } from '@/lib/server/emails'

// Charges an extra fee — cleaning, damage, storage, overtime — to the
// card on file for a booking, as the Event Rental Agreement allows. The
// agreement promises the renter is notified before the card is charged,
// so the request must say staff have done that. On success the fee is
// added to the booking total and recorded as a paid Stripe payment, so
// the books balance and the charge is refundable like any other; the
// renter gets an itemized email. Owners, admins, and managers only.

const MAX_FEE_CENTS = 200_000

export async function POST(req: Request) {
  if (!stripeConfigured()) return NextResponse.json({ message: 'Stripe is not configured.' }, { status: 501 })
  const staff = await getStaffCaller(req)
  if (!staff) return NextResponse.json({ message: 'unauthorized' }, { status: 401 })
  if (!['owner', 'admin', 'manager'].includes(staff.role)) {
    return NextResponse.json({ message: 'Charging a card on file takes an owner, admin, or manager.' }, { status: 403 })
  }

  const body = (await req.json().catch(() => ({}))) as { bookingId?: string; amountCents?: number; reason?: string; notified?: boolean }
  const amount = Math.round(Number(body.amountCents) || 0)
  const reason = (body.reason ?? '').trim().slice(0, 140)
  if (!body.bookingId || amount < 50 || amount > MAX_FEE_CENTS || !reason) {
    return NextResponse.json({ message: 'Give an amount between $0.50 and $2,000 and a reason.' }, { status: 400 })
  }
  if (body.notified !== true) {
    return NextResponse.json({ message: 'The agreement promises the renter is notified before the card is charged — contact them first, then check the box.' }, { status: 400 })
  }

  const db = serviceDb()
  const { data, error } = await db.from('bookings')
    .select('id, org_id, code, title, price_cents, account_id, note, card_customer_id, card_pm_id, card_brand, card_last4')
    .eq('id', body.bookingId).maybeSingle()
  if (error) return NextResponse.json({ message: 'Card on file needs migration 0053 run in Supabase first.' }, { status: 501 })
  const b = data as {
    id: string; org_id: string; code: string; title: string; price_cents: number; account_id: string | null; note: string | null
    card_customer_id: string | null; card_pm_id: string | null; card_brand: string | null; card_last4: string | null
  } | null
  if (!b) return NextResponse.json({ message: 'Booking not found.' }, { status: 404 })
  if (!b.card_pm_id || !b.card_customer_id) {
    return NextResponse.json({ message: 'There is no card on file for this booking.' }, { status: 409 })
  }
  const cardLabel = `${(b.card_brand ?? 'Card').replace(/^./, (c) => c.toUpperCase())} ending ${b.card_last4}`

  let piId: string
  try {
    const pi = await stripe().paymentIntents.create({
      amount,
      currency: 'usd',
      customer: b.card_customer_id,
      payment_method: b.card_pm_id,
      off_session: true,
      confirm: true,
      description: `${reason} — ${b.title} ${b.code}`,
      metadata: { booking_id: b.id, kind: 'booking_fee', reason, taken_by_staff: staff.id },
    })
    if (pi.status !== 'succeeded') {
      return NextResponse.json({ message: `The charge didn’t complete (Stripe status: ${pi.status}).` }, { status: 402 })
    }
    piId = pi.id
  } catch (err) {
    const e = err as { code?: string; message?: string }
    return NextResponse.json({
      message: e.code === 'authentication_required'
        ? 'Their bank wants the renter to approve this charge themselves — call them and take it as a card payment through the booking’s pay link instead.'
        : `The card was declined: ${e.message ?? 'no reason given'}.`,
    }, { status: 402 })
  }

  // The fee joins the booking total and is recorded as paid, so the
  // balance stays where it was and the money shows in "collected".
  const stamp = `Fee: $${(amount / 100).toFixed(2)} ${reason} — charged to ${cardLabel} by ${staff.name}`
  await db.from('bookings').update({
    price_cents: b.price_cents + amount,
    note: b.note ? `${b.note} · ${stamp}` : stamp,
  }).eq('id', b.id)
  await db.from('payments').insert({
    org_id: b.org_id,
    account_id: b.account_id,
    booking_id: b.id,
    method: 'stripe',
    status: 'paid',
    amount_cents: amount,
    memo: `${reason} · ${b.code}`,
    stripe_payment_intent_id: piId,
    taken_by: staff.id,
  })

  try {
    const resolved = await bookingFactsAny(b.id)
    if (resolved?.to) {
      await sendAndLog('booking.fee_charged', resolved.to.email,
        bookingFeeCharged(resolved.facts, { amountCents: amount, reason, card: cardLabel }),
        { accountId: b.account_id, bookingId: b.id })
    }
  } catch (e) {
    console.warn('[booking-fee] email', e)
  }
  return NextResponse.json({ ok: true, card: cardLabel })
}
