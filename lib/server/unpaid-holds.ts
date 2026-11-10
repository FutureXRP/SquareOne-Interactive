import { serviceDb, sendAndLog, alertRecipients } from '@/lib/server/billing'
import { withinDepositWindow } from '@/lib/payment-policy'
import { bookingFactsAny, deadlinePhrase } from '@/lib/server/booking-facts'
import { emailForStaffUser } from '@/lib/server/event-facts'
import {
  holdPaymentWarning, bookingCanceled, unpaidHoldsAlert,
  type HoldDigestItem,
} from '@/lib/server/emails'

// The 24-hour rule for unpaid holds (lib/payment-policy.ts). A party
// within 14 days of its event must have at least the deposit paid within
// 24 hours. Booked inside 14 days, the clock starts at booking; booked
// further out, nothing is due until the event is 14 days away, and the
// clock starts then. Either way the hold gets one notice — the customer
// is told they have 24 hours to pay at least the deposit or it will be
// removed, and the admins are told it's unpaid. When it runs out with still nothing paid, the hold is canceled,
// the customer gets the "hold ran out" email, and the admins get the
// list. Any payment confirms the booking (status leaves 'hold'), which
// is what stops the clock; so does staff confirming it by hand.
//
// Nothing is ever removed without its notice first: the deadline that
// counts is the one set when the warning went out (hold_warned_at), never
// the hold_expires_at a booking was born with.

const DAY_MS = 24 * 60 * 60 * 1000

interface HoldRow {
  id: string
  code: string
  client_name: string
  during: string
  price_cents: number
  status: string
  approved_at?: string | null
  hold_expires_at: string | null
  hold_warned_at: string | null
  note: string | null
  facilities: { name: string } | null
  payments: { amount_cents: number; status: string }[]
}

function startOf(during: string): Date | null {
  const m = /^[[(]"?([^",]+)"?\s*,/.exec(during)
  return m ? new Date(m[1]) : null
}

function paidOn(r: { payments: { amount_cents: number; status: string }[] }): number {
  return (r.payments ?? []).filter((p) => p.status === 'paid').reduce((n, p) => n + p.amount_cents, 0)
}

// 24 hours from now — or the event's start, if that comes sooner.
function deadlineFor(start: Date, now: number): Date {
  return new Date(Math.min(now + DAY_MS, start.getTime()))
}

function whenLabel(during: string): string {
  const d = startOf(during)
  if (!d) return '—'
  return d.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: d.getMinutes() ? '2-digit' : undefined, timeZone: 'America/Chicago' })
}

function digestItem(r: HoldRow, extra: Partial<HoldDigestItem> = {}): HoldDigestItem {
  return {
    code: r.code,
    name: r.client_name,
    room: r.facilities?.name ?? 'Room',
    when: whenLabel(r.during),
    totalCents: r.price_cents,
    ...extra,
  }
}

// Who hears about unpaid holds: the booking alert address(es) on
// Settings, else every active owner and admin with a login.
export async function adminRecipients(exclude?: string | null): Promise<string[]> {
  const db = serviceDb()
  try {
    const { data } = await db.from('site_config').select('booking_alert_email').limit(1).maybeSingle()
    const raw = (data as { booking_alert_email?: string } | null)?.booking_alert_email ?? ''
    const list = alertRecipients(raw, exclude)
    if (list.length > 0) return list
  } catch {
    // pre-0045 — fall through to the owners and admins
  }
  const { data: staff } = await db.from('staff').select('user_id, role, active').eq('active', true).in('role', ['owner', 'admin'])
  const out: string[] = []
  for (const s of (staff ?? []) as { user_id: string | null }[]) {
    const email = await emailForStaffUser(s.user_id)
    if (email && !out.some((e) => e.toLowerCase() === email.toLowerCase())) out.push(email)
  }
  return alertRecipients(out.join(','), exclude)
}

// Start the clock on one hold, if it's an unpaid future hold that hasn't
// had its notice. Returns the deadline when it stamped one. Conditional on
// hold_warned_at still being null, so two callers racing can't both win.
export async function startHoldClock(bookingId: string, now = Date.now()): Promise<string | null> {
  const db = serviceDb()
  const { data, error } = await db.from('bookings')
    .select('id, during, price_cents, status, hold_warned_at, payments(amount_cents, status)')
    .eq('id', bookingId).maybeSingle()
  if (error || !data) return null // 42703 before 0054
  const r = data as unknown as Pick<HoldRow, 'id' | 'during' | 'price_cents' | 'status' | 'hold_warned_at' | 'payments'>
  if (r.status !== 'hold' || r.hold_warned_at || r.price_cents <= 0 || paidOn(r) > 0) return null
  const start = startOf(r.during)
  if (!start || start.getTime() <= now) return null
  // More than 14 days out: nothing is due yet — the hourly job starts
  // the clock when the event comes within 14 days.
  if (!withinDepositWindow(start, now)) return null
  const deadline = deadlineFor(start, now).toISOString()
  const { data: stamped } = await db.from('bookings')
    .update({ hold_warned_at: new Date(now).toISOString(), hold_expires_at: deadline })
    .eq('id', r.id).eq('status', 'hold').is('hold_warned_at', null)
    .select('id')
  return (stamped ?? []).length > 0 ? deadline : null
}

