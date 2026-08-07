'use client'
import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { card, INK, SUB, FAINT, LINE, BLUE, GREEN, RED } from '@/lib/theme'
import { formatCents, formatHour } from '@/lib/format'
import { getRoom, type RoomConfig } from '@/lib/facilities-store'
import { getSiteConfig, type SiteConfig } from '@/lib/site-config-store'
import { isSignedIn, hasWaiver, requestMemberHold, SESSION_EVENT } from '@/lib/session'
import { facilityBusy } from '@/lib/staff-bookings-store'
import { isSupabaseConfigured } from '@/lib/supabase'
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
  const [cfg, setCfg] = useState<SiteConfig | null>(null)
  const [days, setDays] = useState<DayOption[]>([])
  const [dayIdx, setDayIdx] = useState(0)
  const [hours, setHours] = useState(1)
  const [startH, setStartH] = useState<number | null>(null)
  const [busy, setBusy] = useState<{ fromH: number; toH: number }[]>([])
  const [signedIn, setSignedIn] = useState(false)
  const [needsWaiver, setNeedsWaiver] = useState(false)
  const [requesting, setRequesting] = useState(false)
  const [conflict, setConflict] = useState(false)
  const [confirmed, setConfirmed] = useState<{ code: string; startH: number; hours: number; priceCents: number } | null>(null)

  // Dates come from the real clock, so this renders client-side only.
  useEffect(() => {
    const out: DayOption[] = []
    const now = new Date()
    for (let i = 0; i < 14; i++) {
      const d = new Date(now)
      d.setDate(now.getDate() + i)
      const y = d.getFullYear()
      const m = String(d.getMonth() + 1).padStart(2, '0')
      const dd = String(d.getDate()).padStart(2, '0')
      out.push({
        iso: `${y}-${m}-${dd}`,
        label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        weekday: i === 0 ? 'Today' : d.toLocaleDateString('en-US', { weekday: 'short' }),
        isSunday: d.getDay() === 0,
      })
    }
    setDays(out)
    if (!isSupabaseConfigured()) return
    getSiteConfig().then(setCfg).catch(() => {})
    getRoom(facilityId).then((room) => {
      setF(room)
      if (room) setHours((h) => Math.max(h, room.minHours))
    }).catch(() => {})
    const sync = () => { isSignedIn().then(setSignedIn) }
    sync()
    window.addEventListener(SESSION_EVENT, sync)
    return () => window.removeEventListener(SESSION_EVENT, sync)
  }, [facilityId])

  const day = days[dayIdx]

  // Real availability: fetch this room's booked ranges for the selected day.
  const loadBusy = useCallback(() => {
    if (!day || !isSupabaseConfigured()) return
    facilityBusy(facilityId, day.iso).then(setBusy).catch(() => setBusy([]))
  }, [facilityId, day])

  useEffect(() => { loadBusy() }, [loadBusy])

  const dayHours = !cfg
    ? { openH: 6, closeH: 22 }
    : day?.isSunday
      ? { openH: cfg.sundayOpenH, closeH: cfg.sundayCloseH }
      : { openH: cfg.weekdayOpenH, closeH: cfg.weekdayCloseH }

  const slots = useMemo(() => {
    if (!day) return []
    const now = new Date()
    const isToday = dayIdx === 0
    const nowH = now.getHours() + now.getMinutes() / 60
    const open = Math.ceil(dayHours.openH)
    const out: { startH: number; available: boolean }[] = []
    for (let h = open; h + hours <= dayHours.closeH; h++) {
      const overlaps = busy.some((b) => h < b.toH && h + hours > b.fromH)
      const past = isToday && h <= nowH
      out.push({ startH: h, available: !overlaps && !past })
    }
    return out
  }, [day, dayIdx, dayHours.openH, dayHours.closeH, hours, busy])

  if (!f) return <div style={{ minHeight: 200 }} />

  const priceCents = f.id === 'party'
    ? 27900 + Math.max(0, hours - 2) * 9900
    : f.perHourCents * hours

  const placeHold = async () => {
    if (!day || startH == null || requesting) return
    setRequesting(true)
    setConflict(false)
    const res = await requestMemberHold(f.id, `${f.name} rental`, day.iso, startH, hours, priceCents)
    setRequesting(false)
    setNeedsWaiver(false)
    if (res.ok) {
      setConfirmed({ code: res.code, startH, hours, priceCents })
    } else if (res.conflict) {
      setConflict(true)
      setStartH(null)
      loadBusy() // someone else took it — refresh availability
    }
  }

  const requestHold = async () => {
    if (!day || startH == null) return
    if (!(await hasWaiver(RENTAL_WAIVER.id))) {
      setNeedsWaiver(true)
      return
    }
    placeHold()
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
            <strong>Hold {confirmed.code}</strong> — the room is yours for 24 hours. Pay the deposit at the
            front desk (or when we call to confirm) and it locks in. Unpaid holds release automatically.
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
            <button key={d.iso} onClick={() => { setDayIdx(i); setStartH(null); setConflict(false) }} style={{
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

        {/* Slots — live availability from the booking book */}
        <p className="sq-label">Available start times {day ? `· ${day.weekday} ${day.label}` : ''}</p>
        {conflict && (
          <p style={{ fontSize: 12.5, color: RED, fontWeight: 600, margin: '0 0 10px' }}>
            That slot was just taken — here&apos;s what&apos;s still open.
          </p>
        )}
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
            <button className="sq-btn sq-btn-primary" style={{ width: '100%' }} disabled={startH == null || requesting} onClick={requestHold}>
              {requesting ? 'Booking…' : 'Request this slot'}
            </button>
          ) : (
            <>
              <Link href="/login" className="sq-btn sq-btn-primary" style={{ width: '100%', marginBottom: 8 }}>Sign in to book</Link>
              <p style={{ fontSize: 11.5, color: FAINT, margin: 0, textAlign: 'center' }}>New here? <Link href="/signup" style={{ color: BLUE, fontWeight: 600 }}>Create a profile</Link></p>
            </>
          )}
          <p style={{ fontSize: 11, color: FAINT, margin: '10px 0 0', lineHeight: 1.5 }}>
            Availability is live — a slot can&apos;t be double-booked. Requesting places a 24-hour hold;
            you confirm by paying the deposit.
          </p>
        </div>
        )}
      </div>
    </div>
  )
}
