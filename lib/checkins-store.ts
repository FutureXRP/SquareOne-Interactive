'use client'
// Front-desk check-ins — real rows in check_ins. The Front Desk writes
// walk-ins and party arrivals; the Doors page will read the same table.

import { supabase, emit } from '@/lib/supabase'

export const CHECKINS_EVENT = 'sq-checkins'

export interface CheckIn {
  id: string
  who: string
  context: string
  entryPoint: string
  method: string
  outcome: 'in' | 'denied' | 'flagged'
  when: string // "2:05 PM"
  dateIso: string // YYYY-MM-DD local
  hour: number // local hour 0-23
  // Visit tracking (migration 0019): null until it runs / not applicable.
  accountId?: string | null
  durationMin?: number | null // checked-out visits only
  open?: boolean // checked in, not yet out
}

interface Row {
  id: string; who: string; context: string; entry_point: string; method: string
  outcome: CheckIn['outcome']; at: string
  account_id?: string | null; checked_out_at?: string | null
}

function fromRow(r: Row): CheckIn {
  const d = new Date(r.at)
  const hasVisitCols = 'checked_out_at' in r
  const out = r.checked_out_at ? new Date(r.checked_out_at) : null
  return {
    id: r.id,
    who: r.who,
    context: r.context,
    entryPoint: r.entry_point,
    method: r.method,
    outcome: r.outcome,
    when: d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
    dateIso: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
    hour: d.getHours(),
    accountId: hasVisitCols ? (r.account_id ?? null) : undefined,
    durationMin: out ? Math.max(1, Math.round((out.getTime() - d.getTime()) / 60_000)) : null,
    open: hasVisitCols ? !out && !!r.account_id : undefined,
  }
}

const BASE_COLS = 'id, who, context, entry_point, method, outcome, at'
// account_id / checked_out_at arrive with migration 0019 — retry without.
const COL_SETS = [`account_id, checked_out_at, ${BASE_COLS}`, BASE_COLS]

// Check-ins since local midnight (rangeDays - 1) days ago, newest first.
export async function getCheckIns(rangeDays = 1): Promise<CheckIn[]> {
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  start.setDate(start.getDate() - (rangeDays - 1))
  for (const cols of COL_SETS) {
    const { data, error } = await supabase()
      .from('check_ins')
      .select(cols)
      .gte('at', start.toISOString())
      .order('at', { ascending: false })
      .limit(2000)
    if (!error) return (data as unknown as Row[]).map(fromRow)
  }
  throw new Error('check_ins query failed')
}

export async function getTodayCheckIns(): Promise<CheckIn[]> {
  return getCheckIns(1)
}

// ── Member self check-in / check-out (migration 0019) ────────

export interface MyVisit {
  id: string
  atIso: string
  when: string
}

export interface MyVisitStats {
  visits30: number
  totalMin30: number
  lastVisit: string | null
}

// The member's currently-open visit (checked in within the last 16 hours,
// not yet checked out). Null when the visit columns aren't migrated.
export async function getMyOpenVisit(accountId: string): Promise<MyVisit | null> {
  const since = new Date(Date.now() - 16 * 3600_000).toISOString()
  const { data, error } = await supabase()
    .from('check_ins')
    .select('id, at, checked_out_at')
    .eq('account_id', accountId)
    .is('checked_out_at', null)
    .gte('at', since)
    .order('at', { ascending: false })
    .limit(1)
  if (error || !data || data.length === 0) return null
  const r = data[0] as { id: string; at: string }
  return {
    id: r.id,
    atIso: r.at,
    when: new Date(r.at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
  }
}

export async function memberCheckIn(accountId: string, name: string): Promise<boolean> {
  const { data: org, error: orgErr } = await supabase().from('organizations').select('id').limit(1).single()
  if (orgErr) return false
  const { error } = await supabase().from('check_ins').insert({
    org_id: (org as { id: string }).id,
    account_id: accountId,
    who: name,
    context: 'Fitness membership · self check-in',
    entry_point: 'Member app',
    method: 'self',
    outcome: 'in',
  })
  if (error) {
    console.error('[check-ins]', error.message)
    return false
  }
  emit(CHECKINS_EVENT)
  return true
}

export async function memberCheckOut(visitId: string): Promise<boolean> {
  const { error } = await supabase().from('check_ins').update({ checked_out_at: new Date().toISOString() }).eq('id', visitId)
  if (error) {
    console.error('[check-ins]', error.message)
    return false
  }
  emit(CHECKINS_EVENT)
  return true
}

// The member's own activity: visits and time in the building, last 30 days.
export async function getMyVisitStats(accountId: string): Promise<MyVisitStats | null> {
  const since = new Date(Date.now() - 30 * 24 * 3600_000).toISOString()
  const { data, error } = await supabase()
    .from('check_ins')
    .select('at, checked_out_at')
    .eq('account_id', accountId)
    .gte('at', since)
    .order('at', { ascending: false })
    .limit(200)
  if (error) return null
  const rows = data as { at: string; checked_out_at: string | null }[]
  const totalMin = rows.reduce((n, r) => {
    if (!r.checked_out_at) return n
    return n + Math.max(1, Math.round((new Date(r.checked_out_at).getTime() - new Date(r.at).getTime()) / 60_000))
  }, 0)
  return {
    visits30: rows.length,
    totalMin30: totalMin,
    lastVisit: rows.length > 0 ? new Date(rows[0].at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : null,
  }
}

export async function recordCheckIn(who: string, context: string): Promise<boolean> {
  const { data: org, error: orgErr } = await supabase().from('organizations').select('id').limit(1).single()
  if (orgErr) return false
  const { error } = await supabase().from('check_ins').insert({
    org_id: (org as { id: string }).id,
    who,
    context,
    entry_point: 'Front desk',
    method: 'front desk',
    outcome: 'in',
  })
  if (error) {
    console.error('[check-ins]', error.message)
    return false
  }
  emit(CHECKINS_EVENT)
  return true
}
