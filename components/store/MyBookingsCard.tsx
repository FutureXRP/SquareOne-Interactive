'use client'
import { tulsaDayHour, TULSA_TZ } from '@/lib/tulsa-time'
import Link from 'next/link'
import { useState } from 'react'
import { card, INK, SUB, FAINT, LINE, BLUE, GREEN, RED, GOLD } from '@/lib/theme'
import { formatCents, formatHour } from '@/lib/format'
import { roomLabel, type RoomConfig } from '@/lib/facilities-store'
import { cancelMyBooking, rescheduleMyBooking, type MemberBooking } from '@/lib/session'
import { startBookingCheckout } from '@/lib/billing-client'
import { DEPOSIT_RULE_GENERAL } from '@/lib/payment-policy'

// A member's own bookings, each one openable into the full picture: where
// it stands, what's been paid, what's still owed — and the three things
// they can do about it without calling us. Pay, move it, or cancel.

const CHIP: React.CSSProperties = {
  fontSize: 10.5, fontWeight: 700, padding: '2px 10px', borderRadius: 999, whiteSpace: 'nowrap',
}

type Stage = 'review' | 'hold' | 'confirmed' | 'done' | 'canceled'

// approvedAt is undefined until migration 0033 runs — before that there's
// no review step to show, so bookings read the way they always did.
export function stageOf(b: MemberBooking): Stage {
  if (b.status === 'canceled') return 'canceled'
  if (b.status === 'completed') return 'done'
  if (b.approvedAt === null) return 'review'
  if (b.status === 'hold') return 'hold'
  return 'confirmed'
}

export function StatusChip({ stage }: { stage: Stage }) {
  if (stage === 'canceled') return <span style={{ ...CHIP, color: SUB, background: '#eef2f8' }}>Canceled</span>
  if (stage === 'review') return <span style={{ ...CHIP, color: '#5b4708', background: '#fdf3dc' }}>Reservation in review</span>
  if (stage === 'hold') return <span style={{ ...CHIP, color: GOLD, background: '#faf0dc' }}>On hold</span>
  if (stage === 'done') return <span style={{ ...CHIP, color: SUB, background: '#eef2f8' }}>Completed</span>
  return <span style={{ ...CHIP, color: GREEN, background: '#e5f2ea' }}>Confirmed</span>
}

function Row({ label, value, strong, tone }: { label: string; value: string; strong?: boolean; tone?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '5px 0' }}>
      <span style={{ fontSize: 12.5, color: SUB }}>{label}</span>
      <span style={{ fontSize: 12.5, fontWeight: strong ? 800 : 600, color: tone ?? INK, fontVariantNumeric: 'tabular-nums' }}>{value}</span>
    </div>
  )
}