// The admins' heads-up for one hold that just got its clock from the hold
// email. A customer request waiting on approval gets the approval alert
// instead (which says it's unpaid and when it goes), so this is for holds
// staff placed.
export async function alertAdminsOfUnpaidHold(bookingId: string, customerEmail?: string | null): Promise<void> {
  const r = await bookingFactsAny(bookingId)
  if (!r || !r.facts.holdDeadline) return
  const body = unpaidHoldsAlert({
    warned: [{
      code: r.facts.code, name: r.facts.name, room: r.facts.room, when: `${r.facts.date}, ${r.facts.time}`,
      totalCents: r.facts.priceCents, deadline: r.facts.holdDeadline,
      note: `Removed ${r.facts.holdDeadline} unless paid${r.to ? ` — ${r.to.email} was told` : ' — no customer email on file, so call them'}`,
    }],
    released: [],
  })
  for (const addr of await adminRecipients(customerEmail)) await sendAndLog('booking.unpaid_alert', addr, body, { bookingId })
}

async function hasPendingClaim(bookingId: string): Promise<boolean> {
  const { data, error } = await serviceDb().from('payment_claims')
    .select('id').eq('booking_id', bookingId).eq('status', 'pending').limit(1)
  return !error && (data ?? []).length > 0
}

// The hourly pass: notice every unpaid hold that hasn't had one, remove
// every noticed hold whose 24 hours are up, and tell the admins once.
export async function runUnpaidHolds(now = Date.now()): Promise<{ warned: number; released: number; kept: number } | null> {
  const db = serviceDb()
  const { data, error } = await db.from('bookings')
    .select('id, code, client_name, during, price_cents, status, approved_at, hold_expires_at, hold_warned_at, note, facilities:facility_id(name), payments(amount_cents, status)')
    .eq('status', 'hold')
    .limit(500)
  // hold_warned_at is missing until 0054 runs — then there is no clock.
  if (error) return null

  const warned: HoldDigestItem[] = []
  const released: HoldDigestItem[] = []
  let kept = 0

  for (const r of data as unknown as HoldRow[]) {
    if (r.price_cents <= 0 || paidOn(r) > 0) continue
    const start = startOf(r.during)
    // A hold for something that has already started is history, not a
    // booking anyone can still pay for in time — leave it to the desk.
    if (!start || start.getTime() <= now) continue
    // Not within 14 days yet — no clock, nothing due.
    if (!r.hold_warned_at && !withinDepositWindow(start, now)) continue

    if (!r.hold_warned_at) {
      const deadline = await startHoldClock(r.id, now)
      if (!deadline) continue
      const resolved = await bookingFactsAny(r.id)
      if (resolved?.to) {
        await sendAndLog('booking.hold_warning', resolved.to.email, holdPaymentWarning(resolved.facts), { accountId: resolved.b.account_id, bookingId: r.id })
      }
      warned.push(digestItem(r, {
        deadline: deadlinePhrase(deadline),
        note: resolved?.to
          ? `Removed ${deadlinePhrase(deadline)} unless paid — ${resolved.to.email} was told`
          : `Removed ${deadlinePhrase(deadline)} unless paid — no customer email on file, so call them`,
      }))
      continue
    }

    if (r.hold_expires_at && new Date(r.hold_expires_at).getTime() <= now) {
      // "I've sent it" on Cash App is waiting on the desk — removing the
      // booking under someone who says they paid would be the wrong call.
      if (await hasPendingClaim(r.id)) {
        kept += 1
        continue
      }
      const { data: gone } = await db.from('bookings')
        .update({
          status: 'canceled',
          canceled_at: new Date(now).toISOString(),
          canceled_via: 'hold_expired',
          note: [r.note, 'hold expired — unpaid after 24 hours'].filter(Boolean).join(' · '),
        })
        .eq('id', r.id).eq('status', 'hold')
        .select('id')
      if ((gone ?? []).length === 0) continue // paid or confirmed in the meantime
      const resolved = await bookingFactsAny(r.id)
      if (resolved?.to) {
        await sendAndLog('booking.canceled', resolved.to.email, bookingCanceled(resolved.facts), { accountId: resolved.b.account_id, bookingId: r.id })
      }
      released.push(digestItem(r, {
        note: resolved?.to ? `Canceled — ${resolved.to.email} was emailed` : 'Canceled — no customer email on file',
      }))
    }
  }

  if (warned.length > 0 || released.length > 0) {
    const body = unpaidHoldsAlert({ warned, released })
    for (const addr of await adminRecipients()) await sendAndLog('booking.unpaid_alert', addr, body, {})
  }
  return { warned: warned.length, released: released.length, kept }
}
