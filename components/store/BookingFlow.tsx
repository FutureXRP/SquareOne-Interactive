'use client'
import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { card, INK, SUB, FAINT, LINE, BLUE, GREEN, RED } from '@/lib/theme'
import { formatCents, formatHour } from '@/lib/format'
import { getRoom, rentalPriceCents, rentalPriceCentsAt, roomDayHours, DAY_NAMES, type RoomConfig } from '@/lib/facilities-store'
import { getSiteConfig, siteDayHours, closureFor, type SiteConfig } from '@/lib/site-config-store'
import { isSignedIn, requestMemberHold, SESSION_EVENT } from '@/lib/session'
import { facilityBusy } from '@/lib/staff-bookings-store'
import { isSupabaseConfigured } from '@/lib/supabase'
import { WaiverPanel } from '@/components/store/WaiverPanel'
import { unsignedRequiredWaivers, type RequiredWaiver } from '@/lib/waivers-live'

interface DayOption {
  iso: string
  label: string
  weekday: string
  isSunday: boolean
  dow: number // JS getDay(): 0=Sunday … 6=Saturday
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
  const [pendingWaivers, setPendingWaivers] = useState<RequiredWaiver[]>([])
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
        dow: d.getDay(),
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

  // With 48-hour notice the first day or two can't be booked — land the
  // picker on the first day that actually can.
  useEffect(() => {
    if (days.length === 0) return
    const closed = (d: DayOption) => new Date(`${d.iso}T23:59:59`).getTime() < Date.now() + (f?.minNoticeHours ?? 48) * 3600_000
    if (!closed(days[dayIdx])) return
    const idx = days.findIndex((d) => !closed(d))
    if (idx >= 0) setDayIdx(idx)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days, f])

  const siteHours = !cfg || !day
    ? { closed: false, openH: 6, closeH: 22 }
    : siteDayHours(cfg, day.dow)
  const closure = cfg && day ? closureFor(cfg, day.iso) : null
  const roomHours = day && f ? roomDayHours(f, day.dow, siteHours) : { closed: false, openH: siteHours.openH, closeH: siteHours.closeH }
  const closedToday = !!closure || roomHours.closed
  const dayHours = { openH: roomHours.openH, closeH: roomHours.closeH }

  // Which upcoming days this room takes bookings at all (for graying the picker):
  // holiday closures close everything; otherwise the room's schedule, falling
  // back to the site's per-day hours.
  const dayClosed = (d: DayOption) => {
    // Days that end before the notice window opens can't be booked at all.
    if (new Date(`${d.iso}T23:59:59`).getTime() < earliestMs()) return true
    if (cfg && closureFor(cfg, d.iso)) return true
    const sched = f?.bookingHours?.[d.dow]
    if (sched) return sched.closed
    return cfg ? siteDayHours(cfg, d.dow).closed : false
  }

  // Online bookings need this much lead time (staff can always book sooner).
  // 48 hours is the house rule — enforced even before migration 0014 runs.
  const noticeH = f?.minNoticeHours ?? 48
  const earliestMs = () => Date.now() + noticeH * 3600_000

  const slots = useMemo(() => {
    if (!day || closedToday) return []
    const now = new Date()
    const isToday = dayIdx === 0
    const nowH = now.getHours() + now.getMinutes() / 60
    const [yy, mm, dd] = day.iso.split('-').map(Number)
    const earliest = new Date(now.getTime() + noticeH * 3600_000)
    const open = Math.ceil(dayHours.openH)
    const out: { startH: number; available: boolean }[] = []
    for (let h = open; h + hours <= dayHours.closeH; h++) {
      const overlaps = busy.some((b) => h < b.toH && h + hours > b.fromH)
      const past = isToday && h <= nowH
      const slotTime = new Date(yy, mm - 1, dd, Math.floor(h), Math.round((h % 1) * 60))
      const tooSoon = slotTime < earliest
      out.push({ startH: h, available: !overlaps && !past && !tooSoon })
    }
    return out
  }, [day, dayIdx, closedToday, dayHours.openH, dayHours.closeH, hours, busy, noticeH])
  const allTooSoon = slots.length > 0 && slots.every((s) => !s.available) && noticeH > 0

  if (!f) return <div style={{ minHeight: 200 }} />

  // Price the actual slot when one is picked (time/day rules can change the
  // rate); before that, show the base-rate estimate.
  const hasRules = (f.rateRules?.length ?? 0) > 0
  const priceCents = day && startH != null
    ? rentalPriceCentsAt(f, day.dow, startH, hours)
    : rentalPriceCents(f, hours)
  const firstHourCents = f.firstHourCents ?? f.perHourCents
  const splitRate = firstHourCents !== f.perHourCents
  // Deposit that locks the booking in (undefined until migration 0009 runs)
  const depositCents = f.depositRequired && (f.depositCents ?? 0) > 0 ? Math.min(f.depositCents as number, priceCents) : null

  const placeHold = async () => {
    if (!day || startH == null || requesting) return
    setRequesting(true)
    setConflict(false)
    const res = await requestMemberHold(f.id, `${f.name} rental`, day.iso, startH, hours, priceCents,
      f.depositCents === undefined ? undefined : depositCents)
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
    const due = await unsignedRequiredWaivers({ roomId: f.id })
    if (due.length > 0) {
      setPendingWaivers(due)
      setNeedsWaiver(true)
      return
    }
    placeHold()
  }

