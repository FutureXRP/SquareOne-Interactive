'use client'
// Staff wording for outgoing emails — one row per email kind, edited on
// the Email health tab. Empty fields mean "use the stock wording"; a
// cleared row is deleted so the email returns fully to its default.

import { supabase, tryWrite, emit } from '@/lib/supabase'

export const EMAIL_WORDING_EVENT = 'sq-email-wording'

export interface EmailWording {
  kind: string
  subject: string
  topNote: string
  bottomNote: string
}

// null = the table doesn't exist yet (0043 not run).
export async function getEmailWording(): Promise<Map<string, EmailWording> | null> {
  const { data, error } = await supabase().from('email_templates').select('kind, subject, top_note, bottom_note')
  if (error) return null
  const map = new Map<string, EmailWording>()
  for (const r of data as { kind: string; subject: string; top_note: string; bottom_note: string }[]) {
    map.set(r.kind, { kind: r.kind, subject: r.subject, topNote: r.top_note, bottomNote: r.bottom_note })
  }
  return map
}

export async function saveEmailWording(w: EmailWording): Promise<boolean> {
  const sb = supabase()
  const empty = !w.subject.trim() && !w.topNote.trim() && !w.bottomNote.trim()
  if (empty) {
    const ok = await tryWrite(() => sb.from('email_templates').delete().eq('kind', w.kind))
    if (ok) emit(EMAIL_WORDING_EVENT)
    return ok
  }
  const { data: org } = await sb.from('organizations').select('id').limit(1).single()
  const ok = await tryWrite(() => sb.from('email_templates').upsert({
    kind: w.kind,
    org_id: (org as { id: string }).id,
    subject: w.subject,
    top_note: w.topNote,
    bottom_note: w.bottomNote,
    updated_at: new Date().toISOString(),
  }))
  if (ok) emit(EMAIL_WORDING_EVENT)
  return ok
}
