'use client'
import { useState } from 'react'

// Sends the renter to Stripe to save a card on file for this booking —
// verified and stored, nothing charged. Stripe hands them back to the
// pay page, which records the card.
export function CardOnFileButton({ token, replace }: { token: string; replace?: boolean }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const go = async () => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/pay/${token}/card`, { method: 'POST' })
      const json = (await res.json().catch(() => ({}))) as { url?: string; message?: string }
      if (res.ok && json.url) { window.location.assign(json.url); return }
      setError(json.message ?? 'Could not start adding a card — please call the front desk.')
    } catch {
      setError('Could not reach the server — try again.')
    }
    setBusy(false)
  }

  return (
    <div>
      <button className={replace ? 'sq-btn sq-btn-ghost' : 'sq-btn sq-btn-primary'} style={{ padding: replace ? '6px 13px' : '9px 16px', fontSize: replace ? 12 : 13 }} disabled={busy} onClick={go}>
        {busy ? 'One moment…' : replace ? 'Use a different card' : 'Add a card on file'}
      </button>
      {error && <p style={{ fontSize: 12, color: '#cf4436', fontWeight: 600, margin: '6px 0 0' }}>{error}</p>}
    </div>
  )
}
