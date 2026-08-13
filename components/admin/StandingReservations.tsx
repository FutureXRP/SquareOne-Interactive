'use client'
import { useEffect, useState } from 'react'
import { card, INK, SUB, FAINT, LINE, BLUE, GREEN, GOLD } from '@/lib/theme'
import { formatCents, formatHour } from '@/lib/format'
import { roomLabel, type RoomConfig } from '@/lib/facilities-store'
import {
  getStandingReservations, addStandingReservation, patchStandingReservation,
  deleteStandingReservation, extendStanding, clearStanding, patternLabel,
  STANDING_EVENT, type StandingReservation, type StandingPattern,
} from '@/lib/standing-store'

// The groups that use the building on a schedule. Booking one out writes
// every occurrence into the calendar as a real booking, so the same
// no-overlap rule that protects a birthday party protects the fencing
// club's Tuesday night — and anything already on the books wins.

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const NTHS: { value: number; label: string }[] = [
  { value: 1, label: '1st' }, { value: 2, label: '2nd' }, { value: 3, label: '3rd' },
  { value: 4, label: '4th' }, { value: -1, label: 'last' },
]
const START_TIMES = Array.from({ length: 32 }, (_, i) => 6 + i * 0.5) // 6 AM – 9:30 PM
const LENGTHS = [0.5, 1, 1.5, 2, 2.5, 3, 4, 5, 6]

