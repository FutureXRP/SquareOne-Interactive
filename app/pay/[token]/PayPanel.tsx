'use client'
import { useState } from 'react'
import { INK, SUB, FAINT, LINE, RED } from '@/lib/theme'
import { formatCents } from '@/lib/format'
import type { PayTarget } from '@/lib/server/pay-links'

// The buttons on a booking's pay link. Deposit when one is still owed and
// smaller than the balance, otherwise just the balance. When the facility
// has a $cashtag configured, a direct Cash App path rides along — pay the
// tag, tap "I've sent it", and the desk confirms before anything reads as
// paid, because Cash App has no way for software to check.
export function PayPanel({ token, target, cashtag = '', bookingCode = '' }: {
  token: string
  target: PayTarget
  cashtag?: string
  bookingCode?: string
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [cashOpen, setCashOpen] = useState(false)
  const [claimed, setClaimed] = useState(false)

  const showDeposit = target.depositDueCents > 0 && target.depositDueCents < target.balanceCents
  const tag = cashtag.replace(/^\$/, '')
  const cashAmount = showDeposit ? target.depositDueCents : target.balanceCents

  const fileClaim = async () => {
    if (busy) return
    setBusy(true); setError(null)
    try {
      const res = await fetch(`/api/pay/${token}/claim`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ which: showDeposit ? 'deposit' : 'balance' }),
      })
      if (res.ok) setClaimed(true)
      else setError('Could not report the payment — call the front desk and we\u2019ll sort it out.')
    } catch {
      setError('Could not reach the server.')
    }
    setBusy(false)
  }

  const pay = async (which: 'deposit' | 'balance') => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/pay/${token}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ which }),
      })
      const json = (await res.json().catch(() => ({}))) as { url?: string; message?: string }
      if (res.ok && json.url) { window.location.assign(json.url); return }
      setError(json.message ?? 'Could not start the payment. Please call the front desk.')
    } catch {
      setError('Could not reach the server. Please try again.')
    }
    setBusy(false)
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {showDeposit && (
          <button className="sq-btn sq-btn-primary" style={{ padding: '11px 20px' }} disabled={busy} onClick={() => pay('deposit')}>
            {busy ? 'One moment…' : `Pay ${formatCents(target.depositDueCents)} deposit`}
          </button>
        )}
        <button
          className={showDeposit ? 'sq-btn sq-btn-ghost' : 'sq-btn sq-btn-primary'}
          style={{ padding: '11px 20px' }} disabled={busy} onClick={() => pay('balance')}
        >
          {busy ? 'One moment…' : `Pay ${formatCents(target.balanceCents)} in full`}
        </button>
      </div>
      {error && (
        <p style={{ fontSize: 12.5, color: RED, margin: '12px 0 0', fontWeight: 600, lineHeight: 1.5 }}>{error}</p>
      )}
      <p style={{ fontSize: 11.5, color: FAINT, margin: '12px 0 0', lineHeight: 1.55 }}>
        Card or Cash App Pay — handled by Stripe, and we never see or store your card number.
      </p>

      {tag && (
        <div style={{ marginTop: 16, borderTop: `1px solid ${LINE}`, paddingTop: 14 }}>
          {claimed ? (
            <div style={{ background: '#e5f2ea', border: '1px solid #bcdfc9', borderRadius: 10, padding: '12px 14px' }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: '#1d6b3f', margin: '0 0 2px' }}>Thanks — we&rsquo;ll match it up.</p>
              <p style={{ fontSize: 12, color: SUB, margin: 0, lineHeight: 1.55 }}>
                Our team checks Cash App and confirms your payment, usually the same day. You&rsquo;ll get
                your receipt by email the moment it&rsquo;s confirmed — the balance here updates then too.
              </p>
            </div>
          ) : !cashOpen ? (
            <button
              onClick={() => setCashOpen(true)}
              style={{ font: 'inherit', fontSize: 12.5, color: SUB, background: 'none', border: 'none', textDecoration: 'underline', cursor: 'pointer', padding: 0 }}
            >
              Prefer Cash App? Pay our ${tag} directly
            </button>
          ) : (
            <div>
              <p style={{ fontSize: 13, fontWeight: 700, color: INK, margin: '0 0 6px' }}>Pay with Cash App</p>
              <ol style={{ fontSize: 12.5, color: SUB, margin: '0 0 12px', paddingLeft: 18, lineHeight: 1.7 }}>
                <li>Send <strong style={{ color: INK }}>{formatCents(cashAmount)}</strong> to <strong style={{ color: INK }}>${tag}</strong> — the button below opens it with the amount filled in.</li>
                <li>Put your booking code <strong style={{ color: INK }}>{bookingCode}</strong> in the note so we can match it.</li>
                <li>Come back here and tap &ldquo;I&rsquo;ve sent it.&rdquo;</li>
              </ol>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <a
                  className="sq-btn sq-btn-primary" style={{ padding: '10px 18px', textDecoration: 'none' }}
                  href={`https://cash.app/$${tag}/${(cashAmount / 100).toFixed(2)}`} target="_blank" rel="noopener noreferrer"
                >
                  Open Cash App — {formatCents(cashAmount)}
                </a>
                <button className="sq-btn sq-btn-ghost" style={{ padding: '10px 18px' }} disabled={busy} onClick={fileClaim}>
                  {busy ? 'One moment…' : 'I\u2019ve sent it'}
                </button>
              </div>
              <p style={{ fontSize: 11, color: FAINT, margin: '10px 0 0', lineHeight: 1.55 }}>
                Cash App payments are confirmed by a person at our desk before your booking shows paid —
                usually the same day. Card payments above confirm instantly.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
