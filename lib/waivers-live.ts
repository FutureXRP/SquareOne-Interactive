'use client'
// Waivers, start to finish, from the Forms & Waivers tab and nowhere else.
// The name, the paragraphs people actually agree to, the questions, where
// it's required, and how often — every word of it is what staff wrote on
// that page. There is deliberately no built-in waiver text in the codebase
// to fall back on: if no form is assigned to a flow, that flow collects no
// waiver rather than quietly presenting language nobody approved.

import { supabase, isSupabaseConfigured } from '@/lib/supabase'

import {
  FORM_COL_SETS, toWaiver, hasSubstance,
  type FormRow, type RequiredWaiver, type WaiverFrequency,
} from '@/lib/waiver-forms'

export { FREQUENCY_NOTE, toWaiver, hasSubstance } from '@/lib/waiver-forms'
export type { WaiverFrequency, WaiverChoice, RequiredWaiver } from '@/lib/waiver-forms'

// 'fitness' = fitness signup, any plan; { planId } filters plan-targeted
// waivers; { roomId } is a rental booking for that room.
export type WaiverTarget = 'fitness' | { planId: string } | { roomId: string }

const isFitness = (t: WaiverTarget) => t === 'fitness' || 'planId' in t

async function activeForms(assignTo?: 'fitness' | 'rentals'): Promise<FormRow[] | null> {
  for (const cols of FORM_COL_SETS) {
    let q = supabase().from('forms').select(cols).eq('status', 'active')
    // assign_to only exists from 0004 on; the bare select can't filter on it.
    if (assignTo && cols.includes('assign_to')) q = q.eq('assign_to', assignTo)
    const { data, error } = await q.order('id')
    if (!error) return data as unknown as FormRow[]
  }
  return null
}

// Every active waiver assigned to this flow, in stable order.
export async function getRequiredWaivers(target: WaiverTarget): Promise<RequiredWaiver[]> {
  if (!isSupabaseConfigured()) return []
  const fitness = isFitness(target)
  let rows = await activeForms(fitness ? 'fitness' : 'rentals')
  if (!rows) return []
  // Rooms and plans can each narrow a waiver to specific ones; an empty
  // list means "everywhere in this flow".
  if (typeof target === 'object' && 'roomId' in target) {
    rows = rows.filter((r) => !r.assign_room_ids || r.assign_room_ids.length === 0 || r.assign_room_ids.includes(target.roomId))
  }
  if (typeof target === 'object' && 'planId' in target) {
    rows = rows.filter((r) => !r.assign_plan_ids || r.assign_plan_ids.length === 0 || r.assign_plan_ids.includes(target.planId))
  }
  return rows.map((r) => toWaiver(r, fitness ? 'Required with a gym membership' : 'Required with this rental'))
}

// Every active waiver on the books, whatever flow it belongs to — what the
// member's account page lists so they can see where they stand on each.
export async function getAllWaivers(): Promise<RequiredWaiver[]> {
  if (!isSupabaseConfigured()) return []
  const rows = await activeForms()
  if (!rows) return []
  return rows.map((r) => toWaiver(
    r,
    r.assign_to === 'fitness' ? 'Required with a gym membership'
      : r.assign_to === 'rentals' ? 'Required with a rental'
      : undefined,
  ))
}

// Does this signer still owe a signature, given the form's frequency?
// RLS scopes form_submissions to the signed-in member's own account.
async function needsSignature(w: RequiredWaiver): Promise<boolean> {
  if (w.frequency === 'every_time') return true
  const { data, error } = await supabase()
    .from('form_submissions')
    .select('signed_at')
    .eq('form_id', w.id)
    .order('signed_at', { ascending: false })
    .limit(1)
  if (error || !data || data.length === 0) return true
  if (w.frequency === 'once') return false
  const signedMs = new Date((data[0] as { signed_at: string }).signed_at).getTime()
  return Date.now() - signedMs > 365 * 24 * 60 * 60 * 1000
}

// The waivers this flow still has to collect right now. A form with
// nothing to read or decide isn't put in front of anyone.
export async function unsignedRequiredWaivers(target: WaiverTarget): Promise<RequiredWaiver[]> {
  const required = (await getRequiredWaivers(target)).filter(hasSubstance)
  const due: RequiredWaiver[] = []
  for (const w of required) {
    if (await needsSignature(w)) due.push(w)
  }
  return due
}
