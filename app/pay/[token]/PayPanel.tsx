'use client'
import { useState } from 'react'
import { FAINT, RED } from '@/lib/theme'
import { formatCents } from '@/lib/format'
import type { PayTarget } from '@/lib/server/pay-links'

// The buttons on a booking's pay link. Deposit when one is still owed and
// smaller than the balance, otherwise just the balance.
export function PayPanel({ token, target }: { token: string; target: PayTarget }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const showDeposit = target.depositDueCents > 0 && target.depositDueCents < target.balanceCents

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
    </div>
  )
}
