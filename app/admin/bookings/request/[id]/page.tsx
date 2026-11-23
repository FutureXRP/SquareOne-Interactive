'use client'
import Link from 'next/link'
import { use, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { card, INK, SUB, FAINT, LINE, RED, GREEN } from '@/lib/theme'
import { getRooms } from '@/lib/facilities-store'
import { getActiveAddons } from '@/lib/addons-store'
import { rangeLabel } from '@/lib/booking-changes-store'
import { getChangeRequest, decideChangeRequest, type ChangeRequestDetail } from '@/lib/change-requests-store'
import { getMyStaff, type StaffMember } from '@/lib/staff-store'

// One customer change request — the page the Approve / Decline buttons in
// the staff email open. The button only picks the answer; it's applied
// when someone here presses it (mail scanners open links on their own, so
// a link must never change a booking by itself).
export default function ChangeRequestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const search = useSearchParams()
  const wanted = search.get('decide') === 'decline' ? 'decline' : search.get('decide') === 'approve' ? 'approve' : null
  const [req, setReq] = useState<ChangeRequestDetail | null | undefined>(undefined)
  const [rooms, setRooms] = useState<Map<string, string>>(new Map())
  const [addons, setAddons] = useState<Map<string, string>>(new Map())
  const [me, setMe] = useState<StaffMember | null>(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null)

  const load = () => getChangeRequest(id).then(setReq).catch(() => setReq(null))
  useEffect(() => {
    load()
    getRooms().then((r) => setRooms(new Map(r.map((x) => [x.id, x.name])))).catch(() => {})
    getActiveAddons().then((a) => setAddons(new Map(a.map((x) => [x.id, x.name])))).catch(() => {})
    getMyStaff().then(setMe).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const canDecide = !!me && ['owner', 'admin', 'manager'].includes(me.role)
  const roomList = (ids: string[] | null) => (ids ?? []).map((x) => rooms.get(x) ?? x).join(', ') || '—'
  const extraList = (ids: string[] | null) => (ids ?? []).map((x) => addons.get(x) ?? x).join(', ') || 'none'

  const decide = async (approve: boolean) => {
    if (!req || busy) return
    setBusy(true); setResult(null)
    const res = await decideChangeRequest(req.id, approve, note)
    setBusy(false)
    if (res.ok) {
      setResult({ ok: true, text: approve ? 'Approved — the booking is updated and the customer has been emailed.' : 'Declined — the booking stays as it was and the customer has been emailed.' })
      load()
    } else {
      setResult({ ok: false, text: res.message })
    }
  }

  const row = (label: string, value: string, strong?: boolean) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, padding: '6px 0', borderBottom: `1px solid ${LINE}` }}>
      <span style={{ fontSize: 12.5, color: SUB }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: strong ? 800 : 600, color: INK, textAlign: 'right' }}>{value}</span>
    </div>
  )

  return (
    <div className="sq-page" style={{ padding: '30px 24px 40px', maxWidth: 620, margin: '0 auto' }}>
      <Link href="/admin/bookings" style={{ fontSize: 12.5, color: SUB, textDecoration: 'none' }}>← All bookings</Link>
      <div className="sq-card" style={{ ...card, padding: '22px 24px', marginTop: 12 }}>
        {req === undefined ? (
          <p style={{ fontSize: 13, color: SUB, margin: 0 }}>Loading…</p>
        ) : req === null ? (
          <p style={{ fontSize: 13, color: SUB, margin: 0 }}>This change request couldn&rsquo;t be found. It may have been removed with its booking.</p>
        ) : (
          <>
            <p style={{ fontSize: 11, fontWeight: 700, color: FAINT, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 4px' }}>Change request</p>
            <h1 style={{ fontSize: 19, fontWeight: 800, color: INK, margin: '0 0 4px', letterSpacing: '-0.02em' }}>
              {req.booking ? `${req.booking.clientName} · ${req.booking.code}` : 'Booking'}
            </h1>
            <p style={{ fontSize: 12.5, color: SUB, margin: '0 0 14px' }}>
              {req.source === 'agreement' ? 'Asked on their rental agreement' : 'Asked with “Request a new time” in My bookings'}
              {' · '}{new Date(req.createdAt).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
            </p>

            {req.booking && row('What', req.booking.title)}
            {req.newDuring
              ? <>{row('Time now', rangeLabel(req.oldDuring))}{row('Time asked for', rangeLabel(req.newDuring), true)}</>
              : req.booking && row('Time', rangeLabel(req.booking.during))}
            {req.newRoomIds
              ? <>{row('Rooms now', roomList(req.oldRoomIds))}{row('Rooms asked for', roomList(req.newRoomIds), true)}</>
              : row('Rooms', roomList(req.oldRoomIds))}
            {req.newAddonIds && <>{row('Add-ons now', extraList(req.oldAddonIds))}{row('Add-ons asked for', extraList(req.newAddonIds), true)}</>}

            {req.status !== 'pending' ? (
              <p style={{ fontSize: 13, color: INK, background: '#f4f7fb', borderRadius: 10, padding: '11px 13px', margin: '16px 0 0', lineHeight: 1.55 }}>
                {req.status === 'approved' ? 'This request was approved' : req.status === 'declined' ? 'This request was declined' : 'This request was withdrawn (replaced by a newer one, or the booking ended)'}
                {req.decidedAt ? ` on ${new Date(req.decidedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}` : ''}
                {' — nothing more to do.'}{req.decisionNote ? ` Note to the customer: “${req.decisionNote}”` : ''}
              </p>
            ) : (
              <>
                {req.conflicts.length > 0 && (
                  <p style={{ fontSize: 12.5, color: RED, background: '#fdecea', borderRadius: 10, padding: '10px 12px', margin: '14px 0 0', lineHeight: 1.5 }}>
                    <strong>Not available as asked:</strong> {req.conflicts.map((x) => rooms.get(x) ?? x).join(', ')} already booked then. Approving will be refused — decline it with a note, or call the customer.
                  </p>
                )}
                <label className="sq-label" htmlFor="cr-note" style={{ display: 'block', marginTop: 16 }}>Note to the customer (optional)</label>
                <textarea id="cr-note" className="sq-input" rows={3} value={note} onChange={(e) => setNote(e.target.value)}
                  placeholder={wanted === 'decline' ? 'e.g. The gym is booked that afternoon — we can do the same time Saturday.' : 'e.g. All set — see you then!'} />
                {!canDecide && me && (
                  <p style={{ fontSize: 12.5, color: RED, margin: '10px 0 0' }}>Only an owner, admin, or manager can answer change requests.</p>
                )}
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 14 }}>
                  <button className="sq-btn" disabled={busy || !canDecide} onClick={() => decide(true)}
                    style={{ padding: '10px 20px', background: GREEN, color: '#fff', border: 'none', outline: wanted === 'approve' ? `3px solid ${GREEN}55` : 'none' }}>
                    Approve change
                  </button>
                  <button className="sq-btn" disabled={busy || !canDecide} onClick={() => decide(false)}
                    style={{ padding: '10px 20px', background: RED, color: '#fff', border: 'none', outline: wanted === 'decline' ? `3px solid ${RED}55` : 'none' }}>
                    Decline change
                  </button>
                </div>
                <p style={{ fontSize: 11.5, color: FAINT, margin: '10px 0 0', lineHeight: 1.5 }}>
                  Approving applies the change right away; declining leaves the booking exactly as it is. The customer is emailed either way.
                  Approving doesn&rsquo;t change the price — update it afterward if needed.
                </p>
              </>
            )}
            {result && (
              <p style={{ fontSize: 13, fontWeight: 700, color: result.ok ? GREEN : RED, margin: '14px 0 0' }}>{result.text}</p>
            )}
          </>
        )}
      </div>
    </div>
  )
}