  const onWaiverSigned = () => {
    const rest = pendingWaivers.slice(1)
    setPendingWaivers(rest)
    if (rest.length === 0) placeHold()
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
            <strong>Hold {confirmed.code}</strong> — the room is yours for 24 hours.
            {depositCents
              ? ` Pay the ${formatCents(depositCents)} deposit at the front desk (or when we call to confirm) and it locks in.`
              : ' Pay at the front desk (or when we call to confirm) and it locks in.'}
            {' '}Unpaid holds release automatically.
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
          {days.map((d, i) => {
            const off = dayClosed(d)
            return (
              <button key={d.iso} disabled={off} onClick={() => { setDayIdx(i); setStartH(null); setConflict(false) }} style={{
                font: 'inherit', cursor: off ? 'default' : 'pointer', flexShrink: 0, textAlign: 'center',
                border: `1.5px solid ${i === dayIdx ? BLUE : LINE}`, borderRadius: 10,
                background: off ? '#f3f6fb' : i === dayIdx ? '#eef4fb' : '#fff', padding: '8px 13px', opacity: off ? 0.6 : 1,
              }}>
                <span style={{ display: 'block', fontSize: 10.5, fontWeight: 600, color: i === dayIdx ? BLUE : FAINT }}>{d.weekday}</span>
                <span style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: off ? '#c3cede' : i === dayIdx ? BLUE : INK, fontVariantNumeric: 'tabular-nums', textDecoration: off ? 'line-through' : 'none' }}>{d.label}</span>
              </button>
            )
          })}
        </div>

        {/* Duration — 1 hour by default, up to 6 per rental */}
        <p className="sq-label">How long?</p>
        <div style={{ display: 'flex', gap: 8, marginBottom: 18, flexWrap: 'wrap' }}>
          {[1, 2, 3, 4, 5, 6].filter((h) => h >= f.minHours).map((h) => (
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
          {day && slots.length === 0 && (
            <p style={{ fontSize: 13, color: SUB, gridColumn: '1/-1' }}>
              {closure
                ? `We're closed ${day.label}${closure.label ? ` for ${closure.label}` : ''} — pick another day.`
                : closedToday
                  ? `${f.name} isn't bookable on ${DAY_NAMES[day.dow]}s — pick another day.`
                  : 'No slots fit that duration — try a shorter rental.'}
            </p>
          )}
          {day && allTooSoon && (
            <p style={{ fontSize: 12.5, color: SUB, gridColumn: '1/-1', margin: '6px 0 0' }}>
              {f.name} needs at least {noticeH >= 24 ? `${Math.round(noticeH / 24)} day${noticeH > 24 ? 's' : ''}` : `${noticeH} hours`}&apos; notice
              to book online — pick a later day, or call the front desk for short-notice availability.
            </p>
          )}
        </div>
      </div>

      {/* Summary / waiver step */}
      <div>
        {needsWaiver && pendingWaivers.length > 0 ? (
          <div style={{ position: 'sticky', top: 78 }}>
            <p style={{ fontSize: 12.5, color: SUB, margin: '0 0 10px', lineHeight: 1.5 }}>
              One more step — this rental needs a signed{' '}
              <strong style={{ color: INK }}>{pendingWaivers[0].name.toLowerCase()}</strong> on your profile
              {pendingWaivers.length > 1 ? ` (${pendingWaivers.length} to sign)` : ''}. Sign and your booking goes right through.
            </p>
            <WaiverPanel key={pendingWaivers[0].id} def={pendingWaivers[0]} compact onSigned={onWaiverSigned} />
          </div>
        ) : (
        <div className="sq-card" style={{ ...card, padding: '18px 20px', position: 'sticky', top: 78 }}>
          <p style={{ fontSize: 13.5, fontWeight: 700, color: INK, margin: '0 0 12px' }}>Booking summary</p>
          {[
            ['Room', f.name],
            ['Date', day ? `${day.weekday}, ${day.label}` : '—'],
            ['Time', startH != null ? `${formatHour(startH)}–${formatHour(startH + hours)}` : 'pick a start time'],
            ['Duration', `${hours} hour${hours > 1 ? 's' : ''}`],
            ['Rate', hasRules
              ? (startH != null && day
                  ? `${formatCents(Math.round(priceCents / hours))}/hr avg for this time`
                  : 'varies by day & time — pick a slot')
              : splitRate
                ? `${formatCents(firstHourCents)} first hour · ${formatCents(f.perHourCents)}/hr after`
                : `${formatCents(f.perHourCents)}/hr`],
          ].map(([k, v]) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '7px 0', borderBottom: `1px solid ${LINE}` }}>
              <span style={{ fontSize: 12.5, color: FAINT }}>{k}</span>
              <span style={{ fontSize: 12.5, fontWeight: 600, color: INK, textAlign: 'right' }}>{v}</span>
            </div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0 14px' }}>
            <span style={{ fontSize: 13.5, fontWeight: 700, color: INK }}>Total</span>
            <span style={{ textAlign: 'right' }}>
              <span style={{ display: 'block', fontSize: 17, fontWeight: 800, color: INK, fontVariantNumeric: 'tabular-nums' }}>{formatCents(priceCents)}</span>
              {depositCents != null && (
                <span style={{ display: 'block', fontSize: 11.5, color: SUB, fontVariantNumeric: 'tabular-nums' }}>{formatCents(depositCents)} deposit locks it in</span>
              )}
            </span>
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
