'use client'
import { useEffect, useState } from 'react'
import { card, INK, SUB, LINE, GREEN, RED } from '@/lib/theme'
import { formatCents } from '@/lib/format'
import { getPendingClaims, resolveClaim, CLAIMS_EVENT, type PaymentClaim } from '@/lib/claims-store'
import { getStaffBookings, recordPayment, BOOKINGS_EVENT } from '@/lib/staff-bookings-store'
import { getMyStaff, type StaffMember } from '@/lib/staff-store'

// Customers who said "I paid your $cashtag." Open the real Cash App app,
// find the matching amount with the booking code in the note, and confirm —
// that's the moment it becomes a payment, flips the booking, and sends the
// receipt. Reject anything you can't find; the pay link still works.
export function CashAppClaims() {
  const [claims, setClaims] = useState<PaymentClaim[] | null>(null)
  const [me, setMe] = useState<StaffMember | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)

  useEffect(() => {
    let on = true
    const sync = () => {
      getPendingClaims().then((c) => { if (on) setClaims(c) }).catch(() => { if (on) setClaims([]) })
    }
    sync()
    getMyStaff().then((m) => { if (on) setMe(m) }).catch(() => {})
    window.addEventListener(CLAIMS_EVENT, sync)
    window.addEventListener(BOOKINGS_EVENT, sync)
    return () => { on = false; window.removeEventListener(CLAIMS_EVENT, sync); window.removeEventListener(BOOKINGS_EVENT, sync) }
  }, [])

  // Nothing pending (or migration 0040 not run): stay out of the way.
  if (!claims || claims.length === 0) return null

  const confirm = async (c: PaymentClaim) => {
    if (busyId) return
    setBusyId(c.id); setNote(null)
    // The payment first — recordPayment writes the ledger row, flips the
    // booking, and sends the deposit/paid-in-full email. Then the claim.
    const bookings = await getStaffBookings()
    const b = bookings.find((x) => x.id === c.bookingId)
    const paid = b ? await recordPayment(b, 'cashapp', me?.id ?? null, c.amountCents) : false
    if (paid) {
      await resolveClaim(c.id, 'confirmed', me?.id ?? null)
      setNote(`Confirmed ${formatCents(c.amountCents)} from ${c.client} — receipt sent.`)
    } else {
      setNote('Could not record that payment — is the booking still active?')
    }
    setBusyId(null)
  }

  const reject = async (c: PaymentClaim) => {
    if (busyId) return
    if (!window.confirm(`No ${formatCents(c.amountCents)} from ${c.client} in Cash App? This dismisses their report — they can pay again from the same link.`)) return
    setBusyId(c.id); setNote(null)
    await resolveClaim(c.id, 'rejected', me?.id ?? null)
    setBusyId(null)
  }

  return (
    <div className="sq-card" style={{ ...card, marginBottom: 16, overflow: 'hidden', border: '1px solid #e8d9a8' }}>
      <div style={{ padding: '12px 20px', background: '#fdf3dc', borderBottom: `1px solid ${LINE}` }}>
        <p style={{ fontSize: 13, fontWeight: 700, color: '#5b4708', margin: 0 }}>
          {claims.length} Cash App payment{claims.length === 1 ? '' : 's'} to verify
        </p>
        <p style={{ fontSize: 12, color: SUB, margin: '2px 0 0', lineHeight: 1.5 }}>
          Open Cash App, find the matching amount with the booking code in the note, then confirm.
          Confirming records the payment, marks the booking paid, and emails their receipt.
        </p>
      </div>
      {claims.map((c, i) => (
        <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 20px', borderBottom: i < claims.length - 1 ? `1px solid ${LINE}` : 'none', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: INK, margin: 0 }}>
              {formatCents(c.amountCents)} · {c.client}
            </p>
            <p style={{ fontSize: 12, color: SUB, margin: 0 }}>
              {c.bookingTitle} · note should say <strong style={{ color: INK }}>{c.bookingCode}</strong> · reported {new Date(c.createdAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
            </p>
          </div>
          <button className="sq-btn sq-btn-primary" style={{ padding: '6px 13px', fontSize: 11.5 }} disabled={busyId === c.id} onClick={() => confirm(c)}>
            {busyId === c.id ? 'Working…' : 'Found it — confirm'}
          </button>
          <button className="sq-btn sq-btn-ghost" style={{ padding: '6px 13px', fontSize: 11.5, color: RED }} disabled={busyId === c.id} onClick={() => reject(c)}>
            Not there
          </button>
        </div>
      ))}
      {note && (
        <p style={{ fontSize: 12, fontWeight: 600, color: note.startsWith('Confirmed') ? GREEN : RED, margin: 0, padding: '10px 20px', borderTop: `1px solid ${LINE}` }}>
          {note}
        </p>
      )}
    </div>
  )
}
