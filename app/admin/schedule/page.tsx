'use client'
import { useEffect, useState } from 'react'
import { PageHero } from '@/components/admin/PageHero'
import { card, INK, SUB, FAINT, LINE, BLUE, GREEN, GOLD, NAVY, RED } from '@/lib/theme'
import { formatCents, formatHour } from '@/lib/format'
import { getStaffBookings, isoDate, BOOKINGS_EVENT, type StaffBooking } from '@/lib/staff-bookings-store'
import { getEvents, KIND_LABEL, EVENTS_EVENT, type StaffEvent } from '@/lib/events-store'
import { getShifts, addShift, deleteShift, minLabel, timeToMin, SHIFTS_EVENT, type ScheduledShift } from '@/lib/shifts-store'
import { roomLabel, getActiveRooms } from '@/lib/facilities-store'
import { getMyStaff, getStaff, type StaffMember } from '@/lib/staff-store'
import { isSupabaseConfigured } from '@/lib/supabase'

// My Schedule — the live answer to "when am I working?". A posted shift
// is the day's headline (arrive 8:30, leave 6:00); the events assigned
// to you are the details inside it. Managers post and remove shifts
// from the panel at the bottom.

interface Assignment {
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
}

function dayLabel(date: string): string {
  const d = new Date(`${date}T12:00:00`)
  const name = d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
  if (date === isoDate(0)) return `Today — ${name}`
  if (date === isoDate(1)) return `Tomorrow — ${name}`
  return name
}

const CAN_MANAGE = ['owner', 'admin', 'manager']

