'use client'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { PageHero, HeroStat } from '@/components/admin/PageHero'
import { card, INK, SUB, FAINT, LINE, BLUE, GREEN, RED } from '@/lib/theme'
import { formatCents, formatHour } from '@/lib/format'
import { roomLabel, getActiveRooms } from '@/lib/facilities-store'
import {
  bookingsForDate, recordPayment, bookingPayUrl, isoDate, BOOKINGS_EVENT, PAY_LABEL,
  type StaffBooking, type PayMethod,
} from '@/lib/staff-bookings-store'
import { getTodayCheckIns, recordCheckIn, CHECKINS_EVENT, type CheckIn } from '@/lib/checkins-store'
import { getMyStaff, type StaffMember } from '@/lib/staff-store'
import { isSupabaseConfigured } from '@/lib/supabase'

const PAY_METHODS: PayMethod[] = ['stripe', 'cash', 'cashapp']
const WALKIN_CONTEXTS = ['Gym member', 'Guest / day pass', 'Party guest', 'Program', 'Vendor / other']

function dollarsToCents(v: string): number {
  const n = Number.parseFloat(v.replace(/[$,\s]/g, ''))
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : 0
}

// The amount the desk should ask for right now: unpaid deposit first,
// then the remaining balance.
function dueNow(b: StaffBooking): { label: string; cents: number } {
  const remaining = b.priceCents - b.paidCents
  const deposit = b.depositCents ?? 0
  if (deposit > 0 && b.paidCents < deposit) return { label: 'deposit', cents: Math.min(deposit - b.paidCents, remaining) }
  return { label: 'balance', cents: remaining }
}

