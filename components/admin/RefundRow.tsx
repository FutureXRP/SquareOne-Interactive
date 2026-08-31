'use client'
import { useState } from 'react'
import { INK, SUB, FAINT, LINE, BLUE, GREEN, RED } from '@/lib/theme'
import { formatCents } from '@/lib/format'
import { PAY_LABEL, voidPayment, type PaymentRow } from '@/lib/staff-bookings-store'
import { refundPayment } from '@/lib/refunds-store'

function dollarsToCents(v: string): number {
  const n = Number.parseFloat(v.replace(/[$,\s]/g, ''))
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : 0
}

// One payment with a refund drawer: type any amount up to what's left,
// give a reason, send it back. Cards return through Stripe; cash and
// Cash App are handed back at the desk and recorded here.
export function RefundRow({
  payment, refundedCents, staffId, refundsReady, last,
}: {
  payment: PaymentRow
  refundedCents: number
  staffId: string | null
  refundsReady: boolean
  last: boolean
}) {
  const remaining = payment.amountCents - refundedCents
  const [open, setOpen] = useState(false)
  const [amount, setAmount] = useState((remaining / 100).toFixed(2))
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const cents = dollarsToCents(amount)
  const tooMuch = cents > remaining
  const isCard = payment.method === 'stripe'
  const [undoError, setUndoError] = useState<string | null>(null)

  // Undo is for records that were a mistake — no money ever moved, so the
  // row is struck from the books entirely. Refund is for money that
  // really changed hands and goes back. Cards always refund (Stripe holds
  // the truth), and a partially refunded payment can't be "a mistake".
  const canUndo = !isCard && refundedCents === 0

  const undo = async () => {
    if (busy) return
    const label = PAY_LABEL[payment.method] ?? payment.method
    if (!window.confirm(
      `Undo the ${formatCents(payment.amountCents)} ${label} payment from ${payment.client}? `
      + `This strikes it from the books — the booking goes back to owing that amount, reports drop it, `
      + `and the customer is emailed a correction. Use Refund instead if money really changed hands.`,
    )) return
    setBusy(true)
    setUndoError(null)
    const res = await voidPayment(payment, staffId)
    setBusy(false)
    if (!res.ok) setUndoError(res.message ?? 'Could not undo that payment.')
  }

  const submit = async () => {
    if (busy || cents <= 0 || tooMuch) return
    const label = isCard ? 'back to their card' : `in ${PAY_LABEL[payment.method] ?? payment.method}`
    if (!window.confirm(`Refund ${formatCents(cents)} to ${payment.client} ${label}?`)) return
    setBusy(true)
    setError(null)
    const res = await refundPayment(payment, cents, reason.trim(), staffId)
    setBusy(false)
    if (res.ok) {
      setOpen(false)
      setReason('')
      return
    }
    setError(
      res.reason === 'not_migrated' ? 'Refunds need 0027_refunds.sql — run it in Supabase first.'
      : res.reason === 'too_much' ? 'That is more than is left on this payment.'
      : res.reason === 'stripe_failed' ? `Stripe refused the refund: ${res.message ?? 'unknown error'}`
      : res.message ?? 'The refund could not be recorded.',
    )
  }

  return (
    <div style={{ borderBottom: last ? 'none' : `1px solid ${LINE}` }}>
      <div className="sq-row" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 20px' }}>
        <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 11.5, color: FAINT, minWidth: 58 }}>{payment.code}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: INK, margin: 0 }}>
            {payment.client}
            {refundedCents > 0 && (
              <span style={{ fontSize: 10, fontWeight: 700, color: RED, background: '#fae7e4', padding: '1px 8px', borderRadius: 999, marginLeft: 8 }}>
                {remaining <= 0 ? 'refunded' : `${formatCents(refundedCents)} refunded`}
              </span>
            )}
          </p>
          {/* The whole story, never truncated — how they paid gets its own
              chip so the method reads at a glance, and the rest wraps. */}
          <p style={{ fontSize: 12, color: SUB, margin: '2px 0 0', lineHeight: 1.5, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span style={{
              fontSize: 10, fontWeight: 800, borderRadius: 999, padding: '1px 9px', textTransform: 'uppercase', letterSpacing: '0.04em',
              color: payment.method === 'stripe' ? '#2f6db8' : payment.method === 'cashapp' ? '#0f7a3d' : '#5b4708',
              background: payment.method === 'stripe' ? '#eef4fb' : payment.method === 'cashapp' ? '#e6f7ec' : '#faf0dc',
            }}>
              {PAY_LABEL[payment.method] ?? payment.method}
            </span>
            <span>{payment.memo} · {payment.when} · {payment.takenBy === '—' ? 'paid online' : `taken by ${payment.takenBy}`}</span>
          </p>
        </div>
        <span style={{ fontSize: 13.5, fontWeight: 700, color: remaining <= 0 ? FAINT : GREEN, minWidth: 70, textAlign: 'right', fontVariantNumeric: 'tabular-nums', textDecoration: remaining <= 0 ? 'line-through' : 'none' }}>
          {formatCents(payment.amountCents)}
        </span>
        {refundsReady && remaining > 0 && (
          <button className="sq-btn sq-btn-ghost" style={{ padding: '4px 11px', fontSize: 11 }} onClick={() => { setOpen((v) => !v); setAmount((remaining / 100).toFixed(2)); setError(null) }}>
            {open ? 'Close' : 'Refund'}
          </button>
        )}
        {canUndo && (
          <button className="sq-btn sq-btn-ghost" style={{ padding: '4px 11px', fontSize: 11, color: RED }} disabled={busy} onClick={undo} title="Recorded by mistake? Strike it from the books.">
            {busy ? '…' : 'Undo'}
          </button>
        )}
      </div>
      {undoError && (
        <p style={{ fontSize: 11.5, color: RED, fontWeight: 600, margin: 0, padding: '0 20px 10px 78px' }}>{undoError}</p>
      )}

      {open && (
        <div style={{ padding: '2px 20px 14px 78px', background: '#fafbfd' }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }}>
            <input className="sq-input" style={{ width: 110, padding: '7px 10px', fontSize: 12.5 }} inputMode="decimal"
              value={amount} onChange={(e) => setAmount(e.target.value)} />
            <button className="sq-btn sq-btn-ghost" style={{ padding: '6px 12px', fontSize: 11.5 }} onClick={() => setAmount((remaining / 100).toFixed(2))}>
              Full {formatCents(remaining)}
            </button>
            <input className="sq-input" style={{ flex: 1, minWidth: 160, padding: '7px 10px', fontSize: 12.5 }} placeholder="reason — rained out, double charge, canceled party"
              value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <button className="sq-btn sq-btn-danger" style={{ padding: '7px 15px', fontSize: 12 }} disabled={busy || cents <= 0 || tooMuch} onClick={submit}>
              {busy ? 'Refunding…' : `Refund ${formatCents(cents)}`}
            </button>
            <span style={{ fontSize: 11.5, color: tooMuch ? RED : SUB }}>
              {tooMuch
                ? `Only ${formatCents(remaining)} is left on this payment.`
                : isCard
                  ? 'Goes back to the card through Stripe — 5–10 business days to land.'
                  : payment.method === 'cash'
                    ? 'Hand the cash back — it comes out of the cash bag.'
                    : `Send it back by ${PAY_LABEL[payment.method] ?? payment.method}, then record it here.`}
            </span>
          </div>
          {error && <p style={{ fontSize: 11.5, color: RED, margin: '8px 0 0', fontWeight: 600 }}>{error}</p>}
          {payment.bookingId && (
            <p style={{ fontSize: 11, color: FAINT, margin: '6px 0 0' }}>
              Refunding money doesn&apos;t cancel the booking — cancel it on the Bookings tab if the event is off.
            </p>
          )}
          {!payment.bookingId && payment.method === 'stripe' && (
            <p style={{ fontSize: 11, color: FAINT, margin: '6px 0 0' }}>
              This looks like a membership charge. Refunding it doesn&apos;t cancel the membership — do that from the member&apos;s account or the Memberships tab.
            </p>
          )}
          <p style={{ fontSize: 11, color: FAINT, margin: '4px 0 0' }}>
            <span style={{ color: BLUE, fontWeight: 600 }}>{formatCents(remaining)}</span> refundable of {formatCents(payment.amountCents)} collected.
          </p>
        </div>
      )}
    </div>
  )
}
