'use client'
// The live booking book — real rows in Supabase with database-enforced
// conflict prevention. The Board, Bookings page, and member portal all read
// from here. Money is integer cents.

import { supabase, emit } from '@/lib/supabase'
import { notify, notifyReport } from '@/lib/notify-client'

export const BOOKINGS_EVENT = 'sq-staff-bookings'

export type PayMethod = 'stripe' | 'cash' | 'cashapp'

export const PAY_LABEL: Record<string, string> = {
  stripe: 'Card (Stripe)',
  cash: 'Cash',
  cashapp: 'Cash App',
  ach: 'ACH',
  check: 'Check',
}

export interface StaffBooking {
  id: string // uuid
  code: string // BK-xxxx
  roomId: string
  title: string
  client: string
  date: string // YYYY-MM-DD (local)
  startH: number
  hours: number
  priceCents: number
  status: 'hold' | 'confirmed' | 'canceled' | 'completed'
  paidCents: number
  payMethod: string | null
  takenBy: string
  note?: string
  // Deposit that locks this booking in. null = none due; undefined = column not migrated.
  depositCents?: number | null
  // Staff payout for running this booking (migration 0023). undefined = not migrated.
  runByStaffId?: string | null
  payoutCents?: number | null // override; null = use the package's/room's default
  payoutPaidAt?: string | null
  payoutMethod?: string | null
  // The party package this booking sells (migration 0026). undefined = not migrated.
  packageId?: string | null
  // Staff sign-off (migration 0033). null = still a reservation in review.
  approvedAt?: string | null
  // Set when a standing reservation put this on the calendar (0035).
  standingId?: string | null
  // Who ended it (0038). undefined = not migrated; all null = canceled
  // before this was tracked.
  canceledAt?: string | null
  canceledVia?: 'staff' | 'member' | 'hold_expired' | null
  canceledByName?: string | null
  // The booking's own pay link (0037) — how a card is actually charged.
  payToken?: string | null
  // The account behind a member booking (null = guest/desk booking).
  accountId: string | null
  // Guest contact email typed at the desk (0029). Member bookings carry
  // their address on the account instead — see emailsForAccounts().
  contactEmail?: string | null
}

