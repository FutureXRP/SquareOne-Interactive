'use client'
import { agreementMatchesTime } from '@/lib/rental-agreement'
import { tulsaInstant } from '@/lib/tulsa-time'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { INK, SUB, FAINT, LINE, BLUE, GREEN, RED } from '@/lib/theme'
import { formatCents } from '@/lib/format'
import { FEE_PRESETS } from '@/lib/rental-agreement'
import { staffChargeFee } from '@/lib/billing-client'
import { bookingPayUrl, BOOKINGS_EVENT, type StaffBooking } from '@/lib/staff-bookings-store'
import { emit } from '@/lib/supabase'
import { openAgreementPdf, uploadSignedAgreement, type AgreementStatus } from '@/lib/agreements-store'
import { bookingWaiversDue } from '@/lib/waivers-staff'
import { getBookingChanges, rangeLabel, type BookingChange } from '@/lib/booking-changes-store'
import { roomLabel } from '@/lib/facilities-store'
import type { RequiredWaiver } from '@/lib/waiver-forms'

// A booking's paperwork, in its details panel: the signed Event Rental
// Agreement and the card on file — and, for owners/admins/managers, the
// drawer that charges an extra fee to that card as the agreement allows.

function dollarsToCents(v: string): number {
  const n = Number.parseFloat(v.replace(/[$,\s]/g, ''))
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : 0
}

