'use client'
import { useState } from 'react'
import { card, INK, SUB, FAINT, LINE, GREEN, RED } from '@/lib/theme'
import { formatCents } from '@/lib/format'
import { supabase } from '@/lib/supabase'

// "Stripe took it but we never recorded it." The webhook is the normal
// path, but it's a delivery and deliveries fail — a wrong endpoint URL, a
// mismatched signing secret, a deploy mid-flight. This asks Stripe what it
// actually charged and pulls in anything missing, so a missed event is a
// delay rather than a customer holding a receipt for a booking that says
// unpaid.

interface Recovered { kind: 'booking' | 'membership'; amountCents: number; reference: string; detail: string }
interface Result { checked: number; recovered: Recovered[]; totalCents: number; lookbackDays: number }

export function ReconcileStripe() {
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<Result | null>(null)
  const [error, setError] = useState<string | null>(null)

  const run = async () => {
    if (busy) return
    setBusy(true); setError(null); setResult(null)
    try {
      const { data } = await supabase().auth.getSession()
      const res = await fetch('/api/billing/reconcile', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${data.session?.access_token ?? ''}` },
        body: JSON.stringify({ days: 30 }),
      })
      const json = (await res.json().catch(() => ({}))) as Result & { message?: string }
      if (!res.ok) { setError(json.message ?? 'Could not check Stripe.'); setBusy(false); return }
      setResult(json)
    } catch {
      setError('Could not reach the server.')
    }
    setBusy(false)
  }

  return (
    <div className="sq-card" style={{ ...card, padding: '16px 20px', marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <p style={{ fontSize: 12.5, fontWeight: 700, color: INK, margin: '0 0 2px' }}>Missing a payment?</p>
          <p style={{ fontSize: 12, color: SUB, margin: 0, lineHeight: 1.5 }}>
            If a customer&rsquo;s card was charged but their booking still reads unpaid, the webhook
            didn&rsquo;t reach us. This asks Stripe directly and records anything we missed.
          </p>
        </div>
        <button className="sq-btn sq-btn-ghost" style={{ padding: '8px 15px', fontSize: 12 }} disabled={busy} onClick={run}>
          {busy ? 'Checking Stripe…' : 'Check Stripe for missed payments'}
        </button>
      </div>

      {error && <p style={{ fontSize: 12, color: RED, margin: '12px 0 0', fontWeight: 600 }}>{error}</p>}

      {result && (
        <div style={{ marginTop: 13, borderTop: `1px solid ${LINE}`, paddingTop: 12 }}>
          {result.recovered.length === 0 ? (
            <p style={{ fontSize: 12.5, color: SUB, margin: 0, lineHeight: 1.55 }}>
              Checked {result.checked} Stripe payment{result.checked === 1 ? '' : 's'} from the last
              {' '}{result.lookbackDays} days — every one of them is already recorded here. Nothing was missed.
            </p>
          ) : (
            <>
              <p style={{ fontSize: 12.5, fontWeight: 700, color: GREEN, margin: '0 0 8px' }}>
                Recovered {result.recovered.length} payment{result.recovered.length === 1 ? '' : 's'} worth {formatCents(result.totalCents)}.
              </p>
              {result.recovered.map((r) => (
                <div key={r.reference} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '4px 0' }}>
                  <span style={{ fontSize: 12, color: SUB, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {r.detail} <span style={{ color: FAINT }}>· {r.kind}</span>
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: INK, fontVariantNumeric: 'tabular-nums' }}>{formatCents(r.amountCents)}</span>
                </div>
              ))}
              <p style={{ fontSize: 11.5, color: FAINT, margin: '10px 0 0', lineHeight: 1.55 }}>
                Receipts have gone out and the bookings are marked paid. Worth fixing the webhook so
                this isn&rsquo;t needed again — the Go live tab checks it.
              </p>
            </>
          )}
        </div>
      )}
    </div>
  )
}
