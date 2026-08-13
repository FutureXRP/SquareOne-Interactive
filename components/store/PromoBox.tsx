'use client'
import { useState } from 'react'
import { INK, SUB, FAINT, LINE, BLUE, GREEN } from '@/lib/theme'
import { checkCoupon, couponLabel, couponMessage, type Coupon } from '@/lib/coupons-store'

// "Have a code?" — checks it against the database and, once it's good,
// tells the plan cards to carry it through to signup.
export function PromoBox({ onApplied }: { onApplied: (code: string, coupon: Coupon) => void }) {
  const [code, setCode] = useState('')
  const [applied, setApplied] = useState<Coupon | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const apply = async () => {
    const typed = code.trim().toUpperCase()
    if (!typed || busy) return
    setBusy(true)
    setError(null)
    const res = await checkCoupon(typed, 'memberships')
    setBusy(false)
    if (res.ok) {
      setApplied(res.coupon)
      onApplied(typed, res.coupon)
    } else {
      setApplied(null)
      setError(couponMessage(res))
    }
  }

  if (applied) {
    return (
      <div style={{ background: '#e5f2ea', border: '1px solid #bfe0cc', borderRadius: 12, padding: '12px 16px', marginBottom: 18, textAlign: 'center' }}>
        <p style={{ fontSize: 13.5, fontWeight: 800, color: INK, margin: 0 }}>
          <span style={{ fontFamily: 'DM Mono, monospace' }}>{applied.code}</span> applied — {couponLabel(applied)}
        </p>
        <p style={{ fontSize: 12, color: SUB, margin: '3px 0 0' }}>
          {(applied.freeMonths ?? 0) > 0
            ? 'Pick your plan below. You’ll put a card on file, but nothing is charged until the free time is up.'
            : 'Pick your plan below and the discount comes off at checkout.'}
        </p>
        <button
          onClick={() => { setApplied(null); setCode(''); onApplied('', applied) }}
          style={{ font: 'inherit', cursor: 'pointer', border: 'none', background: 'transparent', color: BLUE, fontSize: 11.5, fontWeight: 600, marginTop: 4 }}
        >
          Use a different code
        </button>
      </div>
    )
  }

  return (
    <div style={{ marginBottom: 18, textAlign: 'center' }}>
      <div style={{ display: 'inline-flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center' }}>
        <input
          className="sq-input"
          style={{ width: 190, padding: '9px 12px', fontSize: 13, fontFamily: 'DM Mono, monospace', textTransform: 'uppercase', border: `1px solid ${LINE}`, borderRadius: 9 }}
          placeholder="Promo code"
          value={code}
          onChange={(e) => { setCode(e.target.value); setError(null) }}
          onKeyDown={(e) => { if (e.key === 'Enter') apply() }}
        />
        <button className="sq-btn sq-btn-ghost" style={{ padding: '9px 18px', fontSize: 13 }} disabled={busy || !code.trim()} onClick={apply}>
          {busy ? 'Checking…' : 'Apply'}
        </button>
      </div>
      {error
        ? <p style={{ fontSize: 12, color: '#b23f33', margin: '7px 0 0', fontWeight: 600 }}>{error}</p>
        : <p style={{ fontSize: 11.5, color: FAINT, margin: '7px 0 0' }}>Have a code from us? Enter it before choosing a plan.</p>}
      <span style={{ display: 'none', color: GREEN }} />
    </div>
  )
}
