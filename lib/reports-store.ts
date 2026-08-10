'use client'
// Live report data — reads straight from payments, bookings, check-ins, and
// memberships. No snapshots, no canned numbers: what the desk collects is
// what the charts show.

import { supabase } from '@/lib/supabase'

export interface DayRevenue {
  iso: string
  label: string
  cents: number
}

export interface ReportData {
  rangeDays: number
  totalRevenueCents: number
  perBucket: DayRevenue[]
  bucketLabel: 'day' | 'week'
  byRoom: { roomId: string; cents: number }[]
  byMethod: { method: string; cents: number }[]
  bookings: number
  holds: number
  checkIns: number
  newMembers: number
  activeMembers: number
}

const EMPTY: Omit<ReportData, 'rangeDays'> = {
  totalRevenueCents: 0, perBucket: [], bucketLabel: 'day', byRoom: [], byMethod: [],
  bookings: 0, holds: 0, checkIns: 0, newMembers: 0, activeMembers: 0,
}

function localIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export async function getReport(rangeDays: number): Promise<ReportData> {
  const sb = supabase()
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  start.setDate(start.getDate() - (rangeDays - 1))
  const startIso = start.toISOString()

  const [paymentsRes, bookingsRes, checkinsRes, newMembersRes, activeRes] = await Promise.all([
    sb.from('payments')
      .select('amount_cents, method, created_at, bookings:booking_id(facility_id)')
      .eq('status', 'paid')
      .gte('created_at', startIso)
      .limit(2000),
    sb.from('bookings')
      .select('status', { count: 'exact' })
      .gte('created_at', startIso)
      .in('status', ['hold', 'confirmed', 'completed']),
    sb.from('check_ins').select('id', { count: 'exact', head: true }).gte('at', startIso),
    sb.from('member_subscriptions').select('id', { count: 'exact', head: true }).gte('created_at', startIso),
    sb.from('member_subscriptions').select('id', { count: 'exact', head: true }).in('status', ['active', 'canceling']),
  ])

  interface PayRow { amount_cents: number; method: string; created_at: string; bookings: { facility_id: string } | null }
  const payments = (paymentsRes.data ?? []) as unknown as PayRow[]

  // Buckets: daily up to a month, weekly beyond (Sunday-start weeks).
  const weekly = rangeDays > 31
  const buckets = new Map<string, number>()
  const order: { iso: string; label: string }[] = []
  const cursor = new Date(start)
  if (weekly) cursor.setDate(cursor.getDate() - cursor.getDay())
  const today = new Date()
  while (cursor <= today) {
    const iso = localIso(cursor)
    buckets.set(iso, 0)
    order.push({
      iso,
      label: weekly
        ? cursor.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        : rangeDays <= 7
          ? cursor.toLocaleDateString('en-US', { weekday: 'short' })
          : cursor.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' }),
    })
    cursor.setDate(cursor.getDate() + (weekly ? 7 : 1))
  }

  const byRoom = new Map<string, number>()
  const byMethod = new Map<string, number>()
  let total = 0
  for (const p of payments) {
    if (p.amount_cents <= 0) continue
    total += p.amount_cents
    const d = new Date(p.created_at)
    if (weekly) d.setDate(d.getDate() - d.getDay())
    const key = localIso(d)
    if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + p.amount_cents)
    byMethod.set(p.method, (byMethod.get(p.method) ?? 0) + p.amount_cents)
    const room = p.bookings?.facility_id ?? 'other'
    byRoom.set(room, (byRoom.get(room) ?? 0) + p.amount_cents)
  }

  const bookingRows = (bookingsRes.data ?? []) as { status: string }[]

  return {
    rangeDays,
    ...EMPTY,
    totalRevenueCents: total,
    perBucket: order.map((o) => ({ iso: o.iso, label: o.label, cents: buckets.get(o.iso) ?? 0 })),
    bucketLabel: weekly ? 'week' : 'day',
    byRoom: [...byRoom.entries()].map(([roomId, cents]) => ({ roomId, cents })).sort((a, b) => b.cents - a.cents),
    byMethod: [...byMethod.entries()].map(([method, cents]) => ({ method, cents })).sort((a, b) => b.cents - a.cents),
    bookings: bookingsRes.count ?? bookingRows.length,
    holds: bookingRows.filter((b) => b.status === 'hold').length,
    checkIns: checkinsRes.count ?? 0,
    newMembers: newMembersRes.count ?? 0,
    activeMembers: activeRes.count ?? 0,
  }
}