export function isoDate(offset = 0): string {
  const d = new Date()
  d.setDate(d.getDate() + offset)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function localRange(date: string, startH: number, hours: number): { fromIso: string; toIso: string } {
  const [y, m, d] = date.split('-').map(Number)
  const from = new Date(y, m - 1, d, Math.floor(startH), Math.round((startH % 1) * 60))
  const to = new Date(from.getTime() + hours * 3600_000)
  return { fromIso: from.toISOString(), toIso: to.toISOString() }
}

function parseRange(during: string): { from: Date; to: Date } | null {
  const m = /^[\[(]"?([^",]+)"?\s*,\s*"?([^")\]]+)"?[)\]]$/.exec(during)
  if (!m) return null
  return { from: new Date(m[1]), to: new Date(m[2]) }
}

interface Row {
  id: string
  code: string
  facility_id: string
  account_id: string | null
  title: string
  client_name: string
  during: string
  status: StaffBooking['status']
  price_cents: number
  note: string | null
  deposit_cents?: number | null
  run_by_staff_id?: string | null
  payout_cents?: number | null
  payout_paid_at?: string | null
  payout_method?: string | null
  package_id?: string | null
  approved_at?: string | null
  standing_id?: string | null
  canceled_at?: string | null
  canceled_via?: string | null
  canceled_by_staff?: { name: string } | null
  pay_token?: string | null
  contact_email?: string | null
  staff: { name: string } | null
  payments: { amount_cents: number; method: string; status: string }[]
}

const SELECT = 'id, code, facility_id, account_id, title, client_name, during, status, price_cents, note, staff:created_by(name), payments(amount_cents, method, status)'
// deposit_cents arrives with migration 0009, the payout columns with 0023,
// package_id with 0026 — fall back until each is run.
const SELECT_SETS = [
  `contact_email, pay_token, canceled_at, canceled_via, canceled_by_staff:canceled_by(name), standing_id, approved_at, package_id, run_by_staff_id, payout_cents, payout_paid_at, payout_method, deposit_cents, ${SELECT}`,
  `pay_token, canceled_at, canceled_via, canceled_by_staff:canceled_by(name), standing_id, approved_at, package_id, run_by_staff_id, payout_cents, payout_paid_at, payout_method, deposit_cents, ${SELECT}`,
  `canceled_at, canceled_via, canceled_by_staff:canceled_by(name), standing_id, approved_at, package_id, run_by_staff_id, payout_cents, payout_paid_at, payout_method, deposit_cents, ${SELECT}`,
  `standing_id, approved_at, package_id, run_by_staff_id, payout_cents, payout_paid_at, payout_method, deposit_cents, ${SELECT}`,
  `approved_at, package_id, run_by_staff_id, payout_cents, payout_paid_at, payout_method, deposit_cents, ${SELECT}`,
  `package_id, run_by_staff_id, payout_cents, payout_paid_at, payout_method, deposit_cents, ${SELECT}`,
  `run_by_staff_id, payout_cents, payout_paid_at, payout_method, deposit_cents, ${SELECT}`,
  `deposit_cents, ${SELECT}`,
  SELECT,
]

function fromRow(r: Row): StaffBooking | null {
  const range = parseRange(r.during)
  if (!range) return null
  const date = `${range.from.getFullYear()}-${String(range.from.getMonth() + 1).padStart(2, '0')}-${String(range.from.getDate()).padStart(2, '0')}`
  const startH = range.from.getHours() + range.from.getMinutes() / 60
  const hours = Math.max((range.to.getTime() - range.from.getTime()) / 3600_000, 0.5)
  const paid = r.payments.filter((p) => p.status === 'paid')
  return {
    id: r.id,
    code: r.code,
    roomId: r.facility_id,
    title: r.title,
    client: r.client_name,
    date,
    startH,
    hours,
    priceCents: r.price_cents,
    status: r.status,
    paidCents: paid.reduce((n, p) => n + p.amount_cents, 0),
    payMethod: paid.length > 0 ? paid[paid.length - 1].method : null,
    takenBy: r.staff?.name ?? 'member',
    note: r.note ?? undefined,
    depositCents: 'deposit_cents' in r ? r.deposit_cents ?? null : undefined,
    runByStaffId: 'run_by_staff_id' in r ? (r.run_by_staff_id ?? null) : undefined,
    payoutCents: 'payout_cents' in r ? (r.payout_cents ?? null) : undefined,
    payoutPaidAt: 'payout_paid_at' in r ? (r.payout_paid_at ?? null) : undefined,
    payoutMethod: 'payout_method' in r ? (r.payout_method ?? null) : undefined,
    packageId: 'package_id' in r ? (r.package_id ?? null) : undefined,
    approvedAt: 'approved_at' in r ? (r.approved_at ?? null) : undefined,
    standingId: 'standing_id' in r ? (r.standing_id ?? null) : undefined,
    canceledAt: 'canceled_at' in r ? (r.canceled_at ?? null) : undefined,
    canceledVia: 'canceled_via' in r ? ((r.canceled_via as StaffBooking['canceledVia']) ?? null) : undefined,
    canceledByName: 'canceled_by_staff' in r ? (r.canceled_by_staff?.name ?? null) : undefined,
    payToken: 'pay_token' in r ? (r.pay_token ?? null) : undefined,
    accountId: r.account_id ?? null,
    contactEmail: 'contact_email' in r ? (r.contact_email ?? null) : undefined,
  }
}

// The email behind each member account — for showing who to reach on a
// booking made through the store, where contact_email is empty because
// the address lives on the account. Primary member's address wins.
export async function emailsForAccounts(accountIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  const ids = [...new Set(accountIds)].filter(Boolean)
  if (ids.length === 0) return out
  const { data, error } = await supabase()
    .from('clients')
    .select('account_id, email, is_primary')
    .in('account_id', ids)
    .order('is_primary', { ascending: false })
  if (error) return out
  for (const r of data as { account_id: string; email: string | null }[]) {
    if (r.email && !out.has(r.account_id)) out.set(r.account_id, r.email)
  }
  return out
}

// A booking nobody has signed off on yet. Undefined approvedAt means the
// review migration hasn't run, so nothing is "in review".
// "by Dana Cruz", "by the customer", "hold expired unpaid" — or honest
// silence for cancels that predate the tracking.
export function canceledByLabel(b: StaffBooking): string | null {
  if (b.status !== 'canceled') return null
  if (b.canceledVia === 'member') return 'canceled by the customer'
  if (b.canceledVia === 'hold_expired') return 'hold expired unpaid'
  if (b.canceledVia === 'staff') return b.canceledByName ? `canceled by ${b.canceledByName}` : 'canceled by staff'
  return null // canceled before this was tracked, or 0038 not run
}

export function isInReview(b: StaffBooking): boolean {
  return b.approvedAt === null && b.status !== 'canceled'
}

export async function getStaffBookings(): Promise<StaffBooking[]> {
  for (const cols of SELECT_SETS) {
    const { data, error } = await supabase().from('bookings').select(cols).order('during')
    if (!error) return (data as unknown as Row[]).map(fromRow).filter((b): b is StaffBooking => b !== null)
  }
  throw new Error('bookings query failed')
}

export async function bookingsForDate(date: string): Promise<StaffBooking[]> {
  const { fromIso, toIso } = localRange(date, 0, 24)
  for (const cols of SELECT_SETS) {
    const { data, error } = await supabase()
      .from('bookings')
      .select(cols)
      .overlaps('during', `[${fromIso},${toIso})`)
      .in('status', ['hold', 'confirmed'])
    if (!error) return (data as unknown as Row[]).map(fromRow).filter((b): b is StaffBooking => b !== null)
  }
  throw new Error('bookings query failed')
}

export interface NewBooking {
  roomId: string
  title: string
  client: string
  date: string
  startH: number
  hours: number
  priceCents: number
  hold: boolean
  createdBy: string | null // staff uuid
  accountId?: string | null
  depositCents?: number | null // omit before migration 0009
  addonIds?: string[] // reserved extras (0022)
  runByStaffId?: string | null // who runs the event (0023)
  packageId?: string | null // party package this booking sells (0026)
  contactEmail?: string | null // where the guest's confirmation goes (0029)
  // Unbilled buffer copied from the room at creation (0039).
  setupMin?: number
  cleanupMin?: number
}

// Returns the new booking's code, or a conflict/error marker.
export async function addStaffBooking(b: NewBooking): Promise<{ ok: true; code: string } | { ok: false; conflict: boolean; addonConflict?: boolean }> {
  const sb = supabase()
  const { data: org } = await sb.from('organizations').select('id').limit(1).single()
  const { fromIso, toIso } = localRange(b.date, b.startH, b.hours)
  const base = {
    org_id: (org as { id: string }).id,
    facility_id: b.roomId,
    account_id: b.accountId ?? null,
    title: b.title,
    client_name: b.client,
    during: `[${fromIso},${toIso})`,
    status: b.hold ? 'hold' : 'confirmed',
    price_cents: b.priceCents,
    hold_expires_at: b.hold ? new Date(Date.now() + 24 * 3600_000).toISOString() : null,
    created_by: b.createdBy,
    ...(b.depositCents !== undefined ? { deposit_cents: b.depositCents } : {}),
  }
  const extras = {
    ...(b.addonIds && b.addonIds.length > 0 ? { addon_ids: b.addonIds } : {}),
    ...(b.runByStaffId ? { run_by_staff_id: b.runByStaffId } : {}),
    ...(b.packageId ? { package_id: b.packageId } : {}),
    ...(b.contactEmail ? { contact_email: b.contactEmail } : {}),
    // A staff member writing the booking is the sign-off; only what
    // customers book themselves waits in review.
    ...(b.createdBy ? { approved_at: new Date().toISOString(), approved_by: b.createdBy } : {}),
    ...(b.setupMin !== undefined ? { setup_min: b.setupMin } : {}),
    ...(b.cleanupMin !== undefined ? { cleanup_min: b.cleanupMin } : {}),
  }
  const hasExtras = Object.keys(extras).length > 0
  const payload = (hasExtras ? { ...base, ...extras } : base) as typeof base
  let res = await sb.from('bookings').insert(payload).select('id, code').single()
  // addon_ids / run_by_staff_id / contact_email arrive with 0022/0023/0029
  // — retry plain before then.
  if (res.error && hasExtras && (res.error.code === '42703' || res.error.code === 'PGRST204')) {
    res = await sb.from('bookings').insert(base).select('id, code').single()
  }
  if (res.error) {
    const conflict = res.error.code === '23P01' // exclusion constraint or addon trigger
    if (!conflict) console.error('[bookings]', res.error.message)
    return { ok: false, conflict, addonConflict: conflict && res.error.message.includes('addon_conflict') }
  }
  emit(BOOKINGS_EVENT)
  const row = res.data as { id: string; code: string }
  // Holds email a "we're holding it" note; paid bookings get confirmed
  // by recordPayment right after.
  if (b.hold) notify('booking.hold', row.id)
  // Somebody named as running this at the desk gets their shift email now.
  if (b.runByStaffId) notify('booking.staff_assigned', row.id)
  return { ok: true, code: row.code }
}

// Staff sign-off on a reservation. This is what turns "in review" into a
// confirmed booking for the customer.
export async function approveBooking(id: string, staffId: string | null): Promise<boolean> {
  const { error } = await supabase().from('bookings')
    .update({ approved_at: new Date().toISOString(), approved_by: staffId })
    .eq('id', id)
  if (error) {
    console.error('[bookings]', error.message)
    return false
  }
  emit(BOOKINGS_EVENT)
  notify('booking.approved', id)
  return true
}

// ── Staff payouts (migration 0023) ───────────────────────────

export interface RunByResult { ok: boolean; alertSent: boolean; alertReason: string | null }

export async function setBookingRunBy(id: string, staffId: string | null): Promise<RunByResult> {
  const { error } = await supabase().from('bookings').update({ run_by_staff_id: staffId }).eq('id', id)
  if (error) {
    console.error('[bookings]', error.message)
    return { ok: false, alertSent: false, alertReason: null }
  }
  emit(BOOKINGS_EVENT)
  // Tell them they're on it — and report whether the server actually sent
  // it, so the UI never claims an email that was silently skipped.
  // Unassigning is silent: there's nothing useful to say to somebody who
  // has just been taken off a shift by email.
  if (!staffId) return { ok: true, alertSent: false, alertReason: null }
  const r = await notifyReport('booking.staff_assigned', id)
  return { ok: true, alertSent: r.sent, alertReason: r.reason }
}

export async function setBookingPayout(id: string, cents: number | null): Promise<boolean> {
  const { error } = await supabase().from('bookings').update({ payout_cents: cents }).eq('id', id)
  if (error) {
    console.error('[bookings]', error.message)
    return false
  }
  emit(BOOKINGS_EVENT)
  return true
}

// Mark a payout settled ('cash' | 'cashapp'). A cash payout also comes
// out of the cash bag (best effort — needs 0024).
export async function markPayoutPaid(booking: StaffBooking, method: 'cash' | 'cashapp', amountCents: number, staffName: string, byStaffId: string | null): Promise<boolean> {
  const sb = supabase()
  const { error } = await sb.from('bookings')
    .update({ payout_paid_at: new Date().toISOString(), payout_method: method, payout_cents: amountCents })
    .eq('id', booking.id)
  if (error) {
    console.error('[bookings]', error.message)
    return false
  }
  if (method === 'cash' && amountCents > 0) {
    const { data: org } = await sb.from('organizations').select('id').limit(1).single()
    await sb.from('cash_drawer_entries').insert({
      org_id: (org as { id: string }).id,
      amount_cents: -amountCents,
      reason: `Staff payout — ${staffName} · ${booking.title} ${booking.code}`,
      staff_id: byStaffId,
    }) // ignore failure pre-0024
  }
  emit(BOOKINGS_EVENT)
  return true
}

export async function undoPayoutPaid(booking: StaffBooking, staffName: string, byStaffId: string | null): Promise<boolean> {
  const sb = supabase()
  const { error } = await sb.from('bookings').update({ payout_paid_at: null, payout_method: null }).eq('id', booking.id)
  if (error) return false
  // A cash payout came out of the bag — put it back.
  if (booking.payoutMethod === 'cash' && (booking.payoutCents ?? 0) > 0) {
    const { data: org } = await sb.from('organizations').select('id').limit(1).single()
    await sb.from('cash_drawer_entries').insert({
      org_id: (org as { id: string }).id,
      amount_cents: booking.payoutCents,
      reason: `Payout undone — ${staffName} · ${booking.title} ${booking.code}`,
      staff_id: byStaffId,
    })
  }
  emit(BOOKINGS_EVENT)
  return true
}

export async function rescheduleBooking(id: string, date: string, startH: number, hours: number): Promise<{ ok: boolean; conflict: boolean }> {
  const { fromIso, toIso } = localRange(date, startH, hours)
  const { error } = await supabase().from('bookings').update({ during: `[${fromIso},${toIso})` }).eq('id', id)
  if (error) {
    const conflict = error.code === '23P01'
    if (!conflict) console.error('[bookings]', error.message)
    return { ok: false, conflict }
  }
  emit(BOOKINGS_EVENT)
  notify('booking.rescheduled', id)
  return { ok: true, conflict: false }
}

export async function updateBookingFields(id: string, patch: { price_cents?: number; status?: string; title?: string; client_name?: string; deposit_cents?: number | null; contact_email?: string | null }, byStaffId?: string | null): Promise<boolean> {
  const sb = supabase()
  // A staff cancel stamps who did it and when. The stamp columns arrive
  // with 0038 — before that, retry the plain update rather than fail.
  const stamped = patch.status === 'canceled'
    ? { ...patch, canceled_at: new Date().toISOString(), canceled_by: byStaffId ?? null, canceled_via: 'staff' }
    : patch
  let { error } = await sb.from('bookings').update(stamped).eq('id', id)
  if (error && stamped !== patch && (error.code === '42703' || error.code === 'PGRST204')) {
    ;({ error } = await sb.from('bookings').update(patch).eq('id', id))
  }
  if (error) {
    console.error('[bookings]', error.message)
    return false
  }
  emit(BOOKINGS_EVENT)
  if (patch.status === 'canceled') notify('booking.canceled', id)
  // A price or detail change the customer should know about. Status-only
  // updates are covered above; a contact-email edit isn't news to them.
  else if (patch.price_cents !== undefined || patch.title !== undefined || patch.deposit_cents !== undefined) {
    notify('booking.updated', id)
  }
  return true
}

// Records a payment against a booking. amountCents defaults to the full
// remaining balance; pass a smaller figure for a partial payment/deposit.
// The booking's secure payment page — where a card actually gets charged.
export function bookingPayUrl(b: StaffBooking): string | null {
  return b.payToken ? `${window.location.origin}/pay/${b.payToken}` : null
}

export async function recordPayment(booking: StaffBooking, method: PayMethod, staffId: string | null, amountCents?: number): Promise<boolean> {
  // A card payment is charged by Stripe or it did not happen. This
  // function used to write a 'Card (Stripe)' ledger row without ever
  // calling Stripe — a payment record with no payment behind it, which is
  // exactly how two phantom charges ended up in the books. Cards go
  // through the booking's pay page; this records only money physically
  // handed over at the desk.
  if (method === 'stripe') {
    console.error('[payments] card payments go through the pay link, not recordPayment')
    return false
  }
  const sb = supabase()
  const remaining = booking.priceCents - booking.paidCents
  const amount = Math.min(amountCents ?? remaining, remaining)
  if (amount <= 0) return false
  const { data: org } = await sb.from('organizations').select('id').limit(1).single()
  const { data: paymentRow, error } = await sb.from('payments').insert({
    org_id: (org as { id: string }).id,
    booking_id: booking.id,
    method,
    status: 'paid',
    amount_cents: amount,
    memo: `${booking.title} · ${booking.code}`,
    taken_by: staffId,
  }).select('id').single()
  if (error) {
    console.error('[payments]', error.message)
    return false
  }
  // Cash goes straight into the bag (best effort — needs migration 0024).
  if (method === 'cash') {
    await sb.from('cash_drawer_entries').insert({
      org_id: (org as { id: string }).id,
      amount_cents: amount,
      reason: `Cash payment — ${booking.title} ${booking.code}`,
      staff_id: staffId,
    })
  }
  await supabase().from('bookings').update({ status: 'confirmed', note: null, hold_expires_at: null }).eq('id', booking.id)
  emit(BOOKINGS_EVENT)
  // One email that reads as a deposit receipt or a paid-in-full
  // confirmation, whichever this payment made true.
  const paymentId = (paymentRow as { id: string } | null)?.id
  if (paymentId) notify('booking.payment', paymentId)
  return true
}

// Undo for a mistakenly recorded desk payment (cash / Cash App — never a
// card, which is a real Stripe charge and comes back via Refund). The row
// is kept and flipped to 'voided', so the books show it was entered and
// struck; every total and report counts only 'paid' rows, so the amount
// drops out of the booking's balance, the reports, and this list at once.
export async function voidPayment(p: PaymentRow, staffId: string | null): Promise<{ ok: boolean; message?: string }> {
  if (p.method === 'stripe') {
    return { ok: false, message: 'Card payments are real Stripe charges — use Refund instead.' }
  }
  const sb = supabase()
  const { data, error } = await sb.from('payments')
    .update({ status: 'voided', voided_by: staffId, voided_at: new Date().toISOString() })
    .eq('id', p.id)
    .eq('status', 'paid')
    .select('id')
  // Pre-0041 databases fail two ways: an unknown enum value / column
  // errors, and a missing update policy silently matches zero rows.
  if (error || !data || data.length === 0) {
    if (error) console.error('[payments]', error.message)
    return { ok: false, message: 'Could not undo — has 0041_void_payments.sql been run in Supabase?' }
  }
  // A voided cash payment never belonged in the bag — take it back out.
  if (p.method === 'cash') {
    const { data: org } = await sb.from('organizations').select('id').limit(1).single()
    if (org) {
      await sb.from('cash_drawer_entries').insert({
        org_id: (org as { id: string }).id,
        amount_cents: -p.amountCents,
        reason: `Undo — payment ${p.code} was recorded in error`,
        staff_id: staffId,
      })
    }
  }
  // The customer already holds a receipt for this, so the correction
  // can't be silent — the server builds the email from the voided row.
  if (p.bookingId) notify('payment.voided', p.id)
  emit(BOOKINGS_EVENT)
  return { ok: true }
}

// Hard-delete a booking row (payments/ledger keep their records, unlinked).
export async function deleteBooking(id: string): Promise<boolean> {
  // Send first — once the row is gone the server has nothing left to
  // build the email from.
  await notify('booking.deleted', id)
  const { error } = await supabase().from('bookings').delete().eq('id', id)
  if (error) {
    console.error('[bookings]', error.message)
    return false
  }
  emit(BOOKINGS_EVENT)
  return true
}

// ── New-booking notifications ────────────────────────────────
// The dashboard shows a badge for bookings created since staff last
// looked at the Bookings tab. Last-seen lives per device.

const SEEN_KEY = 'sq-bookings-seen'
export const SEEN_EVENT = 'sq-bookings-seen'

export function bookingsSeenAt(): string {
  if (typeof window === 'undefined') return new Date().toISOString()
  const v = window.localStorage.getItem(SEEN_KEY)
  if (v) return v
  // First run: start the clock now so an old backlog doesn't flood the badge.
  const now = new Date().toISOString()
  window.localStorage.setItem(SEEN_KEY, now)
  return now
}

export function markBookingsSeen(): void {
  window.localStorage.setItem(SEEN_KEY, new Date().toISOString())
  window.dispatchEvent(new Event(SEEN_EVENT))
}

export interface NewBookingPeek {
  code: string
  client: string
  roomId: string
}

export async function newBookingsSince(sinceIso: string): Promise<NewBookingPeek[]> {
  const { data, error } = await supabase()
    .from('bookings')
    .select('code, client_name, facility_id, created_at')
    .gt('created_at', sinceIso)
    .order('created_at', { ascending: false })
    .limit(20)
  if (error) return []
  return (data as { code: string; client_name: string; facility_id: string }[])
    .map((r) => ({ code: r.code, client: r.client_name, roomId: r.facility_id }))
}

export interface PaymentRow {
  id: string
  code: string
  client: string
  memo: string
  method: string
  amountCents: number
  when: string
  dateIso: string // YYYY-MM-DD local
  takenBy: string
  accountId: string | null
  bookingId: string | null
}

export async function getPayments(): Promise<PaymentRow[]> {
  const { data, error } = await supabase()
    .from('payments')
    .select('id, code, method, amount_cents, memo, created_at, account_id, booking_id, staff:taken_by(name), bookings:booking_id(client_name)')
    .eq('status', 'paid')
    .order('created_at', { ascending: false })
    .limit(50)
  if (error) throw error
  interface PRow {
    id: string
    code: string
    method: string
    amount_cents: number
    memo: string | null
    created_at: string
    account_id: string | null
    booking_id: string | null
    staff: { name: string } | null
    bookings: { client_name: string } | null
  }
  return (data as unknown as PRow[]).map((r) => {
    const d = new Date(r.created_at)
    // Membership payments carry no booking — their memo leads with the
    // member's name ("Jane Doe · Individual fitness membership").
    const memoName = r.memo?.includes(' · ') ? r.memo.split(' · ')[0] : null
    return {
      id: r.id,
      code: r.code,
      client: r.bookings?.client_name ?? memoName ?? '—',
      memo: r.memo ?? '',
      method: r.method,
      amountCents: r.amount_cents,
      when: d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }),
      dateIso: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
      takenBy: r.staff?.name ?? '—',
      accountId: r.account_id,
      bookingId: r.booking_id,
    }
  })
}

