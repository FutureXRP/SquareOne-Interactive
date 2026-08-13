'use client'
import { useState } from 'react'
import { INK, SUB, FAINT, LINE, GREEN, RED } from '@/lib/theme'
import { adminSendReset, adminSetTempPassword } from '@/lib/password-client'

// Owner/Admin control for helping someone back in: email a reset link, or
// set a temporary password to read out at the desk. The server checks the
// caller's role — this button only decides what to show.
export function ResetPasswordButton({
  clientId, staffId, name, compact,
}: {
  clientId?: string
  staffId?: string
  name: string
  compact?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [temp, setTemp] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const target = clientId ? { clientId } : { staffId }

  const emailLink = async () => {
    if (busy) return
    setBusy(true); setError(null); setTemp(null)
    const res = await adminSendReset(target)
    setBusy(false)
    if (res.ok) setSent(true)
    else setError(res.error ?? 'Could not send it.')
  }

  const makeTemp = async () => {
    if (busy) return
    if (!window.confirm(`Set a temporary password for ${name}? Their current password stops working immediately.`)) return
    setBusy(true); setError(null); setSent(false)
    const res = await adminSetTempPassword(target)
    setBusy(false)
    if (res.ok && res.tempPassword) setTemp(res.tempPassword)
    else setError(res.error ?? 'Could not set it.')
  }

  if (!open) {
    return (
      <button className="sq-btn sq-btn-ghost" style={{ padding: compact ? '4px 10px' : '6px 13px', fontSize: compact ? 10.5 : 11.5 }} onClick={() => setOpen(true)}>
        Reset password
      </button>
    )
  }

  return (
    <div style={{ background: '#fafbfd', border: `1px solid ${LINE}`, borderRadius: 10, padding: '11px 13px', marginTop: 6, width: '100%' }}>
      <p style={{ fontSize: 12, fontWeight: 700, color: INK, margin: '0 0 8px' }}>Reset {name}&apos;s password</p>

      {temp ? (
        <>
          <p style={{ fontSize: 12, color: SUB, margin: '0 0 6px', lineHeight: 1.55 }}>
            Temporary password — read it to them now, it isn&apos;t shown again:
          </p>
          <p style={{
            fontFamily: 'DM Mono, monospace', fontSize: 16, fontWeight: 700, color: INK,
            background: '#fff', border: `1px solid ${LINE}`, borderRadius: 8, padding: '9px 12px', margin: '0 0 8px', letterSpacing: '0.02em',
          }}>{temp}</p>
          <p style={{ fontSize: 11, color: FAINT, margin: 0, lineHeight: 1.5 }}>
            Ask them to change it once they&apos;re in. We emailed them that it was reset.
          </p>
        </>
      ) : sent ? (
        <p style={{ fontSize: 12, color: GREEN, fontWeight: 600, margin: 0, lineHeight: 1.55 }}>
          Reset link sent. It lands in their inbox and expires after a short window.
        </p>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="sq-btn sq-btn-primary" style={{ padding: '6px 13px', fontSize: 11.5 }} disabled={busy} onClick={emailLink}>
              {busy ? '…' : 'Email them a link'}
            </button>
            <button className="sq-btn sq-btn-navy" style={{ padding: '6px 13px', fontSize: 11.5 }} disabled={busy} onClick={makeTemp}>
              {busy ? '…' : 'Set a temporary password'}
            </button>
          </div>
          <p style={{ fontSize: 11, color: FAINT, margin: '7px 0 0', lineHeight: 1.5 }}>
            Email is the normal way. Use a temporary password only when they&apos;re standing here and can&apos;t get to their inbox.
          </p>
        </>
      )}

      {error && <p style={{ fontSize: 11.5, color: RED, fontWeight: 600, margin: '7px 0 0', lineHeight: 1.5 }}>{error}</p>}

      <button
        onClick={() => { setOpen(false); setSent(false); setTemp(null); setError(null) }}
        style={{ font: 'inherit', cursor: 'pointer', border: 'none', background: 'transparent', color: FAINT, fontSize: 11, fontWeight: 600, marginTop: 8, padding: 0 }}
      >
        Close
      </button>
    </div>
  )
}
