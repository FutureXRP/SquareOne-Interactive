'use client'
// The live booking book — real rows in Supabase with database-enforced
// conflict prevention. The Board, Bookings page, and member portal all read
// from here. Money is integer cents.

import { supabase, emit } from '@/lib/supabase'

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
  payoutCents?: number | null // override; null = use the room's default
  payoutPaidAt?: string | null
  payoutMethod?: string | null
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
  staff: { name: string } | null
  payments: { amount_cents: number; method: string; status: string }[]
}

const SELECT = 'id, code, facility_id, account_id, title, client_name, during, status, price_cents, note, staff:created_by(name), payments(amount_cents, method, status)'
// deposit_cents arrives with migration 0009, the payout columns with 0023
// — fall back until each is run.
const SELECT_SETS = [
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
  }
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
  }
  const hasExtras = Object.keys(extras).length > 0
  const payload = (hasExtras ? { ...base, ...extras } : base) as typeof base
  let res = await sb.from('bookings').insert(payload).select('code').single()
  // addon_ids / run_by_staff_id arrive with 0022/0023 — retry plain before then.
  if (res.error && hasExtras && (res.error.code === '42703' || res.error.code === 'PGRST204')) {
    res = await sb.from('bookings').insert(base).select('code').single()
  }
  if (res.error) {
    const conflict = res.error.code === '23P01' // exclusion constraint or addon trigger
    if (!conflict) console.error('[bookings]', res.error.message)
    return { ok: false, conflict, addonConflict: conflict && res.error.message.includes('addon_conflict') }
  }
  emit(BOOKINGS_EVENT)
  return { ok: true, code: (res.data as { code: string }).code }
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
  return { ok: true, conflict: false }
}

export async function updateBookingFields(id: string, patch: { price_cents?: number; status?: string; title?: string; client_name?: string; deposit_cents?: number | null }): Promise<boolean> {
  const { error } = await supabase().from('bookings').update(patch).eq('id', id)
  if (error) {
    console.error('[bookings]', error.message)
    return false
  }
  emit(BOOKINGS_EVENT)
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
  const { error } = await sb.from('payments').insert({
    org_id: (org as { id: string }).id,
    booking_id: booking.id,
    method,
    status: 'paid',
    amount_cents: amount,
    memo: `${booking.title} · ${booking.code}`,
    taken_by: staffId,
  })
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
  return true
}

// Hard-delete a booking row (payments/ledger keep their records, unlinked).
export async function deleteBooking(id: string): Promise<boolean> {
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
  code: string
  client: string
  memo: string
  method: string
  amountCents: number
  when: string
  dateIso: string // YYYY-MM-DD local
  takenBy: string
}

export async function getPayments(): Promise<PaymentRow[]> {
  const { data, error } = await supabase()
    .from('payments')
    .select('code, method, amount_cents, memo, created_at, staff:taken_by(name), bookings:booking_id(client_name)')
    .eq('status', 'paid')
    .order('created_at', { ascending: false })
    .limit(50)
  if (error) throw error
  interface PRow {
    code: string
    method: string
    amount_cents: number
    memo: string | null
    created_at: string
    staff: { name: string } | null
    bookings: { client_name: string } | null
  }
  return (data as unknown as PRow[]).map((r) => {
    const d = new Date(r.created_at)
    // Membership payments carry no booking — their memo leads with the
    // member's name ("Jane Doe · Individual fitness membership").
    const memoName = r.memo?.includes(' · ') ? r.memo.split(' · ')[0] : null
    return {
      code: r.code,
      client: r.bookings?.client_name ?? memoName ?? '—',
      memo: r.memo ?? '',
      method: r.method,
      amountCents: r.amount_cents,
      when: d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }),
      dateIso: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
      takenBy: r.staff?.name ?? '—',
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
