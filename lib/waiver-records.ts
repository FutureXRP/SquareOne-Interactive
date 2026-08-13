'use client'
// Signed waivers, read from the desk. Every signature a client has given
// stays on their account — the exact language they agreed to, who signed,
// when, and any questions they answered — until someone here deletes it.

import { supabase, emit } from '@/lib/supabase'

export const WAIVER_RECORDS_EVENT = 'sq-waiver-records'

export interface WaiverRecord {
  id: string
  formId: string
  formName: string
  participant: string
  signedBy: string
  signedOn: string
  signedAt: string
  // The paragraphs as they read the day it was signed. Empty for anything
  // signed before 0034 — we don't invent what the form used to say.
  terms: string[]
  responses: Record<string, string[]>
}

interface Row {
  id: string
  form_id: string
  participant: string
  signed_by: string
  signed_at: string
  form_name?: string | null
  signed_terms?: string[] | null
  responses?: Record<string, string[]> | null
  forms: { name: string } | null
}

// Newest first, and the snapshot columns are optional so the tab works
// before 0034 runs.
const COL_SETS = [
  'id, form_id, participant, signed_by, signed_at, form_name, signed_terms, responses, forms(name)',
  'id, form_id, participant, signed_by, signed_at, responses, forms(name)',
  'id, form_id, participant, signed_by, signed_at, forms(name)',
]

export async function getAccountWaivers(accountId: string): Promise<WaiverRecord[]> {
  let rows: Row[] | null = null
  for (const cols of COL_SETS) {
    const res = await supabase()
      .from('form_submissions')
      .select(cols)
      .eq('account_id', accountId)
      .order('signed_at', { ascending: false })
    if (!res.error) { rows = res.data as unknown as Row[]; break }
  }
  if (!rows) return []
  return rows.map((r) => ({
    id: r.id,
    formId: r.form_id,
    // The name we stored at signing wins; the live form name is the
    // fallback for older records.
    formName: r.form_name || r.forms?.name || r.form_id,
    participant: r.participant,
    signedBy: r.signed_by,
    signedAt: r.signed_at,
    signedOn: new Date(r.signed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
    terms: Array.isArray(r.signed_terms) ? r.signed_terms : [],
    responses: r.responses ?? {},
  }))
}

// The only way a waiver record ever leaves an account. Needs migration 0034
// for the staff delete policy.
export async function deleteWaiverRecord(id: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase().from('form_submissions').delete().eq('id', id)
  if (error) {
    console.error('[waivers]', error.message)
    return { ok: false, error: error.message }
  }
  emit(WAIVER_RECORDS_EVENT)
  return { ok: true }
}
