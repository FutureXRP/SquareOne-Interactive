'use client'
// Programs — live from Supabase. Enrollment counts come from registrations.

import { supabase, tryWrite, emit } from '@/lib/supabase'

export const PROGRAMS_EVENT = 'sq-programs'

export interface EditableProgram {
  id: string
  name: string
  schedule: string
  coach: string
  capacity: number
  enrolled: number
  waitlist: number
  waiversMissing: number
  feeCents: number
  fee: string
  active: boolean
}

interface Row {
  id: string
  name: string
  schedule_label: string
  coach: string
  capacity: number
  fee_cents: number
  fee_period: string
  active: boolean
  registrations: { waitlisted: boolean; waiver_signed: boolean }[]
}

export async function getPrograms(): Promise<EditableProgram[]> {
  const { data, error } = await supabase()
    .from('programs')
    .select('id, name, schedule_label, coach, capacity, fee_cents, fee_period, active, sort, registrations(waitlisted, waiver_signed)')
    .order('sort')
  if (error) throw error
  return (data as Row[]).map((r) => {
    const roster = r.registrations.filter((x) => !x.waitlisted)
    return {
      id: r.id,
      name: r.name,
      schedule: r.schedule_label,
      coach: r.coach,
      capacity: r.capacity,
      enrolled: roster.length,
      waitlist: r.registrations.length - roster.length,
      waiversMissing: roster.filter((x) => !x.waiver_signed).length,
      feeCents: r.fee_cents,
      fee: r.fee_period,
      active: r.active,
    }
  })
}

export async function saveProgram(p: EditableProgram): Promise<boolean> {
  const ok = await tryWrite(() => supabase().from('programs').update({
    name: p.name,
    schedule_label: p.schedule,
    coach: p.coach,
    capacity: p.capacity,
    fee_cents: p.feeCents,
    fee_period: p.fee,
    active: p.active,
  }).eq('id', p.id))
  if (ok) emit(PROGRAMS_EVENT)
  return ok
}

export async function addProgram(id: string, name: string): Promise<boolean> {
  const { data: org } = await supabase().from('organizations').select('id').limit(1).single()
  const ok = await tryWrite(() => supabase().from('programs').insert({
    id,
    org_id: (org as { id: string }).id,
    name,
    schedule_label: 'Day & time',
    coach: 'Staff',
    capacity: 12,
    fee_cents: 5000,
    fee_period: 'per month',
    active: false,
    sort: 99,
  }))
  if (ok) emit(PROGRAMS_EVENT)
  return ok
}

// Deleting a program also deletes its registrations (cascade) — confirm first.
export async function deleteProgram(id: string): Promise<boolean> {
  const ok = await tryWrite(() => supabase().from('programs').delete().eq('id', id))
  if (ok) emit(PROGRAMS_EVENT)
  return ok
}
