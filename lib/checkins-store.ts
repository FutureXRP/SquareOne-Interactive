'use client'
// Front-desk check-ins — real rows in check_ins. The Front Desk writes
// walk-ins and party arrivals; the Doors page will read the same table.

import { supabase, emit } from '@/lib/supabase'

export const CHECKINS_EVENT = 'sq-checkins'

export interface CheckIn {
  id: string
  who: string
  context: string
  method: string
  outcome: 'in' | 'denied' | 'flagged'
  when: string // "2:05 PM"
}

export async function getTodayCheckIns(): Promise<CheckIn[]> {
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  const { data, error } = await supabase()
    .from('check_ins')
    .select('id, who, context, method, outcome, at')
    .gte('at', start.toISOString())
    .order('at', { ascending: false })
    .limit(100)
  if (error) throw error
  interface Row { id: string; who: string; context: string; method: string; outcome: CheckIn['outcome']; at: string }
  return (data as Row[]).map((r) => ({
    id: r.id,
    who: r.who,
    context: r.context,
    method: r.method,
    outcome: r.outcome,
    when: new Date(r.at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
  }))
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
