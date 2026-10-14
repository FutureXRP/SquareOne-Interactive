'use client'
import { useEffect, useState } from 'react'
import { PageHero } from '@/components/admin/PageHero'
import { card, INK, SUB, FAINT, LINE, BLUE, GREEN, GOLD } from '@/lib/theme'
import { formatCents, formatHour } from '@/lib/format'
import { getStaffBookings, isoDate, BOOKINGS_EVENT, type StaffBooking } from '@/lib/staff-bookings-store'
import { getEvents, KIND_LABEL, EVENTS_EVENT, type StaffEvent } from '@/lib/events-store'
import { roomLabel, getActiveRooms } from '@/lib/facilities-store'
import { getMyStaff, type StaffMember } from '@/lib/staff-store'
import { isSupabaseConfigured } from '@/lib/supabase'

// My Schedule — the live answer to "when am I working?". Every booking
// and tour/event assigned to the signed-in person, with the staff hours
// (arrive-by for setup, stay-until for cleanup) said plainly. The same
// times the assignment email carries, kept current as bookings move.

interface Shift {
  id: string
  date: string // YYYY-MM-DD
  title: string
  room: string
  client: string
  eventLabel: string // "4 PM – 7 PM"
  arriveH: number
  leaveH: number
  setupMin: number
  cleanupMin: number
  note?: string
  payoutCents?: number | null
  kind: 'booking' | 'event'
}

function dayLabel(date: string): string {
  const d = new Date(`${date}T12:00:00`)
  const today = isoDate(0)
  const tomorrow = isoDate(1)
  const name = d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
  if (date === today) return `Today — ${name}`
  if (date === tomorrow) return `Tomorrow — ${name}`
  return name
}

