'use client'
// Staff time clock — clock in/out shifts. Pay is per event, not per
// hour; this is the attendance record. Needs migration 0025.

import { supabase, emit } from '@/lib/supabase'

export const SHIFTS_EVENT = 'sq-shifts'

export interface Shift {
  id: string
  staffId: string
  staffName: string
  inIso: string
  outIso: string | null
  dateLabel: string // "Aug 12"
  inLabel: string // "9:05 AM"
  outLabel: string | null
  minutes: number | null // null while still clocked in
  note: string
}

function fromRow(r: { id: string; staff_id: string; clock_in: string; clock_out: string | null; note: string; staff: { name: string } | null }): Shift {
  const inD = new Date(r.clock_in)
  const outD = r.clock_out ? new Date(r.clock_out) : null
  return {
    id: r.id,
    staffId: r.staff_id,
    staffName: r.staff?.name ?? '—',
    inIso: r.clock_in,
    outIso: r.clock_out,
    dateLabel: inD.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    inLabel: inD.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
    outLabel: outD ? outD.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : null,
    minutes: outD ? Math.max(1, Math.round((outD.getTime() - inD.getTime()) / 60_000)) : null,
    note: r.note,
  }
}

// Shifts starting in the last N days, newest first. Null until 0025 runs.
export async function getShifts(rangeDays: number): Promise<Shift[] | null> {
  const since = new Date(Date.now() - rangeDays * 24 * 3600_000).toISOString()
  const { data, error } = await supabase()
    .from('staff_shifts')
    .select('id, staff_id, clock_in, clock_out, note, staff(name)')
    .gte('clock_in', since)
    .order('clock_in', { ascending: false })
    .limit(1000)
  if (error) return null
  return (data as unknown as Parameters<typeof fromRow>[0][]).map(fromRow)
}

export async function clockIn(staffId: string): Promise<boolean> {
  const sb = supabase()
  const { data: org, error: orgErr } = await sb.from('organizations').select('id').limit(1).single()
  if (orgErr) return false
  const { error } = await sb.from('staff_shifts').insert({
    org_id: (org as { id: string }).id,
    staff_id: staffId,
  })
  if (error) {
    console.error('[time clock]', error.message)
    return false
  }
  emit(SHIFTS_EVENT)
  return true
}

export async function clockOut(shiftId: string): Promise<boolean> {
  const { error } = await supabase().from('staff_shifts').update({ clock_out: new Date().toISOString() }).eq('id', shiftId)
  if (error) return false
  emit(SHIFTS_EVENT)
  return true
}

export async function deleteShift(shiftId: string): Promise<boolean> {
  const { error } = await supabase().from('staff_shifts').delete().eq('id', shiftId)
  if (error) return false
  emit(SHIFTS_EVENT)
  return true
}

// Admin fix-up: add a completed shift by hand ("forgot to clock in").
export async function addManualShift(staffId: string, inIso: string, outIso: string, note: string): Promise<boolean> {
  const sb = supabase()
  const { data: org, error: orgErr } = await sb.from('organizations').select('id').limit(1).single()
  if (orgErr) return false
  const { error } = await sb.from('staff_shifts').insert({
    org_id: (org as { id: string }).id,
    staff_id: staffId,
    clock_in: inIso,
    clock_out: outIso,
    note,
  })
  if (error) {
    console.error('[time clock]', error.message)
    return false
  }
  emit(SHIFTS_EVENT)
  return true
}
