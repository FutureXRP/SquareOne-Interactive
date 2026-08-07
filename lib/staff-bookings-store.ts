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
  staff: { name: string } | null
  payments: { amount_cents: number; method: string; status: string }[]
}

const SELECT = 'id, code, facility_id, account_id, title, client_name, during, status, price_cents, note, staff:created_by(name), payments(amount_cents, method, status)'

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
  }
}

export async function getStaffBookings(): Promise<StaffBooking[]> {
  const { data, error } = await supabase().from('bookings').select(SELECT).order('during')
  if (error) throw error
  return (data as unknown as Row[]).map(fromRow).filter((b): b is StaffBooking => b !== null)
}

export async function bookingsForDate(date: string): Promise<StaffBooking[]> {
  const { fromIso, toIso } = localRange(date, 0, 24)
  const { data, error } = await supabase()
    .from('bookings')
    .select(SELECT)
    .overlaps('during', `[${fromIso},${toIso})`)
    .in('status', ['hold', 'confirmed'])
  if (error) throw error
  return (data as unknown as Row[]).map(fromRow).filter((b): b is StaffBooking => b !== null)
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
}

// Returns the new booking's code, or a conflict/error marker.
export async function addStaffBooking(b: NewBooking): Promise<{ ok: true; code: string } | { ok: false; conflict: boolean }> {
  const sb = supabase()
  const { data: org } = await sb.from('organizations').select('id').limit(1).single()
  const { fromIso, toIso } = localRange(b.date, b.startH, b.hours)
  const { data, error } = await sb.from('bookings').insert({
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
  }).select('code').single()
  if (error) {
    const conflict = error.code === '23P01' // exclusion constraint: slot taken
    if (!conflict) console.error('[bookings]', error.message)
    return { ok: false, conflict }
  }
  emit(BOOKINGS_EVENT)
  return { ok: true, code: (data as { code: string }).code }
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

export async function updateBookingFields(id: string, patch: { price_cents?: number; status?: string; title?: string; client_name?: string }): Promise<boolean> {
  const { error } = await supabase().from('bookings').update(patch).eq('id', id)
  if (error) {
    console.error('[bookings]', error.message)
    return false
  }
  emit(BOOKINGS_EVENT)
  return true
}

export async function recordPayment(booking: StaffBooking, method: PayMethod, staffId: string | null): Promise<boolean> {
  const sb = supabase()
  const amount = booking.priceCents - booking.paidCents
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
  await supabase().from('bookings').update({ status: 'confirmed', note: null, hold_expires_at: null }).eq('id', booking.id)
  emit(BOOKINGS_EVENT)
  return true
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
    return {
      code: r.code,
      client: r.bookings?.client_name ?? '—',
      memo: r.memo ?? '',
      method: r.method,
      amountCents: r.amount_cents,
      when: d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }),
      dateIso: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
      takenBy: r.staff?.name ?? '—',
    }
  })
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
