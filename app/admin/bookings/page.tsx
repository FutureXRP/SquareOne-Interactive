'use client'
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { PageHero, HeroStat } from '@/components/admin/PageHero'
import { card, INK, SUB, FAINT, LINE, BLUE, GREEN, GOLD, RED } from '@/lib/theme'
import { formatCents, formatHour } from '@/lib/format'
import { getActiveRooms, roomLabel, rentalPriceCentsAt, type RoomConfig } from '@/lib/facilities-store'
import { getMyStaff, getStaff, ROLE_LABEL, CAN_BOOK, type StaffMember } from '@/lib/staff-store'
import { getActiveAddons, addonPriceCents, addonPriceLabel, type AddonConfig } from '@/lib/addons-store'
import { getActivePackages, type EventPackage } from '@/lib/packages-store'
import {
  getStaffBookings, addStaffBooking, rescheduleBooking, updateBookingFields, recordPayment, deleteBooking, isoDate,
  markBookingsSeen, setBookingRunBy, addonsTaken, isInReview, approveBooking, canceledByLabel, bookingPayUrl,
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
  const [allStaff, setAllStaff] = useState<StaffMember[]>([])
  const [allAddons, setAllAddons] = useState<AddonConfig[]>([])
  const [showNew, setShowNew] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [payingId, setPayingId] = useState<string | null>(null)
  const [payAmount, setPayAmount] = useState('') // blank = the whole balance
  const [conflictMsg, setConflictMsg] = useState(false)
  const [addonConflictMsg, setAddonConflictMsg] = useState(false)
  const [busyWrite, setBusyWrite] = useState(false)
  // Canceled bookings are kept, not deleted — but they shouldn't be the
  // first thing the desk reads through.
  const [showCanceled, setShowCanceled] = useState(false)

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
  const [nbPackage, setNbPackage] = useState('')
  const [nbEmail, setNbEmail] = useState('')
  const [nbTaken, setNbTaken] = useState<string[]>([]) // extras booked elsewhere for this window
  const [packages, setPackages] = useState<EventPackage[]>([])

  useEffect(() => {
    if (!isSupabaseConfigured()) return
    let on = true
    const sync = () => {
      Promise.all([getStaffBookings(), getActiveRooms(), getMyStaff(), getStaff().catch(() => []), getActiveAddons().catch(() => []), getActivePackages().catch(() => [])]).then(([b, r, m, s, a, pk]) => {
        if (on) { setBookings(b); setRooms(r); setMe(m); setAllStaff(s); setAllAddons(a); setPackages(pk) }
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
      packageId: nbPackage || null,
      contactEmail: nbEmail.trim() || null,
      ...(room.setupMin !== undefined ? { setupMin: room.setupMin, cleanupMin: room.cleanupMin ?? 0 } : {}),
    })
    if (res.ok && nbPay !== 'hold') {
      const fresh = await getStaffBookings()
      const mine = fresh.find((b) => b.code === res.code)
      if (mine && nbPay === 'stripe') {
        // A card is charged on the booking's secure page, not asserted at
        // the desk — open it so the customer can pay right now.
        const url = bookingPayUrl(mine)
        if (url) window.open(url, '_blank', 'noopener')
      } else if (mine) {
        // Cash / Cash App changed hands here: record it.
        await recordPayment(mine, nbPay, me.id)
      }
    }
    setBusyWrite(false)
    if (res.ok) {
      setShowNew(false)
      setNbClient(''); setNbTitle(''); setNbPrice(''); setNbDeposit(''); setNbPay('hold'); setNbAddons([]); setNbRunBy(''); setNbPackage(''); setNbEmail('')
    } else if (res.conflict) {
      if (res.addonConflict) setAddonConflictMsg(true)
      else setConflictMsg(true)
    }
  }

  const active = bookings.filter((b) => b.status === 'hold' || b.status === 'confirmed')
  const onBooksCents = active.reduce((n, b) => n + b.priceCents, 0)
  const collectedCents = bookings.reduce((n, b) => n + b.paidCents, 0)
  const holds = active.filter((b) => b.status === 'hold')
  // Customer-made reservations nobody has signed off on yet.
  const inReview = active.filter(isInReview)

  // Today first, then what's coming, then history newest-first. The desk
  // is almost always asking about today, and was scrolling past weeks of
  // finished days to reach it.
  const byDate = useMemo(() => {
    const today = isoDate(0)
    const groups = new Map<string, StaffBooking[]>()
    const sorted = [...bookings].sort((a, b) => a.date.localeCompare(b.date) || a.startH - b.startH)
    for (const b of sorted) {
      // A canceled booking with money on it is never hidden. Somebody paid
      // and nobody has given it back yet — that is the last thing that
      // should be behind a toggle.
      if (!showCanceled && b.status === 'canceled' && b.paidCents === 0) continue
      const list = groups.get(b.date) ?? []
      list.push(b)
      groups.set(b.date, list)
    }
    const entries = [...groups.entries()]
    return {
      today: entries.filter(([d]) => d === today),
      upcoming: entries.filter(([d]) => d > today),
      past: entries.filter(([d]) => d < today).reverse(),
    }
  }, [bookings, showCanceled])

  const canceledCount = bookings.filter((b) => b.status === 'canceled' && b.paidCents === 0).length
  // Canceled but paid: the desk owes these people their money back.
  const refundOwed = bookings.filter((b) => b.status === 'canceled' && b.paidCents > 0)
  const refundOwedCents = refundOwed.reduce((n, b) => n + b.paidCents, 0)
  const hasAny = byDate.today.length + byDate.upcoming.length + byDate.past.length > 0

  const dateLabel = (d: string) => (d === isoDate(0) ? 'Today' : d === isoDate(1) ? 'Tomorrow' : d)

  // Never let the count contradict the rows underneath it: a day showing
  // three canceled bookings used to be labelled "0 bookings".
  const dayCount = (list: StaffBooking[]): string => {
    const live = list.filter((b) => b.status !== 'canceled').length
    const canceled = list.length - live
    const parts: string[] = []
    if (live > 0) parts.push(`${live} booking${live === 1 ? '' : 's'}`)
    if (canceled > 0) parts.push(`${canceled} canceled`)
    return parts.join(' · ') || 'nothing booked'
  }

  // One day's rows. Extracted so Today, Upcoming and Earlier can each
  // render the same list without duplicating it three times.
  const renderDay = (list: StaffBooking[]) => (
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
              ) : b.standingId ? (
                // Put here by a standing reservation on the Calendar tab.
                <span style={{ fontSize: 10.5, fontWeight: 700, color: BLUE, background: '#eef4fb', padding: '2px 10px', borderRadius: 999 }}>Standing group</span>
              ) : isInReview(b) ? (
                // Booked by a customer and waiting on one of us to say yes.
                <span style={{ fontSize: 10.5, fontWeight: 700, color: '#5b4708', background: '#fdf3dc', padding: '2px 10px', borderRadius: 999 }}>
                  In review{b.paidCents > 0 ? ` · ${formatCents(b.paidCents)} paid` : ''}
                </span>
              ) : b.status === 'hold' && b.paidCents === 0 ? (
                <span style={{ fontSize: 10.5, fontWeight: 700, color: GOLD, background: '#faf0dc', padding: '2px 10px', borderRadius: 999 }}>Hold — unpaid</span>
              ) : b.paidCents > 0 && b.paidCents < b.priceCents ? (
                // A deposit locks the slot in, but it isn't paid in full.
                <span style={{ fontSize: 10.5, fontWeight: 700, color: '#b07818', background: '#faf0dc', padding: '2px 10px', borderRadius: 999 }}>
                  Deposit paid · {formatCents(b.priceCents - b.paidCents)} due
                </span>
              ) : (
                <span style={{ fontSize: 10.5, fontWeight: 700, color: GREEN, background: '#e5f2ea', padding: '2px 10px', borderRadius: 999 }}>
                  {b.payMethod ? `Paid · ${PAY_LABEL[b.payMethod] ?? b.payMethod}` : 'Confirmed'}
                </span>
              )}
              <span style={{ fontSize: 13.5, fontWeight: 700, color: INK, minWidth: 70, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{formatCents(b.priceCents)}</span>
              {b.status !== 'canceled' && canBook && (
                <span style={{ display: 'flex', gap: 6 }}>
                  {isInReview(b) && (
                    <button className="sq-btn sq-btn-primary" style={{ padding: '5px 12px', fontSize: 11.5 }}
                      onClick={() => approveBooking(b.id, me?.id ?? null)}>Confirm reservation</button>
                  )}
                  {b.paidCents < b.priceCents && b.priceCents > 0 && (
                    <button className="sq-btn sq-btn-primary" style={{ padding: '5px 12px', fontSize: 11.5 }} onClick={() => {
                      setPayingId(isPaying ? null : b.id)
                      setEditingId(null)
                      // Open on the deposit when the room asks for one.
                      const due = b.depositCents && b.depositCents > 0
                        ? Math.min(Math.max(b.depositCents - b.paidCents, 0), b.priceCents - b.paidCents)
                        : 0
                      setPayAmount(due > 0 && due < b.priceCents - b.paidCents ? (due / 100).toFixed(2) : '')
                    }}>{b.paidCents > 0 ? 'Take balance' : 'Take payment'}</button>
                  )}
                  <button className="sq-btn sq-btn-ghost" style={{ padding: '5px 12px', fontSize: 11.5 }} onClick={() => { setEditingId(isEditing ? null : b.id); setPayingId(null) }}>{isEditing ? 'Close' : 'Edit'}</button>
                </span>
              )}
            </div>

            {isPaying && me && (() => {
              // Take the whole balance, the deposit, or any amount typed.
              const remaining = b.priceCents - b.paidCents
              const depositDue = b.depositCents && b.depositCents > 0
                ? Math.min(Math.max(b.depositCents - b.paidCents, 0), remaining)
                : 0
              const typed = payAmount.trim() === '' ? null : dollarsToCents(payAmount)
              const amount = Math.min(typed ?? remaining, remaining)
              const leftAfter = remaining - amount
              return (
                <div style={{ padding: '4px 18px 16px 39px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 9 }}>
                    <span style={{ fontSize: 12.5, fontWeight: 600, color: INK }}>Collect</span>
                    <input
                      className="sq-input"
                      style={{ width: 108, padding: '7px 10px', fontSize: 12.5, textAlign: 'right' }}
                      inputMode="decimal"
                      placeholder={(remaining / 100).toFixed(2)}
                      value={payAmount}
                      onChange={(e) => setPayAmount(e.target.value)}
                    />
                    {depositDue > 0 && depositDue < remaining && (
                      <button className="sq-btn sq-btn-ghost" style={{ padding: '6px 12px', fontSize: 11.5 }}
                        onClick={() => setPayAmount((depositDue / 100).toFixed(2))}>
                        Deposit {formatCents(depositDue)}
                      </button>
                    )}
                    <button className="sq-btn sq-btn-ghost" style={{ padding: '6px 12px', fontSize: 11.5 }}
                      onClick={() => setPayAmount((remaining / 100).toFixed(2))}>
                      Full {formatCents(remaining)}
                    </button>
                  </div>
                  <PayButtons disabled={busyWrite || amount <= 0} onPick={async (m) => {
                    // Card = the customer pays on the secure page, so the
                    // charge is real and Stripe's records match ours.
                    // Cash/Cash App = money changed hands here, record it.
                    if (m === 'stripe') {
                      const url = bookingPayUrl(b)
                      if (url) window.open(url, '_blank', 'noopener')
                      else window.alert('Run migration 0037 to turn on card payment links.')
                      return
                    }
                    setBusyWrite(true)
                    await recordPayment(b, m, me.id, amount)
                    setBusyWrite(false)
                    setPayingId(null)
                    setPayAmount('')
                  }} />
                  <p style={{ fontSize: 11.5, color: leftAfter > 0 ? GOLD : SUB, margin: '8px 0 0', lineHeight: 1.5 }}>
                    {amount <= 0
                      ? 'Enter an amount to collect.'
                      : leftAfter > 0
                        ? `Taking ${formatCents(amount)} as a deposit — ${formatCents(leftAfter)} still due, and the slot is locked in.`
                        : `Taking ${formatCents(amount)} — paid in full.`}
                  </p>
                  <p style={{ fontSize: 11.5, color: FAINT, margin: '4px 0 0', lineHeight: 1.5 }}>
                    Card opens the booking&rsquo;s secure payment page — have them pay there (it&rsquo;s the same
                    link as in their email), and it records itself the moment Stripe confirms. Cash and Cash App
                    record here directly.
                  </p>
                </div>
              )
            })()}

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
                <button className="sq-btn sq-btn-danger" style={{ padding: '6px 13px', fontSize: 11.5 }} onClick={async () => { await updateBookingFields(b.id, { status: 'canceled' }, me?.id ?? null); setEditingId(null) }}>
                  Cancel this booking
                </button>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )

  const DayGroup = ({ date, list }: { date: string; list: StaffBooking[] }) => (
    <div style={{ marginBottom: 22 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '0 0 10px' }}>
        <span style={{ width: 8, height: 8, background: BLUE, borderRadius: 2 }} />
        <span style={{ fontSize: 12, fontWeight: 700, color: BLUE, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{dateLabel(date)}</span>
        <div style={{ height: 1, flex: 1, background: LINE }} />
        <span style={{ fontSize: 11.5, color: FAINT }}>{dayCount(list)}</span>
      </div>
      {renderDay(list)}
    </div>
  )

  const SectionRule = ({ label }: { label: string }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '28px 0 14px' }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: FAINT, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</span>
      <div style={{ height: 1, flex: 1, background: LINE }} />
    </div>
  )

  return (
    <div className="sq-page" style={{ padding: '34px 40px 20px', maxWidth: 1180, margin: '0 auto' }}>
      <PageHero title="Bookings" sub="Create bookings for people, reschedule, and take payment by card, cash, or Cash App — right from the desk." chip={`${holds.length} holds open`}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <HeroStat label="On the books" value={formatCents(onBooksCents)} sub={`${formatCents(collectedCents)} collected`} />
          <HeroStat label="In review" value={String(inReview.length)} sub={inReview.length === 1 ? 'waiting on us' : 'waiting on us'} />
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
              <label className="sq-label" htmlFor="nb-email">Their email (for the confirmation)</label>
              <input id="nb-email" type="email" className="sq-input" value={nbEmail} onChange={(e) => setNbEmail(e.target.value)} placeholder="parent@email.com" />
            </div>
            {packages.length > 0 && (
              <div>
                <label className="sq-label" htmlFor="nb-pkg">Party package (optional)</label>
                <select id="nb-pkg" className="sq-select" value={nbPackage} onChange={(e) => {
                  const id = e.target.value
                  setNbPackage(id)
                  const pkg = packages.find((p) => p.id === id)
                  if (pkg) {
                    // The package fills in the details — all still adjustable.
                    setNbTitle(pkg.name)
                    setNbHours(Math.min(Math.max(pkg.hours, 1), 6))
                    setNbPrice((pkg.priceCents / 100).toFixed(2))
                    if (pkg.roomIds.length > 0) setNbRoom(pkg.roomIds[0])
                  } else {
                    setNbPrice('')
                  }
                }}>
                  <option value="">— none, plain rental —</option>
                  {packages.map((p) => <option key={p.id} value={p.id}>{p.name} · {formatCents(p.priceCents)}</option>)}
                </select>
              </div>
            )}
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
                : nbPay === 'stripe'
                  ? `Books the slot and opens the secure card page for ${formatCents(priceCents)} — it confirms itself when Stripe does.`
                  : `Collects ${formatCents(priceCents)} by ${PAY_LABEL[nbPay]} and confirms the slot.`}
            </p>
            <button className="sq-btn sq-btn-primary" disabled={!nbClient.trim() || !canBook || busyWrite} onClick={createBooking}>
              {busyWrite ? 'Booking…' : nbPay === 'hold' ? 'Book with hold' : `Book & take ${formatCents(priceCents)}`}
            </button>
          </div>
        </div>
      )}

      {/* Booking list — today first, then what's coming, then history */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, color: SUB }}>
          {byDate.today.length > 0
            ? `${dayCount(byDate.today[0][1])} today`
            : 'Nothing booked today'}
        </span>
        <span style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {canceledCount > 0 && (
            <button className="sq-btn sq-btn-ghost" style={{ padding: '6px 13px', fontSize: 11.5 }}
              onClick={() => setShowCanceled((v) => !v)}>
              {showCanceled ? 'Hide' : 'Show'} {canceledCount} canceled
            </button>
          )}
          <Link href="/admin/bookings/history" className="sq-btn sq-btn-ghost" style={{ padding: '6px 13px', fontSize: 11.5 }}>
            Past bookings →
          </Link>
        </span>
      </div>

      {refundOwed.length > 0 && (
        <div className="sq-card" style={{ ...card, padding: '14px 18px', marginBottom: 16, background: '#fae7e4', border: '1px solid #f0cdc7' }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: '#a33427', margin: '0 0 3px' }}>
            {formatCents(refundOwedCents)} taken on {refundOwed.length} canceled booking{refundOwed.length === 1 ? '' : 's'}
          </p>
          <p style={{ fontSize: 12.5, color: SUB, margin: 0, lineHeight: 1.55 }}>
            These were paid and then canceled, so the money is still ours and shouldn&rsquo;t be. They stay
            visible until refunded — open one and use Refund on the <Link href="/admin/payments" style={{ color: BLUE, fontWeight: 600 }}>Payments</Link> tab.
          </p>
        </div>
      )}

      {!hasAny && (
        <div className="sq-card" style={{ ...card, padding: '30px 32px', textAlign: 'center' }}>
          <p style={{ fontSize: 14, color: SUB, margin: 0 }}>
            {bookings.length === 0
              ? 'No bookings yet — create the first one, or wait for store requests to land here.'
              : 'Nothing to show. Every booking on the books is canceled — use the button above to see them.'}
          </p>
        </div>
      )}

      {/* Today, always first — it's what the desk is nearly always asking about */}
      {byDate.today.map(([date, list]) => <DayGroup key={date} date={date} list={list} />)}
      {byDate.today.length === 0 && hasAny && (
        <div className="sq-card" style={{ ...card, padding: '18px 22px', marginBottom: 22 }}>
          <p style={{ fontSize: 13, color: SUB, margin: 0 }}>Nothing booked today.</p>
        </div>
      )}

      {byDate.upcoming.length > 0 && <SectionRule label="Coming up" />}
      {byDate.upcoming.map(([date, list]) => <DayGroup key={date} date={date} list={list} />)}

      {byDate.past.length > 0 && <SectionRule label="Earlier — most recent first" />}
      {byDate.past.map(([date, list]) => <DayGroup key={date} date={date} list={list} />)}

      <p style={{ fontSize: 11.5, color: FAINT, marginTop: 4 }}>
        Live booking book — changes land on <Link href="/admin/board" style={{ color: BLUE, fontWeight: 600 }}>the Board</Link>, in Payments,
        and in members&apos; accounts instantly. Double-booking is blocked by the database itself.
      </p>
    </div>
  )
}
