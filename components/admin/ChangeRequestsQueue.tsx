'use client'
import { useEffect, useState } from 'react'
import { card, INK, SUB, FAINT, LINE, RED, GREEN } from '@/lib/theme'
import { formatCents } from '@/lib/format'
import { roomLabel } from '@/lib/facilities-store'
import { getActiveAddons } from '@/lib/addons-store'
import { rangeLabel } from '@/lib/booking-changes-store'
import { getPendingChangeRequests, decideChangeRequest, CHANGE_REQUESTS_EVENT, type ChangeRequest } from '@/lib/change-requests-store'
import { BOOKINGS_EVENT, type StaffBooking } from '@/lib/staff-bookings-store'

// Customer change requests (0057) — a new time, different rooms, or
// different extras. Nothing changes on a booking until someone here says
// yes; approving applies it in one step (and is refused if anything has
// been taken since), declining leaves the booking as it was. Either way
// the customer gets an email with the answer and any note.
export function ChangeRequestsQueue({ bookings, canDecide }: { bookings: StaffBooking[]; canDecide: boolean }) {
  const [reqs, setReqs] = useState<ChangeRequest[] | null>(null)
  const [addonName, setAddonName] = useState<Map<string, string>>(new Map())
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<Record<string, { ok: boolean; text: string }>>({})

  useEffect(() => {
    let on = true
    const sync = () => { getPendingChangeRequests().then((r) => { if (on) setReqs(r) }).catch(() => {}) }
    sync()
    getActiveAddons().then((a) => { if (on) setAddonName(new Map(a.map((x) => [x.id, x.name]))) }).catch(() => {})
    window.addEventListener(BOOKINGS_EVENT, sync)
    window.addEventListener(CHANGE_REQUESTS_EVENT, sync)
    return () => { on = false; window.removeEventListener(BOOKINGS_EVENT, sync); window.removeEventListener(CHANGE_REQUESTS_EVENT, sync) }
  }, [])

  if (!reqs || reqs.length === 0) return null
  const rooms = (ids: string[] | null) => (ids ?? []).map((id) => roomLabel(id).name).join(', ') || '—'
  const extras = (ids: string[] | null) => (ids ?? []).map((id) => addonName.get(id) ?? id).join(', ') || 'none'

  const decide = async (r: ChangeRequest, approve: boolean) => {
    if (busy) return
    const b = bookings.find((x) => x.id === r.bookingId)
    if (!window.confirm(approve
      ? `Approve this change${b ? ` to ${b.code}` : ''}? It's applied right away and the customer is emailed.`
      : `Decline this change${b ? ` to ${b.code}` : ''}? The booking stays as it is and the customer is emailed${notes[r.id]?.trim() ? ' your note' : ''}.`)) return
    setBusy(r.id)
    const res = await decideChangeRequest(r.id, approve, notes[r.id] ?? '')
    setBusy(null)
    setMsg((m) => ({ ...m, [r.id]: res.ok ? { ok: true, text: approve ? 'Approved — the customer has been emailed.' : 'Declined — the customer has been emailed.' } : { ok: false, text: res.message } }))
  }

  return (
    <div className="sq-card" style={{ ...card, overflow: 'hidden', marginBottom: 16, border: '1px solid #f0ddb8' }}>
      <div style={{ padding: '12px 20px', background: '#fdf3dc', borderBottom: `1px solid ${LINE}` }}>
        <p style={{ fontSize: 13, fontWeight: 700, color: '#5b4708', margin: 0 }}>
          {reqs.length} change request{reqs.length === 1 ? '' : 's'} waiting on you
        </p>
        <p style={{ fontSize: 12, color: SUB, margin: '2px 0 0', lineHeight: 1.5 }}>
          Customers asked to change their booking. Nothing has changed yet — approve to apply it, or decline to keep it as it is.
          {canDecide ? '' : ' Only an owner, admin, or manager can answer these.'}
        </p>
      </div>
      {reqs.map((r, i) => {
        const b = bookings.find((x) => x.id === r.bookingId)
        const m = msg[r.id]
        return (
          <div key={r.id} style={{ padding: '12px 20px', borderTop: i ? `1px solid ${LINE}` : 'none' }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: INK, margin: 0 }}>
              {b ? `${b.title} · ${b.code} · ${b.client}` : 'Booking'}
              <span style={{ fontWeight: 500, color: FAINT }}> · asked {new Date(r.createdAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                {r.source === 'agreement' ? ' on their rental agreement' : ' from My bookings'}</span>
            </p>
            <div style={{ fontSize: 12.5, color: SUB, margin: '4px 0 0', lineHeight: 1.6 }}>
              {r.newDuring && <div><strong style={{ color: INK }}>Time:</strong> <s>{rangeLabel(r.oldDuring)}</s> → <strong style={{ color: INK }}>{rangeLabel(r.newDuring)}</strong></div>}
              {r.newRoomIds && <div><strong style={{ color: INK }}>Rooms:</strong> <s>{rooms(r.oldRoomIds)}</s> → <strong style={{ color: INK }}>{rooms(r.newRoomIds)}</strong></div>}
              {r.newAddonIds && <div><strong style={{ color: INK }}>Extras:</strong> <s>{extras(r.oldAddonIds)}</s> → <strong style={{ color: INK }}>{extras(r.newAddonIds)}</strong></div>}
              {b && <div style={{ color: FAINT }}>Price now {formatCents(b.priceCents)}{b.paidCents > 0 ? ` · ${formatCents(b.paidCents)} paid` : ''} — approving doesn&rsquo;t change it; edit the price after if needed.</div>}
              {r.conflicts.length > 0
                ? <div style={{ color: RED, fontWeight: 600 }}>Not available: {rooms(r.conflicts)} {r.conflicts.length === 1 ? 'is' : 'are'} already booked then — approving will be refused.</div>
                : <div style={{ color: GREEN, fontWeight: 600 }}>Available — every room is free at that time.</div>}
            </div>
            {canDecide && !m?.ok && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 8 }}>
                <input className="sq-input" style={{ flex: 1, minWidth: 200, padding: '6px 10px', fontSize: 12.5 }} autoComplete="off"
                  placeholder="Note to the customer (optional) — e.g. the new price, or why not"
                  value={notes[r.id] ?? ''} onChange={(e) => setNotes((n) => ({ ...n, [r.id]: e.target.value }))} />
                <button className="sq-btn sq-btn-primary" style={{ padding: '6px 14px', fontSize: 11.5 }} disabled={busy === r.id || r.conflicts.length > 0}
                  onClick={() => decide(r, true)}>Approve</button>
                <button className="sq-btn sq-btn-ghost" style={{ padding: '6px 14px', fontSize: 11.5 }} disabled={busy === r.id}
                  onClick={() => decide(r, false)}>Decline</button>
              </div>
            )}
            {m && <p style={{ fontSize: 12, fontWeight: 600, color: m.ok ? GREEN : RED, margin: '6px 0 0' }}>{m.text}</p>}
          </div>
        )
      })}
    </div>
  )
}
