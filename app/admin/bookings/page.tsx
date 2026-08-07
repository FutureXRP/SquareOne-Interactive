'use client'
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { PageHero, HeroStat } from '@/components/admin/PageHero'
import { card, INK, SUB, FAINT, LINE, BLUE, GREEN, GOLD, RED } from '@/lib/theme'
import { formatCents, formatHour } from '@/lib/format'
import { getActiveRooms, roomLabel, rentalPriceCents, type RoomConfig } from '@/lib/facilities-store'
import { getMyStaff, ROLE_LABEL, CAN_BOOK, type StaffMember } from '@/lib/staff-store'
import {
  getStaffBookings, addStaffBooking, rescheduleBooking, updateBookingFields, recordPayment, deleteBooking, isoDate,
  BOOKINGS_EVENT, PAY_LABEL, type StaffBooking, type PayMethod,
} from '@/lib/staff-bookings-store'
import { isSupabaseConfigured } from '@/lib/supabase'

function dollarsToCents(v: string): number {
  const n = Number.parseFloat(v.replace(/[$,\s]/g, ''))
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : 0
}

const START_TIMES = Array.from({ length: 16 }, (_, i) => i + 6) // 6 AM – 9 PM
const PAY_METHODS: PayMethod[] = ['stripe', 'cash', 'cashapp']

function PayButtons({ onPick, picked, disabled }: { onPick: (m: PayMethod) => void; picked?: PayMethod | null; disabled?: boolean }) {
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {PAY_METHODS.map((m) => (
        <button key={m} disabled={disabled} onClick={() => onPick(m)} style={{
          font: 'inherit', cursor: 'pointer', fontSize: 12.5, fontWeight: 600,
          color: picked === m ? '#fff' : SUB, background: picked === m ? BLUE : '#fff',
          border: `1.5px solid ${picked === m ? BLUE : LINE}`, borderRadius: 999, padding: '6px 15px',
          opacity: disabled ? 0.5 : 1,
        }}>
          {PAY_LABEL[m]}
        </button>
      ))}
    </div>
  )
}

