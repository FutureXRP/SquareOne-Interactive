'use client'
// The operational booking book — what the Board and the admin Bookings page
// read, and where staff create bookings for people and record payments.
// Seeded from the demo day on first load; demo persistence (localStorage)
// until the real booking engine lands. Money is integer cents.

import { bookings as demoDay } from '@/lib/demo-data'

export type PayMethod = 'stripe' | 'cash' | 'cashapp'

export const PAY_LABEL: Record<PayMethod, string> = {
  stripe: 'Card (Stripe)',
  cash: 'Cash',
  cashapp: 'Cash App',
}

export interface StaffBooking {
  id: string
  roomId: string
  title: string
  client: string
  date: string // YYYY-MM-DD
  startH: number // decimal hour
  hours: number
  priceCents: number
  status: 'hold' | 'confirmed' | 'canceled'
  paidCents: number
  payMethod: PayMethod | null
  takenBy: string
  note?: string
  seeded?: boolean // demo-day rows; excluded from the recorded-payments feed
}

const KEY = 'sq-staff-bookings-v1'

export function isoDate(offset = 0): string {
  const d = new Date()
  d.setDate(d.getDate() + offset)
  return d.toISOString().slice(0, 10)
}

function seed(): StaffBooking[] {
  const today = isoDate(0)
  return demoDay.map((b) => ({
    id: b.id,
    roomId: b.zoneId,
    title: b.title,
    client: b.who,
    date: today,
    startH: b.start,
    hours: b.end - b.start,
    priceCents: b.priceCents,
    status: b.status === 'hold' ? 'hold' : 'confirmed',
    paidCents: b.status === 'hold' ? 0 : b.priceCents,
    payMethod: b.status === 'hold' || b.priceCents === 0 ? null : 'stripe',
    takenBy: 'M. Santos',
    note: b.status === 'hold' ? `hold expires ${b.holdExpires} · missing ${b.missing}` : undefined,
    seeded: true,
  }))
}

export function getStaffBookings(): StaffBooking[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(KEY)
    if (!raw) {
      const s = seed()
      window.localStorage.setItem(KEY, JSON.stringify(s))
      return s
    }
    const parsed = JSON.parse(raw) as StaffBooking[]
    return Array.isArray(parsed) ? parsed : seed()
  } catch {
    return seed()
  }
}

function persist(all: StaffBooking[]) {
  window.localStorage.setItem(KEY, JSON.stringify(all))
  window.dispatchEvent(new Event('sq-staff-bookings'))
}

export function bookingsForDate(date: string): StaffBooking[] {
  return getStaffBookings().filter((b) => b.date === date && b.status !== 'canceled')
}

export function addStaffBooking(b: Omit<StaffBooking, 'id'>): StaffBooking {
  const all = getStaffBookings()
  const maxNum = all.reduce((n, x) => {
    const m = /^BK-(\d+)$/.exec(x.id)
    return m ? Math.max(n, Number(m[1])) : n
  }, 3200)
  const booking: StaffBooking = { ...b, id: `BK-${maxNum + 1}` }
  persist([booking, ...all])
  return booking
}

export function updateStaffBooking(id: string, patch: Partial<StaffBooking>) {
  persist(getStaffBookings().map((b) => (b.id === id ? { ...b, ...patch } : b)))
}

export function recordPayment(id: string, method: PayMethod, takenBy: string) {
  persist(getStaffBookings().map((b) => (
    b.id === id
      ? { ...b, status: b.status === 'hold' ? 'confirmed' : b.status, paidCents: b.priceCents, payMethod: method, takenBy, note: undefined, seeded: false }
      : b
  )))
}

// Payments staff actually recorded through the UI (seeded demo rows excluded).
export function recordedPayments(): StaffBooking[] {
  return getStaffBookings().filter((b) => !b.seeded && b.paidCents > 0 && b.payMethod != null)
}

export function resetStaffBookings() {
  window.localStorage.removeItem(KEY)
  window.dispatchEvent(new Event('sq-staff-bookings'))
}
