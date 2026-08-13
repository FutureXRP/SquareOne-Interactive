'use client'
import { useState } from 'react'
import { card, INK, SUB, FAINT, LINE, BLUE, GREEN } from '@/lib/theme'
import { signWaiver } from '@/lib/session'
import type { RequiredWaiver } from '@/lib/waivers-live'

// Inline waiver signing step, embedded in the flows that require it
// (fitness membership signup, facility rental booking). Everything on
// screen — the title, the paragraphs, the questions — comes from the form
// staff built on the Forms & Waivers tab. Writes a real form_submissions
// row against the signer's account.
export function WaiverPanel({ def, onSigned, compact = false, defaultName = '' }: {
  def: RequiredWaiver
  onSigned: () => void
  compact?: boolean
  defaultName?: string
}) {
  const [signer, setSigner] = useState(defaultName)
  const [agreed, setAgreed] = useState(false)
  const [signature, setSignature] = useState('')
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState(false)
  const [choices, setChoices] = useState<Record<string, string[]>>({})

  const toggleChoice = (label: string, option: string) => {
    setChoices((cur) => {
      const set = new Set(cur[label] ?? [])
      if (set.has(option)) set.delete(option)
      else set.add(option)
      return { ...cur, [label]: [...set] }
    })
  }

  const choicesOk = def.choices.every((m) => !m.required || (choices[m.label]?.length ?? 0) > 0)
  const canSign = signer.trim().length > 0 && agreed && choicesOk && signature.trim().toLowerCase() === signer.trim().toLowerCase()

  const sign = async () => {
    setSaving(true)
    setFailed(false)
    // The snapshot is what keeps this signature meaningful later: the
    // waiver as it read today, not as the form may read next year.
    const ok = await signWaiver(def.id, signer.trim(), signer.trim(), choices, { name: def.name, terms: def.terms })
    setSaving(false)
    if (ok) onSigned()
    else setFailed(true)
  }

  return (
    <div className="sq-card" style={{ ...card, padding: compact ? '18px 20px' : '22px 26px' }}>
      <p style={{ fontSize: 14.5, fontWeight: 800, color: INK, margin: '0 0 2px' }}>{def.name}</p>
      <p style={{ fontSize: 12, color: FAINT, margin: '0 0 12px' }}>{def.context} · takes about a minute</p>

      <div style={{ maxHeight: compact ? 150 : undefined, overflowY: compact ? 'auto' : undefined, paddingRight: compact ? 6 : 0, marginBottom: 14 }}>
        {def.terms.map((t, i) => (
          <p key={i} style={{ fontSize: 12.5, color: SUB, lineHeight: 1.6, margin: '0 0 10px', paddingLeft: 16, position: 'relative' }}>
            <span style={{ position: 'absolute', left: 0, top: 6, width: 6, height: 6, background: `${BLUE}30`, border: `1.5px solid ${BLUE}`, borderRadius: 2, transform: 'rotate(45deg)' }} />
            {t}
          </p>
        ))}
      </div>

      {def.choices.map((m) => (
        <div key={m.label} style={{ marginBottom: 12 }}>
          <span className="sq-label">{m.label}{m.required ? '' : ' (optional)'}</span>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {m.options.map((opt) => {
              const on = (choices[m.label] ?? []).includes(opt)
              return (
                <label key={opt} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: INK, cursor: 'pointer', background: on ? '#eef4fb' : '#fff', border: `1.5px solid ${on ? BLUE : LINE}`, borderRadius: 9, padding: '6px 11px' }}>
                  <input type="checkbox" checked={on} onChange={() => toggleChoice(m.label, opt)} style={{ accentColor: BLUE }} />
                  {opt}
                </label>
              )
            })}
          </div>
        </div>
      ))}

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
