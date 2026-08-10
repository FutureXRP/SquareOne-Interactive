'use client'
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { PageHero, HeroStat } from '@/components/admin/PageHero'
import { card, INK, SUB, FAINT, LINE, BLUE, GREEN } from '@/lib/theme'
import { formatCents, formatHour } from '@/lib/format'
import { roomLabel, getActiveRooms } from '@/lib/facilities-store'
import { getStaffBookings, BOOKINGS_EVENT, type StaffBooking } from '@/lib/staff-bookings-store'
import { isSupabaseConfigured } from '@/lib/supabase'

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function monthLabel(year: number, month: number): string {
  return new Date(year, month, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

function isoOf(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

export default function CalendarPage() {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth()) // 0-11
  const [bookings, setBookings] = useState<StaffBooking[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const todayIso = isoOf(now.getFullYear(), now.getMonth(), now.getDate())

  useEffect(() => {
    if (!isSupabaseConfigured()) return
    let on = true
    const sync = () => {
      Promise.all([getStaffBookings(), getActiveRooms()])
        .then(([b]) => { if (on) setBookings(b.filter((x) => x.status === 'hold' || x.status === 'confirmed')) })
        .catch(() => {})
    }
    sync()
    window.addEventListener(BOOKINGS_EVENT, sync)
    return () => { on = false; window.removeEventListener(BOOKINGS_EVENT, sync) }
  }, [])

  const byDate = useMemo(() => {
    const map = new Map<string, StaffBooking[]>()
    for (const b of bookings) {
      const list = map.get(b.date) ?? []
      list.push(b)
      map.set(b.date, list)
    }
    for (const list of map.values()) list.sort((a, b) => a.startH - b.startH)
    return map
  }, [bookings])

  const step = (dir: -1 | 1) => {
    const d = new Date(year, month + dir, 1)
    setYear(d.getFullYear())
    setMonth(d.getMonth())
    setSelected(null)
  }

  const firstDow = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells: (number | null)[] = [...Array(firstDow).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)]
  while (cells.length % 7 !== 0) cells.push(null)

  const monthCount = Array.from({ length: daysInMonth }, (_, i) => byDate.get(isoOf(year, month, i + 1))?.length ?? 0).reduce((a, b) => a + b, 0)
  const dayList = selected ? byDate.get(selected) ?? [] : []

  return (
    <div className="sq-page" style={{ padding: '34px 40px 20px', maxWidth: 1180, margin: '0 auto' }}>
      <PageHero title="Calendar" sub="Every upcoming booking and event on one calendar — click a day to see its full schedule." chip={`${monthCount} this month`}>
        <HeroStat label="On the books" value={String(bookings.length)} sub="holds + confirmed" />
      </PageHero>

      <div className="sq-card" style={{ ...card, padding: '16px 18px', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 12 }}>
          <button className="sq-btn sq-btn-ghost" style={{ padding: '6px 13px', fontSize: 12 }} onClick={() => step(-1)}>← Prev</button>
          <p style={{ fontSize: 15, fontWeight: 800, color: INK, margin: 0 }}>{monthLabel(year, month)}</p>
          <button className="sq-btn sq-btn-ghost" style={{ padding: '6px 13px', fontSize: 12 }} onClick={() => step(1)}>Next →</button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
          {WEEKDAYS.map((w) => (
            <p key={w} style={{ fontSize: 10.5, fontWeight: 700, color: FAINT, textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'center', margin: '0 0 2px' }}>{w}</p>
          ))}
          {cells.map((d, i) => {
            if (d === null) return <div key={`x${i}`} />
            const iso = isoOf(year, month, d)
            const list = byDate.get(iso) ?? []
            const isToday = iso === todayIso
            const isSel = iso === selected
            return (
              <button key={iso} onClick={() => setSelected(isSel ? null : iso)} style={{
                font: 'inherit', cursor: 'pointer', textAlign: 'left', minHeight: 74, borderRadius: 9, padding: '6px 7px',
                border: `1.5px solid ${isSel ? BLUE : isToday ? '#9db9dd' : LINE}`,
                background: isSel ? '#eef4fb' : '#fff', overflow: 'hidden',
              }}>
                <span style={{ display: 'block', fontSize: 11.5, fontWeight: 700, color: isToday ? BLUE : INK, marginBottom: 3, fontVariantNumeric: 'tabular-nums' }}>{d}</span>
                {list.slice(0, 2).map((b) => {
                  const room = roomLabel(b.roomId)
                  return (
                    <span key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 9.5, color: SUB, marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden' }}>
                      <span style={{ width: 6, height: 6, borderRadius: 2, background: room.color, flexShrink: 0 }} />
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{formatHour(b.startH)} {room.name}</span>
                    </span>
                  )
                })}
                {list.length > 2 && <span style={{ fontSize: 9.5, fontWeight: 700, color: BLUE }}>+{list.length - 2} more</span>}
              </button>
            )
          })}
        </div>
      </div>

      {/* Day detail */}
      {selected && (
        <div className="sq-card" style={{ ...card, overflow: 'hidden', marginBottom: 8 }}>
          <div style={{ padding: '13px 20px', borderBottom: `1px solid ${LINE}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 13.5, fontWeight: 700, color: INK }}>
              {new Date(`${selected}T00:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
            </span>
            <Link href="/admin/bookings?new=1" style={{ fontSize: 12.5, color: BLUE, fontWeight: 600, textDecoration: 'none' }}>+ Book this day</Link>
          </div>
          {dayList.length === 0 && <p style={{ fontSize: 13, color: SUB, padding: '16px 20px', margin: 0 }}>Nothing booked — the day is wide open.</p>}
          {dayList.map((b, i) => {
            const room = roomLabel(b.roomId)
            const paidUp = b.paidCents >= b.priceCents
            return (
              <div key={b.id} className="sq-row" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 20px', borderBottom: i < dayList.length - 1 ? `1px solid ${LINE}` : 'none', flexWrap: 'wrap' }}>
                <span style={{ width: 10, height: 10, borderRadius: 3, background: room.color, flexShrink: 0 }} />
                <span style={{ fontSize: 12.5, fontWeight: 700, color: INK, fontVariantNumeric: 'tabular-nums', minWidth: 120 }}>
                  {formatHour(b.startH)}–{formatHour(b.startH + b.hours)}
                </span>
                <span style={{ flex: 1, minWidth: 140, fontSize: 12.5, color: INK }}>
                  <strong>{room.name}</strong> · {b.client} <span style={{ color: FAINT }}>· {b.code}</span>
                </span>
                {b.status === 'hold'
                  ? <span style={{ fontSize: 10, fontWeight: 700, color: '#b07818', background: '#faf0dc', padding: '1px 8px', borderRadius: 999 }}>hold</span>
                  : <span style={{ fontSize: 10, fontWeight: 700, color: GREEN, background: '#e5f2ea', padding: '1px 8px', borderRadius: 999 }}>confirmed</span>}
                <span style={{ fontSize: 11.5, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: paidUp ? GREEN : SUB }}>
                  {paidUp ? formatCents(b.priceCents) : `${formatCents(b.paidCents)} of ${formatCents(b.priceCents)}`}
                </span>
              </div>
            )
          })}
        </div>
      )}

      <p style={{ fontSize: 11.5, color: FAINT, marginTop: 10 }}>
        Live — store requests and desk bookings appear the moment they happen. The day-by-day lane view is on{' '}
        <Link href="/admin/board" style={{ color: BLUE, fontWeight: 600 }}>The Board</Link>.
      </p>
    </div>
  )
}
