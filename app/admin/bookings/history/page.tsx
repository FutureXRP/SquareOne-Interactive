'use client'
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { PageHero, HeroStat } from '@/components/admin/PageHero'
import { card, INK, SUB, FAINT, LINE, BLUE, GREEN, RED } from '@/lib/theme'
import { formatCents, formatHour } from '@/lib/format'
import { roomLabel, getActiveRooms, type RoomConfig } from '@/lib/facilities-store'
import { getPastBookings, canceledByLabel, PAY_LABEL, type StaffBooking } from '@/lib/staff-bookings-store'
import { isSupabaseConfigured } from '@/lib/supabase'

// Everything that already happened, back a year. Kept off the main
// Bookings tab so the desk's day-to-day list stays about what's ahead.

function monthKey(date: string): string {
  return date.slice(0, 7)
}

function monthLabel(key: string): string {
  const [y, m] = key.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

export default function BookingHistoryPage() {
  const [bookings, setBookings] = useState<StaffBooking[] | null>(null)
  const [rooms, setRooms] = useState<RoomConfig[]>([])
  const [query, setQuery] = useState('')
  const [room, setRoom] = useState('')
  const [includeCanceled, setIncludeCanceled] = useState(false)

  useEffect(() => {
    if (!isSupabaseConfigured()) { setBookings([]); return }
    let on = true
    getPastBookings(12).then((b) => { if (on) setBookings(b) }).catch(() => { if (on) setBookings([]) })
    getActiveRooms().then((r) => { if (on) setRooms(r) }).catch(() => {})
    return () => { on = false }
  }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (bookings ?? []).filter((b) => {
      if (!includeCanceled && b.status === 'canceled') return false
      if (room && b.roomId !== room) return false
      if (!q) return true
      return b.client.toLowerCase().includes(q)
        || b.title.toLowerCase().includes(q)
        || b.code.toLowerCase().includes(q)
        || roomLabel(b.roomId).name.toLowerCase().includes(q)
    })
  }, [bookings, query, room, includeCanceled])

  const byMonth = useMemo(() => {
    const groups = new Map<string, StaffBooking[]>()
    for (const b of filtered) {
      const list = groups.get(monthKey(b.date)) ?? []
      list.push(b)
      groups.set(monthKey(b.date), list)
    }
    // getPastBookings already returns newest first, so insertion order holds.
    return [...groups.entries()]
  }, [filtered])

  const held = filtered.filter((b) => b.status !== 'canceled')
  const collectedCents = held.reduce((n, b) => n + b.paidCents, 0)
  const bookedCents = held.reduce((n, b) => n + b.priceCents, 0)
  const unpaidCents = Math.max(0, bookedCents - collectedCents)
  const canceledCount = (bookings ?? []).filter((b) => b.status === 'canceled').length

  return (
    <div className="sq-page" style={{ padding: '34px 40px 20px', maxWidth: 1180, margin: '0 auto' }}>
      <PageHero
        title="Past bookings"
        sub="Everything that has already happened, back one year — for looking someone up, settling a question, or seeing how a room actually gets used."
        chip={`${held.length} in range`}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <HeroStat label="Collected" value={formatCents(collectedCents)} sub={`of ${formatCents(bookedCents)} booked`} />
          <Link href="/admin/bookings" className="sq-btn" style={{ background: '#fff', color: '#182740' }}>
            ← Current bookings
          </Link>
        </div>
      </PageHero>

      {/* Filters */}
      <div className="sq-card" style={{ ...card, padding: '14px 18px', marginBottom: 18 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            className="sq-input"
            style={{ flex: 1, minWidth: 200 }}
            placeholder="Search a name, booking code, or room…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <select className="sq-select" style={{ width: 'auto', minWidth: 170 }} value={room} onChange={(e) => setRoom(e.target.value)}>
            <option value="">Every room</option>
            {rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
          {canceledCount > 0 && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, color: SUB, cursor: 'pointer' }}>
              <input type="checkbox" checked={includeCanceled} onChange={(e) => setIncludeCanceled(e.target.checked)} style={{ accentColor: BLUE }} />
              Include {canceledCount} canceled
            </label>
          )}
        </div>
        {unpaidCents > 0 && (
          <p style={{ fontSize: 12, color: '#b07818', margin: '10px 0 0', lineHeight: 1.5 }}>
            {formatCents(unpaidCents)} of what&rsquo;s shown was never collected — worth a look if any of
            these should have been paid.
          </p>
        )}
      </div>

      {bookings === null && (
        <p style={{ fontSize: 13, color: SUB }}>Loading the last year…</p>
      )}

      {bookings !== null && byMonth.length === 0 && (
        <div className="sq-card" style={{ ...card, padding: '30px 32px', textAlign: 'center' }}>
          <p style={{ fontSize: 14, color: SUB, margin: 0 }}>
            {(bookings ?? []).length === 0
              ? 'Nothing in the past year yet — finished bookings land here as they go by.'
              : 'Nothing matches those filters.'}
          </p>
        </div>
      )}

      {byMonth.map(([key, list]) => {
        const live = list.filter((b) => b.status !== 'canceled')
        const monthCents = live.reduce((n, b) => n + b.paidCents, 0)
        return (
          <div key={key} style={{ marginBottom: 22 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '0 0 10px' }}>
              <span style={{ width: 8, height: 8, background: BLUE, borderRadius: 2 }} />
              <span style={{ fontSize: 12, fontWeight: 700, color: BLUE, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{monthLabel(key)}</span>
              <div style={{ height: 1, flex: 1, background: LINE }} />
              <span style={{ fontSize: 11.5, color: FAINT, fontVariantNumeric: 'tabular-nums' }}>
                {live.length} booking{live.length === 1 ? '' : 's'} · {formatCents(monthCents)} collected
              </span>
            </div>
            <div className="sq-card" style={{ ...card, overflow: 'hidden' }}>
              {list.map((b, i) => {
                const zone = roomLabel(b.roomId)
                const owed = Math.max(0, b.priceCents - b.paidCents)
                return (
                  <div key={b.id} style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: '11px 18px', flexWrap: 'wrap',
                    borderBottom: i < list.length - 1 ? `1px solid ${LINE}` : 'none',
                    opacity: b.status === 'canceled' ? 0.5 : 1,
                  }}>
                    <span style={{ width: 9, height: 9, borderRadius: 2, background: zone.color, flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 190 }}>
                      <p style={{ fontSize: 13, fontWeight: 700, color: INK, margin: 0 }}>{b.title} · {zone.name}</p>
                      <p style={{ fontSize: 12, color: SUB, margin: 0 }}>
                        {b.client} · {b.date} · {formatHour(b.startH)}–{formatHour(b.startH + b.hours)} · {b.code}
                      </p>
                    </div>
                    {b.status === 'canceled' ? (
                      <span style={{ fontSize: 10.5, fontWeight: 700, color: SUB, background: '#eef2f8', padding: '2px 10px', borderRadius: 999 }}>
                        {canceledByLabel(b) ?? 'Canceled'}
                      </span>
                    ) : owed > 0 ? (
                      <span style={{ fontSize: 10.5, fontWeight: 700, color: RED, background: '#fae7e4', padding: '2px 10px', borderRadius: 999 }}>
                        {formatCents(owed)} never collected
                      </span>
                    ) : (
                      <span style={{ fontSize: 10.5, fontWeight: 700, color: GREEN, background: '#e5f2ea', padding: '2px 10px', borderRadius: 999 }}>
                        {b.payMethod ? `Paid · ${PAY_LABEL[b.payMethod] ?? b.payMethod}` : 'Paid'}
                      </span>
                    )}
                    <span style={{ fontSize: 13.5, fontWeight: 700, color: INK, minWidth: 74, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                      {formatCents(b.priceCents)}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}

      <p style={{ fontSize: 11.5, color: FAINT, marginTop: 14 }}>
        Showing finished bookings only — anything running right now stays on{' '}
        <Link href="/admin/bookings" style={{ color: BLUE, fontWeight: 600 }}>Bookings</Link>. For revenue
        by date range with CSV and PDF, use <Link href="/admin/reports" style={{ color: BLUE, fontWeight: 600 }}>Reports</Link>.
      </p>
    </div>
  )
}
