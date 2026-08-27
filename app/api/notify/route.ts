import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { serviceDb, sendAndLog, alertRecipients } from '@/lib/server/billing'
import {
  bookingHeld, bookingConfirmed, bookingCanceled, bookingRescheduled, bookingUpdated,
  bookingRemoved, bookingPayment, bookingApproved, bookingApprovalAlert, bookingStaffAssigned, paymentReceipt, paymentVoided, refundIssued,
  membershipCanceled, membershipResumed,
  eventAssigned, eventGuestConfirmed, eventMoved,
} from '@/lib/server/emails'
import { eventFacts, emailForStaffUser } from '@/lib/server/event-facts'
import { bookingFacts, bookingFactsAny, recipientFor } from '@/lib/server/booking-facts'

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

export async function POST(req: Request) {
  const user = await callerId(req)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { kind, id } = (await req.json().catch(() => ({}))) as { kind?: string; id?: string }
  if (!kind || !id) return NextResponse.json({ error: 'bad_request' }, { status: 400 })

  try {
    if (kind === 'booking.hold' || kind === 'booking.confirmed' || kind === 'booking.canceled'
      || kind === 'booking.rescheduled' || kind === 'booking.updated' || kind === 'booking.deleted'
      || kind === 'booking.approved') {
      const resolved = await bookingFacts(id)
      if (!resolved) return NextResponse.json({ ok: true, skipped: 'no_email' })
      const body =
        kind === 'booking.hold' ? bookingHeld(resolved.facts)
        : kind === 'booking.approved' ? bookingApproved(resolved.facts)
        : kind === 'booking.confirmed' ? bookingConfirmed(resolved.facts)
        : kind === 'booking.rescheduled' ? bookingRescheduled(resolved.facts)
        : kind === 'booking.updated' ? bookingUpdated(resolved.facts)
        : kind === 'booking.deleted' ? bookingRemoved(resolved.facts)
        : bookingCanceled(resolved.facts)
      await sendAndLog(kind, resolved.to.email, body, { accountId: resolved.b.account_id, bookingId: resolved.b.id })
      // A customer hold that nobody has approved also wakes the house —
      // to whatever address Settings names (0045). Staff-made bookings
      // carry approved_at from birth and stay silent here.
      if (kind === 'booking.hold' && !resolved.b.approved_at) {
        try {
          const { data: cfgRow } = await serviceDb().from('site_config').select('booking_alert_email').limit(1).maybeSingle()
          const raw = (cfgRow as { booking_alert_email?: string } | null)?.booking_alert_email ?? ''
          for (const alertTo of alertRecipients(raw, resolved.to.email)) {
            await sendAndLog('booking.approval_alert', alertTo, bookingApprovalAlert(resolved.facts), { bookingId: resolved.b.id })
          }
        } catch {
          // pre-0045 — no alert address to consult
        }
      }
      return NextResponse.json({ ok: true })
    }

    // A staff member put on a booking to run it. This one goes to them,
    // not the customer, and the address is looked up from the assignment
    // on the row — the browser names the booking and nothing else.
    if (kind === 'booking.staff_assigned') {
      const db = serviceDb()
      const { data } = await db.from('bookings')
        .select('run_by_staff_id, payout_cents, staff:run_by_staff_id(name, user_id)')
        .eq('id', id)
        .maybeSingle()
      const row = data as unknown as {
        run_by_staff_id: string | null
        payout_cents: number | null
        staff: { name: string; user_id: string | null } | null
      } | null
      if (!row?.staff?.user_id) return NextResponse.json({ ok: true, skipped: 'no_staff_login' })
      const to = await emailForStaffUser(row.staff.user_id)
      if (!to) return NextResponse.json({ ok: true, skipped: 'no_email' })
      // The staff alert must not depend on the CUSTOMER having an email —
      // a desk booking with no contact address still has a runner to tell.
      const resolved = await bookingFactsAny(id)
      if (!resolved) return NextResponse.json({ ok: true, skipped: 'not_found' })
      await sendAndLog('booking.staff_assigned', to, bookingStaffAssigned(resolved.facts, {
        staffName: row.staff.name,
        payoutCents: row.payout_cents,
      }), { bookingId: id })
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

    // A payment struck from the books. The customer already got a receipt
    // for it, so the correction can't be silent. Only rows a staff member
    // actually voided qualify — the browser names the row, the row's own
    // status decides whether an email goes out.
    if (kind === 'payment.voided') {
      const { data } = await serviceDb()
        .from('payments')
        .select('code, amount_cents, method, booking_id, status')
        .eq('id', id)
        .maybeSingle()
      const p = data as { code: string; amount_cents: number; method: string; booking_id: string | null; status: string } | null
      if (!p || p.status !== 'voided' || !p.booking_id) return NextResponse.json({ ok: true, skipped: 'not_a_voided_booking_payment' })
      const resolved = await bookingFacts(p.booking_id)
      if (!resolved) return NextResponse.json({ ok: true, skipped: 'no_email' })
      await sendAndLog('payment.voided', resolved.to.email, paymentVoided(resolved.facts, {
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

    // Tours and scheduled events: the staff member who's running it, and
    // the visitor who's coming in.
    if (kind === 'event.assigned' || kind === 'event.guest_confirmed' || kind === 'event.moved') {
      const resolved = await eventFacts(id)
      if (!resolved) return NextResponse.json({ ok: true, skipped: 'not_found' })
      const { e, facts, staffEmail, guestEmail } = resolved
      if (kind === 'event.assigned' && staffEmail) {
        await sendAndLog('event.assigned', staffEmail, eventAssigned(facts), {})
      }
      if (kind === 'event.guest_confirmed' && guestEmail) {
        await sendAndLog('event.guest_confirmed', guestEmail, eventGuestConfirmed(facts), {})
      }
      if (kind === 'event.moved') {
        if (staffEmail) await sendAndLog('event.moved', staffEmail, eventMoved(facts, true), {})
        if (guestEmail) await sendAndLog('event.moved', guestEmail, eventMoved(facts, false), {})
      }
      void e
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
