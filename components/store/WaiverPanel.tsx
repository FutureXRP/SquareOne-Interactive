'use client'
import { useState } from 'react'
import { card, INK, SUB, FAINT, LINE, BLUE, GREEN } from '@/lib/theme'
import { addWaiver, getProfile } from '@/lib/demo-session'
import type { WaiverDef } from '@/lib/waiver-defs'

// Inline waiver signing step, embedded in the flows that require it
// (fitness membership signup, facility rental booking).
export function WaiverPanel({ def, onSigned, compact = false }: {
  def: WaiverDef
  onSigned: () => void
  compact?: boolean
}) {
  const profileName = getProfile()?.name ?? ''
  const [signer, setSigner] = useState(profileName)
  const [agreed, setAgreed] = useState(false)
  const [signature, setSignature] = useState('')

  const canSign = signer.trim().length > 0 && agreed && signature.trim().toLowerCase() === signer.trim().toLowerCase()

  const sign = () => {
    addWaiver({
      formId: def.id,
      formName: def.name,
      signedBy: signer.trim(),
      participant: signer.trim(),
      signedOn: new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
    })
    onSigned()
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

      <button className="sq-btn sq-btn-primary" disabled={!canSign} onClick={sign} style={{ width: '100%' }}>Sign {def.name.toLowerCase()}</button>
      <p style={{ fontSize: 10.5, color: FAINT, margin: '8px 0 0', textAlign: 'center' }}>Demo signature — signed PDFs to secure storage arrive with the forms engine.</p>
    </div>
  )
}
