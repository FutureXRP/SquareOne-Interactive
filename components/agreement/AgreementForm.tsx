'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { formatCents } from '@/lib/format'
import { AgreementTerms } from '@/components/agreement/AgreementDocument'
import {
  AGREEMENT_ADDRESS, AGREEMENT_SECTIONS, PHOTO_OPTIONS, SIGNATURE_STATEMENT,
  type AgreementSnapshot, type PhotoPermission,
} from '@/lib/rental-agreement'

// The fillable Event Rental Agreement. Everything the booking already
// knows — name, event, date, times, the room, the add-ons, the totals —
// arrives filled in; the renter supplies the rest, initials each section,
// picks a photo permission, and signs by typing their name. The server
// re-checks every required field before it saves.

const INK = '#1f2c42'
const SUB = '#64748c'
const FAINT = '#94a6bd'
const LINE = '#dbe4f0'
const RED = '#cf4436'

function Fixed({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '5px 0', borderBottom: '1px dashed #e7edf5' }}>
      <span style={{ fontSize: 12.5, color: SUB }}>{label}</span>
      <span style={{ fontSize: 12.5, fontWeight: 700, color: INK, textAlign: 'right' }}>{value || '—'}</span>
    </div>
  )
}

export function AgreementForm({ token, snapshot, rooms, addons, bookedRoom, bookedRooms = [], bookedAddons, resign = false }: {
  token: string
  snapshot: AgreementSnapshot
  rooms: string[]
  addons: string[]
  bookedRoom: string | null
  bookedRooms?: string[]
  // Signing again because the booking changed after the first signature.
  resign?: boolean
  bookedAddons: string[]
}) {
  const router = useRouter()
  const [address, setAddress] = useState('')
  const [phone, setPhone] = useState(snapshot.phone)
  const [guestCount, setGuestCount] = useState('')
  const booked = bookedRooms.length > 0 ? bookedRooms : (bookedRoom ? [bookedRoom] : [])
  const [spaces, setSpaces] = useState<string[]>(booked)
  const [picked, setPicked] = useState<string[]>(bookedAddons)
  const [initials, setInitials] = useState({ guidelines: '', expectations: '', fees: '' })
  const [photo, setPhoto] = useState<PhotoPermission | ''>('')
  const [signature, setSignature] = useState('')
  const [agree, setAgree] = useState(false)
  // Asking for different rooms or extras is a deliberate choice, never a
  // side effect of a checkbox — the renter confirms it separately.
  const [requestChange, setRequestChange] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // After a refresh brings in the booking as it is now, start the boxes
  // from that (what they typed elsewhere on the form is kept).
  const bookedKey = `${booked.join('|')}#${bookedAddons.join('|')}`
  useEffect(() => {
    setSpaces(booked)
    setPicked(bookedAddons)
    setRequestChange(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookedKey])

  const toggle = (list: string[], set: (v: string[]) => void, v: string) =>
    set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v])

  const roomList = [...new Set([...booked, ...rooms])]
  const asksForChange = spaces.length !== booked.length || spaces.some((r) => !booked.includes(r))
    || picked.length !== bookedAddons.length || picked.some((a) => !bookedAddons.includes(a))
  const addonList = [...new Set([...bookedAddons, ...addons])]

  const submit = async () => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/pay/${token}/agreement`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ address, phone, guestCount: Number(guestCount), spaces, addons: picked, initials, photoPermission: photo, signature, agree, requestChange: asksForChange && requestChange }),
      })
      const json = (await res.json().catch(() => ({}))) as { message?: string; changeRequested?: boolean; needsChangeConfirm?: boolean }
      // The booking changed while this page was open, so the boxes here
      // no longer match it — reload to show it as it is now.
      if (res.status === 409 && json.needsChangeConfirm && !asksForChange) {
        setError('Your booking was just updated by our team — this page has been refreshed. Please check the details and sign again.')
        setBusy(false)
        router.refresh()
        return
      }
      if (res.ok) {
        router.push(`/pay/${token}?signed=1${json.changeRequested ? '&asked=1' : ''}`)
        return
      }
      setError(json.message ?? 'Could not save the agreement — please try again.')
    } catch {
      setError('Could not reach the server — check your connection and try again.')
    }
    setBusy(false)
  }

  // Shown only when the boxes differ from the booking: say so plainly,
  // offer the way back, and make asking for the change its own decision.
  const changeBox = (
    <div style={{ fontSize: 11.5, color: '#5b4708', background: '#fdf3dc', borderRadius: 8, padding: '8px 10px', margin: '4px 0 8px', lineHeight: 1.45 }}>
      <p style={{ margin: '0 0 6px' }}>This is different from what you booked. Nothing changes unless you ask — our team reviews every change.</p>
      <label style={{ display: 'flex', alignItems: 'flex-start', gap: 7, cursor: 'pointer', margin: '0 0 6px', fontWeight: 700 }}>
        <input type="checkbox" checked={requestChange} onChange={(e) => setRequestChange(e.target.checked)} style={{ width: 15, height: 15, marginTop: 1 }} />
        Yes, I&rsquo;m asking to change my rooms or add-ons
      </label>
      <button type="button" className="sq-btn sq-btn-ghost" style={{ padding: '4px 10px', fontSize: 11.5 }}
        onClick={() => { setSpaces(booked); setPicked(bookedAddons); setRequestChange(false) }}>
        Reset to my booking
      </button>
    </div>
  )

  const initialBox = (id: 'guidelines' | 'expectations' | 'fees') => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '6px 0 4px', padding: '8px 12px', background: '#f4f7fb', borderRadius: 10 }}>
      <label htmlFor={`init-${id}`} style={{ fontSize: 12.5, fontWeight: 700, color: INK }}>Initial here to agree to this section</label>
      <input id={`init-${id}`} className="sq-input" style={{ width: 80, padding: '6px 9px', fontFamily: 'Georgia, serif', fontStyle: 'italic', textAlign: 'center' }}
        maxLength={5} placeholder="ABC" autoComplete="off"
        value={initials[id]} onChange={(e) => setInitials((cur) => ({ ...cur, [id]: e.target.value.toUpperCase() }))} />
    </div>
  )

  return (
    <div>
      <div style={{ textAlign: 'center', marginBottom: 14 }}>
        <p style={{ fontSize: 18, fontWeight: 800, color: INK, margin: 0 }}>SquareOne Event Rental Agreement</p>
        <p style={{ fontSize: 12, color: SUB, margin: '2px 0 0' }}>{AGREEMENT_ADDRESS}</p>
      </div>
      {resign && (
        <div style={{ background: '#fdf3dc', border: '1px solid #f0ddb8', borderRadius: 10, padding: '11px 14px', marginBottom: 16 }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: '#5b4708', margin: '0 0 2px' }}>Your booking changed since you signed</p>
          <p style={{ fontSize: 12.5, color: SUB, margin: 0, lineHeight: 1.5 }}>
            The date, time, or rooms below are the booking as it stands now. Please sign again so the agreement matches your event.
          </p>
        </div>
      )}

      <p style={{ fontSize: 13.5, fontWeight: 800, color: INK, textTransform: 'uppercase', letterSpacing: '0.04em', margin: '0 0 6px' }}>Renter information</p>
      <Fixed label="Renter name" value={snapshot.renterName} />
      <div style={{ margin: '10px 0' }}>
        <label className="sq-label" htmlFor="ag-address">Address</label>
        <input id="ag-address" className="sq-input" autoComplete="street-address" placeholder="Street, city, state, ZIP"
          value={address} onChange={(e) => setAddress(e.target.value)} />
      </div>
      <div style={{ margin: '0 0 10px' }}>
        <label className="sq-label" htmlFor="ag-phone">Phone number</label>
        <input id="ag-phone" className="sq-input" type="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
      </div>

      <p style={{ fontSize: 13.5, fontWeight: 800, color: INK, textTransform: 'uppercase', letterSpacing: '0.04em', margin: '14px 0 6px' }}>Event details</p>
      <Fixed label="Event type" value={snapshot.eventType} />
      <Fixed label="Event date" value={snapshot.eventDate} />
      <Fixed label="Event time" value={`${snapshot.timeFrom} – ${snapshot.timeTo}`} />
      <Fixed label="Setup time (arrive)" value={snapshot.setupTime} />
      <Fixed label="Leave time" value={snapshot.leaveTime} />
      <div style={{ margin: '10px 0' }}>
        <label className="sq-label" htmlFor="ag-guests">Estimated guest count</label>
        <input id="ag-guests" className="sq-input" style={{ maxWidth: 140 }} inputMode="numeric" autoComplete="off"
          value={guestCount} onChange={(e) => setGuestCount(e.target.value.replace(/\D/g, ''))} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 14, margin: '6px 0 4px' }}>
        <div>
          <p className="sq-label">Space(s) reserved</p>
          {roomList.map((r) => (
            <label key={r} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: INK, margin: '0 0 6px', cursor: 'pointer' }}>
              <input type="checkbox" checked={spaces.includes(r)} onChange={() => toggle(spaces, setSpaces, r)} style={{ width: 17, height: 17 }} />
              {r}
            </label>
          ))}
          {asksForChange && changeBox}
          <p style={{ fontSize: 11, color: FAINT, margin: '2px 0 0', lineHeight: 1.45 }}>
            The rooms you booked are already checked — leave them as they are unless you want to ask for different
            rooms. Any change is only a request: your booking stays as it is until our team approves it.
          </p>
        </div>
        {addonList.length > 0 && (
          <div>
            <p className="sq-label">Event add-on(s)</p>
            {addonList.map((a) => (
              <label key={a} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: INK, margin: '0 0 6px', cursor: 'pointer' }}>
                <input type="checkbox" checked={picked.includes(a)} onChange={() => toggle(picked, setPicked, a)} style={{ width: 17, height: 17 }} />
                {a}
              </label>
            ))}
            <p style={{ fontSize: 11, color: FAINT, margin: '2px 0 0', lineHeight: 1.45 }}>
              Add-ons you booked are already checked — leave them unless you want to ask for different ones. Any change is only a request; our team confirms availability and price first.
            </p>
          </div>
        )}
      </div>

      {AGREEMENT_SECTIONS.map((s) => (
        <div key={s.id}>
          <AgreementTerms section={s} />
          {initialBox(s.id)}
        </div>
      ))}

      <div style={{ borderTop: `1px solid ${LINE}`, padding: '12px 0 4px', margin: '8px 0 0' }}>
        <Fixed label="Total rental fee" value={formatCents(snapshot.totalCents)} />
        <Fixed label="Deposit (non-refundable)" value={formatCents(snapshot.depositCents)} />
        <Fixed label="Remaining balance" value={formatCents(snapshot.balanceCents)} />
      </div>

      <div style={{ borderTop: `1px solid ${LINE}`, padding: '14px 0 4px', margin: '8px 0 0' }}>
        <p className="sq-label">Photo &amp; social media permission (select one)</p>
        {PHOTO_OPTIONS.map((o) => (
          <label key={o.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 9, fontSize: 13, color: INK, margin: '0 0 8px', cursor: 'pointer', lineHeight: 1.5 }}>
            <input type="radio" name="photo" checked={photo === o.id} onChange={() => setPhoto(o.id)} style={{ width: 17, height: 17, marginTop: 2 }} />
            {o.label}
          </label>
        ))}
      </div>

      <div style={{ borderTop: `1px solid ${LINE}`, padding: '14px 0 0', margin: '8px 0 0' }}>
        <p style={{ fontSize: 14, fontWeight: 800, color: INK, margin: '0 0 6px' }}>Agreement &amp; signature</p>
        <p style={{ fontSize: 12.5, color: SUB, margin: '0 0 10px', lineHeight: 1.55 }}>{SIGNATURE_STATEMENT}</p>
        <label className="sq-label" htmlFor="ag-sign">Renter signature — type your full name</label>
        <input id="ag-sign" className="sq-input" autoComplete="off" placeholder={snapshot.renterName}
          style={{ fontFamily: 'Georgia, serif', fontStyle: 'italic', fontSize: 18 }}
          value={signature} onChange={(e) => setSignature(e.target.value)} />
        <p style={{ fontSize: 11.5, color: FAINT, margin: '4px 0 10px' }}>
          Date: {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })} · A SquareOne representative countersigns after review.
        </p>
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 9, fontSize: 13, color: INK, cursor: 'pointer', lineHeight: 1.5, margin: '0 0 14px' }}>
          <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} style={{ width: 17, height: 17, marginTop: 2 }} />
          I have read this entire agreement and agree to all of its terms. Typing my name above is my signature.
        </label>
        {error && <p style={{ fontSize: 12.5, color: RED, fontWeight: 600, margin: '0 0 10px', lineHeight: 1.5 }}>{error}</p>}
        <button className="sq-btn sq-btn-primary" style={{ width: '100%', padding: '12px 18px' }} disabled={busy} onClick={submit}>
          {busy ? 'Signing…' : 'Sign the rental agreement'}
        </button>
      </div>
    </div>
  )
}