export default function AdminBookingsPage() {
  const [bookings, setBookings] = useState<StaffBooking[]>([])
  const [rooms, setRooms] = useState<RoomConfig[]>([])
  const [me, setMe] = useState<StaffMember | null>(null)
  const [showNew, setShowNew] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [payingId, setPayingId] = useState<string | null>(null)
  const [conflictMsg, setConflictMsg] = useState(false)
  const [busyWrite, setBusyWrite] = useState(false)

  // New-booking form state
  const [nbClient, setNbClient] = useState('')
  const [nbTitle, setNbTitle] = useState('')
  const [nbRoom, setNbRoom] = useState('')
  const [nbDate, setNbDate] = useState('')
  const [nbStart, setNbStart] = useState(17)
  const [nbHours, setNbHours] = useState(2)
  const [nbPrice, setNbPrice] = useState('')
  const [nbPay, setNbPay] = useState<PayMethod | 'hold'>('hold')

  useEffect(() => {
    if (!isSupabaseConfigured()) return
    let on = true
    const sync = () => {
      Promise.all([getStaffBookings(), getActiveRooms(), getMyStaff()]).then(([b, r, m]) => {
        if (on) { setBookings(b); setRooms(r); setMe(m) }
      }).catch(() => {})
    }
    sync()
    setNbDate(isoDate(0))
    window.addEventListener(BOOKINGS_EVENT, sync)
    return () => { on = false; window.removeEventListener(BOOKINGS_EVENT, sync) }
  }, [])

  const room = rooms.find((r) => r.id === nbRoom) ?? rooms[0]
  const autoPriceCents = room ? rentalPriceCents(room, nbHours) : 0
  const priceCents = nbPrice.trim() === '' ? autoPriceCents : dollarsToCents(nbPrice)
  const canBook = me ? CAN_BOOK.includes(me.role) : false

  const createBooking = async () => {
    if (!room || !nbClient.trim() || !me || busyWrite) return
    setBusyWrite(true)
    setConflictMsg(false)
    const res = await addStaffBooking({
      roomId: room.id,
      title: nbTitle.trim() || `${room.name} rental`,
      client: nbClient.trim(),
      date: nbDate,
      startH: nbStart,
      hours: nbHours,
      priceCents,
      hold: nbPay === 'hold',
      createdBy: me.id,
    })
    if (res.ok && nbPay !== 'hold') {
      // Collect immediately: find the row we just made and record the payment.
      const fresh = await getStaffBookings()
      const mine = fresh.find((b) => b.code === res.code)
      if (mine) await recordPayment(mine, nbPay, me.id)
    }
    setBusyWrite(false)
    if (res.ok) {
      setShowNew(false)
      setNbClient(''); setNbTitle(''); setNbPrice(''); setNbPay('hold')
    } else if (res.conflict) {
      setConflictMsg(true)
    }
  }

  const active = bookings.filter((b) => b.status === 'hold' || b.status === 'confirmed')
  const onBooksCents = active.reduce((n, b) => n + b.priceCents, 0)
  const collectedCents = bookings.reduce((n, b) => n + b.paidCents, 0)
  const holds = active.filter((b) => b.status === 'hold')

  const byDate = useMemo(() => {
    const groups = new Map<string, StaffBooking[]>()
    const sorted = [...bookings].sort((a, b) => a.date.localeCompare(b.date) || a.startH - b.startH)
    for (const b of sorted) {
      const list = groups.get(b.date) ?? []
      list.push(b)
      groups.set(b.date, list)
    }
    return [...groups.entries()]
  }, [bookings])

  const dateLabel = (d: string) => (d === isoDate(0) ? 'Today' : d === isoDate(1) ? 'Tomorrow' : d)

  return (
    <div className="sq-page" style={{ padding: '34px 40px 20px', maxWidth: 1180, margin: '0 auto' }}>
      <PageHero title="Bookings" sub="Create bookings for people, reschedule, and take payment by card, cash, or Cash App — right from the desk." chip={`${holds.length} holds open`}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <HeroStat label="On the books" value={formatCents(onBooksCents)} sub={`${formatCents(collectedCents)} collected`} />
          <button className="sq-btn" style={{ background: '#fff', color: '#182740' }} onClick={() => setShowNew((v) => !v)}>
            {showNew ? 'Close' : '+ New booking'}
          </button>
        </div>
      </PageHero>

      {me && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: SUB }}>
            Signed in as <strong style={{ color: INK }}>{me.name}</strong> · {ROLE_LABEL[me.role]}
          </span>
          {!canBook && (
            <span style={{ fontSize: 11.5, fontWeight: 600, color: '#b07818', background: '#faf0dc', padding: '3px 11px', borderRadius: 999 }}>
              {ROLE_LABEL[me.role]}s can&apos;t create bookings or take payments
            </span>
          )}
        </div>
      )}

      {/* New booking form */}
      {showNew && (
        <div className="sq-card" style={{ ...card, padding: '20px 24px', marginBottom: 20, borderTop: `3px solid ${BLUE}` }}>
          <p style={{ fontSize: 14, fontWeight: 800, color: INK, margin: '0 0 14px' }}>New booking</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginBottom: 14 }}>
            <div>
              <label className="sq-label" htmlFor="nb-client">Who is it for?</label>
              <input id="nb-client" className="sq-input" value={nbClient} onChange={(e) => setNbClient(e.target.value)} placeholder="Henderson family" />
            </div>
            <div>
              <label className="sq-label" htmlFor="nb-title">What is it? (optional)</label>
              <input id="nb-title" className="sq-input" value={nbTitle} onChange={(e) => setNbTitle(e.target.value)} placeholder="Birthday party" />
            </div>
            <div>
              <label className="sq-label" htmlFor="nb-room">Room</label>
              <select id="nb-room" className="sq-select" value={room?.id ?? ''} onChange={(e) => { setNbRoom(e.target.value); setNbPrice('') }}>
                {rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 14, marginBottom: 14 }}>
            <div>
              <label className="sq-label" htmlFor="nb-date">Date</label>
              <input id="nb-date" type="date" className="sq-input" value={nbDate} onChange={(e) => setNbDate(e.target.value)} />
            </div>
            <div>
              <label className="sq-label" htmlFor="nb-start">Start</label>
              <select id="nb-start" className="sq-select" value={nbStart} onChange={(e) => setNbStart(Number(e.target.value))}>
                {START_TIMES.map((h) => <option key={h} value={h}>{formatHour(h)}</option>)}
              </select>
            </div>
            <div>
              <label className="sq-label" htmlFor="nb-hours">Length</label>
              <select id="nb-hours" className="sq-select" value={nbHours} onChange={(e) => { setNbHours(Number(e.target.value)); setNbPrice('') }}>
                {[1, 2, 3, 4, 5, 6, 7, 8].map((h) => <option key={h} value={h}>{h} hour{h > 1 ? 's' : ''}</option>)}
              </select>
            </div>
            <div>
              <label className="sq-label" htmlFor="nb-price">Price ($)</label>
              <input id="nb-price" className="sq-input" inputMode="decimal" value={nbPrice} placeholder={(autoPriceCents / 100).toFixed(2)} onChange={(e) => setNbPrice(e.target.value)} />
            </div>
          </div>

          <span className="sq-label">Payment</span>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 }}>
            <button onClick={() => setNbPay('hold')} style={{
              font: 'inherit', cursor: 'pointer', fontSize: 12.5, fontWeight: 600,
              color: nbPay === 'hold' ? '#fff' : SUB, background: nbPay === 'hold' ? '#b07818' : '#fff',
              border: `1.5px solid ${nbPay === 'hold' ? '#b07818' : LINE}`, borderRadius: 999, padding: '6px 15px',
            }}>
              Hold — collect later
            </button>
            <PayButtons picked={nbPay === 'hold' ? null : nbPay} onPick={(m) => setNbPay(m)} />
          </div>

          {conflictMsg && (
            <p style={{ fontSize: 12.5, color: RED, fontWeight: 600, margin: '0 0 12px' }}>
              That room is already booked for that time — the database blocked the double-booking. Pick another slot.
            </p>
          )}

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <p style={{ fontSize: 12, color: FAINT, margin: 0 }}>
              {nbPay === 'hold'
                ? 'Books the slot as a striped hold on the Board until payment lands (24-hour expiry).'
                : `Collects ${formatCents(priceCents)} by ${PAY_LABEL[nbPay]} and confirms the slot.`}
            </p>
            <button className="sq-btn sq-btn-primary" disabled={!nbClient.trim() || !canBook || busyWrite} onClick={createBooking}>
              {busyWrite ? 'Booking…' : nbPay === 'hold' ? 'Book with hold' : `Book & take ${formatCents(priceCents)}`}
            </button>
          </div>
        </div>
      )}

      {/* Booking list */}
      {byDate.length === 0 && (
        <div className="sq-card" style={{ ...card, padding: '30px 32px', textAlign: 'center' }}>
          <p style={{ fontSize: 14, color: SUB, margin: 0 }}>No bookings yet — create the first one, or wait for store requests to land here.</p>
        </div>
      )}
      {byDate.map(([date, list]) => (
        <div key={date} style={{ marginBottom: 22 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '0 0 10px' }}>
            <span style={{ width: 8, height: 8, background: BLUE, borderRadius: 2 }} />
            <span style={{ fontSize: 12, fontWeight: 700, color: BLUE, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{dateLabel(date)}</span>
            <div style={{ height: 1, flex: 1, background: LINE }} />
            <span style={{ fontSize: 11.5, color: FAINT }}>{list.filter((b) => b.status !== 'canceled').length} bookings</span>
          </div>
          <div className="sq-card" style={{ ...card, overflow: 'hidden' }}>
            {list.map((b, i) => {
              const zone = roomLabel(b.roomId)
              const isEditing = editingId === b.id
              const isPaying = payingId === b.id
              return (
                <div key={b.id} style={{ borderBottom: i < list.length - 1 ? `1px solid ${LINE}` : 'none', opacity: b.status === 'canceled' ? 0.5 : 1 }}>
                  <div className="sq-row" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 18px', flexWrap: 'wrap' }}>
                    <span style={{ width: 9, height: 9, borderRadius: 2, background: zone.color, flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 170 }}>
                      <p style={{ fontSize: 13, fontWeight: 700, color: INK, margin: 0 }}>{b.title} · {zone.name}</p>
                      <p style={{ fontSize: 12, color: SUB, margin: 0 }}>
                        {b.client} · {formatHour(b.startH)}–{formatHour(b.startH + b.hours)} · {b.code} · by {b.takenBy}
                      </p>
                    </div>
                    {b.status === 'canceled' ? (
                      <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 10.5, fontWeight: 700, color: SUB, background: '#eef2f8', padding: '2px 10px', borderRadius: 999 }}>Canceled</span>
                        {canBook && (
                          <button className="sq-btn sq-btn-danger" style={{ padding: '4px 10px', fontSize: 10.5 }}
                            onClick={async () => { if (window.confirm(`Delete ${b.code} permanently?`)) await deleteBooking(b.id) }}>Delete</button>
                        )}
                      </span>
                    ) : b.status === 'hold' ? (
                      <span style={{ fontSize: 10.5, fontWeight: 700, color: GOLD, background: '#faf0dc', padding: '2px 10px', borderRadius: 999 }}>Hold — unpaid</span>
                    ) : (
                      <span style={{ fontSize: 10.5, fontWeight: 700, color: GREEN, background: '#e5f2ea', padding: '2px 10px', borderRadius: 999 }}>
                        {b.payMethod ? `Paid · ${PAY_LABEL[b.payMethod] ?? b.payMethod}` : 'Confirmed'}
                      </span>
                    )}
                    <span style={{ fontSize: 13.5, fontWeight: 700, color: INK, minWidth: 70, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{formatCents(b.priceCents)}</span>
                    {b.status !== 'canceled' && canBook && (
                      <span style={{ display: 'flex', gap: 6 }}>
                        {b.paidCents < b.priceCents && b.priceCents > 0 && (
                          <button className="sq-btn sq-btn-primary" style={{ padding: '5px 12px', fontSize: 11.5 }} onClick={() => { setPayingId(isPaying ? null : b.id); setEditingId(null) }}>Take payment</button>
                        )}
                        <button className="sq-btn sq-btn-ghost" style={{ padding: '5px 12px', fontSize: 11.5 }} onClick={() => { setEditingId(isEditing ? null : b.id); setPayingId(null) }}>{isEditing ? 'Close' : 'Edit'}</button>
                      </span>
                    )}
                  </div>

                  {isPaying && me && (
                    <div style={{ padding: '4px 18px 16px 39px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 12.5, fontWeight: 600, color: INK }}>Collect {formatCents(b.priceCents - b.paidCents)} by</span>
                      <PayButtons disabled={busyWrite} onPick={async (m) => { setBusyWrite(true); await recordPayment(b, m, me.id); setBusyWrite(false); setPayingId(null) }} />
                    </div>
                  )}

                  {isEditing && (
                    <div style={{ padding: '4px 18px 16px 39px' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 12, marginBottom: 12, maxWidth: 620 }}>
                        <div>
                          <label className="sq-label">Date</label>
                          <input type="date" className="sq-input" defaultValue={b.date} key={`bd-${b.id}`}
                            onBlur={async (e) => { const r = await rescheduleBooking(b.id, e.target.value, b.startH, b.hours); if (r.conflict) window.alert('That time is taken in that room.') }} />
                        </div>
                        <div>
                          <label className="sq-label">Start</label>
                          <select className="sq-select" value={Math.round(b.startH)}
                            onChange={async (e) => { const r = await rescheduleBooking(b.id, b.date, Number(e.target.value), b.hours); if (r.conflict) window.alert('That time is taken in that room.') }}>
                            {START_TIMES.map((h) => <option key={h} value={h}>{formatHour(h)}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="sq-label">Length</label>
                          <select className="sq-select" value={Math.round(b.hours)}
                            onChange={async (e) => { const r = await rescheduleBooking(b.id, b.date, b.startH, Number(e.target.value)); if (r.conflict) window.alert('That length overlaps another booking.') }}>
                            {[1, 2, 3, 4, 5, 6, 7, 8].map((h) => <option key={h} value={h}>{h} hr</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="sq-label">Price ($)</label>
                          <input className="sq-input" inputMode="decimal" defaultValue={(b.priceCents / 100).toFixed(2)} key={`bp-${b.id}`}
                            onBlur={(e) => updateBookingFields(b.id, { price_cents: dollarsToCents(e.target.value) })} />
                        </div>
                      </div>
                      <button className="sq-btn sq-btn-danger" style={{ padding: '6px 13px', fontSize: 11.5 }} onClick={async () => { await updateBookingFields(b.id, { status: 'canceled' }); setEditingId(null) }}>
                        Cancel this booking
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      ))}

      <p style={{ fontSize: 11.5, color: FAINT, marginTop: 4 }}>
        Live booking book — changes land on <Link href="/admin/board" style={{ color: BLUE, fontWeight: 600 }}>the Board</Link>, in Payments,
        and in members&apos; accounts instantly. Double-booking is blocked by the database itself.
      </p>
    </div>
  )
}
