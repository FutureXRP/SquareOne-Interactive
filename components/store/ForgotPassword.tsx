'use client'
import { useState } from 'react'
import { SUB, FAINT, LINE, BLUE, GREEN, RED } from '@/lib/theme'
import { sendResetEmail } from '@/lib/password-client'

// "Forgot password?" — expands into an email box in place, on both the
// member sign-in and the staff dashboard sign-in.
export function ForgotPassword({ defaultEmail = '' }: { defaultEmail?: string }) {
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState(defaultEmail)
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const send = async () => {
    if (busy) return
    setBusy(true)
    setError(null)
    const res = await sendResetEmail(email || defaultEmail)
    setBusy(false)
    if (res.ok) setSent(true)
    else setError(res.error ?? 'Could not send the email.')
  }

  if (sent) {
    return (
      <p style={{ fontSize: 12, color: GREEN, fontWeight: 600, margin: '12px 0 0', textAlign: 'center', lineHeight: 1.55 }}>
        If that address has an account, a reset link is on its way. Check spam if it doesn&apos;t land in a minute.
      </p>
    )
  }

  if (!open) {
    return (
      <p style={{ textAlign: 'center', margin: '12px 0 0' }}>
        <button
          type="button"
          onClick={() => { setOpen(true); if (!email) setEmail(defaultEmail) }}
          style={{ font: 'inherit', cursor: 'pointer', border: 'none', background: 'transparent', color: BLUE, fontSize: 12, fontWeight: 600 }}
        >
          Forgot your password?
        </button>
      </p>
    )
  }

  return (
    <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${LINE}` }}>
      <p style={{ fontSize: 12, color: SUB, margin: '0 0 8px', lineHeight: 1.55 }}>
        Enter your email and we&apos;ll send a link to set a new one.
      </p>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          className="sq-input"
          type="email"
          style={{ flex: 1, minWidth: 0, fontSize: 13 }}
          placeholder="you@email.com"
          value={email}
          onChange={(e) => { setEmail(e.target.value); setError(null) }}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); send() } }}
        />
        <button type="button" className="sq-btn sq-btn-ghost" style={{ padding: '9px 15px', fontSize: 12.5 }} disabled={busy || !email.includes('@')} onClick={send}>
          {busy ? 'Sending…' : 'Send'}
        </button>
      </div>
      {error && <p style={{ fontSize: 11.5, color: RED, fontWeight: 600, margin: '7px 0 0' }}>{error}</p>}
      <p style={{ fontSize: 11, color: FAINT, margin: '7px 0 0' }}>
        No email on the account? A manager can set you a temporary password at the desk.
      </p>
    </div>
  )
}
