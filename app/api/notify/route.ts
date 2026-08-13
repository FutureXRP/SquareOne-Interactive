import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { serviceDb, sendAndLog } from '@/lib/server/billing'
import {
  bookingHeld, bookingConfirmed, bookingCanceled, bookingRescheduled, bookingUpdated,
  bookingRemoved, bookingPayment, paymentReceipt, refundIssued,
  membershipCanceled, membershipResumed, type BookingFacts,
} from '@/lib/server/emails'

// Confirmation emails for things that happen in the browser — a member
// booking a room, the desk taking a payment, a booking being canceled.
// The caller only names the event and the row; every word of the email is
// built here from the database, so nothing a browser sends can be mailed
// to a customer.

const PAY_LABEL: Record<string, string> = {
  stripe: 'Card', cash: 'Cash', cashapp: 'Cash App', ach: 'Bank transfer', check: 'Check',
}

async function callerId(req: Request): Promise<string | null> {
  const token = req.headers.get('authorization')?.replace(/^Bearer /, '')
  if (!token) return null
  const anon = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
    { global: { headers: { Authorization: `Bearer ${token}` } } },
  )
  const { data } = await anon.auth.getUser()
  return data?.user?.id ?? null
}

// The address we write to: the booking's own contact email first (walk-ins
// booked at the desk), otherwise the account holder's.
async function recipientFor(accountId: string | null, contactEmail: string | null): Promise<{ email: string; name: string } | null> {
  if (contactEmail) return { email: contactEmail, name: '' }
  if (!accountId) return null
  const { data } = await serviceDb()
    .from('clients')
    .select('full_name, email, is_primary')
    .eq('account_id', accountId)
    .order('is_primary', { ascending: false })
    .limit(1)
  const row = (data as { full_name: string; email: string | null }[] | null)?.[0]
  return row?.email ? { email: row.email, name: row.full_name } : null
}

function parseRange(during: string): { from: Date; to: Date } | null {
  const m = /^[[(]"?([^",]+)"?\s*,\s*"?([^")\]]+)"?[)\]]$/.exec(during)
  if (!m) return null
  return { from: new Date(m[1]), to: new Date(m[2]) }
}

function hour(d: Date): string {
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: d.getMinutes() ? '2-digit' : undefined, timeZone: 'America/Chicago' })
}

interface BookingRecord {
  id: string; code: string; title: string; client_name: string; during: string
  price_cents: number; status: string; account_id: string | null
  deposit_cents?: number | null
  contact_email?: string | null
  note?: string | null
  facilities: { name: string } | null
  payments: { amount_cents: number; status: string }[]
}

async function bookingFacts(bookingId: string): Promise<{ b: BookingRecord; facts: BookingFacts; to: { email: string; name: string } } | null> {
  const sets = [
    'id, code, title, client_name, during, price_cents, status, account_id, deposit_cents, contact_email, note, facilities:facility_id(name), payments(amount_cents, status)',
    'id, code, title, client_name, during, price_cents, status, account_id, deposit_cents, note, facilities:facility_id(name), payments(amount_cents, status)',
    'id, code, title, client_name, during, price_cents, status, account_id, facilities:facility_id(name), payments(amount_cents, status)',
  ]
  let b: BookingRecord | null = null
  for (const cols of sets) {
    const { data, error } = await serviceDb().from('bookings').select(cols).eq('id', bookingId).maybeSingle()
    if (!error && data) { b = data as unknown as BookingRecord; break }
  }
  if (!b) return null
  const to = await recipientFor(b.account_id, b.contact_email ?? null)
  if (!to) return null
  const range = parseRange(b.during)
  const paid = b.payments.filter((p) => p.status === 'paid').reduce((n, p) => n + p.amount_cents, 0)
  const addons = b.note?.startsWith('Add-ons:') ? b.note.replace('Add-ons: ', '') : undefined
  return {
    b,
    to,
    facts: {
      code: b.code,
      room: b.facilities?.name ?? 'Your room',
      what: b.title,
      date: range ? range.from.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'America/Chicago' }) : '—',
      time: range ? `${hour(range.from)} – ${hour(range.to)}` : '—',
      priceCents: b.price_cents,
      paidCents: paid,
      depositCents: b.deposit_cents ?? null,
      name: to.name || b.client_name,
      addons,
    },
  }
}

