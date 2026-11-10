'use client'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { INK, SUB, FAINT, LINE, BLUE, GREEN, RED } from '@/lib/theme'
import { formatCents } from '@/lib/format'
import { FEE_PRESETS } from '@/lib/rental-agreement'
import { staffChargeFee } from '@/lib/billing-client'
import { bookingPayUrl, BOOKINGS_EVENT, type StaffBooking } from '@/lib/staff-bookings-store'
import { emit } from '@/lib/supabase'
import type { AgreementStatus } from '@/lib/agreements-store'
import { bookingWaiversDue } from '@/lib/waivers-staff'
import type { RequiredWaiver } from '@/lib/waiver-forms'

// A booking's paperwork, in its details panel: the signed Event Rental
// Agreement and the card on file — and, for owners/admins/managers, the
// drawer that charges an extra fee to that card as the agreement allows.

function dollarsToCents(v: string): number {
  const n = Number.parseFloat(v.replace(/[$,\s]/g, ''))
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : 0
}

export function BookingAgreementCard({ b, agreement, canCharge }: {
  b: StaffBooking
  agreement: AgreementStatus | null | undefined // undefined = 0053 not run
  canCharge: boolean
}) {
  const [open, setOpen] = useState(false)
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [notified, setNotified] = useState(false)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null)
  // Waivers the room requires that nobody has signed for this booking.
  // null while loading; companions ride on their lead and owe nothing.
  const [waivers, setWaivers] = useState<RequiredWaiver[] | null>(null)
  useEffect(() => {
    if (b.leadBookingId || b.status === 'canceled' || b.priceCents === 0) { setWaivers([]); return }
    let live = true
    bookingWaiversDue({ id: b.id, roomId: b.roomId, accountId: b.accountId, createdAt: b.createdAt })
      .then((w) => { if (live) setWaivers(w) })
      .catch(() => { if (live) setWaivers([]) })
    return () => { live = false }
  }, [b.id, b.roomId, b.accountId, b.createdAt, b.leadBookingId, b.status])

  // Before 0053 there's nothing to show — unless a waiver is owed.
  if (agreement === undefined && b.card === undefined && !(waivers && waivers.length > 0)) return null
  const payUrl = bookingPayUrl(b)
  const cents = dollarsToCents(amount)
  const cardLabel = b.card ? `${b.card.brand.replace(/^./, (c) => c.toUpperCase())} ••${b.card.last4}` : ''

  const charge = async () => {
    if (busy || cents <= 0 || !reason.trim() || !notified || !b.card) return
    if (!window.confirm(`Charge ${formatCents(cents)} to ${cardLabel} for "${reason.trim()}"? This charges the card right now, adds the fee to the booking, and emails the renter a receipt.`)) return
    setBusy(true)
    setNote(null)
    const res = await staffChargeFee(b.id, cents, reason.trim(), notified)
    setBusy(false)
    if (res.ok) {
      setNote({ ok: true, text: `Charged ${formatCents(cents)} to ${res.card ?? cardLabel}. Receipt emailed to the renter.` })
      setAmount(''); setReason(''); setNotified(false); setOpen(false)
      emit(BOOKINGS_EVENT) // the fee changed the total — refresh the list
    } else {
      setNote({ ok: false, text: res.message ?? 'The charge did not go through.' })
    }
  }

  return (
    <div style={{ background: '#fff', border: `1px solid ${LINE}`, borderRadius: 10, padding: '10px 14px', margin: '0 0 12px', fontSize: 12.5, color: SUB, lineHeight: 1.7, maxWidth: 620 }}>
      {waivers && waivers.length > 0 && (
        // Waivers come before money — online that's enforced; at the desk
        // it's this warning, right where payment is taken.
        <div style={{ background: '#fdecea', border: '1px solid #f3c4bf', borderRadius: 8, padding: '8px 11px', margin: '2px 0 8px', color: INK, lineHeight: 1.5 }}>
          <strong style={{ color: RED }}>Waiver not signed:</strong>{' '}
          {waivers.map((w) => w.name).join(', ')}.{' '}
          {b.paidCents < b.priceCents
            ? 'Have them sign before you take any payment — '
            : 'This needs signing before the event — guests don’t sign at the door — '}
          {payUrl
            ? <><a href={payUrl} target="_blank" rel="noopener noreferrer" style={{ color: BLUE, fontWeight: 600 }}>open their booking page</a> (it&rsquo;s the first step there; hand them a tablet, or it&rsquo;s linked in their emails).</>
            : 'it’s the first step on their booking page.'}
        </div>
      )}
      {waivers && waivers.length === 0 && !b.leadBookingId && b.status !== 'canceled' && b.priceCents > 0 && (
        <p style={{ margin: 0 }}><strong style={{ color: INK }}>Waivers:</strong> <span style={{ color: GREEN, fontWeight: 700 }}>none owed</span></p>
      )}
      <p style={{ margin: 0 }}>
        <strong style={{ color: INK }}>Rental agreement:</strong>{' '}
        {agreement
          ? <>
              <span style={{ color: GREEN, fontWeight: 700 }}>signed</span> by {agreement.signature} on{' '}
              {new Date(agreement.signedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              {agreement.repName ? ` · countersigned by ${agreement.repName}` : ' · needs countersignature'}
              {' · '}<Link href={`/admin/bookings/agreement/${b.id}`} style={{ color: BLUE, fontWeight: 600 }}>View / print</Link>
            </>
          : <>
              <span style={{ color: RED, fontWeight: 700 }}>not signed yet</span>
              {payUrl && <> · <a href={`${payUrl}/agreement`} target="_blank" rel="noopener noreferrer" style={{ color: BLUE, fontWeight: 600 }}>Open the signing page</a> (hand them a tablet, or it&rsquo;s linked in their booking emails)</>}
            </>}
      </p>
      <p style={{ margin: 0 }}>
        <strong style={{ color: INK }}>Card on file:</strong>{' '}
        {b.card
          ? <><span style={{ color: GREEN, fontWeight: 700 }}>{cardLabel}</span> — for damages, cleaning, storage, or an unpaid balance</>
          : <>
              <span style={{ color: RED, fontWeight: 700 }}>none</span>
              {payUrl && <> · <a href={payUrl} target="_blank" rel="noopener noreferrer" style={{ color: BLUE, fontWeight: 600 }}>Open their booking page</a> to add one (paying online also saves it)</>}
            </>}
      </p>

      {b.card && canCharge && (
        <div style={{ marginTop: 6 }}>
          <button className="sq-btn sq-btn-ghost" style={{ padding: '4px 11px', fontSize: 11.5 }} onClick={() => { setOpen((v) => !v); setNote(null) }}>
            {open ? 'Close' : 'Charge an extra fee to this card'}
          </button>
          {open && (
            <div style={{ marginTop: 8, padding: '10px 12px', background: '#fafbfd', borderRadius: 8 }}>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                {FEE_PRESETS.map((f) => (
                  <button key={f.label} className="sq-btn sq-btn-ghost" style={{ padding: '4px 10px', fontSize: 11 }}
                    onClick={() => { setAmount((f.cents / 100).toFixed(2)); setReason(f.reason) }}>
                    {f.label}
                  </button>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }}>
                <input className="sq-input" style={{ width: 110, padding: '6px 10px', fontSize: 12.5 }} inputMode="decimal" autoComplete="off"
                  placeholder="$ amount" value={amount} onChange={(e) => setAmount(e.target.value)} />
                <input className="sq-input" style={{ flex: 1, minWidth: 180, padding: '6px 10px', fontSize: 12.5 }} autoComplete="off"
                  placeholder="reason the renter will see — e.g. stained carpet in Dining Hall" value={reason} onChange={(e) => setReason(e.target.value)} />
              </div>
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12, color: INK, cursor: 'pointer', margin: '0 0 8px', lineHeight: 1.45 }}>
                <input type="checkbox" checked={notified} onChange={(e) => setNotified(e.target.checked)} style={{ marginTop: 2 }} />
                I&rsquo;ve told the renter about this charge (call or text) — the agreement promises they&rsquo;re notified before the card is charged.
              </label>
              <button className="sq-btn sq-btn-danger" style={{ padding: '6px 14px', fontSize: 12 }}
                disabled={busy || cents <= 0 || !reason.trim() || !notified} onClick={charge}>
                {busy ? 'Charging…' : cents > 0 ? `Charge ${formatCents(cents)} to ${cardLabel}` : 'Charge the card'}
              </button>
              <p style={{ fontSize: 11, color: FAINT, margin: '6px 0 0' }}>
                The fee is added to the booking total and recorded as a card payment, so it shows in collected and can be refunded from Payments.
              </p>
            </div>
          )}
        </div>
      )}
      {note && <p style={{ fontSize: 12, fontWeight: 600, color: note.ok ? GREEN : RED, margin: '6px 0 0' }}>{note.text}</p>}
    </div>
  )
}