export default function MySchedulePage() {
  const [me, setMe] = useState<StaffMember | null>(null)
  const [shifts, setShifts] = useState<Shift[] | null>(null)

  useEffect(() => {
    if (!isSupabaseConfigured()) return
    let on = true
    const sync = async () => {
      const my = await getMyStaff()
      if (!on || !my) { if (on) { setMe(null); setShifts([]) } return }
      setMe(my)
      await getActiveRooms().catch(() => []) // warms roomLabel's cache
      const today = isoDate(0)
      const [bookings, events] = await Promise.all([
        getStaffBookings().catch(() => [] as StaffBooking[]),
        getEvents(today, isoDate(90)).catch(() => null),
      ])
      if (!on) return
      const mine: Shift[] = bookings
        .filter((b) => b.runByStaffId === my.id && b.status !== 'canceled' && b.date >= today)
        .map((b) => ({
          id: `b-${b.id}`,
          date: b.date,
          title: b.title,
          room: roomLabel(b.roomId).name,
          client: b.client,
          eventLabel: `${formatHour(b.startH)} – ${formatHour(b.startH + b.hours)}`,
          arriveH: Math.max(b.startH - (b.setupMin ?? 0) / 60, 0),
          leaveH: b.startH + b.hours + (b.cleanupMin ?? 0) / 60,
          setupMin: b.setupMin ?? 0,
          cleanupMin: b.cleanupMin ?? 0,
          note: b.note,
          payoutCents: b.payoutCents,
          kind: 'booking' as const,
        }))
      for (const e of (events ?? []) as StaffEvent[]) {
        if (e.assignedStaffId !== my.id || e.status !== 'scheduled' || e.dateIso < today) continue
        mine.push({
          id: `e-${e.id}`,
          date: e.dateIso,
          title: `${KIND_LABEL[e.kind]} — ${e.title || e.guestName}`,
          room: e.facilityId ? roomLabel(e.facilityId).name : 'No room held',
          client: e.guestName,
          eventLabel: e.timeLabel,
          arriveH: e.startH,
          leaveH: e.startH + e.hours,
          setupMin: 0,
          cleanupMin: 0,
          note: e.notes || undefined,
          kind: 'event' as const,
        })
      }
      mine.sort((a, b) => a.date.localeCompare(b.date) || a.arriveH - b.arriveH)
      setShifts(mine)
    }
    sync()
    window.addEventListener(BOOKINGS_EVENT, sync)
    window.addEventListener(EVENTS_EVENT, sync)
    return () => { on = false; window.removeEventListener(BOOKINGS_EVENT, sync); window.removeEventListener(EVENTS_EVENT, sync) }
  }, [])

  const byDate = new Map<string, Shift[]>()
  for (const s of shifts ?? []) {
    byDate.set(s.date, [...(byDate.get(s.date) ?? []), s])
  }

  return (
    <div className="sq-page" style={{ padding: '34px 40px 20px', maxWidth: 1180, margin: '0 auto' }}>
      <PageHero
        title="My Schedule"
        sub="Every event you're assigned to run, with your working hours — when to arrive for setup and how long to stay for cleanup. Same times as your assignment email, always current."
        chip={me ? me.name : 'you'}
      />

      {shifts === null && <p style={{ fontSize: 13, color: SUB }}>Loading your schedule…</p>}

      {shifts !== null && shifts.length === 0 && (
        <div className="sq-card" style={{ ...card, padding: '26px 28px', textAlign: 'center' }}>
          <p style={{ fontSize: 14, fontWeight: 700, color: INK, margin: '0 0 4px' }}>Nothing on your schedule</p>
          <p style={{ fontSize: 12.5, color: SUB, margin: 0, lineHeight: 1.55 }}>
            When a manager assigns you to run a booking or a tour, it appears here with your arrive-by
            and stay-until times — and you get an email the moment it happens.
          </p>
        </div>
      )}

      {[...byDate.entries()].map(([date, list]) => (
        <div key={date} style={{ marginBottom: 18 }}>
          <p style={{ fontSize: 12, fontWeight: 800, color: SUB, textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 8px' }}>
            {dayLabel(date)}
          </p>
          <div className="sq-card" style={{ ...card, overflow: 'hidden' }}>
            {list.map((s, i) => (
              <div key={s.id} style={{ padding: '14px 20px', borderBottom: i < list.length - 1 ? `1px solid ${LINE}` : 'none' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                  <p style={{ fontSize: 13.5, fontWeight: 700, color: INK, margin: 0 }}>{s.title}</p>
                  <span style={{ fontSize: 11.5, color: SUB }}>{s.room} · {s.client}</span>
                  {s.payoutCents != null && s.payoutCents > 0 && (
                    <span style={{ fontSize: 10.5, fontWeight: 700, color: GREEN, background: '#e5f2ea', padding: '1px 8px', borderRadius: 999 }}>
                      you earn {formatCents(s.payoutCents)}
                    </span>
                  )}
                </div>
                {/* The three times that matter, big enough to read on a phone
                    in a hallway. */}
                <div style={{ display: 'flex', gap: '6px 22px', flexWrap: 'wrap', margin: '8px 0 0' }}>
                  <span style={{ fontSize: 12.5, color: SUB }}>
                    <strong style={{ color: BLUE, fontSize: 14 }}>Arrive by {formatHour(s.arriveH)}</strong>
                    {s.setupMin > 0 && <> — {s.setupMin} min setup</>}
                  </span>
                  <span style={{ fontSize: 12.5, color: SUB }}>Event {s.eventLabel}</span>
                  <span style={{ fontSize: 12.5, color: SUB }}>
                    <strong style={{ color: GOLD, fontSize: 14 }}>Stay until {formatHour(s.leaveH)}</strong>
                    {s.cleanupMin > 0 && <> — {s.cleanupMin} min cleanup</>}
                  </span>
                </div>
                {s.note && (
                  <p style={{ fontSize: 12, color: SUB, margin: '7px 0 0', lineHeight: 1.5 }}>
                    <strong style={{ color: INK }}>Notes:</strong> {s.note}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}

      <p style={{ fontSize: 11.5, color: FAINT, marginTop: 14, lineHeight: 1.5 }}>
        Can&rsquo;t make one? Tell a manager right away so it can be handed to someone else.
      </p>
    </div>
  )
}