export async function POST(req: Request) {
  const user = await callerId(req)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { kind, id } = (await req.json().catch(() => ({}))) as { kind?: string; id?: string }
  if (!kind || !id) return NextResponse.json({ error: 'bad_request' }, { status: 400 })

  try {
    if (kind === 'booking.hold' || kind === 'booking.confirmed' || kind === 'booking.canceled'
      || kind === 'booking.rescheduled' || kind === 'booking.updated' || kind === 'booking.deleted') {
      const resolved = await bookingFacts(id)
      if (!resolved) return NextResponse.json({ ok: true, skipped: 'no_email' })
      const body =
        kind === 'booking.hold' ? bookingHeld(resolved.facts)
        : kind === 'booking.confirmed' ? bookingConfirmed(resolved.facts)
        : kind === 'booking.rescheduled' ? bookingRescheduled(resolved.facts)
        : kind === 'booking.updated' ? bookingUpdated(resolved.facts)
        : kind === 'booking.deleted' ? bookingRemoved(resolved.facts)
        : bookingCanceled(resolved.facts)
      await sendAndLog(kind, resolved.to.email, body, { accountId: resolved.b.account_id, bookingId: resolved.b.id })
      return NextResponse.json({ ok: true })
    }

    // A payment against a booking: one email that reads as a deposit
    // receipt or a paid-in-full confirmation, depending on what's left.
    if (kind === 'booking.payment') {
      const { data } = await serviceDb()
        .from('payments')
        .select('code, amount_cents, method, booking_id')
        .eq('id', id)
        .maybeSingle()
      const p = data as { code: string; amount_cents: number; method: string; booking_id: string | null } | null
      if (!p?.booking_id) return NextResponse.json({ ok: true, skipped: 'not_a_booking_payment' })
      const resolved = await bookingFacts(p.booking_id)
      if (!resolved) return NextResponse.json({ ok: true, skipped: 'no_email' })
      await sendAndLog('booking.payment', resolved.to.email, bookingPayment(resolved.facts, {
        amountCents: p.amount_cents,
        method: PAY_LABEL[p.method] ?? p.method,
        code: p.code,
      }), { accountId: resolved.b.account_id, bookingId: resolved.b.id })
      return NextResponse.json({ ok: true })
    }

    if (kind === 'payment.receipt') {
      const { data } = await serviceDb()
        .from('payments')
        .select('code, amount_cents, method, memo, account_id, booking_id, bookings:booking_id(client_name, price_cents, contact_email, payments(amount_cents, status))')
        .eq('id', id)
        .maybeSingle()
      if (!data) return NextResponse.json({ ok: true, skipped: 'not_found' })
      const p = data as unknown as {
        code: string; amount_cents: number; method: string; memo: string | null
        account_id: string | null; booking_id: string | null
        bookings: { client_name: string; price_cents: number; contact_email?: string | null; payments: { amount_cents: number; status: string }[] } | null
      }
      const to = await recipientFor(p.account_id, p.bookings?.contact_email ?? null)
      if (!to) return NextResponse.json({ ok: true, skipped: 'no_email' })
      const paidAll = (p.bookings?.payments ?? []).filter((x) => x.status === 'paid').reduce((n, x) => n + x.amount_cents, 0)
      const balance = p.bookings ? Math.max(0, p.bookings.price_cents - paidAll) : 0
      await sendAndLog('payment.receipt', to.email, paymentReceipt({
        name: to.name || p.bookings?.client_name || 'there',
        amountCents: p.amount_cents,
        method: PAY_LABEL[p.method] ?? p.method,
        what: p.memo ?? 'SquareOne Interactive',
        code: p.code,
        balanceCents: balance,
      }), { accountId: p.account_id, bookingId: p.booking_id })
      return NextResponse.json({ ok: true })
    }

    // Cash and Cash App refunds are recorded in the browser, so the
    // email is triggered from there — card refunds mail from their own route.
    if (kind === 'refund.issued') {
      const { data } = await serviceDb()
        .from('refunds')
        .select('amount_cents, method, reason, account_id, booking_id, payments:payment_id(memo)')
        .eq('id', id)
        .maybeSingle()
      if (!data) return NextResponse.json({ ok: true, skipped: 'not_found' })
      const r = data as unknown as {
        amount_cents: number; method: string; reason: string
        account_id: string | null; booking_id: string | null
        payments: { memo: string | null } | null
      }
      const to = await recipientFor(r.account_id, null)
      if (!to) return NextResponse.json({ ok: true, skipped: 'no_email' })
      await sendAndLog('refund.issued', to.email, refundIssued({
        name: to.name,
        amountCents: r.amount_cents,
        method: PAY_LABEL[r.method] ?? r.method,
        what: r.payments?.memo ?? 'your booking',
        reason: r.reason,
      }), { accountId: r.account_id, bookingId: r.booking_id })
      return NextResponse.json({ ok: true })
    }

    // Membership cancel/resume when Stripe isn't in the loop — the billing
    // route handles it otherwise. Resolved from the signed-in user, so a
    // browser can only ever trigger this for its own account.
    if (kind === 'membership.canceled' || kind === 'membership.resumed') {
      const db = serviceDb()
      const { data } = await db.from('clients')
        .select('account_id, full_name, email')
        .eq('user_id', user)
        .maybeSingle()
      const me = data as { account_id: string; full_name: string; email: string | null } | null
      if (!me?.email) return NextResponse.json({ ok: true, skipped: 'no_email' })
      const { data: sub } = await db.from('member_subscriptions')
        .select('current_period_end').eq('account_id', me.account_id).maybeSingle()
      const ends = (sub as { current_period_end: string | null } | null)?.current_period_end
      const endsOn = ends
        ? new Date(`${ends}T12:00:00`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
        : null
      await sendAndLog(
        kind,
        me.email,
        kind === 'membership.resumed'
          ? membershipResumed({ name: me.full_name })
          : membershipCanceled({ name: me.full_name, endsOn }),
        { accountId: me.account_id },
      )
      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ error: 'unknown_kind' }, { status: 400 })
  } catch (e) {
    console.error('[notify]', e)
    return NextResponse.json({ error: 'notify_failed' }, { status: 500 })
  }
}
