'use client'
// The live booking book — real rows in Supabase with database-enforced
// conflict prevention. The Board, Bookings page, and member portal all read
// from here. Money is integer cents.

import { supabase, emit } from '@/lib/supabase'
import { notify } from '@/lib/notify-client'

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
  staff: { name: string } | null
  payments: { amount_cents: number; method: string; status: string }[]
}

const SELECT = 'id, code, facility_id, account_id, title, client_name, during, status, price_cents, note, staff:created_by(name), payments(amount_cents, method, status)'
// deposit_cents arrives with migration 0009, the payout columns with 0023,
// package_id with 0026 — fall back until each is run.
const SELECT_SETS = [
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
  }
}

// A booking nobody has signed off on yet. Undefined approvedAt means the
// review migration hasn't run, so nothing is "in review".
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

export async function setBookingRunBy(id: string, staffId: string | null): Promise<boolean> {
  const { error } = await supabase().from('bookings').update({ run_by_staff_id: staffId }).eq('id', id)
  if (error) {
    console.error('[bookings]', error.message)
    return false
  }
  emit(BOOKINGS_EVENT)
  return true
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

export async function updateBookingFields(id: string, patch: { price_cents?: number; status?: string; title?: string; client_name?: string; deposit_cents?: number | null; contact_email?: string | null }): Promise<boolean> {
  const { error } = await supabase().from('bookings').update(patch).eq('id', id)
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
export async function recordPayment(booking: StaffBooking, method: PayMethod, staffId: string | null, amountCents?: number): Promise<boolean> {
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