export function BookingAgreementCard({ b, agreement, canCharge, leadCode }: {
  b: StaffBooking
  agreement: AgreementStatus | null | undefined // undefined = 0053 not run
  canCharge: boolean
  // A companion room (0055): its paperwork lives on this lead booking.
  leadCode?: string
}) {
  const [open, setOpen] = useState(false)
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [notified, setNotified] = useState(false)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null)
  // Attaching an agreement signed outside the system (0059).
  const [upOpen, setUpOpen] = useState(false)
  const [upSigner, setUpSigner] = useState('')
  const [upDate, setUpDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [upFile, setUpFile] = useState<File | null>(null)
  const [upBusy, setUpBusy] = useState(false)
  const [upMsg, setUpMsg] = useState<{ ok: boolean; text: string } | null>(null)
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

  // What's changed on this booking, and by whom (0056).
  const [changes, setChanges] = useState<BookingChange[]>([])
  useEffect(() => {
    if (b.leadBookingId) { setChanges([]); return }
    let live = true
    getBookingChanges(b.id).then((c) => { if (live) setChanges(c) }).catch(() => {})
    return () => { live = false }
  }, [b.id, b.leadBookingId, b.date, b.startH, b.roomId, b.status])

  // An extra room on someone else's booking: one line pointing at it.
  if (b.leadBookingId) {
    return (
      <div style={{ background: '#fff', border: `1px solid ${LINE}`, borderRadius: 10, padding: '10px 14px', margin: '0 0 12px', fontSize: 12.5, color: SUB, lineHeight: 1.6, maxWidth: 620 }}>
        <strong style={{ color: INK }}>Extra room for {leadCode ?? 'another booking'}.</strong>{' '}
        Its rental agreement, card on file, waivers, and payments are all on {leadCode ?? 'that booking'}
        {agreement ? <> — agreement <span style={{ color: GREEN, fontWeight: 700 }}>signed</span> by {agreement.signature}.</> : agreement === null ? <> — agreement <span style={{ color: RED, fontWeight: 700 }}>not signed yet</span>.</> : '.'}
        {' '}It moves and cancels with that booking.
      </div>
    )
  }

  // Before 0053 there's nothing to show — unless a waiver is owed.
  if (agreement === undefined && b.card === undefined && !(waivers && waivers.length > 0) && changes.length === 0) return null

  // Signed before the latest move or room change: it describes the old event.
  const lastMove = changes.find((c) => c.kind === 'moved' || c.kind === 'room')
  const startAt = tulsaInstant(b.date, b.startH)
  const agreementOutdated = !!agreement && (
    (!!lastMove && new Date(lastMove.at) > new Date(agreement.signedAt))
    || !agreementMatchesTime(agreement.snapshot, startAt, new Date(startAt.getTime() + b.hours * 3600_000))
  )
  const who = (c: BookingChange) => c.actor === 'customer' ? 'Customer' : c.actor === 'staff' ? 'Staff' : 'System'
  const describe = (c: BookingChange): string => {
    if (c.kind === 'moved') return `${who(c)} moved it: ${rangeLabel(c.oldDuring)} → ${rangeLabel(c.newDuring)}`
    if (c.kind === 'room') return `${who(c)} changed the room: ${c.oldRoomId ? roomLabel(c.oldRoomId).name : '—'} → ${c.newRoomId ? roomLabel(c.newRoomId).name : '—'}`
    if (c.kind === 'canceled') return `${who(c)} canceled it`
    const d = c.detail ?? {}
    return [
      'Customer asked on the agreement for',
      d.requested ? `spaces: ${d.requested.join(', ') || 'none'} (booked: ${(d.booked ?? []).join(', ')})` : '',
      d.addonsAdded?.length ? `extras added: ${d.addonsAdded.join(', ')}` : '',
      d.addonsDropped?.length ? `extras removed: ${d.addonsDropped.join(', ')}` : '',
    ].filter(Boolean).join(' ')
  }
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
              {agreement.source === 'uploaded' && <> · <span style={{ color: INK, fontWeight: 600 }}>signed outside the system (PDF uploaded)</span></>}
              {agreementOutdated && <> · <span style={{ color: RED, fontWeight: 700 }}>out of date — the booking changed after signing; their booking page asks them to sign again</span></>}
              {' · '}<button onClick={async () => { const r = await openAgreementPdf(b.id); if (!r.ok) setUpMsg({ ok: false, text: r.message ?? 'Could not open it.' }) }}
                style={{ font: 'inherit', color: BLUE, fontWeight: 600, background: 'none', border: 'none', padding: 0, cursor: 'pointer', textDecoration: 'underline' }}>Open PDF</button>
              {agreement.source !== 'uploaded' && <>{' · '}<Link href={`/admin/bookings/agreement/${b.id}`} style={{ color: BLUE, fontWeight: 600 }}>View / countersign</Link></>}
            </>
          : <>
              <span style={{ color: RED, fontWeight: 700 }}>not signed yet</span>
              {payUrl && <> · <a href={`${payUrl}/agreement`} target="_blank" rel="noopener noreferrer" style={{ color: BLUE, fontWeight: 600 }}>Open the signing page</a> (hand them a tablet, or it&rsquo;s linked in their booking emails)</>}
            </>}
      </p>
      {agreement !== undefined && (
        <div style={{ margin: '0 0 4px' }}>
          <button onClick={() => { setUpOpen((v) => !v); setUpMsg(null); if (!upSigner) setUpSigner(b.client) }}
            style={{ font: 'inherit', fontSize: 12, color: BLUE, fontWeight: 600, background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}>
            {upOpen ? 'Close' : agreement ? 'Replace with a PDF signed elsewhere…' : 'Signed it outside the system? Upload the signed PDF…'}
          </button>
          {upOpen && (
            <div style={{ marginTop: 6, padding: '10px 12px', background: '#fafbfd', borderRadius: 8 }}>
              <p style={{ fontSize: 11.5, color: SUB, margin: '0 0 8px', lineHeight: 1.5 }}>
                For an agreement e-signed in another app or signed on paper and scanned. Once attached, the booking counts as
                signed everywhere — the renter&rsquo;s booking page, this board, and the emails.
              </p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }}>
                <input className="sq-input" style={{ flex: 1, minWidth: 160, padding: '6px 10px', fontSize: 12.5 }} autoComplete="off"
                  placeholder="Who signed it" value={upSigner} onChange={(e) => setUpSigner(e.target.value)} />
                <input className="sq-input" type="date" style={{ width: 150, padding: '6px 10px', fontSize: 12.5 }}
                  value={upDate} onChange={(e) => setUpDate(e.target.value)} />
              </div>
              <input type="file" accept="application/pdf,.pdf" onChange={(e) => setUpFile(e.target.files?.[0] ?? null)} style={{ fontSize: 12, marginBottom: 8 }} />
              <div>
                <button className="sq-btn sq-btn-primary" style={{ padding: '6px 14px', fontSize: 12 }}
                  disabled={upBusy || !upFile || upSigner.trim().length < 2}
                  onClick={async () => {
                    if (!upFile) return
                    setUpBusy(true); setUpMsg(null)
                    const r = await uploadSignedAgreement(b.id, upSigner.trim(), upDate, upFile)
                    setUpBusy(false)
                    setUpMsg(r.ok ? { ok: true, text: 'Attached — this booking now shows the agreement as signed.' } : { ok: false, text: r.message ?? 'Upload failed.' })
                    if (r.ok) { setUpOpen(false); setUpFile(null) }
                  }}>
                  {upBusy ? 'Uploading…' : 'Attach signed agreement'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
      {upMsg && <p style={{ fontSize: 12, fontWeight: 600, color: upMsg.ok ? GREEN : RED, margin: '0 0 4px' }}>{upMsg.text}</p>}
      <p style={{ margin: 0 }}>
        <strong style={{ color: INK }}>Card on file:</strong>{' '}
        {b.card
          ? <><span style={{ color: GREEN, fontWeight: 700 }}>{cardLabel}</span> — for damages, cleaning, storage, or an unpaid balance</>
          : <>
              <span style={{ color: RED, fontWeight: 700 }}>none</span>
              {payUrl && <> · <a href={payUrl} target="_blank" rel="noopener noreferrer" style={{ color: BLUE, fontWeight: 600 }}>Open their booking page</a> to add one (paying online also saves it)</>}
            </>}
      </p>

      {changes.length > 0 && (
        <div style={{ marginTop: 6 }}>
          <strong style={{ color: INK }}>Changes:</strong>
          <ul style={{ margin: '2px 0 0', paddingLeft: 18 }}>
            {changes.slice(0, 5).map((c) => (
              <li key={c.id} style={{ color: c.actor === 'customer' ? INK : SUB }}>
                <span style={{ color: FAINT }}>{new Date(c.at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>{' · '}
                {describe(c)}
              </li>
            ))}
          </ul>
        </div>
      )}

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
