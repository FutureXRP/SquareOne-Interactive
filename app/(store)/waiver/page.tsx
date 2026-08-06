'use client'
import Link from 'next/link'
import { useState } from 'react'
import { card, INK, SUB, FAINT, LINE, BLUE, GREEN } from '@/lib/theme'
import { addWaiver, getProfile } from '@/lib/demo-session'

const TERMS = [
  'I understand that use of SquareOne Interactive facilities — including the gym, climbing and adventure areas, multiball, multisport court, gaming zone, and arcade — carries inherent risk of injury.',
  'I voluntarily assume all risks related to participation, for myself and for any minors listed below, and release SquareOne Compassion, its staff, and volunteers from liability to the fullest extent permitted by law.',
  'I confirm the participants listed are in adequate physical condition to participate, and I agree to follow all posted rules and staff instructions.',
  'I grant permission for emergency medical treatment if needed, and I understand SquareOne is not responsible for lost or stolen property.',
]

export default function WaiverPage() {
  const [signer, setSigner] = useState('')
  const [participants, setParticipants] = useState('')
  const [agreed, setAgreed] = useState(false)
  const [signature, setSignature] = useState('')
  const [done, setDone] = useState(false)

  const canSign = signer.trim() && agreed && signature.trim().toLowerCase() === signer.trim().toLowerCase()

  const sign = () => {
    addWaiver({
      formId: 'liability-v1',
      formName: 'Liability Waiver & Release',
      signedBy: signer.trim(),
      participant: participants.trim() || signer.trim(),
      signedOn: new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
    })
    setDone(true)
  }

  if (done) {
    return (
      <div className="sq-page" style={{ padding: '40px 20px 10px', maxWidth: 560, margin: '0 auto' }}>
        <div className="sq-card" style={{ ...card, padding: '30px 32px' }}>
          <div style={{ width: 40, height: 40, borderRadius: 11, background: '#e5f2ea', color: GREEN, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
            <svg width="20" height="20" viewBox="0 0 16 16" fill="none"><path d="M3 8.5l3.2 3.2L13 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </div>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: INK, margin: '0 0 8px' }}>Waiver signed — you&apos;re all set</h1>
          <p style={{ fontSize: 13.5, color: SUB, margin: '0 0 18px', lineHeight: 1.6 }}>
            We&apos;ve recorded your waiver{getProfile() ? ' on your profile' : ''}. Show your name at the
            front desk on your first visit and you&apos;ll walk right in.
          </p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {getProfile()
              ? <Link href="/account" className="sq-btn sq-btn-primary">Go to my account</Link>
              : <Link href="/signup" className="sq-btn sq-btn-primary">Create a profile</Link>}
            <Link href="/" className="sq-btn sq-btn-ghost">Back home</Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="sq-page" style={{ padding: '34px 20px 10px', maxWidth: 680, margin: '0 auto' }}>
      <h1 style={{ fontSize: 28, fontWeight: 800, color: INK, margin: '0 0 6px', letterSpacing: '-0.03em' }}>Liability waiver &amp; release</h1>
      <p style={{ fontSize: 14, color: SUB, margin: '0 0 24px' }}>
        Sign once a year, for yourself and any kids in your care. Takes about a minute.
      </p>

      <div className="sq-card" style={{ ...card, padding: '22px 26px', marginBottom: 18 }}>
        <p style={{ fontSize: 11, fontWeight: 700, color: FAINT, textTransform: 'uppercase', letterSpacing: '0.07em', margin: '0 0 12px' }}>Please read</p>
        {TERMS.map((t, i) => (
          <p key={i} style={{ fontSize: 13, color: SUB, lineHeight: 1.65, margin: '0 0 12px', paddingLeft: 18, position: 'relative' }}>
            <span style={{ position: 'absolute', left: 0, top: 7, width: 7, height: 7, background: `${BLUE}30`, border: `1.5px solid ${BLUE}`, borderRadius: 2, transform: 'rotate(45deg)' }} />
            {t}
          </p>
        ))}
      </div>

      <div className="sq-card" style={{ ...card, padding: '22px 26px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14, marginBottom: 14 }}>
          <div>
            <label className="sq-label" htmlFor="signer">Your full legal name</label>
            <input id="signer" className="sq-input" value={signer} onChange={(e) => setSigner(e.target.value)} placeholder="Jordan Alvarez" />
          </div>
          <div>
            <label className="sq-label" htmlFor="participants">Minors covered (optional)</label>
            <input id="participants" className="sq-input" value={participants} onChange={(e) => setParticipants(e.target.value)} placeholder="Sam Alvarez, Riley Alvarez" />
          </div>
        </div>

        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 13, color: SUB, lineHeight: 1.55, cursor: 'pointer', marginBottom: 14 }}>
          <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} style={{ marginTop: 3, accentColor: BLUE }} />
          I have read and agree to the waiver and release above.
        </label>

        <div style={{ marginBottom: 18 }}>
          <label className="sq-label" htmlFor="signature">Type your name to sign</label>
          <input id="signature" className="sq-input" value={signature} onChange={(e) => setSignature(e.target.value)} placeholder={signer.trim() || 'Your name, exactly as above'}
            style={{ fontStyle: 'italic', fontSize: 16, borderBottom: `2px solid ${signature && canSign ? GREEN : LINE}` }} />
        </div>

        <button className="sq-btn sq-btn-primary" disabled={!canSign} onClick={sign} style={{ width: '100%' }}>Sign waiver</button>
        <p style={{ fontSize: 11, color: FAINT, margin: '10px 0 0', textAlign: 'center' }}>
          Demo signature — signed PDFs to secure storage arrive with the forms engine.
        </p>
      </div>
    </div>
  )
}
