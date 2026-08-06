'use client'
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { card, INK, SUB, FAINT, LINE, BLUE, GREEN } from '@/lib/theme'
import { formatCents, formatHour } from '@/lib/format'
import { HOURS } from '@/lib/store-data'
import { getRoom, type RoomConfig } from '@/lib/facilities-store'
import { addBooking, getProfile, hasWaiver, hashString, mulberry32, type DemoBooking } from '@/lib/demo-session'
import { WaiverPanel } from '@/components/store/WaiverPanel'
import { RENTAL_WAIVER } from '@/lib/waiver-defs'

interface DayOption {
  iso: string
  label: string
  weekday: string
  isSunday: boolean
}

export function BookingFlow({ facilityId }: { facilityId: string }) {
  const [f, setF] = useState<RoomConfig | null>(null)
  const [days, setDays] = useState<DayOption[]>([])
  const [dayIdx, setDayIdx] = useState(0)
  const [hours, setHours] = useState(1)
  const [startH, setStartH] = useState<number | null>(null)
  const [signedIn, setSignedIn] = useState(false)
  const [needsWaiver, setNeedsWaiver] = useState(false)
  const [confirmed, setConfirmed] = useState<DemoBooking | null>(null)

  // Dates come from the real clock, so they render client-side only.
  useEffect(() => {
    const out: DayOption[] = []
    const now = new Date()
    for (let i = 0; i < 14; i++) {
      const d = new Date(now)
      d.setDate(now.getDate() + i)
      out.push({
        iso: d.toISOString().slice(0, 10),
        label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        weekday: i === 0 ? 'Today' : d.toLocaleDateString('en-US', { weekday: 'short' }),
        isSunday: d.getDay() === 0,
      })
    }
    setDays(out)
    setSignedIn(!!getProfile())
    const room = getRoom(facilityId)
    setF(room)
    if (room) setHours((h) => Math.max(h, room.minHours))
    const sync = () => setSignedIn(!!getProfile())
    window.addEventListener('sq-session', sync)
    return () => window.removeEventListener('sq-session', sync)
  }, [facilityId])

  const day = days[dayIdx]
  const dayHours = day?.isSunday ? HOURS[1] : HOURS[0]

  // Deterministic availability per zone+date (seeded RNG, house rules).
  const slots = useMemo(() => {
    if (!day) return []
    const rng = mulberry32(hashString(`${facilityId}-${day.iso}`))
    const open = Math.ceil(dayHours.openH)
    const out: { startH: number; available: boolean }[] = []
    for (let h = open; h + hours <= dayHours.closeH; h++) {
      out.push({ startH: h, available: rng() > 0.3 })
    }
    return out
  }, [day, dayHours, facilityId, hours])

  if (!f) return null

  const priceCents = f.id === 'party'
    ? 27900 + Math.max(0, hours - 2) * 9900
    : f.perHourCents * hours

  const requestHold = () => {
    if (!day || startH == null) return
    // The facility rental waiver is part of booking — sign once, then book.
    if (!hasWaiver(RENTAL_WAIVER.id)) {
      setNeedsWaiver(true)
      return
    }
    placeHold()
  }

  const placeHold = () => {
    if (!day || startH == null) return
    const booking = addBooking({
      zoneId: f.id,
      date: day.iso,
      startH,
      hours,
      priceCents,
      status: 'hold',
    })
    setNeedsWaiver(false)
    setConfirmed(booking)
  }

  if (confirmed && day) {
    return (
      <div className="sq-card" style={{ ...card, padding: '30px 32px', maxWidth: 560 }}>
        <div style={{ width: 40, height: 40, borderRadius: 11, background: '#e5f2ea', color: GREEN, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
          <svg width="20" height="20" viewBox="0 0 16 16" fill="none"><path d="M3 8.5l3.2 3.2L13 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </div>
        <h2 style={{ fontSize: 20, fontWeight: 800, color: INK, margin: '0 0 8px', letterSpacing: '-0.02em' }}>Your slot is on hold</h2>
        <p style={{ fontSize: 13.5, color: SUB, margin: '0 0 16px', lineHeight: 1.6 }}>
          <strong style={{ color: INK }}>{f.name}</strong> · {day.weekday}, {day.label} ·{' '}
          {formatHour(confirmed.startH)}–{formatHour(confirmed.startH + confirmed.hours)} · {formatCents(confirmed.priceCents)}
        </p>
        <div style={{ background: '#faf0dc', border: '1px solid #f0ddb8', borderRadius: 10, padding: '12px 14px', marginBottom: 18 }}>
          <p style={{ fontSize: 12.5, color: '#7a5a14', margin: 0, lineHeight: 1.55 }}>
            <strong>Hold {confirmed.id}</strong> — pay the deposit within 24 hours to confirm.
            Unpaid holds release automatically. (Demo: checkout with Stripe arrives in Phase 2.)
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Link href="/account/bookings" className="sq-btn sq-btn-primary">View my bookings</Link>
          <Link href="/facilities" className="sq-btn sq-btn-ghost">Book another room</Link>
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 1.6fr) minmax(250px, 1fr)', gap: 18 }} className="sq-grid-2">
      <div>
        {/* Date picker */}
        <p className="sq-label">Pick a date</p>
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 6, marginBottom: 18 }}>
          {days.map((d, i) => (
            <button key={d.iso} onClick={() => { setDayIdx(i); setStartH(null) }} style={{
              font: 'inherit', cursor: 'pointer', flexShrink: 0, textAlign: 'center',
              border: `1.5px solid ${i === dayIdx ? BLUE : LINE}`, borderRadius: 10,
              background: i === dayIdx ? '#eef4fb' : '#fff', padding: '8px 13px',
            }}>
              <span style={{ display: 'block', fontSize: 10.5, fontWeight: 600, color: i === dayIdx ? BLUE : FAINT }}>{d.weekday}</span>
              <span style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: i === dayIdx ? BLUE : INK, fontVariantNumeric: 'tabular-nums' }}>{d.label}</span>
            </button>
          ))}
        </div>

        {/* Duration — rentals run up to 8 hours */}
        <p className="sq-label">How long?</p>
        <div style={{ display: 'flex', gap: 8, marginBottom: 18, flexWrap: 'wrap' }}>
          {[1, 2, 3, 4, 5, 6, 7, 8].filter((h) => h >= f.minHours).map((h) => (
            <button key={h} onClick={() => { setHours(h); setStartH(null) }} style={{
              font: 'inherit', cursor: 'pointer', fontSize: 12.5, fontWeight: 600,
              color: h === hours ? '#fff' : SUB, background: h === hours ? BLUE : '#fff',
              border: `1.5px solid ${h === hours ? BLUE : LINE}`, borderRadius: 999, padding: '6px 16px',
            }}>
              {h} hour{h > 1 ? 's' : ''}
            </button>
          ))}
        </div>

        {/* Slots */}
        <p className="sq-label">Available start times {day ? `· ${day.weekday} ${day.label}` : ''}</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(92px, 1fr))', gap: 8 }}>
          {slots.map((s) => (
            <button key={s.startH} disabled={!s.available} onClick={() => setStartH(s.startH)} style={{
              font: 'inherit', cursor: s.available ? 'pointer' : 'default',
              fontSize: 12.5, fontWeight: 600, fontVariantNumeric: 'tabular-nums',
              color: !s.available ? '#c3cede' : s.startH === startH ? '#fff' : INK,
              background: !s.available ? '#f3f6fb' : s.startH === startH ? BLUE : '#fff',
              border: `1.5px solid ${s.startH === startH ? BLUE : LINE}`,
              borderRadius: 9, padding: '9px 4px',
              textDecoration: s.available ? 'none' : 'line-through',
            }}>
              {formatHour(s.startH)}
            </button>
          ))}
          {day && slots.length === 0 && <p style={{ fontSize: 13, color: SUB, gridColumn: '1/-1' }}>No slots fit that duration — try a shorter rental.</p>}
        </div>
      </div>

      {/* Summary / waiver step */}
      <div>
        {needsWaiver ? (
          <div style={{ position: 'sticky', top: 78 }}>
            <p style={{ fontSize: 12.5, color: SUB, margin: '0 0 10px', lineHeight: 1.5 }}>
              One more step — rentals need a signed <strong style={{ color: INK }}>facility rental waiver</strong> on your profile. Sign once and your booking goes right through.
            </p>
            <WaiverPanel def={RENTAL_WAIVER} compact onSigned={placeHold} />
          </div>
        ) : (
        <div className="sq-card" style={{ ...card, padding: '18px 20px', position: 'sticky', top: 78 }}>
          <p style={{ fontSize: 13.5, fontWeight: 700, color: INK, margin: '0 0 12px' }}>Booking summary</p>
          {[
            ['Room', f.name],
            ['Date', day ? `${day.weekday}, ${day.label}` : '—'],
            ['Time', startH != null ? `${formatHour(startH)}–${formatHour(startH + hours)}` : 'pick a start time'],
            ['Duration', `${hours} hour${hours > 1 ? 's' : ''}`],
          ].map(([k, v]) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '7px 0', borderBottom: `1px solid ${LINE}` }}>
              <span style={{ fontSize: 12.5, color: FAINT }}>{k}</span>
              <span style={{ fontSize: 12.5, fontWeight: 600, color: INK, textAlign: 'right' }}>{v}</span>
            </div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0 14px' }}>
            <span style={{ fontSize: 13.5, fontWeight: 700, color: INK }}>Total</span>
            <span style={{ fontSize: 17, fontWeight: 800, color: INK, fontVariantNumeric: 'tabular-nums' }}>{formatCents(priceCents)}</span>
          </div>
          {signedIn ? (
            <button className="sq-btn sq-btn-primary" style={{ width: '100%' }} disabled={startH == null} onClick={requestHold}>
              Request this slot
            </button>
          ) : (
            <>
              <Link href="/login" className="sq-btn sq-btn-primary" style={{ width: '100%', marginBottom: 8 }}>Sign in to book</Link>
              <p style={{ fontSize: 11.5, color: FAINT, margin: 0, textAlign: 'center' }}>New here? <Link href="/signup" style={{ color: BLUE, fontWeight: 600 }}>Create a profile</Link></p>
            </>
          )}
          <p style={{ fontSize: 11, color: FAINT, margin: '10px 0 0', lineHeight: 1.5 }}>
            Requesting places a hold — you confirm by paying the deposit. Setup and
            teardown time is included in your window.
          </p>
        </div>
        )}
      </div>
    </div>
  )
}
