'use client'
// Waivers, start to finish, from the Forms & Waivers tab and nowhere else.
// The name, the paragraphs people actually agree to, the questions, where
// it's required, and how often — every word of it is what staff wrote on
// that page. There is deliberately no built-in waiver text in the codebase
// to fall back on: if no form is assigned to a flow, that flow collects no
// waiver rather than quietly presenting language nobody approved.

import { supabase, isSupabaseConfigured } from '@/lib/supabase'

export type WaiverFrequency = 'once' | 'annual' | 'every_time'
// 'fitness' = fitness signup, any plan; { planId } filters plan-targeted
// waivers; { roomId } is a rental booking for that room.
export type WaiverTarget = 'fitness' | { planId: string } | { roomId: string }

export interface WaiverChoice {
  label: string
  options: string[]
  required: boolean
  // true = pick exactly one (an either/or, like a photo release);
  // false = check any that apply.
  single: boolean
}

export interface RequiredWaiver {
  id: string
  name: string
  context: string
  terms: string[]
  choices: WaiverChoice[]
  // Standalone "Agreement checkbox" fields — each rendered as its own
  // checkbox; required ones must be ticked to sign.
  agreements: { label: string; required: boolean }[]
  frequency: WaiverFrequency
}

export const FREQUENCY_NOTE: Record<WaiverFrequency, string> = {
  once: 'signed once',
  annual: 're-signed every 12 months',
  every_time: 'signed with every booking',
}

interface FormField {
  type: string
  label?: string
  content?: string
  required?: boolean
  options?: string[]
}

interface FormRow {
  id: string
  name: string
  fields: FormField[]
  assign_to?: string
  assign_room_ids: string[] | null
  assign_plan_ids?: string[] | null
  frequency: WaiverFrequency
}

const isFitness = (t: WaiverTarget) => t === 'fitness' || 'planId' in t

// A form row becomes exactly what the store shows — paragraphs in the
// order staff arranged them, multi-select questions with their options.
export function toWaiver(r: FormRow, where?: string): RequiredWaiver {
  const fields = Array.isArray(r.fields) ? r.fields : []
  const frequency = r.frequency ?? 'once'
  return {
    id: r.id,
    name: r.name,
    context: [where, FREQUENCY_NOTE[frequency]].filter(Boolean).join(' · '),
    terms: fields
      .filter((f) => f.type === 'paragraph' && f.content && f.content.trim())
      .map((f) => (f.content as string).trim()),
    choices: fields
      .filter((f) => (f.type === 'multi' || f.type === 'single') && Array.isArray(f.options) && f.options.length > 0)
      .map((f) => ({ label: f.label ?? '', options: f.options as string[], required: !!f.required, single: f.type === 'single' })),
    agreements: fields
      .filter((f) => f.type === 'checkbox' && (f.label ?? '').trim())
      .map((f) => ({ label: (f.label as string).trim(), required: !!f.required })),
    frequency,
  }
}

// assign_plan_ids arrives with 0017 and frequency/assign_to with 0004 —
// each select falls back to the last shape that worked.
const COL_SETS = [
  'id, name, fields, assign_to, assign_room_ids, assign_plan_ids, frequency',
  'id, name, fields, assign_to, assign_room_ids, frequency',
  'id, name, fields',
]

async function activeForms(assignTo?: 'fitness' | 'rentals'): Promise<FormRow[] | null> {
  for (const cols of COL_SETS) {
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

// A form is substantive when it puts anything in front of the signer to
// read or decide — paragraphs, choices, or agreement checkboxes. A photo
// release that is nothing but an either/or question counts.
export function hasSubstance(w: RequiredWaiver): boolean {
  return w.terms.length > 0 || w.choices.length > 0 || w.agreements.length > 0
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
