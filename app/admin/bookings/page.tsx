'use client'
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { PageHero, HeroStat } from '@/components/admin/PageHero'
import { card, INK, SUB, FAINT, LINE, BLUE, GREEN, GOLD, RED } from '@/lib/theme'
import { formatCents, formatHour } from '@/lib/format'
import { getActiveRooms, roomLabel, rentalPriceCentsAt, type RoomConfig } from '@/lib/facilities-store'
import { getMyStaff, getStaff, ROLE_LABEL, CAN_BOOK, type StaffMember } from '@/lib/staff-store'
import { getActiveAddons, addonPriceCents, addonPriceLabel, type AddonConfig } from '@/lib/addons-store'
import {
  getStaffBookings, addStaffBooking, rescheduleBooking, updateBookingFields, recordPayment, deleteBooking, isoDate,
  markBookingsSeen, setBookingRunBy, addonsTaken, BOOKINGS_EVENT, PAY_LABEL, type StaffBooking, type PayMethod,
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
  const [allStaff, setAllStaff] = useState<StaffMember[]>([])
  const [allAddons, setAllAddons] = useState<AddonConfig[]>([])
  const [showNew, setShowNew] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [payingId, setPayingId] = useState<string | null>(null)
  const [conflictMsg, setConflictMsg] = useState(false)
  const [addonConflictMsg, setAddonConflictMsg] = useState(false)
  const [busyWrite, setBusyWrite] = useState(false)

  // New-booking form state
  const [nbClient, setNbClient] = useState('')
  const [nbTitle, setNbTitle] = useState('')
  const [nbRoom, setNbRoom] = useState('')
  const [nbDate, setNbDate] = useState('')
  const [nbStart, setNbStart] = useState(17)
  const [nbHours, setNbHours] = useState(2)
  const [nbPrice, setNbPrice] = useState('')
  const [nbDeposit, setNbDeposit] = useState('') // '' = room default
  const [nbPay, setNbPay] = useState<PayMethod | 'hold'>('hold')
  const [nbAddons, setNbAddons] = useState<string[]>([])
  const [nbRunBy, setNbRunBy] = useState('')
  const [nbTaken, setNbTaken] = useState<string[]>([]) // extras booked elsewhere for this window

  useEffect(() => {
    if (!isSupabaseConfigured()) return
    let on = true
    const sync = () => {
      Promise.all([getStaffBookings(), getActiveRooms(), getMyStaff(), getStaff().catch(() => []), getActiveAddons().catch(() => [])]).then(([b, r, m, s, a]) => {
        if (on) { setBookings(b); setRooms(r); setMe(m); setAllStaff(s); setAllAddons(a) }
      }).catch(() => {})
    }
    sync()
    setNbDate(isoDate(0))
    markBookingsSeen() // clears the sidebar's new-booking badge
    // Front Desk deep-link: /admin/bookings?new=1 opens the booking form
    if (new URLSearchParams(window.location.search).get('new') === '1') setShowNew(true)
    window.addEventListener(BOOKINGS_EVENT, sync)
    return () => { on = false; window.removeEventListener(BOOKINGS_EVENT, sync) }
  }, [])

  const room = rooms.find((r) => r.id === nbRoom) ?? rooms[0]
  const nbDow = nbDate ? new Date(`${nbDate}T00:00:00`).getDay() : 0
  const roomAddons = allAddons.filter((a) => room?.addonIds?.includes(a.id))
  const pickedAddons = roomAddons.filter((a) => nbAddons.includes(a.id))
  const nbAddonsCents = pickedAddons.reduce((n, a) => n + addonPriceCents(a, nbHours), 0)
  const autoPriceCents = (room ? rentalPriceCentsAt(room, nbDow, nbStart, nbHours) : 0) + nbAddonsCents
  const priceCents = nbPrice.trim() === '' ? autoPriceCents : dollarsToCents(nbPrice)

  // Grey out extras someone else already has for this window.
  useEffect(() => {
    if (!nbDate || roomAddons.length === 0 || !isSupabaseConfigured()) {
      setNbTaken([])
      return
    }
    addonsTaken(nbDate, nbStart, nbHours).then((t) => {
      const taken = t ?? []
      setNbTaken(taken)
      if (taken.length > 0) setNbAddons((cur) => cur.filter((id) => !taken.includes(id)))
    }).catch(() => setNbTaken([]))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nbDate, nbStart, nbHours, roomAddons.length, bookings])
  // Deposit defaults from the room; adjustable per booking (0009 required)
  const roomDepositCents = room?.depositRequired ? (room.depositCents ?? 0) : 0
  const depositCents = room?.depositCents === undefined
    ? undefined
    : nbDeposit.trim() === '' ? (roomDepositCents > 0 ? roomDepositCents : null) : (dollarsToCents(nbDeposit) || null)
  const canBook = me ? CAN_BOOK.includes(me.role) : false

  const createBooking = async () => {
    if (!room || !nbClient.trim() || !me || busyWrite) return
    setBusyWrite(true)
    setConflictMsg(false)
    setAddonConflictMsg(false)
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
      depositCents,
      addonIds: nbAddons,
      runByStaffId: nbRunBy || null,
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
      setNbClient(''); setNbTitle(''); setNbPrice(''); setNbDeposit(''); setNbPay('hold'); setNbAddons([]); setNbRunBy('')
    } else if (res.conflict) {
      if (res.addonConflict) setAddonConflictMsg(true)
      else setConflictMsg(true)
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
                {[1, 2, 3, 4, 5, 6].map((h) => <option key={h} value={h}>{h} hour{h > 1 ? 's' : ''}</option>)}
              </select>
            </div>
            <div>
              <label className="sq-label" htmlFor="nb-price">Price ($)</label>
              <input id="nb-price" className="sq-input" inputMode="decimal" value={nbPrice} placeholder={(autoPriceCents / 100).toFixed(2)} onChange={(e) => setNbPrice(e.target.value)} />
            </div>
            {room?.depositCents !== undefined && (
              <div>
                <label className="sq-label" htmlFor="nb-dep">Deposit ($)</label>
                <input id="nb-dep" className="sq-input" inputMode="decimal" value={nbDeposit}
                  placeholder={(roomDepositCents / 100).toFixed(2)} onChange={(e) => setNbDeposit(e.target.value)} />
              </div>
            )}
          </div>

          {/* Reserved extras — same availability guard as the store */}
          {roomAddons.length > 0 && (
            <>
              <span className="sq-label">Extras</span>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
                {roomAddons.map((a) => {
                  const on = nbAddons.includes(a.id)
                  const gone = nbTaken.includes(a.id)
                  return (
                    <label key={a.id} title={gone ? 'Already booked for this time' : a.blurb} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: gone ? FAINT : INK, cursor: gone ? 'default' : 'pointer', background: gone ? '#f4f6fa' : on ? '#eef4fb' : '#fff', border: `1.5px solid ${on ? BLUE : LINE}`, borderRadius: 10, padding: '6px 12px', opacity: gone ? 0.75 : 1 }}>
                      <input type="checkbox" checked={on} disabled={gone} style={{ accentColor: BLUE }}
                        onChange={() => setNbAddons((cur) => on ? cur.filter((id) => id !== a.id) : [...cur, a.id])} />
                      <span>
                        <span style={{ fontWeight: 700 }}>{a.name}</span>
                        <span style={{ color: gone ? FAINT : SUB, fontVariantNumeric: 'tabular-nums' }}> +{addonPriceLabel(a)}</span>
                        {gone && <span style={{ display: 'block', fontSize: 10.5, color: RED, fontWeight: 600 }}>Already booked for this time</span>}
                      </span>
                    </label>
                  )
                })}
              </div>
            </>
          )}

          {/* Who runs it — drives the staff payout once the booking is paid in full */}
          {allStaff.length > 0 && (
            <div style={{ marginBottom: 14, maxWidth: 320 }}>
              <label className="sq-label" htmlFor="nb-runby">Run by (staff payout)</label>
              <select id="nb-runby" className="sq-select" value={nbRunBy} onChange={(e) => setNbRunBy(e.target.value)}>
                <option value="">— assign later —</option>
                {allStaff.map((s) => <option key={s.id} value={s.id}>{s.name} · {ROLE_LABEL[s.role]}</option>)}
              </select>
            </div>
          )}

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
          {addonConflictMsg && (
            <p style={{ fontSize: 12.5, color: RED, fontWeight: 600, margin: '0 0 12px' }}>
              One of the extras is already booked for that time — the database blocked it. Drop the extra or pick another slot.
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
                        {b.runByStaffId !== undefined && allStaff.length > 0 && (
                          <div>
                            <label className="sq-label">Run by</label>
                            <select className="sq-select" value={b.runByStaffId ?? ''} onChange={(e) => setBookingRunBy(b.id, e.target.value || null)}>
                              <option value="">— unassigned —</option>
                              {allStaff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                            </select>
                          </div>
                        )}
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
