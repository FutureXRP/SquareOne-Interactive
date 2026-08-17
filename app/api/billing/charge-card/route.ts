import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { stripe, stripeConfigured, serviceDb } from '@/lib/server/billing'
import { recordBookingIntent } from '@/lib/server/record-payments'

// Desk card payments, two ways, both real:
//
// 'saved'  — charge the card the customer already saved with Stripe, with
//            their say-so on the phone or at the counter. Off-session, so
//            no card number is spoken, typed, or seen by anyone.
// 'manual' — the customer reads their number over the phone and staff type
//            it into a Stripe Elements field. The number goes from that
//            field straight to Stripe: it never reaches this server, and
//            must never — this route only mints the PaymentIntent the
//            Elements form confirms.
//
// Amounts are computed here from the booking row. Staff choose deposit or
// balance, never a number.

async function callerStaff(req: Request): Promise<{ id: string } | null> {
  const token = req.headers.get('authorization')?.replace(/^Bearer /, '')
  if (!token) return null
  const anon = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
    { global: { headers: { Authorization: `Bearer ${token}` } } },
  )
  const { data } = await anon.auth.getUser()
  const userId = data?.user?.id
  if (!userId) return null
  const { data: row } = await serviceDb().from('staff').select('id, active').eq('user_id', userId).maybeSingle()
  const s = row as { id: string; active: boolean } | null
  return s?.active ? { id: s.id } : null
}

interface BookingRow {
  id: string; code: string; title: string; price_cents: number; status: string
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
  const staff = await callerStaff(req)
  if (!staff) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { bookingId, which, mode } = (await req.json().catch(() => ({}))) as
    { bookingId?: string; which?: 'deposit' | 'balance'; mode?: 'saved' | 'manual' }
  if (!bookingId || !mode) return NextResponse.json({ error: 'bad_request' }, { status: 400 })

  const db = serviceDb()
  let b: BookingRow | null = null
  for (const cols of COL_SETS) {
    const { data, error } = await db.from('bookings').select(cols).eq('id', bookingId).maybeSingle()
    if (!error) { b = data as unknown as BookingRow | null; break }
  }
  if (!b) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  if (b.status === 'canceled') return NextResponse.json({ error: 'canceled', message: 'That booking is canceled.' }, { status: 409 })

  const paid = (b.payments ?? []).filter((p) => p.status === 'paid').reduce((n, p) => n + p.amount_cents, 0)
  const balance = Math.max(0, b.price_cents - paid)
  if (balance <= 0) return NextResponse.json({ error: 'already_paid', message: 'Already paid in full.' }, { status: 409 })
  const depositDue = b.deposit_cents && b.deposit_cents > 0 ? Math.max(0, b.deposit_cents - paid) : 0
  const amount = which === 'deposit' && depositDue > 0 ? Math.min(depositDue, balance) : balance

  const meta = { booking_id: b.id, account_id: b.account_id ?? '', kind: 'booking', taken_by_staff: staff.id }

  try {
    const s = stripe()

    if (mode === 'saved') {
      if (!b.account_id) {
        return NextResponse.json({ error: 'no_account', message: 'This booking has no member account, so there is no saved card. Use "type the card" or send the pay link.' }, { status: 409 })
      }
      const { data: acct } = await db.from('client_accounts').select('stripe_customer_id').eq('id', b.account_id).maybeSingle()
      const customerId = (acct as { stripe_customer_id: string | null } | null)?.stripe_customer_id
      if (!customerId) {
        return NextResponse.json({ error: 'no_saved_card', message: 'No card on file for this member yet. A card saves automatically the first time they pay online.' }, { status: 409 })
      }
      // The default card if one is set, otherwise the most recent.
      const customer = await s.customers.retrieve(customerId)
      const defaultPm = !customer.deleted ? customer.invoice_settings?.default_payment_method : null
      let pmId = typeof defaultPm === 'string' ? defaultPm : defaultPm?.id
      if (!pmId) {
        const pms = await s.paymentMethods.list({ customer: customerId, type: 'card', limit: 1 })
        pmId = pms.data[0]?.id
      }
      if (!pmId) {
        return NextResponse.json({ error: 'no_saved_card', message: 'No card on file for this member yet. A card saves automatically the first time they pay online.' }, { status: 409 })
      }

      try {
        const pi = await s.paymentIntents.create({
          amount,
          currency: 'usd',
          customer: customerId,
          payment_method: pmId,
          off_session: true,
          confirm: true,
          description: `${b.title} — ${b.code}`,
          metadata: meta,
        })
        await recordBookingIntent(pi)
        const card = pi.latest_charge && typeof pi.latest_charge !== 'string'
          ? pi.latest_charge.payment_method_details?.card?.last4 : undefined
        return NextResponse.json({ ok: true, paid: true, amountCents: amount, last4: card ?? null })
      } catch (err) {
        // The bank wants the customer present — that's what the pay link is for.
        const e = err as { code?: string; message?: string }
        const needsCustomer = e.code === 'authentication_required'
        return NextResponse.json({
          error: e.code ?? 'charge_failed',
          message: needsCustomer
            ? 'Their bank wants the customer to approve this one themselves — send them the pay link from their booking email.'
            : `The card was declined: ${e.message ?? 'no reason given'}.`,
        }, { status: 402 })
      }
    }

    // mode === 'manual': mint the intent; the Elements form confirms it
    // with the card the staff member types, and the number never comes here.
    const pi = await s.paymentIntents.create({
      amount,
      currency: 'usd',
      payment_method_types: ['card'],
      description: `${b.title} — ${b.code} (phone order)`,
      metadata: meta,
    })
    return NextResponse.json({ ok: true, clientSecret: pi.client_secret, amountCents: amount })
  } catch (e) {
    console.error('[charge-card]', e)
    return NextResponse.json({ error: 'failed', message: e instanceof Error ? e.message : 'Could not start the charge.' }, { status: 500 })
  }
}
