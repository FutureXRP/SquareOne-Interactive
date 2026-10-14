'use client'
// Scheduled shifts — the hours a person is expected in the building,
// posted by a manager. One row per person per day. Needs 0051; every
// reader degrades to null before it so the UI can say so.

import { supabase, tryWrite, emit } from '@/lib/supabase'

export const SHIFTS_EVENT = 'sq-scheduled-shifts'

export interface ScheduledShift {
  id: string
  staffId: string
  staffName: string
  date: string // YYYY-MM-DD
  startMin: number
  endMin: number
  note: string
}

export function minLabel(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  const period = h >= 12 ? 'PM' : 'AM'
  const display = h % 12 === 0 ? 12 : h % 12
  return m === 0 ? `${display} ${period}` : `${display}:${String(m).padStart(2, '0')} ${period}`
}

// "08:30" (time input) → minutes after midnight
export function timeToMin(v: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(v.trim())
  if (!m) return null
  const n = Number(m[1]) * 60 + Number(m[2])
  return n >= 0 && n <= 1439 ? n : null
}

interface Row {
  id: string; staff_id: string; day: string; start_min: number; end_min: number; note: string
  staff: { name: string } | null
}

// All shifts in a date window, every person — null before 0051.
export async function getShifts(fromDate: string, toDate: string): Promise<ScheduledShift[] | null> {
  const { data, error } = await supabase()
    .from('scheduled_shifts')
    .select('id, staff_id, day, start_min, end_min, note, staff:staff_id(name)')
    .gte('day', fromDate)
    .lte('day', toDate)
    .order('day', { ascending: true })
    .order('start_min', { ascending: true })
    .limit(2000)
  if (error) return null
  return (data as unknown as Row[]).map((r) => ({
    id: r.id,
    staffId: r.staff_id,
    staffName: r.staff?.name ?? '—',
    date: r.day,
    startMin: r.start_min,
    endMin: r.end_min,
    note: r.note,
  }))
}

export async function addShift(s: { staffId: string; date: string; startMin: number; endMin: number; note?: string; createdBy?: string | null }): Promise<boolean> {
  const { data: org } = await supabase().from('organizations').select('id').limit(1).single()
  const ok = await tryWrite(() => supabase().from('scheduled_shifts').insert({
    org_id: (org as { id: string }).id,
    staff_id: s.staffId,
    day: s.date,
    start_min: s.startMin,
    end_min: s.endMin,
    note: s.note?.trim() || '',
    created_by: s.createdBy ?? null,
  }))
  if (ok) emit(SHIFTS_EVENT)
  return ok
}

export async function deleteShift(id: string): Promise<boolean> {
  const ok = await tryWrite(() => supabase().from('scheduled_shifts').delete().eq('id', id))
  if (ok) emit(SHIFTS_EVENT)
  return ok
}
