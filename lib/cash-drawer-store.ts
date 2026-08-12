'use client'
// The cash bag — a running ledger of physical cash on hand. Cash
// payments flow in automatically (recordPayment), cash payouts flow out
// (markPayoutPaid), and staff record deposits to the bank, petty cash,
// and count corrections here. Needs migration 0024.

import { supabase, emit } from '@/lib/supabase'

export const DRAWER_EVENT = 'sq-cash-drawer'

export interface DrawerEntry {
  id: string
  amountCents: number // positive = into the bag, negative = out
  reason: string
  staffName: string | null
  when: string
}

export interface DrawerState {
  balanceCents: number
  entries: DrawerEntry[] // newest first, capped
}

// Null until 0024_cash_drawer.sql runs.
export async function getDrawer(): Promise<DrawerState | null> {
  const { data, error } = await supabase()
    .from('cash_drawer_entries')
    .select('id, amount_cents, reason, created_at, staff(name)')
    .order('created_at', { ascending: false })
    .limit(1000)
  if (error) return null
  const rows = data as unknown as { id: string; amount_cents: number; reason: string; created_at: string; staff: { name: string } | null }[]
  return {
    balanceCents: rows.reduce((n, r) => n + r.amount_cents, 0),
    entries: rows.slice(0, 40).map((r) => ({
      id: r.id,
      amountCents: r.amount_cents,
      reason: r.reason,
      staffName: r.staff?.name ?? null,
      when: new Date(r.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }),
    })),
  }
}

// One month of bag activity for the bookkeeper's report. Opening balance
// is everything before the month started. Null until 0024 runs.
export interface DrawerMonth {
  openingCents: number
  inCents: number
  outCents: number
  closingCents: number
  entries: DrawerEntry[] // oldest first
}

export async function getDrawerMonth(year: number, month: number): Promise<DrawerMonth | null> {
  const start = new Date(year, month - 1, 1)
  const end = new Date(year, month, 1)
  const sb = supabase()
  const before = await sb.from('cash_drawer_entries')
    .select('amount_cents')
    .lt('created_at', start.toISOString())
    .limit(10000)
  if (before.error) return null
  const openingCents = (before.data as { amount_cents: number }[]).reduce((n, r) => n + r.amount_cents, 0)
  const { data, error } = await sb.from('cash_drawer_entries')
    .select('id, amount_cents, reason, created_at, staff(name)')
    .gte('created_at', start.toISOString())
    .lt('created_at', end.toISOString())
    .order('created_at', { ascending: true })
    .limit(5000)
  if (error) return null
  const rows = data as unknown as { id: string; amount_cents: number; reason: string; created_at: string; staff: { name: string } | null }[]
  const entries = rows.map((r) => ({
    id: r.id,
    amountCents: r.amount_cents,
    reason: r.reason,
    staffName: r.staff?.name ?? null,
    when: new Date(r.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }),
  }))
  const inCents = entries.reduce((n, e) => n + Math.max(e.amountCents, 0), 0)
  const outCents = entries.reduce((n, e) => n + Math.min(e.amountCents, 0), 0)
  return { openingCents, inCents, outCents: -outCents, closingCents: openingCents + inCents + outCents, entries }
}

// First entry when moving off the paper records: seed the bag with what's
// physically in it today.
export async function setStartingBalance(amountCents: number, staffId: string | null): Promise<boolean> {
  return addDrawerEntry(amountCents, 'Starting balance — carried over from paper records', staffId)
}

export async function addDrawerEntry(amountCents: number, reason: string, staffId: string | null): Promise<boolean> {
  if (amountCents === 0 || !reason.trim()) return false
  const sb = supabase()
  const { data: org, error: orgErr } = await sb.from('organizations').select('id').limit(1).single()
  if (orgErr) return false
  const { error } = await sb.from('cash_drawer_entries').insert({
    org_id: (org as { id: string }).id,
    amount_cents: amountCents,
    reason: reason.trim(),
    staff_id: staffId,
  })
  if (error) {
    console.error('[cash drawer]', error.message)
    return false
  }
  emit(DRAWER_EVENT)
  return true
}