function todayPlus(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function Detail({ b, room, onDone }: { b: MemberBooking; room: RoomConfig | undefined; onDone: () => void }) {
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [moving, setMoving] = useState(false)
  const [sent, setSent] = useState(false)
  const [date, setDate] = useState(b.date)
  const [startH, setStartH] = useState(b.startH)
  const [hours, setHours] = useState(b.hours)

  const stage = stageOf(b)
  const balance = Math.max(0, b.priceCents - b.paidCents)
  const depositDue = b.depositCents && b.depositCents > 0 ? Math.max(0, b.depositCents - b.paidCents) : 0
  // Partial payments: anything from the deposit (or $10 with none set) up
  // to the balance — the server enforces the same floor.
  const [customOpen, setCustomOpen] = useState(false)
  const [customAmount, setCustomAmount] = useState('')
  const minPartial = depositDue > 0 ? Math.min(depositDue, balance) : Math.min(1000, balance)
  const customCents = Math.round((Number.parseFloat(customAmount.replace(/[$,\s]/g, '')) || 0) * 100)
  const customOk = customCents >= minPartial && customCents <= balance
  const notice = room?.minNoticeHours ?? 48
  const canPay = balance > 0 && b.status !== 'canceled' && stage !== 'done'
  const extras = b.note?.startsWith('Add-ons:') ? b.note.replace('Add-ons: ', '') : null

  const pay = async (which: 'deposit' | 'balance' | 'custom') => {
    if (busy) return
    if (which === 'custom' && !customOk) return
    setBusy(true); setMsg(null)
    const started = await startBookingCheckout(b.id, which, which === 'custom' ? customCents : undefined)
    // Waivers come before payment: the booking's own page has the waiver
    // ready to sign, with the payment buttons right after it.
    if (started === 'waiver' && b.payToken) { window.location.assign(`/pay/${b.payToken}`); return }
    if (started === 'waiver') { setMsg('This booking still needs its waiver signed before payment — open it from your confirmation email, or call the front desk.'); setBusy(false) }
    else if (started === 'unavailable') { setMsg('Card payments aren’t switched on yet — give us a call and we’ll take it at the desk.'); setBusy(false) }
    // On success the browser is already on its way to Stripe.
  }

  const cancel = async () => {
    if (busy) return
    if (!window.confirm(`Cancel ${b.title} on ${b.date}?\n\nOur cancellation practice: more than 7 days before — full refund of what you've paid; 3–7 days before — refund less the deposit; under 72 hours — no refund (we'll try to rebook you). Refunds go back the way you paid, and we'll email you.`)) return
    setBusy(true); setMsg(null)
    const res = await cancelMyBooking(b.id)
    setBusy(false)
    if (!res.ok) setMsg(res.error ?? 'We couldn’t cancel that — please call the front desk.')
    else onDone()
  }

  const move = async () => {
    if (busy) return
    setBusy(true); setMsg(null)
    const res = await rescheduleMyBooking(b.id, date, startH, hours)
    setBusy(false)
    if (res.ok) { setMoving(false); setSent(true); onDone(); return }
    setMsg(res.conflict
      ? 'That time isn’t open in your room. Try another slot.'
      : res.error ?? 'We couldn’t move that booking.')
  }

  const pc = b.pendingChange
  const pcWhen = pc?.newDuring ? (() => {
    const m = /^[[(]"?([^",]+)"?\s*,\s*"?([^")\]]+)"?[)\]]$/.exec(pc.newDuring as string)
    if (!m) return null
    const f = new Date(m[1]); const t = new Date(m[2])
    return `${f.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: TULSA_TZ })}, ${formatHour(tulsaDayHour(f).hour)}–${formatHour(tulsaDayHour(t).hour)}`
  })() : null

  return (
    <div style={{ padding: '0 20px 16px', background: '#fbfcfe', borderTop: `1px solid ${LINE}` }}>
      {(pc || sent) && (
        <div style={{ background: '#fdf3dc', border: '1px solid #f0ddb8', borderRadius: 10, padding: '10px 13px', margin: '12px 0 0' }}>
          <p style={{ fontSize: 12.5, fontWeight: 700, color: '#5b4708', margin: '0 0 2px' }}>
            Your request for change has been submitted and will be reviewed by our team.
          </p>
          <p style={{ fontSize: 12, color: SUB, margin: 0, lineHeight: 1.5 }}>
            {pcWhen ? <>You asked for <strong style={{ color: INK }}>{pcWhen}</strong>{pc?.newRoomIds ? ' and different rooms' : ''}. </> : pc?.newRoomIds || pc?.newAddonIds ? 'You asked for different rooms or extras. ' : ''}
            Until it&rsquo;s approved your booking stays as shown below. We&rsquo;ll email you either way.
          </p>
        </div>
      )}
      {stage === 'review' && (
        <p style={{ fontSize: 12.5, color: SUB, margin: '12px 0 0', lineHeight: 1.55 }}>
          We have your request and someone on our team is looking at it. You&rsquo;ll get an email the
          moment it&rsquo;s approved. {DEPOSIT_RULE_GENERAL} If we can&rsquo;t approve it, we refund you in full.
        </p>
      )}

      <div style={{ margin: '12px 0 0' }}>
        <Row label="Confirmation" value={b.code} />
        <Row label="What" value={b.title} />
        <Row label="When" value={`${b.date} · ${formatHour(b.startH)}–${formatHour(b.startH + b.hours)}`} />
        {extras && <Row label="Extras" value={extras} />}
        <div style={{ borderTop: `1px solid ${LINE}`, margin: '8px 0 2px' }} />
        <Row label="Booking total" value={formatCents(b.priceCents)} />
        {b.depositCents && b.depositCents > 0 ? <Row label="Deposit to hold it" value={formatCents(b.depositCents)} /> : null}
        <Row label="Paid so far" value={formatCents(b.paidCents)} tone={b.paidCents > 0 ? GREEN : undefined} />
        <Row label="Balance remaining" value={formatCents(balance)} strong tone={balance > 0 ? RED : GREEN} />
      </div>

      {canPay && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
          {depositDue > 0 && depositDue < balance && (
            <button className="sq-btn sq-btn-primary" style={{ padding: '8px 16px' }} disabled={busy} onClick={() => pay('deposit')}>
              Pay {formatCents(depositDue)} deposit
            </button>
          )}
          <button
            className={depositDue > 0 && depositDue < balance ? 'sq-btn sq-btn-ghost' : 'sq-btn sq-btn-primary'}
            style={{ padding: '8px 16px' }} disabled={busy} onClick={() => pay('balance')}
          >
            Pay {formatCents(balance)} in full
          </button>
        </div>
      )}

      {/* Any amount in between — a partial payment toward the balance. */}
      {canPay && minPartial < balance && (
        !customOpen ? (
          <button onClick={() => setCustomOpen(true)}
            style={{ font: 'inherit', fontSize: 12, fontWeight: 600, color: INK, background: 'none', border: 'none', cursor: 'pointer', padding: 0, margin: '8px 0 0', textDecoration: 'underline' }}>
            Pay a different amount
          </button>
        ) : (
          <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <input className="sq-input" style={{ width: 110, padding: '8px 11px' }} inputMode="decimal"
              placeholder={`${(minPartial / 100).toFixed(2)}+`}
              value={customAmount} onChange={(e) => setCustomAmount(e.target.value)} />
            <button className="sq-btn sq-btn-primary" style={{ padding: '8px 15px' }} disabled={busy || !customOk} onClick={() => pay('custom')}>
              {customOk ? `Pay ${formatCents(customCents)}` : 'Pay this amount'}
            </button>
            <span style={{ fontSize: 11, color: FAINT }}>
              {formatCents(minPartial)} to {formatCents(balance)} — the rest stays due.
            </span>
          </div>
        )
      )}

      {/* The rental agreement and card on file live on the booking's page. */}
      {b.payToken && stage !== 'done' && b.status !== 'canceled' && (
        <p style={{ fontSize: 12, color: SUB, margin: '10px 0 0', lineHeight: 1.5 }}>
          {b.agreementSigned === true
            ? <>
                <span style={{ color: GREEN, fontWeight: 700 }}>✓ Rental agreement signed</span>
                {' · '}<a href={`/api/pay/${b.payToken}/agreement/pdf?download=1`} style={{ color: BLUE, fontWeight: 600 }}>Download PDF</a>
                {' · '}<a href={`/pay/${b.payToken}`} style={{ color: BLUE, fontWeight: 600 }}>Booking page →</a>
              </>
            : <>
                <a href={`/pay/${b.payToken}/agreement`} style={{ color: BLUE, fontWeight: 700 }}>Sign the rental agreement →</a>
                {b.agreementSigned === false && <span style={{ color: RED, fontWeight: 600 }}> · still needed</span>}
              </>}
          {b.cardOnFile === false && <span style={{ color: RED, fontWeight: 600 }}> · card on file still needed (<a href={`/pay/${b.payToken}`} style={{ color: BLUE }}>add it</a>)</span>}
        </p>
      )}

      {stage !== 'done' && b.status !== 'canceled' && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
          <button className="sq-btn sq-btn-ghost" style={{ padding: '8px 16px' }} disabled={busy} onClick={() => setMoving((v) => !v)}>
            {moving ? 'Never mind' : pc ? 'Ask for a different time' : 'Request a new time'}
          </button>
          <button className="sq-btn sq-btn-danger" style={{ padding: '8px 16px' }} disabled={busy} onClick={cancel}>
            Cancel booking
          </button>
        </div>
      )}

      {moving && (
        <div style={{ marginTop: 12, padding: 14, background: '#fff', border: `1px solid ${LINE}`, borderRadius: 10 }}>
          <p style={{ fontSize: 12, color: SUB, margin: '0 0 10px', lineHeight: 1.5 }}>
            Pick a new time at least {notice} hours out. This sends a change request — your booking stays
            as it is until our team approves it, and your payment stays on it either way.
          </p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <label style={{ display: 'block' }}>
              <span style={{ display: 'block', fontSize: 11, fontWeight: 700, color: FAINT, marginBottom: 4 }}>Date</span>
              <input
                type="date" value={date} min={todayPlus(Math.ceil(notice / 24))}
                onChange={(e) => setDate(e.target.value)}
                style={{ padding: '8px 10px', border: `1px solid ${LINE}`, borderRadius: 8, fontSize: 13, color: INK }}
              />
            </label>
            <label style={{ display: 'block' }}>
              <span style={{ display: 'block', fontSize: 11, fontWeight: 700, color: FAINT, marginBottom: 4 }}>Start</span>
              <select
                value={startH} onChange={(e) => setStartH(Number(e.target.value))}
                style={{ padding: '8px 10px', border: `1px solid ${LINE}`, borderRadius: 8, fontSize: 13, color: INK, background: '#fff' }}
              >
                {Array.from({ length: 30 }, (_, i) => 8 + i * 0.5).filter((h) => h <= 22).map((h) => (
                  <option key={h} value={h}>{formatHour(h)}</option>
                ))}
              </select>
            </label>
            <label style={{ display: 'block' }}>
              <span style={{ display: 'block', fontSize: 11, fontWeight: 700, color: FAINT, marginBottom: 4 }}>Hours</span>
              <select
                value={hours} onChange={(e) => setHours(Number(e.target.value))}
                style={{ padding: '8px 10px', border: `1px solid ${LINE}`, borderRadius: 8, fontSize: 13, color: INK, background: '#fff' }}
              >
                {[1, 2, 3, 4, 5, 6].map((h) => <option key={h} value={h}>{h} hour{h > 1 ? 's' : ''}</option>)}
              </select>
            </label>
            <button className="sq-btn sq-btn-primary" style={{ padding: '8px 16px' }} disabled={busy} onClick={move}>
              Send request
            </button>
          </div>
        </div>
      )}

      {msg && <p style={{ fontSize: 12.5, color: RED, margin: '10px 0 0', lineHeight: 1.5 }}>{msg}</p>}
    </div>
  )
}

