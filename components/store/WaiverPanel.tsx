'use client'
import { useEffect, useState } from 'react'
import { card, INK, SUB, FAINT, LINE, BLUE, GREEN } from '@/lib/theme'
import { signWaiver } from '@/lib/session'
import { supabase, isSupabaseConfigured } from '@/lib/supabase'
import type { WaiverDef } from '@/lib/waiver-defs'

// Inline waiver signing step, embedded in the flows that require it
// (fitness membership signup, facility rental booking). Writes a real
// form_submissions row.
export function WaiverPanel({ def, onSigned, compact = false, defaultName = '' }: {
  def: WaiverDef
  onSigned: () => void
  compact?: boolean
  defaultName?: string
}) {
  const [signer, setSigner] = useState(defaultName)
  const [agreed, setAgreed] = useState(false)
  const [signature, setSignature] = useState('')
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState(false)
  const [terms, setTerms] = useState<string[]>(def.terms)
  const [title, setTitle] = useState(def.name)

  // The signed terms come from the live form (editable in the dashboard);
  // the built-in text is only the fallback.
  useEffect(() => {
    if (!isSupabaseConfigured()) return
    let on = true
    supabase().from('forms').select('name, fields').eq('id', def.id).maybeSingle().then(({ data }) => {
      if (!on || !data) return
      const row = data as { name: string; fields: { type: string; content?: string; label: string }[] }
      setTitle(row.name || def.name)
      const paras = (Array.isArray(row.fields) ? row.fields : [])
        .filter((f) => f.type === 'paragraph' && f.content && f.content.trim())
        .map((f) => (f.content as string).trim())
      if (paras.length > 0) setTerms(paras)
    })
    return () => { on = false }
  }, [def.id, def.name])

  const canSign = signer.trim().length > 0 && agreed && signature.trim().toLowerCase() === signer.trim().toLowerCase()

  const sign = async () => {
    setSaving(true)
    setFailed(false)
    const ok = await signWaiver(def.id, signer.trim(), signer.trim())
    setSaving(false)
    if (ok) onSigned()
    else setFailed(true)
  }

  return (
    <div className="sq-card" style={{ ...card, padding: compact ? '18px 20px' : '22px 26px' }}>
      <p style={{ fontSize: 14.5, fontWeight: 800, color: INK, margin: '0 0 2px' }}>{title}</p>
      <p style={{ fontSize: 12, color: FAINT, margin: '0 0 12px' }}>{def.context} · takes about a minute</p>

      <div style={{ maxHeight: compact ? 150 : undefined, overflowY: compact ? 'auto' : undefined, paddingRight: compact ? 6 : 0, marginBottom: 14 }}>
        {terms.map((t, i) => (
          <p key={i} style={{ fontSize: 12.5, color: SUB, lineHeight: 1.6, margin: '0 0 10px', paddingLeft: 16, position: 'relative' }}>
            <span style={{ position: 'absolute', left: 0, top: 6, width: 6, height: 6, background: `${BLUE}30`, border: `1.5px solid ${BLUE}`, borderRadius: 2, transform: 'rotate(45deg)' }} />
            {t}
          </p>
        ))}
      </div>

      <div style={{ marginBottom: 12 }}>
        <label className="sq-label" htmlFor={`${def.id}-signer`}>Your full legal name</label>
        <input id={`${def.id}-signer`} className="sq-input" value={signer} onChange={(e) => setSigner(e.target.value)} placeholder="Jordan Alvarez" />
      </div>

      <label style={{ display: 'flex', alignItems: 'flex-start', gap: 9, fontSize: 12.5, color: SUB, lineHeight: 1.5, cursor: 'pointer', marginBottom: 12 }}>
        <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} style={{ marginTop: 2, accentColor: BLUE }} />
        I have read and agree to the {def.name.toLowerCase()} above.
      </label>

      <div style={{ marginBottom: 14 }}>
        <label className="sq-label" htmlFor={`${def.id}-sig`}>Type your name to sign</label>
        <input id={`${def.id}-sig`} className="sq-input" value={signature} onChange={(e) => setSignature(e.target.value)} placeholder={signer.trim() || 'Your name, exactly as above'}
          style={{ fontStyle: 'italic', fontSize: 15, borderBottom: `2px solid ${signature && canSign ? GREEN : LINE}` }} />
      </div>

      <button className="sq-btn sq-btn-primary" disabled={!canSign || saving} onClick={sign} style={{ width: '100%' }}>
        {saving ? 'Signing…' : `Sign ${def.name.toLowerCase()}`}
      </button>
      {failed && <p style={{ fontSize: 11.5, color: '#cf4436', margin: '8px 0 0', textAlign: 'center', fontWeight: 600 }}>Couldn&apos;t save your signature — check your connection and try again.</p>}
      <p style={{ fontSize: 10.5, color: FAINT, margin: '8px 0 0', textAlign: 'center' }}>Your signature is stored securely on your account.</p>
    </div>
  )
}
