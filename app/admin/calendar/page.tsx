'use client'
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { PageHero, HeroStat } from '@/components/admin/PageHero'
import { card, INK, SUB, FAINT, LINE, BLUE, GREEN } from '@/lib/theme'
import { formatCents, formatHour } from '@/lib/format'
import { roomLabel, getActiveRooms, type RoomConfig } from '@/lib/facilities-store'
import { StandingReservations } from '@/components/admin/StandingReservations'
import { getStaffBookings, BOOKINGS_EVENT, type StaffBooking } from '@/lib/staff-bookings-store'
import {
  getEvents, addEvent, patchEvent, deleteEvent, KIND_LABEL, KIND_COLOR, STATUS_LABEL,
  EVENTS_EVENT, type StaffEvent, type EventKind, type EventStatus,
} from '@/lib/events-store'
import { getStaff, getMyStaff, CAN_BOOK, type StaffMember } from '@/lib/staff-store'
import { isSupabaseConfigured, supabase as supabaseClient } from '@/lib/supabase'

const START_TIMES = Array.from({ length: 30 }, (_, i) => 7 + i * 0.5) // 7 AM – 9:30 PM
const LENGTHS = [0.5, 1, 1.5, 2, 3, 4]

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
  const [rooms, setRooms] = useState<RoomConfig[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [events, setEvents] = useState<StaffEvent[] | null>(null)
  const [staff, setStaffList] = useState<StaffMember[]>([])
  const [me, setMe] = useState<StaffMember | null>(null)
  const [showNew, setShowNew] = useState(false)
  const [busy, setBusy] = useState(false)
  const [reminderNote, setReminderNote] = useState<string | null>(null)
  const todayIso = isoOf(now.getFullYear(), now.getMonth(), now.getDate())

  // New tour / event form
  const [evKind, setEvKind] = useState<EventKind>('tour')
  const [evTitle, setEvTitle] = useState('')
  const [evGuest, setEvGuest] = useState('')
  const [evEmail, setEvEmail] = useState('')
  const [evPhone, setEvPhone] = useState('')
  const [evParty, setEvParty] = useState('')
  const [evStart, setEvStart] = useState(14)
  const [evLength, setEvLength] = useState(0.5)
  const [evStaff, setEvStaff] = useState('')
  const [evNotes, setEvNotes] = useState('')

  useEffect(() => {
    if (!isSupabaseConfigured()) return
    let on = true
    const sync = () => {
      Promise.all([getStaffBookings(), getActiveRooms()])
        .then(([b, r]) => { if (on) { setBookings(b.filter((x) => x.status === 'hold' || x.status === 'confirmed')); setRooms(r) } })
        .catch(() => {})
      // Tours and events for the month on screen, plus a margin either side.
      const from = isoOf(year, month, 1)
      const last = new Date(year, month + 1, 0).getDate()
      getEvents(from, isoOf(year, month, last)).then((list) => { if (on) setEvents(list) }).catch(() => {})
      getStaff().then((s) => { if (on) setStaffList(s) }).catch(() => {})
      getMyStaff().then((m) => { if (on) setMe(m) }).catch(() => {})
    }
    sync()
    window.addEventListener(BOOKINGS_EVENT, sync)
    window.addEventListener(EVENTS_EVENT, sync)
    return () => {
      on = false
      window.removeEventListener(BOOKINGS_EVENT, sync)
      window.removeEventListener(EVENTS_EVENT, sync)
    }
  }, [year, month])

  const eventsByDate = useMemo(() => {
    const map = new Map<string, StaffEvent[]>()
    for (const e of events ?? []) {
      const list = map.get(e.dateIso) ?? []
      list.push(e)
      map.set(e.dateIso, list)
    }
    for (const list of map.values()) list.sort((a, b) => a.startH - b.startH)
    return map
  }, [events])

  const createEvent = async () => {
    if (!selected || busy) return
    setBusy(true)
    const id = await addEvent({
      kind: evKind,
      title: evTitle.trim() || (evGuest.trim() ? `${KIND_LABEL[evKind]} — ${evGuest.trim()}` : KIND_LABEL[evKind]),
      guestName: evGuest,
      guestEmail: evEmail,
      guestPhone: evPhone,
      partySize: evParty.trim() ? Number.parseInt(evParty, 10) || null : null,
      date: selected,
      startH: evStart,
      hours: evLength,
      assignedStaffId: evStaff || null,
      notes: evNotes,
      createdBy: me?.id ?? null,
    })
    setBusy(false)
    if (id) {
      setShowNew(false)
      setEvTitle(''); setEvGuest(''); setEvEmail(''); setEvPhone(''); setEvParty(''); setEvNotes(''); setEvStaff('')
    }
  }

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
      <PageHero title="Calendar" sub="Bookings, tours, and scheduled events on one calendar — click a day to see it all, or to schedule a tour." chip={`${monthCount} this month`}>
        <HeroStat label="On the books" value={String(bookings.length)} sub="holds + confirmed" />
      </PageHero>

      {/* Standing groups first — they're what the rest of the schedule fits around */}
      <StandingReservations rooms={rooms} canEdit={!!me && CAN_BOOK.includes(me.role)} />

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
                {(eventsByDate.get(iso) ?? []).slice(0, 2).map((e) => (
                  <span key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 9.5, color: SUB, marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden' }}>
                    <span style={{ width: 6, height: 6, borderRadius: 999, background: KIND_COLOR[e.kind], flexShrink: 0 }} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: 600 }}>{formatHour(e.startH)} {e.kind === 'tour' ? 'Tour' : e.title}</span>
                  </span>
                ))}
                {list.slice(0, Math.max(0, 2 - (eventsByDate.get(iso)?.length ?? 0))).map((b) => {
                  const room = roomLabel(b.roomId)
                  return (
                    <span key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 9.5, color: SUB, marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden' }}>
                      <span style={{ width: 6, height: 6, borderRadius: 2, background: room.color, flexShrink: 0 }} />
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{formatHour(b.startH)} {room.name}</span>
                    </span>
                  )
                })}
                {(() => {
                  const total = list.length + (eventsByDate.get(iso)?.length ?? 0)
                  return total > 2 ? <span style={{ fontSize: 9.5, fontWeight: 700, color: BLUE }}>+{total - 2} more</span> : null
                })()}
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
            <span style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
              <button onClick={() => setShowNew((v) => !v)} style={{ font: 'inherit', cursor: 'pointer', border: 'none', background: 'transparent', color: BLUE, fontSize: 12.5, fontWeight: 600 }}>
                {showNew ? 'Close' : '+ Schedule a tour or event'}
              </button>
              <Link href="/admin/bookings?new=1" style={{ fontSize: 12.5, color: BLUE, fontWeight: 600, textDecoration: 'none' }}>+ Book a room</Link>
            </span>
          </div>

          {/* Schedule a tour on this day */}
          {showNew && (
            <div style={{ padding: '14px 20px', borderBottom: `1px solid ${LINE}`, background: '#fafbfd' }}>
              {events === null ? (
                <p style={{ fontSize: 12.5, color: '#b07818', margin: 0, fontWeight: 600 }}>
                  Tours and events need 0032_tours_events.sql — run it in Supabase to turn this on.
                </p>
              ) : (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 12 }}>
                    <div>
                      <label className="sq-label">What is it?</label>
                      <select className="sq-select" value={evKind} onChange={(e) => setEvKind(e.target.value as EventKind)}>
                        {(Object.keys(KIND_LABEL) as EventKind[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="sq-label">Start</label>
                      <select className="sq-select" value={evStart} onChange={(e) => setEvStart(Number(e.target.value))}>
                        {START_TIMES.map((h) => <option key={h} value={h}>{formatHour(h)}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="sq-label">How long</label>
                      <select className="sq-select" value={evLength} onChange={(e) => setEvLength(Number(e.target.value))}>
                        {LENGTHS.map((h) => <option key={h} value={h}>{h === 0.5 ? '30 min' : `${h} hour${h > 1 ? 's' : ''}`}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="sq-label">Who runs it</label>
                      <select className="sq-select" value={evStaff} onChange={(e) => setEvStaff(e.target.value)}>
                        <option value="">— assign later —</option>
                        {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 12 }}>
                    <div>
                      <label className="sq-label">Guest name</label>
                      <input className="sq-input" value={evGuest} placeholder="Henderson family" onChange={(e) => setEvGuest(e.target.value)} />
                    </div>
                    <div>
                      <label className="sq-label">Their email</label>
                      <input className="sq-input" type="email" value={evEmail} placeholder="for their confirmation" onChange={(e) => setEvEmail(e.target.value)} />
                    </div>
                    <div>
                      <label className="sq-label">Phone</label>
                      <input className="sq-input" value={evPhone} onChange={(e) => setEvPhone(e.target.value)} />
                    </div>
                    <div>
                      <label className="sq-label">How many coming</label>
                      <input className="sq-input" inputMode="numeric" value={evParty} onChange={(e) => setEvParty(e.target.value)} />
                    </div>
                  </div>
                  <div style={{ marginBottom: 12 }}>
                    <label className="sq-label">Notes for whoever runs it</label>
                    <input className="sq-input" value={evNotes} placeholder="Interested in a birthday party for 20 in the Gaming Zone" onChange={(e) => setEvNotes(e.target.value)} />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                    <button className="sq-btn sq-btn-primary" disabled={busy} onClick={createEvent}>
                      {busy ? 'Scheduling…' : 'Schedule it'}
                    </button>
                    <span style={{ fontSize: 11.5, color: FAINT }}>
                      {evStaff ? 'They get an email now, and a reminder the day before.' : 'Assign someone and they’ll be emailed straight away.'}
                      {evEmail.includes('@') && ' The guest gets a confirmation too.'}
                    </span>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Tours & events on this day */}
          {(eventsByDate.get(selected) ?? []).map((e) => (
            <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 20px', borderBottom: `1px solid ${LINE}`, flexWrap: 'wrap', background: '#fcfdff' }}>
              <span style={{ width: 10, height: 10, borderRadius: 999, background: KIND_COLOR[e.kind], flexShrink: 0 }} />
              <span style={{ fontSize: 12.5, fontWeight: 700, color: INK, fontVariantNumeric: 'tabular-nums', minWidth: 120 }}>{e.timeLabel}</span>
              <span style={{ flex: 1, minWidth: 160, fontSize: 12.5, color: INK }}>
                <strong>{e.title}</strong>
                {e.guestName && <span style={{ color: SUB }}> · {e.guestName}</span>}
                {e.partySize ? <span style={{ color: FAINT }}> · party of {e.partySize}</span> : null}
                {e.notes && <span style={{ display: 'block', fontSize: 11.5, color: FAINT }}>{e.notes}</span>}
              </span>
              <select className="sq-select" style={{ width: 'auto', padding: '5px 9px', fontSize: 11.5 }}
                value={e.assignedStaffId ?? ''} onChange={(ev) => patchEvent(e.id, { assignedStaffId: ev.target.value || null })}>
                <option value="">— unassigned —</option>
                {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <select className="sq-select" style={{ width: 'auto', padding: '5px 9px', fontSize: 11.5 }}
                value={e.status} onChange={(ev) => patchEvent(e.id, { status: ev.target.value as EventStatus })}>
                {(Object.keys(STATUS_LABEL) as EventStatus[]).map((st) => <option key={st} value={st}>{STATUS_LABEL[st]}</option>)}
              </select>
              <button aria-label="Delete" onClick={async () => { if (window.confirm(`Delete "${e.title}"?`)) await deleteEvent(e.id) }}
                style={{ font: 'inherit', cursor: 'pointer', border: 'none', background: 'transparent', color: FAINT, fontSize: 15, lineHeight: 1 }}>×</button>
            </div>
          ))}
          {dayList.length === 0 && (eventsByDate.get(selected)?.length ?? 0) === 0 && (
            <p style={{ fontSize: 13, color: SUB, padding: '16px 20px', margin: 0 }}>Nothing booked — the day is wide open.</p>
          )}
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

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12, flexWrap: 'wrap' }}>
        <button className="sq-btn sq-btn-ghost" style={{ padding: '6px 13px', fontSize: 11.5 }} disabled={busy} onClick={async () => {
          setBusy(true)
          setReminderNote(null)
          try {
            const { data } = await supabaseClient().auth.getSession()
            const token = data.session?.access_token
            const res = await fetch('/api/reminders/run', { method: 'POST', headers: { authorization: `Bearer ${token ?? ''}` } })
            const body = await res.json() as { staffSent?: number; guestsSent?: number; message?: string }
            setReminderNote(res.ok
              ? `Sent ${body.staffSent ?? 0} staff reminder${body.staffSent === 1 ? '' : 's'} and ${body.guestsSent ?? 0} guest reminder${body.guestsSent === 1 ? '' : 's'}.`
              : body.message ?? 'Could not run reminders.')
          } catch {
            setReminderNote('Could not run reminders.')
          }
          setBusy(false)
        }}>
          Send reminders now
        </button>
        <span style={{ fontSize: 11.5, color: reminderNote ? INK : FAINT }}>
          {reminderNote ?? 'Reminders go out automatically every hour for anything starting in the next day.'}
        </span>
      </div>

      <p style={{ fontSize: 11.5, color: FAINT, marginTop: 10 }}>
        Live — store requests, desk bookings, and tours appear the moment they happen. The day-by-day lane view is on{' '}
        <Link href="/admin/board" style={{ color: BLUE, fontWeight: 600 }}>The Board</Link>.
      </p>
    </div>
  )
}