export function MyBookingsCard({ bookings, rooms, onChanged }: {
  bookings: MemberBooking[]
  rooms: RoomConfig[]
  onChanged: () => void
}) {
  const [open, setOpen] = useState<string | null>(null)

  return (
    <div className="sq-card" style={{ ...card, marginBottom: 24 }}>
      <div style={{ padding: '14px 20px', borderBottom: `1px solid ${LINE}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 13.5, fontWeight: 700, color: INK }}>My bookings</span>
        <Link href="/facilities" style={{ fontSize: 12.5, color: BLUE, fontWeight: 600, textDecoration: 'none' }}>Book a room →</Link>
      </div>
      {bookings.length === 0 ? (
        <p style={{ fontSize: 13, color: SUB, padding: '16px 20px', margin: 0 }}>Nothing booked yet — grab a room for your next get-together.</p>
      ) : (
        bookings.map((b, i) => {
          const zone = roomLabel(b.roomId)
          const stage = stageOf(b)
          const balance = Math.max(0, b.priceCents - b.paidCents)
          const isOpen = open === b.id
          return (
            <div key={b.id} style={{ borderBottom: i < bookings.length - 1 ? `1px solid ${LINE}` : 'none' }}>
              <button
                onClick={() => setOpen(isOpen ? null : b.id)}
                aria-expanded={isOpen}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '12px 20px', width: '100%',
                  background: isOpen ? '#fbfcfe' : 'transparent', border: 'none', textAlign: 'left', cursor: 'pointer',
                }}
              >
                <span style={{ width: 9, height: 9, borderRadius: 2, background: zone.color, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 13, fontWeight: 700, color: INK, margin: 0 }}>{zone.name}</p>
                  <p style={{ fontSize: 12, color: SUB, margin: 0, fontVariantNumeric: 'tabular-nums' }}>
                    {b.date} · {formatHour(b.startH)}–{formatHour(b.startH + b.hours)}
                    {balance > 0 ? ` · ${formatCents(balance)} due` : ' · paid in full'}
                  </p>
                </div>
                <StatusChip stage={stage} />
                <span style={{ fontSize: 13, fontWeight: 700, color: INK, fontVariantNumeric: 'tabular-nums' }}>{formatCents(b.priceCents)}</span>
                <span aria-hidden style={{ fontSize: 11, color: FAINT, transform: isOpen ? 'rotate(180deg)' : 'none' }}>▾</span>
              </button>
              {isOpen && <Detail b={b} room={rooms.find((r) => r.id === b.roomId)} onDone={onChanged} />}
            </div>
          )
        })
      )}
    </div>
  )
}