// Which add-on ids are already booked during this window — so the store
// greys them out. Null when 0022_addon_conflicts.sql hasn't run yet
// (no data to consult, nothing to grey out).
export async function addonsTaken(date: string, startH: number, hours: number): Promise<string[] | null> {
  const { fromIso, toIso } = localRange(date, startH, hours)
  const { data, error } = await supabase().rpc('addons_taken', { p_from: fromIso, p_to: toIso })
  if (error) return null
  return (data as string[] | null) ?? []
}

// Privacy-safe availability for the public booking flow.
export async function facilityBusy(facilityId: string, date: string): Promise<{ fromH: number; toH: number }[]> {
  const { fromIso, toIso } = localRange(date, 0, 24)
  const { data, error } = await supabase().rpc('facility_busy', { p_facility_id: facilityId, p_from: fromIso, p_to: toIso })
  if (error) throw error
  return (data as { busy_from: string; busy_to: string }[]).map((r) => {
    const from = new Date(r.busy_from)
    const to = new Date(r.busy_to)
    return { fromH: from.getHours() + from.getMinutes() / 60, toH: to.getHours() + to.getMinutes() / 60 }
  })
}

// Everything that already happened, newest first, back as far as `months`.
// Kept out of the main Bookings tab so the desk's day-to-day list stays
// about what's ahead — history is its own page.
export async function getPastBookings(months = 12): Promise<StaffBooking[]> {
  const cutoff = new Date()
  cutoff.setMonth(cutoff.getMonth() - months)
  const now = new Date().toISOString()
  for (const cols of SELECT_SETS) {
    const { data, error } = await supabase()
      .from('bookings')
      .select(cols)
      // Range comparisons, not scalar ones: `sl` is "ends entirely before"
      // and `sr` is "starts entirely after". A booking is past once its end
      // time has gone by, not its start — something running right now still
      // belongs to today.
      .rangeLt('during', `[${now},${now}]`)
      .rangeGt('during', `[${cutoff.toISOString()},${cutoff.toISOString()}]`)
      .order('during', { ascending: false })
      .limit(2000)
    if (!error) return (data as unknown as Row[]).map(fromRow).filter((b): b is StaffBooking => b !== null)
  }
  throw new Error('bookings query failed')
}
