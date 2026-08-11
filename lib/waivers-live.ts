'use client'
// Which waivers a store flow must collect, driven by the assignment rules
// staff set on the Forms & Waivers tab. Falls back to the two built-in
// waivers when Supabase (or the assignment migration) isn't available yet.

import { supabase, isSupabaseConfigured } from '@/lib/supabase'
import { FITNESS_WAIVER, RENTAL_WAIVER, type WaiverDef } from '@/lib/waiver-defs'

export type WaiverFrequency = 'once' | 'annual' | 'every_time'
// 'fitness' = fitness signup, any plan; { planId } filters plan-targeted
// waivers; { roomId } is a rental booking for that room.
export type WaiverTarget = 'fitness' | { planId: string } | { roomId: string }

export interface RequiredWaiver extends WaiverDef {
  frequency: WaiverFrequency
}

export const FREQUENCY_NOTE: Record<WaiverFrequency, string> = {
  once: 'signed once',
  annual: 're-signed every 12 months',
  every_time: 'signed with every booking',
}

interface FormRow {
  id: string
  name: string
  fields: { type: string; content?: string }[]
  assign_room_ids: string[] | null
  assign_plan_ids?: string[] | null
  frequency: WaiverFrequency
}

const isFitness = (t: WaiverTarget) => t === 'fitness' || 'planId' in t

function toRequired(r: FormRow, target: WaiverTarget): RequiredWaiver {
  const paras = (Array.isArray(r.fields) ? r.fields : [])
    .filter((f) => f.type === 'paragraph' && f.content && f.content.trim())
    .map((f) => (f.content as string).trim())
  const builtin = isFitness(target) ? FITNESS_WAIVER : RENTAL_WAIVER
  return {
    id: r.id,
    name: r.name,
    context: `${isFitness(target) ? 'Required with a gym membership' : 'Required with this rental'} · ${FREQUENCY_NOTE[r.frequency]}`,
    terms: paras.length > 0 ? paras : builtin.terms,
    frequency: r.frequency ?? 'once',
  }
}

function builtinFor(target: WaiverTarget): RequiredWaiver[] {
  const def = isFitness(target) ? FITNESS_WAIVER : RENTAL_WAIVER
  return [{ ...def, frequency: 'once' }]
}

// Every active form assigned to this flow, in stable order.
export async function getRequiredWaivers(target: WaiverTarget): Promise<RequiredWaiver[]> {
  if (!isSupabaseConfigured()) return builtinFor(target)
  // assign_plan_ids arrives with migration 0017 — retry without it.
  let res: { data: unknown; error: unknown } = await supabase()
    .from('forms')
    .select('id, name, fields, assign_room_ids, assign_plan_ids, frequency')
    .eq('status', 'active')
    .eq('assign_to', isFitness(target) ? 'fitness' : 'rentals')
    .order('id')
  if (res.error) {
    res = await supabase()
      .from('forms')
      .select('id, name, fields, assign_room_ids, frequency')
      .eq('status', 'active')
      .eq('assign_to', isFitness(target) ? 'fitness' : 'rentals')
      .order('id')
  }
  // Column missing means the assignment migration hasn't run — keep the
  // built-in behavior so waivers are never silently skipped.
  if (res.error) return builtinFor(target)
  let rows = res.data as unknown as FormRow[]
  if (typeof target === 'object' && 'roomId' in target) {
    rows = rows.filter((r) => !r.assign_room_ids || r.assign_room_ids.length === 0 || r.assign_room_ids.includes(target.roomId))
  }
  if (typeof target === 'object' && 'planId' in target) {
    rows = rows.filter((r) => !r.assign_plan_ids || r.assign_plan_ids.length === 0 || r.assign_plan_ids.includes(target.planId))
  }
  return rows.map((r) => toRequired(r, target))
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

// The waivers this flow still has to collect right now.
export async function unsignedRequiredWaivers(target: WaiverTarget): Promise<RequiredWaiver[]> {
  const required = await getRequiredWaivers(target)
  const due: RequiredWaiver[] = []
  for (const w of required) {
    if (await needsSignature(w)) due.push(w)
  }
  return due
}