function isoToday(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function isoMonthsOut(months: number): string {
  const d = new Date()
  d.setMonth(d.getMonth() + months)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function prettyDate(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function dollarsToCents(v: string): number {
  const n = Number.parseFloat(v.replace(/[$,\s]/g, ''))
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : 0
}

const chip = (on: boolean): React.CSSProperties => ({
  font: 'inherit', cursor: 'pointer', fontSize: 12, fontWeight: 600, padding: '6px 12px',
  borderRadius: 9, border: `1.5px solid ${on ? BLUE : LINE}`, background: on ? '#eef4fb' : '#fff',
  color: on ? BLUE : INK,
})

export function StandingReservations({ rooms, canEdit }: { rooms: RoomConfig[]; canEdit: boolean }) {
  const [list, setList] = useState<StandingReservation[] | null>(null)
  const [migrationMissing, setMigrationMissing] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const [through, setThrough] = useState(isoMonthsOut(6))

  // New reservation
  const [room, setRoom] = useState('')
  const [title, setTitle] = useState('')
  const [group, setGroup] = useState('')
  const [email, setEmail] = useState('')
  const [pattern, setPattern] = useState<StandingPattern>('weekly')
  const [days, setDays] = useState<number[]>([])
  const [weekInterval, setWeekInterval] = useState(1)
  const [nths, setNths] = useState<number[]>([])
  const [startH, setStartH] = useState(18)
  const [hours, setHours] = useState(2)
  const [startsOn, setStartsOn] = useState(isoToday())
  const [endsOn, setEndsOn] = useState('')
  const [price, setPrice] = useState('')

  useEffect(() => {
    let on = true
    const sync = () => {
      getStandingReservations().then((r) => {
        if (!on) return
        if (r === null) { setMigrationMissing(true); setList([]) } else { setList(r); setMigrationMissing(false) }
      }).catch(() => { if (on) setList([]) })
    }
    sync()
    window.addEventListener(STANDING_EVENT, sync)
    return () => { on = false; window.removeEventListener(STANDING_EVENT, sync) }
  }, [])

  useEffect(() => { if (!room && rooms.length > 0) setRoom(rooms[0].id) }, [rooms, room])

  const toggle = (arr: number[], v: number, set: (n: number[]) => void) =>
    set(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v])

  const patternReady = days.length > 0 && (pattern === 'weekly' || nths.length > 0)
  const canCreate = !!room && title.trim().length > 0 && patternReady && !busy

  const create = async () => {
    if (!canCreate) return
    setBusy(true); setNote(null)
    const id = await addStandingReservation({
      facilityId: room, title: title.trim(), groupName: group.trim(), contactEmail: email,
      pattern, days, weekInterval, monthlyNths: nths,
      startH, hours, startsOn, endsOn: endsOn || null, priceCents: dollarsToCents(price),
    })
    if (!id) { setBusy(false); setNote('Couldn’t save that — run migration 0035 and try again.'); return }
    // Put it on the calendar right away; that's the whole point.
    const res = await extendStanding(id, through)
    setBusy(false)
    setShowNew(false)
    setTitle(''); setGroup(''); setEmail(''); setDays([]); setNths([]); setPrice('')
    if (res) setNote(describe(res.created, res.blocked, res.blockedOn))
  }

  const describe = (created: number, blocked: number, blockedOn: string[]): string => {
    const made = `Booked ${created} date${created === 1 ? '' : 's'} through ${prettyDate(through)}.`
    if (blocked === 0) return made
    const shown = blockedOn.slice(0, 6).map(prettyDate).join(', ')
    const more = blockedOn.length > 6 ? ` and ${blockedOn.length - 6} more` : ''
    return `${made} ${blocked} date${blocked === 1 ? ' was' : 's were'} already taken and left alone: ${shown}${more}.`
  }

  const extend = async (r: StandingReservation) => {
    setBusy(true); setNote(null)
    const res = await extendStanding(r.id, through)
    setBusy(false)
    setNote(res ? `${r.title}: ${describe(res.created, res.blocked, res.blockedOn)}` : 'Couldn’t book those dates.')
  }

  const pause = async (r: StandingReservation) => {
    if (!window.confirm(`Pause ${r.title} and take its upcoming dates off the calendar? Past dates stay.`)) return
    setBusy(true); setNote(null)
    const removed = await clearStanding(r.id)
    await patchStandingReservation(r.id, { active: false })
    setBusy(false)
    setNote(`Paused ${r.title} and freed ${removed} upcoming date${removed === 1 ? '' : 's'}.`)
  }

  const resume = async (r: StandingReservation) => {
    setBusy(true); setNote(null)
    await patchStandingReservation(r.id, { active: true })
    const res = await extendStanding(r.id, through)
    setBusy(false)
    setNote(res ? `${r.title}: ${describe(res.created, res.blocked, res.blockedOn)}` : `Resumed ${r.title}.`)
  }

  const remove = async (r: StandingReservation) => {
    if (!window.confirm(`Delete ${r.title}? Its upcoming dates come off the calendar; past dates stay as a record.`)) return
    setBusy(true); setNote(null)
    const ok = await deleteStandingReservation(r.id)
    setBusy(false)
    if (!ok) setNote('Couldn’t delete that one.')
  }

  return (
    <div className="sq-card" style={{ ...card, marginBottom: 22, overflow: 'hidden' }}>
      <div style={{ padding: '14px 20px', borderBottom: `1px solid ${LINE}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <span style={{ fontSize: 13.5, fontWeight: 700, color: INK }}>Standing reservations</span>
          <span style={{ fontSize: 11.5, color: FAINT, marginLeft: 10 }}>
            groups that use the building on a schedule — booked onto the calendar so nothing lands on top of them
          </span>
        </div>
        {canEdit && (
          <button className="sq-btn sq-btn-ghost" style={{ padding: '6px 13px', fontSize: 12 }} onClick={() => setShowNew((v) => !v)}>
            {showNew ? 'Close' : '+ Add standing reservation'}
          </button>
        )}
      </div>

      {migrationMissing && (
        <p style={{ fontSize: 12, color: '#b07818', background: '#faf0dc', padding: '10px 20px', margin: 0, lineHeight: 1.5 }}>
          Run migration <strong>0035_standing_reservations.sql</strong> in Supabase to turn this on.
        </p>
      )}

      {showNew && canEdit && (
        <div style={{ padding: '16px 20px', borderBottom: `1px solid ${LINE}`, background: '#fbfcfe' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 12 }}>
            <div>
              <label className="sq-label">Room</label>
              <select className="sq-select" value={room} onChange={(e) => setRoom(e.target.value)}>
                {rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </div>
            <div>
              <label className="sq-label">What to call it</label>
              <input className="sq-input" value={title} placeholder="Fencing club training" onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div>
              <label className="sq-label">Group</label>
              <input className="sq-input" value={group} placeholder="Tulsa Fencing Club" onChange={(e) => setGroup(e.target.value)} />
            </div>
            <div>
              <label className="sq-label">Contact email (optional)</label>
              <input className="sq-input" value={email} placeholder="coach@example.com" onChange={(e) => setEmail(e.target.value)} />
            </div>
          </div>

          <span className="sq-label">How often</span>
          <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
            <button style={chip(pattern === 'weekly')} onClick={() => setPattern('weekly')}>Every week</button>
            <button style={chip(pattern === 'monthly')} onClick={() => setPattern('monthly')}>Certain weeks of the month</button>
          </div>

          <span className="sq-label">Which days</span>
          <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
            {DAYS.map((d, i) => (
              <button key={d} style={chip(days.includes(i))} onClick={() => toggle(days, i, setDays)}>{d}</button>
            ))}
          </div>

          {pattern === 'weekly' ? (
            <div style={{ marginBottom: 10 }}>
              <label className="sq-label">Repeat</label>
              <select className="sq-select" style={{ width: 'auto', minWidth: 170 }} value={weekInterval} onChange={(e) => setWeekInterval(Number(e.target.value))}>
                <option value={1}>Every week</option>
                <option value={2}>Every other week</option>
                <option value={3}>Every 3 weeks</option>
                <option value={4}>Every 4 weeks</option>
              </select>
            </div>
          ) : (
            <>
              <span className="sq-label">Which weeks of the month</span>
              <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
                {NTHS.map((n) => (
                  <button key={n.value} style={chip(nths.includes(n.value))} onClick={() => toggle(nths, n.value, setNths)}>{n.label}</button>
                ))}
              </div>
            </>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 12 }}>
            <div>
              <label className="sq-label">Start time</label>
              <select className="sq-select" value={startH} onChange={(e) => setStartH(Number(e.target.value))}>
                {START_TIMES.map((h) => <option key={h} value={h}>{formatHour(h)}</option>)}
              </select>
            </div>
            <div>
              <label className="sq-label">How long</label>
              <select className="sq-select" value={hours} onChange={(e) => setHours(Number(e.target.value))}>
                {LENGTHS.map((h) => <option key={h} value={h}>{h} hour{h === 1 ? '' : 's'}</option>)}
              </select>
            </div>
            <div>
              <label className="sq-label">Starts</label>
              <input className="sq-input" type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} />
            </div>
            <div>
              <label className="sq-label">Ends (blank = ongoing)</label>
              <input className="sq-input" type="date" value={endsOn} onChange={(e) => setEndsOn(e.target.value)} />
            </div>
            <div>
              <label className="sq-label">Charge per session</label>
              <input className="sq-input" inputMode="decimal" placeholder="$0.00" value={price} onChange={(e) => setPrice(e.target.value)} />
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <button className="sq-btn sq-btn-primary" disabled={!canCreate} onClick={create}>
              {busy ? 'Booking…' : `Book it through ${prettyDate(through)}`}
            </button>
            <span style={{ fontSize: 11.5, color: FAINT, flex: 1, minWidth: 200, lineHeight: 1.5 }}>
              Each date goes on the calendar as a real booking. Any date already taken is skipped and reported —
              whoever booked first keeps the room.
            </span>
          </div>
        </div>
      )}

      {list === null ? (
        <p style={{ fontSize: 13, color: SUB, padding: '16px 20px', margin: 0 }}>Loading…</p>
      ) : list.length === 0 ? (
        <p style={{ fontSize: 13, color: SUB, padding: '16px 20px', margin: 0, lineHeight: 1.55 }}>
          No standing reservations yet — add the groups that come in on a schedule and their nights will be
          held on the calendar before anyone can book over them.
        </p>
      ) : list.map((r, i) => {
        const zone = roomLabel(r.facilityId)
        return (
          <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 20px', borderBottom: i < list.length - 1 ? `1px solid ${LINE}` : 'none', flexWrap: 'wrap', opacity: r.active ? 1 : 0.55 }}>
            <span style={{ width: 9, height: 9, borderRadius: 2, background: zone.color, flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 200 }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: INK, margin: 0 }}>
                {r.title} · {zone.name}
                {r.groupName && r.groupName !== r.title ? <span style={{ fontWeight: 500, color: SUB }}> · {r.groupName}</span> : null}
              </p>
              <p style={{ fontSize: 12, color: SUB, margin: 0, fontVariantNumeric: 'tabular-nums' }}>
                {patternLabel(r)} · {formatHour(r.startH)}–{formatHour(r.startH + r.hours)}
                {r.priceCents > 0 ? ` · ${formatCents(r.priceCents)} a session` : ' · no charge'}
                {r.endsOn ? ` · through ${prettyDate(r.endsOn)}` : ''}
              </p>
            </div>
            {r.active
              ? <span style={{ fontSize: 10.5, fontWeight: 700, color: GREEN, background: '#e5f2ea', padding: '2px 10px', borderRadius: 999 }}>On the calendar</span>
              : <span style={{ fontSize: 10.5, fontWeight: 700, color: GOLD, background: '#faf0dc', padding: '2px 10px', borderRadius: 999 }}>Paused</span>}
            {canEdit && (
              <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {r.active ? (
                  <>
                    <button className="sq-btn sq-btn-primary" style={{ padding: '5px 12px', fontSize: 11.5 }} disabled={busy} onClick={() => extend(r)}>Book more dates</button>
                    <button className="sq-btn sq-btn-ghost" style={{ padding: '5px 12px', fontSize: 11.5 }} disabled={busy} onClick={() => pause(r)}>Pause</button>
                  </>
                ) : (
                  <button className="sq-btn sq-btn-primary" style={{ padding: '5px 12px', fontSize: 11.5 }} disabled={busy} onClick={() => resume(r)}>Resume</button>
                )}
                <button className="sq-btn sq-btn-danger" style={{ padding: '5px 12px', fontSize: 11.5 }} disabled={busy} onClick={() => remove(r)}>Delete</button>
              </span>
            )}
          </div>
        )
      })}

      {(list?.length ?? 0) > 0 && canEdit && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 20px', borderTop: `1px solid ${LINE}`, background: '#fbfcfe', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11.5, color: SUB }}>Book dates out through</span>
          <input className="sq-input" type="date" style={{ width: 'auto' }} value={through} onChange={(e) => setThrough(e.target.value)} />
          <span style={{ fontSize: 11.5, color: FAINT, flex: 1, minWidth: 180 }}>
            Come back and push this out further whenever you want more of the year held.
          </span>
        </div>
      )}

      {note && (
        <p style={{ fontSize: 12, color: INK, background: '#eef4fb', padding: '10px 20px', margin: 0, lineHeight: 1.55 }}>{note}</p>
      )}
    </div>
  )
}