export default function MySchedulePage() {
  const [me, setMe] = useState<StaffMember | null>(null)
  const [assignments, setAssignments] = useState<Assignment[] | null>(null)
  // Scheduled shifts for everyone (null until 0051 runs) — mine feed the
  // day banners, the whole list feeds the manager panel.
  const [allShifts, setAllShifts] = useState<ScheduledShift[] | null>(null)
  const [allStaff, setAllStaff] = useState<StaffMember[]>([])
  // Post-a-shift form
  const [shStaff, setShStaff] = useState('')
  const [shDate, setShDate] = useState(isoDate(0))
  const [shFrom, setShFrom] = useState('08:30')
  const [shTo, setShTo] = useState('18:00')
  const [shNote, setShNote] = useState('')
  const [shBusy, setShBusy] = useState(false)
  const [shError, setShError] = useState<string | null>(null)

  useEffect(() => {
    if (!isSupabaseConfigured()) return
    let on = true
    const sync = async () => {
      const my = await getMyStaff()
      if (!on || !my) { if (on) { setMe(null); setAssignments([]) } return }
      setMe(my)
      await getActiveRooms().catch(() => []) // warms roomLabel's cache
      const today = isoDate(0)
      const [bookings, events, shifts, staff] = await Promise.all([
        getStaffBookings().catch(() => [] as StaffBooking[]),
        getEvents(today, isoDate(90)).catch(() => null),
        getShifts(today, isoDate(90)),
        getStaff().catch(() => [] as StaffMember[]),
      ])
      if (!on) return
      setAllShifts(shifts)
      setAllStaff(staff)
      const mine: Assignment[] = bookings
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
        })
      }
      mine.sort((a, b) => a.date.localeCompare(b.date) || a.arriveH - b.arriveH)
      setAssignments(mine)
    }
    sync()
    window.addEventListener(BOOKINGS_EVENT, sync)
    window.addEventListener(EVENTS_EVENT, sync)
    window.addEventListener(SHIFTS_EVENT, sync)
    return () => {
      on = false
      window.removeEventListener(BOOKINGS_EVENT, sync)
      window.removeEventListener(EVENTS_EVENT, sync)
      window.removeEventListener(SHIFTS_EVENT, sync)
    }
  }, [])

  const canManage = me ? CAN_MANAGE.includes(me.role) : false
  const myShifts = (allShifts ?? []).filter((s) => s.staffId === me?.id)

  // Every day that has either a shift or an assignment, in order.
  const days = [...new Set([...myShifts.map((s) => s.date), ...(assignments ?? []).map((a) => a.date)])].sort()

  const postShift = async () => {
    if (shBusy) return
    const startMin = timeToMin(shFrom)
    const endMin = timeToMin(shTo)
    setShError(null)
    if (!shStaff || startMin == null || endMin == null) { setShError('Pick a person and both times.'); return }
    if (endMin <= startMin) { setShError('Leave time has to be after arrive time.'); return }
    setShBusy(true)
    const ok = await addShift({ staffId: shStaff, date: shDate, startMin, endMin, note: shNote, createdBy: me?.id ?? null })
    setShBusy(false)
    if (ok) { setShNote(''); setShError(null) }
    else setShError('Could not save — has 0051_scheduled_shifts.sql been run in Supabase?')
  }

  return (
    <div className="sq-page" style={{ padding: '34px 40px 20px', maxWidth: 1180, margin: '0 auto' }}>
      <PageHero
        title="My Schedule"
        sub="Your shifts and the events you're assigned to run, day by day — arrive-by and leave times said plainly."
        chip={me ? me.name : 'you'}
      />

      {assignments === null && <p style={{ fontSize: 13, color: SUB }}>Loading your schedule…</p>}

      {assignments !== null && days.length === 0 && (
        <div className="sq-card" style={{ ...card, padding: '26px 28px', textAlign: 'center', marginBottom: 18 }}>
          <p style={{ fontSize: 14, fontWeight: 700, color: INK, margin: '0 0 4px' }}>Nothing on your schedule</p>
          <p style={{ fontSize: 12.5, color: SUB, margin: 0, lineHeight: 1.55 }}>
            When a manager posts you a shift or assigns you an event, it appears here with your
            arrive and leave times.
          </p>
        </div>
      )}

      {days.map((date) => {
        const dayShifts = myShifts.filter((s) => s.date === date)
        const dayEvents = (assignments ?? []).filter((a) => a.date === date)
        return (
          <div key={date} style={{ marginBottom: 18 }}>
            <p style={{ fontSize: 12, fontWeight: 800, color: SUB, textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 8px' }}>
              {dayLabel(date)}
            </p>
            <div className="sq-card" style={{ ...card, overflow: 'hidden' }}>
              {/* The shift is the day's headline — one answer to "when am
                  I working", however many events sit inside it. */}
              {dayShifts.map((s) => (
                <div key={s.id} style={{ padding: '13px 20px', background: NAVY, color: '#fff' }}>
                  <p style={{ fontSize: 14.5, fontWeight: 800, margin: 0 }}>
                    Your shift: arrive {minLabel(s.startMin)} · leave {minLabel(s.endMin)}
                  </p>
                  {s.note && <p style={{ fontSize: 12, opacity: 0.85, margin: '3px 0 0', lineHeight: 1.5 }}>{s.note}</p>}
                </div>
              ))}
              {dayShifts.length > 0 && dayEvents.length > 0 && (
                <p style={{ fontSize: 11, color: FAINT, margin: 0, padding: '8px 20px 0' }}>
                  During your shift:
                </p>
              )}
              {dayEvents.map((s, i) => (
                <div key={s.id} style={{ padding: '14px 20px', borderBottom: i < dayEvents.length - 1 ? `1px solid ${LINE}` : 'none' }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                    <p style={{ fontSize: 13.5, fontWeight: 700, color: INK, margin: 0 }}>{s.title}</p>
                    <span style={{ fontSize: 11.5, color: SUB }}>{s.room} · {s.client}</span>
                    {s.payoutCents != null && s.payoutCents > 0 && (
                      <span style={{ fontSize: 10.5, fontWeight: 700, color: GREEN, background: '#e5f2ea', padding: '1px 8px', borderRadius: 999 }}>
                        you earn {formatCents(s.payoutCents)}
                      </span>
                    )}
                  </div>
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
        )
      })}

      <p style={{ fontSize: 11.5, color: FAINT, margin: '14px 0 22px', lineHeight: 1.5 }}>
        Can&rsquo;t make one? Tell a manager right away so it can be handed to someone else.
      </p>

      {/* ── Manager panel: post and remove shifts for anyone ── */}
      {canManage && (
        <div className="sq-card" style={{ ...card, padding: '20px 24px' }}>
          <p style={{ fontSize: 13.5, fontWeight: 700, color: INK, margin: '0 0 4px' }}>Post a shift</p>
          <p style={{ fontSize: 12, color: SUB, margin: '0 0 12px', lineHeight: 1.5 }}>
            One line per person per day — &ldquo;arrive 8:30, leave 6:00&rdquo;. It becomes the headline on
            their My Schedule, with any assigned events listed inside it.
          </p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'end', marginBottom: 8 }}>
            <div>
              <label className="sq-label" htmlFor="sh-staff">Who</label>
              <select id="sh-staff" className="sq-select" value={shStaff} onChange={(e) => setShStaff(e.target.value)} style={{ minWidth: 170 }}>
                <option value="">— pick a person —</option>
                {allStaff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="sq-label" htmlFor="sh-date">Day</label>
              <input id="sh-date" type="date" className="sq-input" value={shDate} min={isoDate(0)} onChange={(e) => setShDate(e.target.value)} />
            </div>
            <div>
              <label className="sq-label" htmlFor="sh-from">Arrive</label>
              <input id="sh-from" type="time" className="sq-input" value={shFrom} onChange={(e) => setShFrom(e.target.value)} />
            </div>
            <div>
              <label className="sq-label" htmlFor="sh-to">Leave</label>
              <input id="sh-to" type="time" className="sq-input" value={shTo} onChange={(e) => setShTo(e.target.value)} />
            </div>
            <div style={{ flex: 1, minWidth: 180 }}>
              <label className="sq-label" htmlFor="sh-note">Note (optional)</label>
              <input id="sh-note" className="sq-input" placeholder="front desk, floater, opens the gym…" value={shNote} onChange={(e) => setShNote(e.target.value)} />
            </div>
            <button className="sq-btn sq-btn-primary" disabled={shBusy} onClick={postShift}>
              {shBusy ? 'Posting…' : 'Post shift'}
            </button>
          </div>
          {shError && <p style={{ fontSize: 12, color: RED, fontWeight: 600, margin: '0 0 8px' }}>{shError}</p>}
          {allShifts === null && (
            <p style={{ fontSize: 12, color: '#b07818', fontWeight: 600, margin: '6px 0 0' }}>
              Shifts need migration 0051_scheduled_shifts.sql — run it in Supabase to turn this on.
            </p>
          )}

          {allShifts !== null && allShifts.length > 0 && (
            <div style={{ marginTop: 10 }}>
              <span className="sq-label">Upcoming shifts — everyone</span>
              {allShifts.map((s) => (
                <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: `1px solid ${LINE}`, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: INK, minWidth: 140 }}>{s.staffName}</span>
                  <span style={{ fontSize: 12.5, color: SUB, minWidth: 150 }}>{dayLabel(s.date)}</span>
                  <span style={{ fontSize: 12.5, color: INK, fontVariantNumeric: 'tabular-nums' }}>{minLabel(s.startMin)} – {minLabel(s.endMin)}</span>
                  {s.note && <span style={{ fontSize: 11.5, color: FAINT, flex: 1 }}>{s.note}</span>}
                  <button className="sq-btn sq-btn-ghost" style={{ padding: '3px 10px', fontSize: 11, color: RED, marginLeft: 'auto' }}
                    onClick={async () => { if (window.confirm(`Remove ${s.staffName}'s shift on ${s.date}?`)) await deleteShift(s.id) }}>
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
