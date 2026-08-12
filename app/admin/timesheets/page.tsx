'use client'
import { useEffect, useMemo, useState } from 'react'
import { PageHero, HeroStat } from '@/components/admin/PageHero'
import { card, INK, SUB, FAINT, LINE, BLUE, GREEN } from '@/lib/theme'
import { getStaff, getMyStaff, isAdminRole, ROLE_LABEL, type StaffMember } from '@/lib/staff-store'
import { getShifts, clockIn, clockOut, deleteShift, addManualShift, SHIFTS_EVENT, type Shift } from '@/lib/timeclock-store'
import { isSupabaseConfigured } from '@/lib/supabase'

const RANGES = [
  { days: 7, label: 'This week' },
  { days: 31, label: 'This month' },
  { days: 365, label: 'Last year' },
]

function fmtMin(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

export default function TimesheetsPage() {
  const [shifts, setShifts] = useState<Shift[] | null>(null)
  const [staff, setStaffList] = useState<StaffMember[]>([])
  const [me, setMe] = useState<StaffMember | null>(null)
  const [range, setRange] = useState(7)
  const [checked, setChecked] = useState(false)
  const [busy, setBusy] = useState(false)
  const [, tick] = useState(0)
  // Manual entry (admins)
  const [showManual, setShowManual] = useState(false)
  const [mStaff, setMStaff] = useState('')
  const [mDate, setMDate] = useState('')
  const [mIn, setMIn] = useState('09:00')
  const [mOut, setMOut] = useState('17:00')
  const [mNote, setMNote] = useState('')

  useEffect(() => {
    if (!isSupabaseConfigured()) return
    let on = true
    const sync = () => {
      Promise.all([getShifts(range), getStaff().catch(() => []), getMyStaff().catch(() => null)]).then(([sh, s, m]) => {
        if (on) { setShifts(sh); setStaffList(s); setMe(m); setChecked(true) }
      }).catch(() => {})
    }
    sync()
    window.addEventListener(SHIFTS_EVENT, sync)
    const timer = window.setInterval(() => tick((n) => n + 1), 30_000) // live "on the clock" timers
    return () => { on = false; window.removeEventListener(SHIFTS_EVENT, sync); window.clearInterval(timer) }
  }, [range])

  const list = useMemo(() => shifts ?? [], [shifts])
  const myOpen = me ? list.find((s) => s.staffId === me.id && !s.outIso) : undefined
  const openNow = list.filter((s) => !s.outIso)
  const liveMin = (s: Shift) => Math.max(1, Math.round((Date.now() - new Date(s.inIso).getTime()) / 60_000))

  // Hours per person across the range (open shifts count up to "now").
  const totals = useMemo(() => {
    const m = new Map<string, { name: string; minutes: number; shifts: number; onClock: boolean }>()
    for (const s of list) {
      const cur = m.get(s.staffId) ?? { name: s.staffName, minutes: 0, shifts: 0, onClock: false }
      cur.minutes += s.minutes ?? liveMin(s)
      cur.shifts += 1
      cur.onClock = cur.onClock || !s.outIso
      m.set(s.staffId, cur)
    }
    return [...m.values()].sort((a, b) => b.minutes - a.minutes)
  }, [list])

  const punch = async () => {
    if (!me || busy) return
    setBusy(true)
    if (myOpen) await clockOut(myOpen.id)
    else await clockIn(me.id)
    setBusy(false)
  }

  const saveManual = async () => {
    if (!mStaff || !mDate || busy) return
    const inIso = new Date(`${mDate}T${mIn}:00`).toISOString()
    const outIso = new Date(`${mDate}T${mOut}:00`).toISOString()
    if (outIso <= inIso) return
    setBusy(true)
    const ok = await addManualShift(mStaff, inIso, outIso, mNote.trim() || 'added by admin')
    if (ok) { setShowManual(false); setMNote('') }
    setBusy(false)
  }

  const amAdmin = isAdminRole(me?.role)

  return (
    <div className="sq-page" style={{ padding: '34px 40px 20px', maxWidth: 1180, margin: '0 auto' }}>
      <PageHero title="Time Clock" sub="Clock in when you arrive, out when you leave. Pay is per event — this is the attendance record: who worked, when, and how long." chip={`${openNow.length} on the clock`}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <HeroStat label="On the clock" value={String(openNow.length)} sub={openNow.map((s) => s.staffName).slice(0, 3).join(', ') || 'nobody right now'} />
          {me && shifts !== null && (
            <button className="sq-btn" style={{ background: '#fff', color: '#182740' }} disabled={busy} onClick={punch}>
              {busy ? '…' : myOpen ? `Clock out — ${fmtMin(liveMin(myOpen))} so far` : `Clock in as ${me.name}`}
            </button>
          )}
        </div>
      </PageHero>

      {shifts === null && checked && (
        <div className="sq-card" style={{ ...card, padding: '18px 22px', marginBottom: 20 }}>
          <p style={{ fontSize: 13, color: SUB, margin: 0, lineHeight: 1.6 }}>
            The time clock needs <strong>0025_time_clock.sql</strong> — run it in Supabase and this page goes live.
          </p>
        </div>
      )}

      {/* Range picker */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 18, flexWrap: 'wrap', alignItems: 'center' }}>
        {RANGES.map((r) => (
          <button key={r.days} onClick={() => setRange(r.days)} style={{
            font: 'inherit', cursor: 'pointer', fontSize: 12.5, fontWeight: 600,
            color: range === r.days ? '#fff' : SUB, background: range === r.days ? BLUE : '#fff',
            border: `1.5px solid ${range === r.days ? BLUE : LINE}`, borderRadius: 999, padding: '6px 16px',
          }}>
            {r.label}
          </button>
        ))}
        {amAdmin && shifts !== null && (
          <button className="sq-btn sq-btn-ghost" style={{ padding: '6px 14px', fontSize: 12, marginLeft: 'auto' }} onClick={() => { setShowManual((v) => !v); setMDate(new Date().toISOString().slice(0, 10)) }}>
            {showManual ? 'Close' : '+ Add a shift by hand'}
          </button>
        )}
      </div>

      {/* Manual entry — for "forgot to clock in" */}
      {showManual && amAdmin && (
        <div className="sq-card" style={{ ...card, padding: '16px 20px', marginBottom: 18 }}>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div>
              <label className="sq-label">Staff member</label>
              <select className="sq-select" style={{ width: 180 }} value={mStaff} onChange={(e) => setMStaff(e.target.value)}>
                <option value="">— pick —</option>
                {staff.map((s) => <option key={s.id} value={s.id}>{s.name} · {ROLE_LABEL[s.role]}</option>)}
              </select>
            </div>
            <div>
              <label className="sq-label">Date</label>
              <input type="date" className="sq-input" style={{ width: 150 }} value={mDate} onChange={(e) => setMDate(e.target.value)} />
            </div>
            <div>
              <label className="sq-label">In</label>
              <input type="time" className="sq-input" style={{ width: 110 }} value={mIn} onChange={(e) => setMIn(e.target.value)} />
            </div>
            <div>
              <label className="sq-label">Out</label>
              <input type="time" className="sq-input" style={{ width: 110 }} value={mOut} onChange={(e) => setMOut(e.target.value)} />
            </div>
            <div style={{ flex: 1, minWidth: 160 }}>
              <label className="sq-label">Note</label>
              <input className="sq-input" placeholder="forgot to clock in" value={mNote} onChange={(e) => setMNote(e.target.value)} />
            </div>
            <button className="sq-btn sq-btn-primary" style={{ padding: '9px 18px' }} disabled={!mStaff || !mDate || busy} onClick={saveManual}>Save shift</button>
          </div>
        </div>
      )}

      <div className="sq-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1.6fr', gap: 16, alignItems: 'start' }}>
        {/* Totals per person */}
        <div className="sq-card" style={{ ...card, overflow: 'hidden' }}>
          <div style={{ padding: '14px 20px', borderBottom: `1px solid ${LINE}` }}>
            <span style={{ fontSize: 13.5, fontWeight: 700, color: INK }}>Hours by person</span>
          </div>
          {totals.length === 0 ? (
            <p style={{ fontSize: 13, color: SUB, padding: '16px 20px', margin: 0 }}>No shifts in this range yet.</p>
          ) : totals.map((t, i) => (
            <div key={t.name} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 20px', borderBottom: i < totals.length - 1 ? `1px solid ${LINE}` : 'none' }}>
              <span style={{ width: 30, height: 30, borderRadius: '50%', background: t.onClock ? '#e5f2ea' : '#eef4fb', color: t.onClock ? GREEN : BLUE, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, textTransform: 'uppercase', flexShrink: 0 }}>
                {t.name.charAt(0)}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 13, fontWeight: 700, color: INK, margin: 0 }}>
                  {t.name}
                  {t.onClock && <span style={{ fontSize: 10, fontWeight: 700, color: GREEN, background: '#e5f2ea', padding: '1px 8px', borderRadius: 999, marginLeft: 8 }}>on the clock</span>}
                </p>
                <p style={{ fontSize: 11.5, color: SUB, margin: 0 }}>{t.shifts} shift{t.shifts === 1 ? '' : 's'}</p>
              </div>
              <span style={{ fontSize: 13.5, fontWeight: 700, color: INK, fontVariantNumeric: 'tabular-nums' }}>{fmtMin(t.minutes)}</span>
            </div>
          ))}
        </div>

        {/* Shift log */}
        <div className="sq-card" style={{ ...card, overflow: 'hidden' }}>
          <div style={{ padding: '14px 20px', borderBottom: `1px solid ${LINE}` }}>
            <span style={{ fontSize: 13.5, fontWeight: 700, color: INK }}>Shift log</span>
          </div>
          {list.length === 0 ? (
            <p style={{ fontSize: 13, color: SUB, padding: '16px 20px', margin: 0 }}>No shifts yet — the first clock-in starts the log.</p>
          ) : list.slice(0, 60).map((s, i) => (
            <div key={s.id} className="sq-row" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 20px', borderBottom: i < Math.min(list.length, 60) - 1 ? `1px solid ${LINE}` : 'none' }}>
              <span style={{ fontSize: 11.5, color: FAINT, minWidth: 52 }}>{s.dateLabel}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 13, fontWeight: 700, color: INK, margin: 0 }}>{s.staffName}</p>
                <p style={{ fontSize: 11.5, color: SUB, margin: 0 }}>
                  {s.inLabel} – {s.outLabel ?? 'now'}{s.note ? ` · ${s.note}` : ''}
                </p>
              </div>
              {s.outIso
                ? <span style={{ fontSize: 12.5, fontWeight: 700, color: INK, fontVariantNumeric: 'tabular-nums' }}>{fmtMin(s.minutes ?? 0)}</span>
                : <span style={{ fontSize: 10.5, fontWeight: 700, color: GREEN, background: '#e5f2ea', padding: '2px 10px', borderRadius: 999 }}>{fmtMin(liveMin(s))} so far</span>}
              {amAdmin && (
                <button aria-label="Delete shift" style={{ font: 'inherit', cursor: 'pointer', border: 'none', background: 'transparent', color: FAINT, fontSize: 14, lineHeight: 1 }}
                  onClick={async () => { if (window.confirm(`Delete this ${s.staffName} shift?`)) await deleteShift(s.id) }}>×</button>
              )}
            </div>
          ))}
        </div>
      </div>

      <p style={{ fontSize: 11.5, color: FAINT, marginTop: 16 }}>
        Everyone clocks themselves in and out from this page on any device. Admins can add a missed shift by hand or delete a bad punch.
      </p>
    </div>
  )
}