export default function FrontDeskPage() {
  const [bookings, setBookings] = useState<StaffBooking[]>([])
  const [checkIns, setCheckIns] = useState<CheckIn[]>([])
  const [me, setMe] = useState<StaffMember | null>(null)
  const [payingId, setPayingId] = useState<string | null>(null)
  const [payAmount, setPayAmount] = useState('')
  const [walkName, setWalkName] = useState('')
  const [walkContext, setWalkContext] = useState(WALKIN_CONTEXTS[0])
  const [busy, setBusy] = useState(false)
  const [justChecked, setJustChecked] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!isSupabaseConfigured()) return
    let on = true
    const sync = () => {
      Promise.all([bookingsForDate(isoDate(0)), getTodayCheckIns(), getMyStaff(), getActiveRooms()])
        .then(([b, c, m]) => { if (on) { setBookings(b.sort((x, y) => x.startH - y.startH)); setCheckIns(c); setMe(m) } })
        .catch(() => {})
    }
    sync()
    window.addEventListener(BOOKINGS_EVENT, sync)
    window.addEventListener(CHECKINS_EVENT, sync)
    return () => { on = false; window.removeEventListener(BOOKINGS_EVENT, sync); window.removeEventListener(CHECKINS_EVENT, sync) }
  }, [])

  const checkInParty = async (b: StaffBooking) => {
    setBusy(true)
    const ok = await recordCheckIn(b.client, `${b.title} · ${b.code}`)
    setBusy(false)
    if (ok) setJustChecked((cur) => new Set(cur).add(b.id))
  }

  const walkIn = async () => {
    if (!walkName.trim() || busy) return
    setBusy(true)
    const ok = await recordCheckIn(walkName.trim(), walkContext)
    setBusy(false)
    if (ok) setWalkName('')
  }

  const takePayment = async (b: StaffBooking, method: PayMethod) => {
    if (!me || busy) return
    // Cards are charged on the booking's secure page, never asserted here.
    if (method === 'stripe') {
      const url = bookingPayUrl(b)
      if (url) window.open(url, '_blank', 'noopener')
      else window.alert('Run migration 0037 to turn on card payment links.')
      return
    }
    const cents = payAmount.trim() === '' ? dueNow(b).cents : dollarsToCents(payAmount)
    if (cents <= 0) return
    setBusy(true)
    await recordPayment(b, method, me.id, cents)
    setBusy(false)
    setPayingId(null)
    setPayAmount('')
  }

  const arrivedCodes = new Set(
    checkIns.flatMap((c) => { const m = /BK-[a-z0-9]+/i.exec(c.context); return m ? [m[0]] : [] })
  )
  const collectedToday = bookings.reduce((n, b) => n + b.paidCents, 0)

  return (
    <div className="sq-page" style={{ padding: '34px 40px 20px', maxWidth: 1180, margin: '0 auto' }}>
      <PageHero title="Front Desk" sub="Run the desk: check parties in, take payments, and get walk-ins through the door — everything here is live." chip={`${bookings.length} bookings today`}>
        <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
          <HeroStat label="Checked in today" value={String(checkIns.length)} sub="through the desk" />
          <Link href="/admin/bookings?new=1" className="sq-btn" style={{ background: '#fff', color: '#182740' }}>+ Book a room</Link>
        </div>
      </PageHero>

      <div className="sq-grid-2" style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 1.7fr) minmax(260px, 1fr)', gap: 16 }}>
        {/* Today's bookings */}
        <div className="sq-card" style={{ ...card, alignSelf: 'start', overflow: 'hidden' }}>
          <div style={{ padding: '13px 20px', borderBottom: `1px solid ${LINE}` }}>
            <span style={{ fontSize: 13.5, fontWeight: 700, color: INK }}>Today&apos;s bookings</span>
            <span style={{ fontSize: 11.5, color: FAINT, marginLeft: 10, fontVariantNumeric: 'tabular-nums' }}>{formatCents(collectedToday)} collected</span>
          </div>
          {bookings.length === 0 && (
            <p style={{ fontSize: 13, color: SUB, padding: '18px 20px', margin: 0 }}>
              {isSupabaseConfigured() ? 'No bookings on the book today.' : 'Connect Supabase to see the live desk.'}
            </p>
          )}
          {bookings.map((b, i) => {
            const room = roomLabel(b.roomId)
            const due = dueNow(b)
            const paidUp = b.paidCents >= b.priceCents
            const arrived = arrivedCodes.has(b.code) || justChecked.has(b.id)
            const paying = payingId === b.id
            return (
              <div key={b.id} style={{ borderBottom: i < bookings.length - 1 ? `1px solid ${LINE}` : 'none', padding: '12px 20px' }}>
                <div className="sq-row" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <span style={{ width: 10, height: 10, borderRadius: 3, background: room.color, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 150 }}>
                    <p style={{ fontSize: 13, fontWeight: 700, color: INK, margin: 0 }}>
                      {formatHour(b.startH)}–{formatHour(b.startH + b.hours)} · {room.name}
                    </p>
                    <p style={{ fontSize: 11.5, color: SUB, margin: 0 }}>
                      {b.client} · {b.code}
                      {b.status === 'hold' && <span style={{ color: '#b07818', fontWeight: 700 }}> · hold</span>}
                    </p>
                  </div>
                  <span style={{ fontSize: 11.5, fontVariantNumeric: 'tabular-nums', color: paidUp ? GREEN : SUB, fontWeight: 700 }}>
                    {paidUp ? `Paid ${formatCents(b.priceCents)}` : `${formatCents(b.paidCents)} of ${formatCents(b.priceCents)}`}
                  </span>
                  {!paidUp && (b.depositCents ?? 0) > 0 && b.paidCents < (b.depositCents ?? 0) && (
                    <span style={{ fontSize: 10, fontWeight: 700, color: '#b07818', background: '#faf0dc', padding: '1px 8px', borderRadius: 999 }}>
                      deposit due {formatCents((b.depositCents ?? 0) - b.paidCents)}
                    </span>
                  )}
                  {arrived
                    ? <span style={{ fontSize: 10, fontWeight: 700, color: GREEN, background: '#e5f2ea', padding: '2px 9px', borderRadius: 999 }}>checked in ✓</span>
                    : <button className="sq-btn sq-btn-ghost" style={{ padding: '5px 12px', fontSize: 11.5 }} disabled={busy} onClick={() => checkInParty(b)}>Check in party</button>}
                  {!paidUp && (
                    <button className="sq-btn sq-btn-primary" style={{ padding: '5px 12px', fontSize: 11.5 }} onClick={() => { setPayingId(paying ? null : b.id); setPayAmount('') }}>
                      {paying ? 'Close' : 'Take payment'}
                    </button>
                  )}
                </div>
                {paying && !paidUp && (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 10, paddingLeft: 20 }}>
                    <input className="sq-input" style={{ width: 110 }} inputMode="decimal" value={payAmount}
                      placeholder={(due.cents / 100).toFixed(2)} onChange={(e) => setPayAmount(e.target.value)} />
                    <span style={{ fontSize: 11.5, color: FAINT }}>{payAmount.trim() === '' ? `${due.label} due` : 'custom amount'}</span>
                    {PAY_METHODS.map((m) => (
                      <button key={m} className="sq-btn sq-btn-ghost" style={{ padding: '6px 13px', fontSize: 11.5 }} disabled={busy} onClick={() => takePayment(b, m)}>
                        {PAY_LABEL[m]}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Walk-in check-in + recent */}
        <div style={{ display: 'grid', gap: 16, alignSelf: 'start' }}>
          <div className="sq-card" style={{ ...card, padding: '18px 20px' }}>
            <p style={{ fontSize: 13.5, fontWeight: 700, color: INK, margin: '0 0 10px' }}>Walk-in check-in</p>
            <div style={{ marginBottom: 10 }}>
              <label className="sq-label" htmlFor="fd-name">Name</label>
              <input id="fd-name" className="sq-input" value={walkName} placeholder="Jordan Alvarez" onChange={(e) => setWalkName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') walkIn() }} />
            </div>
            <div style={{ marginBottom: 12 }}>
              <label className="sq-label" htmlFor="fd-ctx">Here for</label>
              <select id="fd-ctx" className="sq-select" value={walkContext} onChange={(e) => setWalkContext(e.target.value)}>
                {WALKIN_CONTEXTS.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <button className="sq-btn sq-btn-primary" style={{ width: '100%' }} disabled={!walkName.trim() || busy} onClick={walkIn}>Check in</button>
          </div>

          <div className="sq-card" style={{ ...card, overflow: 'hidden' }}>
            <div style={{ padding: '13px 20px', borderBottom: `1px solid ${LINE}` }}>
              <span style={{ fontSize: 13.5, fontWeight: 700, color: INK }}>Checked in today</span>
            </div>
            {checkIns.length === 0 && <p style={{ fontSize: 12.5, color: SUB, padding: '14px 20px', margin: 0 }}>Nobody yet — arrivals appear here.</p>}
            {checkIns.slice(0, 12).map((c, i) => (
              <div key={c.id} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '9px 20px', borderBottom: i < Math.min(checkIns.length, 12) - 1 ? `1px solid ${LINE}` : 'none' }}>
                <span style={{ fontSize: 11.5, color: FAINT, fontVariantNumeric: 'tabular-nums', width: 62, flexShrink: 0 }}>{c.when}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 12.5, fontWeight: 700, color: INK, margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.who}</p>
                  <p style={{ fontSize: 11, color: SUB, margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.context}</p>
                </div>
                {c.outcome !== 'in' && <span style={{ fontSize: 10, fontWeight: 700, color: RED, background: '#fae7e4', padding: '1px 8px', borderRadius: 999 }}>{c.outcome}</span>}
              </div>
            ))}
          </div>
        </div>
      </div>

      <p style={{ fontSize: 11.5, color: FAINT, marginTop: 14 }}>
        Payments post to the booking and show on <Link href="/admin/payments" style={{ color: BLUE, fontWeight: 600 }}>Payments</Link>.
        Booking for a member links it to their account from <Link href="/admin/bookings" style={{ color: BLUE, fontWeight: 600 }}>Bookings</Link>.
      </p>
    </div>
  )
}
