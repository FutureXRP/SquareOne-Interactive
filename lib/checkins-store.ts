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
}

interface Row { id: string; who: string; context: string; entry_point: string; method: string; outcome: CheckIn['outcome']; at: string }

function fromRow(r: Row): CheckIn {
  const d = new Date(r.at)
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
  }
}

// Check-ins since local midnight (rangeDays - 1) days ago, newest first.
export async function getCheckIns(rangeDays = 1): Promise<CheckIn[]> {
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  start.setDate(start.getDate() - (rangeDays - 1))
  const { data, error } = await supabase()
    .from('check_ins')
    .select('id, who, context, entry_point, method, outcome, at')
    .gte('at', start.toISOString())
    .order('at', { ascending: false })
    .limit(500)
  if (error) throw error
  return (data as Row[]).map(fromRow)
}

export async function getTodayCheckIns(): Promise<CheckIn[]> {
  return getCheckIns(1)
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
