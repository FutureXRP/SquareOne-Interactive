import { serviceDb } from '@/lib/server/billing'

// Staff-written wording, applied to every outgoing email at the one
// place they all pass through (sendAndLog). The template still generates
// the whole default email; overrides then swap the subject and slot the
// staff's own paragraphs above and below the generated body, at markers
// the shell leaves for exactly this. Notes are plain text — escaped, so
// nothing typed on the admin page can inject markup into a receipt.

interface Override { subject: string; top_note: string; bottom_note: string }

// A short cache keeps sends from hitting the table on every email while
// letting edits take effect within a minute on a warm instance.
let cache: { at: number; map: Map<string, Override> } | null = null

async function overrides(): Promise<Map<string, Override>> {
  if (cache && Date.now() - cache.at < 30_000) return cache.map
  const map = new Map<string, Override>()
  try {
    const { data, error } = await serviceDb().from('email_templates').select('kind, subject, top_note, bottom_note')
    if (!error && data) {
      for (const r of data as unknown as ({ kind: string } & Override)[]) map.set(r.kind, r)
    }
  } catch {
    // pre-0043 — every email keeps its stock wording
  }
  cache = { at: Date.now(), map }
  return map
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function paragraphs(s: string, color: string): string {
  return `<div style="font-size:14px;line-height:1.6;color:${color};">`
    + s.trim().split(/\n+/).map((l) => `<p style="margin:0 0 10px;">${esc(l.trim())}</p>`).join('')
    + '</div>'
}

export async function applyEmailOverrides(kind: string, body: { subject: string; html: string }): Promise<{ subject: string; html: string }> {
  const o = (await overrides()).get(kind)
  if (!o) return body
  let subject = body.subject
  if (o.subject.trim()) subject = o.subject.replace(/\{default\}/gi, body.subject).trim()
  let html = body.html
  if (o.top_note.trim()) html = html.replace('<!--sq:top-->', paragraphs(o.top_note, '#3f4c5f') + '<!--sq:top-->')
  if (o.bottom_note.trim()) html = html.replace('<!--sq:bottom-->', '<!--sq:bottom-->' + paragraphs(o.bottom_note, '#5b6b82'))
  return { subject, html }
}
