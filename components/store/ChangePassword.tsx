'use client'
import { useState } from 'react'
import { card, SUB, FAINT, LINE, GREEN, RED } from '@/lib/theme'
import { changeMyPassword, sendResetEmail } from '@/lib/password-client'

// Change your own password from inside your account. The current password
// is required — these are household logins, often left signed in on a
// phone or the front-desk tablet, and without that check anyone holding an
// unlocked device could lock the family out of their own account.
//
// The "I don't remember it" path is here too, because someone who can't
// recall their current password is exactly the person standing on this
// screen, and sending them off to hunt for the login page is unkind.
export function ChangePassword({ email }: { email: string }) {
  const [open, setOpen] = useState(false)
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [emailed, setEmailed] = useState(false)

  const reset = () => {
    setCurrent(''); setNext(''); setConfirm(''); setError(null)
  }

  const save = async () => {
    if (busy) return
    if (next !== confirm) { setError('Those two new passwords don’t match.'); return }
    setBusy(true)
    setError(null)
    const res = await changeMyPassword(current, next)
    setBusy(false)
    if (!res.ok) { setError(res.error ?? 'Could not change the password.'); return }
    reset()
    setOpen(false)
    setDone(true)
    window.setTimeout(() => setDone(false), 6000)
  }

  const emailMe = async () => {
    setBusy(true)
    setError(null)
    const res = await sendResetEmail(email)
    setBusy(false)
    if (res.ok) setEmailed(true)
    else setError(res.error ?? 'Could not send the email.')
  }

  const ready = current.length > 0 && next.length >= 8 && confirm.length > 0

  return (
    <div className="sq-card" style={{ ...card, padding: '20px 24px', marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: open ? 14 : 0, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: FAINT, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 4px' }}>Password</p>
          <p style={{ fontSize: 13, color: SUB, margin: 0, lineHeight: 1.5 }}>
            {done
              ? 'Your password is changed. Use the new one next time you sign in.'
              : 'Everyone who shares this account signs in with this password.'}
          </p>
        </div>
        {done
          ? <span style={{ fontSize: 11.5, fontWeight: 700, color: GREEN }}>Changed &#10003;</span>
          : (
            <button className="sq-btn sq-btn-ghost" style={{ padding: '8px 16px' }} onClick={() => { setOpen((v) => !v); reset(); setEmailed(false) }}>
              {open ? 'Cancel' : 'Change password'}
            </button>
          )}
      </div>

      {open && (
        <div style={{ borderTop: `1px solid ${LINE}`, paddingTop: 14 }}>
          {/* A hidden username field tells password managers which login
              this belongs to, so they offer to save the new one. */}
          <input type="text" name="username" autoComplete="username" value={email} readOnly hidden />

          <div style={{ display: 'grid', gap: 12, maxWidth: 380 }}>
            <div>
              <label className="sq-label" htmlFor="cp-current">Current password</label>
              <input id="cp-current" className="sq-input" type="password" autoComplete="current-password"
                value={current} onChange={(e) => setCurrent(e.target.value)} />
            </div>
            <div>
              <label className="sq-label" htmlFor="cp-new">New password</label>
              <input id="cp-new" className="sq-input" type="password" autoComplete="new-password"
                value={next} onChange={(e) => setNext(e.target.value)} placeholder="At least 8 characters" />
            </div>
            <div>
              <label className="sq-label" htmlFor="cp-confirm">New password again</label>
              <input id="cp-confirm" className="sq-input" type="password" autoComplete="new-password"
                value={confirm} onChange={(e) => setConfirm(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && ready) save() }} />
            </div>
          </div>

          {error && (
            <p style={{ fontSize: 12.5, color: RED, margin: '12px 0 0', fontWeight: 600, lineHeight: 1.5 }}>{error}</p>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 14, flexWrap: 'wrap' }}>
            <button className="sq-btn sq-btn-primary" style={{ padding: '8px 16px' }} disabled={!ready || busy} onClick={save}>
              {busy ? 'Saving…' : 'Save new password'}
            </button>
            {emailed ? (
              <span style={{ fontSize: 12, color: GREEN, fontWeight: 600 }}>
                Sent to {email} &mdash; the link works for one hour.
              </span>
            ) : (
              <button
                onClick={emailMe} disabled={busy}
                style={{ font: 'inherit', fontSize: 12.5, color: SUB, background: 'none', border: 'none', textDecoration: 'underline', cursor: 'pointer', padding: 0 }}
              >
                I don&rsquo;t remember my current password
              </button>
            )}
          </div>

          <p style={{ fontSize: 11.5, color: FAINT, margin: '12px 0 0', lineHeight: 1.55 }}>
            Changing this changes it for everyone on the account. If family members are signed in
            elsewhere, let them know&nbsp;&mdash; they&rsquo;ll need the new one next time.
          </p>
        </div>
      )}

      {!open && done && (
        <p style={{ fontSize: 11.5, color: FAINT, margin: '10px 0 0', lineHeight: 1.55 }}>
          Anyone else on this account will need the new password next time they sign in.
        </p>
      )}
    </div>
  )
}
