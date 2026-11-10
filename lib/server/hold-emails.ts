import { serviceDb, sendAndLog } from '@/lib/server/billing'
import { bookingFacts, bookingFactsAny } from '@/lib/server/booking-facts'
import { startHoldClock, alertAdminsOfUnpaidHold, adminRecipients } from '@/lib/server/unpaid-holds'
import { bookingHeld, bookingApprovalAlert } from '@/lib/server/emails'

// Everything a new hold sends: its 24-hour clock when the event is within
// 14 days, the customer's "we're holding it" email, and the house's alert
// (the approval alert for a customer request — sent even when the
// customer left no email — or the unpaid notice for a hold staff placed).
// Called right after the booking is made, and again by the hourly job for
// any hold whose email never went out (a closed tab, a failed request).
export async function sendHoldEmails(bookingId: string, parts: { customer?: boolean; staff?: boolean } = {}): Promise<{ customer: boolean; staff: boolean }> {
  const wantCustomer = parts.customer !== false
  const wantStaff = parts.staff !== false
  const clock = await startHoldClock(bookingId).catch(() => null)
  const resolved = await bookingFacts(bookingId)
  let customer = false
  if (resolved && wantCustomer) {
    await sendAndLog('booking.hold', resolved.to.email, bookingHeld(resolved.facts),
      { accountId: resolved.b.account_id, bookingId })
    customer = true
  }
  const any = resolved ?? await bookingFactsAny(bookingId)
  if (!any) return { customer, staff: false }
  let staff = false
  if (!wantStaff) return { customer, staff }
  if (!any.b.approved_at && 'approved_at' in any.b) {
    for (const to of await adminRecipients(any.to?.email)) {
      await sendAndLog('booking.approval_alert', to, bookingApprovalAlert(any.facts), { bookingId })
    }
    staff = true
  } else if (clock) {
    await alertAdminsOfUnpaidHold(bookingId, any.to?.email)
    staff = true
  }
  return { customer, staff }
}

// The hourly backup: holds made in the last few days whose hold email (or
// approval alert, for customer requests) was never logged.
export async function sendMissedHoldEmails(): Promise<number> {
  const db = serviceDb()
  const since = new Date(Date.now() - 4 * 24 * 3600_000).toISOString()
  const { data, error } = await db.from('bookings').select('id, approved_at, created_at, contact_email, account_id')
    .eq('status', 'hold').is('lead_booking_id', null).gte('created_at', since).limit(200)
  if (error || !data || data.length === 0) return 0
  const ids = (data as { id: string }[]).map((r) => r.id)
  const { data: logs } = await db.from('email_log').select('booking_id, kind')
    .in('booking_id', ids).in('kind', ['booking.hold', 'booking.approval_alert'])
  const sent = new Set(((logs ?? []) as { booking_id: string; kind: string }[]).map((l) => `${l.booking_id}:${l.kind}`))
  let n = 0
  for (const r of data as { id: string; approved_at: string | null; created_at: string; contact_email: string | null; account_id: string | null }[]) {
    // The browser's own send has had ten minutes to happen.
    if (Date.now() - new Date(r.created_at).getTime() < 10 * 60_000) continue
    const hasCustomer = !!r.contact_email || !!r.account_id
    const missedCustomer = hasCustomer && !sent.has(`${r.id}:booking.hold`)
    const missedStaff = !r.approved_at && !sent.has(`${r.id}:booking.approval_alert`)
    if (!missedCustomer && !missedStaff) continue
    await sendHoldEmails(r.id, { customer: missedCustomer, staff: missedStaff })
    n += 1
  }
  return n
}
