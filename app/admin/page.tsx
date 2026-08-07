'use client'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Board } from '@/components/board/Board'
import { formatCents, formatHour } from '@/lib/format'
import { card, HERO_GRADIENT, INK, SUB, FAINT, LINE, BLUE, GREEN, RED, GOLD } from '@/lib/theme'
import { roomLabel } from '@/lib/facilities-store'
import { getStaffBookings, getPayments, isoDate, BOOKINGS_EVENT, type StaffBooking, type PaymentRow } from '@/lib/staff-bookings-store'
import { getClients, CLIENTS_EVENT, type ClientAccount } from '@/lib/clients-store'
import { isSupabaseConfigured } from '@/lib/supabase'

function SectionLabel({ children, meta }: { children: string; meta?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '0 0 14px' }}>
      <span style={{ width: 8, height: 8, background: BLUE, borderRadius: 2, flexShrink: 0 }} />
      <span style={{ fontSize: 12, fontWeight: 700, color: BLUE, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{children}</span>
      <div style={{ height: 1, flex: 1, background: LINE }} />
      {meta && <span style={{ fontSize: 11.5, color: FAINT }}>{meta}</span>}
    </div>
  )
}

function Kpi({ label, value, accent, sub }: { label: string; value: string; accent?: string; sub?: string }) {
  return (
    <div className="sq-card" style={{ ...card, padding: '15px 17px' }}>
      <p style={{ fontSize: 11, color: FAINT, margin: '0 0 6px', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>{label}</p>
      <p style={{ fontSize: 22, fontWeight: 700, color: accent ?? INK, margin: 0, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}>{value}</p>
      {sub && <p style={{ fontSize: 11.5, color: SUB, margin: '4px 0 0' }}>{sub}</p>}
    </div>
  )
}

function greeting(hour: number) {
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

export default function TodayPage() {
  const [now, setNow] = useState<Date | null>(null)
  const [bookings, setBookings] = useState<StaffBooking[]>([])
  const [payments, setPayments] = useState<PaymentRow[]>([])
  const [clients, setClients] = useState<ClientAccount[]>([])

  useEffect(() => {
    setNow(new Date())
    if (!isSupabaseConfigured()) return
    let on = true
    const sync = () => {
      Promise.all([getStaffBookings(), getPayments(), getClients()]).then(([b, p, c]) => {
        if (on) { setBookings(b); setPayments(p); setClients(c) }
      }).catch(() => {})
    }
    sync()
    window.addEventListener(BOOKINGS_EVENT, sync)
    window.addEventListener(CLIENTS_EVENT, sync)
    return () => {
      on = false
      window.removeEventListener(BOOKINGS_EVENT, sync)
      window.removeEventListener(CLIENTS_EVENT, sync)
    }
  }, [])

  const today = isoDate(0)
  const todays = bookings.filter((b) => b.date === today && b.status !== 'canceled')
  const holds = bookings.filter((b) => b.status === 'hold')
  const revenueTodayCents = payments.filter((p) => p.dateIso === today).reduce((n, p) => n + p.amountCents, 0)
  const owing = clients.filter((c) => c.balanceCents > 0)

  // "Needs a person": open holds first, then accounts owing money.
  const queue: { title: string; detail: string; href: string; urgent: boolean }[] = [
    ...holds.slice(0, 3).map((h) => ({
      title: `Hold ${h.code} — deposit not collected`,
      detail: `${h.client} · ${roomLabel(h.roomId).name} · ${h.date === today ? 'today' : h.date} ${formatHour(h.startH)} · ${formatCents(h.priceCents)}. Take payment to lock it in.`,
      href: '/admin/bookings',
      urgent: h.date === today,
    })),
    ...owing.slice(0, 2).map((c) => ({
      title: `${c.account} owes ${formatCents(c.balanceCents)}`,
      detail: 'Collect at the desk or record a credit on their account.',
      href: '/admin/clients',
      urgent: false,
    })),
  ]

  const dateLine = now?.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }) ?? ''

  return (
    <div className="sq-page" style={{ padding: '34px 40px 20px', maxWidth: 1180, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 24, marginBottom: 26, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 800, color: INK, margin: '0 0 6px', letterSpacing: '-0.03em' }}>
            {now ? greeting(now.getHours()) : 'Welcome'} — here&apos;s today
          </h1>
          <p style={{ fontSize: 13, color: FAINT, margin: 0 }}>
            {dateLine}&nbsp;&nbsp;·&nbsp;&nbsp;<span style={{ color: GREEN }}>●</span> live from Supabase
          </p>
        </div>
        <div style={{ position: 'relative', overflow: 'hidden', background: HERO_GRADIENT, color: '#fff', borderRadius: 18, padding: '16px 22px', textAlign: 'right', minWidth: 264, boxShadow: '0 14px 32px rgba(24,39,64,.28)' }}>
          <div style={{ position: 'absolute', left: -26, top: -30, width: 110, height: 110, border: '2px solid rgba(255,255,255,0.08)', borderRadius: 18, transform: 'rotate(20deg)' }} />
          <div style={{ position: 'absolute', left: -4, top: -8, width: 66, height: 66, border: '2px solid rgba(255,255,255,0.10)', borderRadius: 12, transform: 'rotate(20deg)' }} />
          <p style={{ fontSize: 11, margin: '0 0 2px', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700, opacity: 0.78 }}>Collected today</p>
          <p style={{ fontSize: 32, fontWeight: 800, color: '#fff', margin: 0, letterSpacing: '-0.03em', fontVariantNumeric: 'tabular-nums' }}>{formatCents(revenueTodayCents)}</p>
          <p style={{ fontSize: 12, opacity: 0.88, margin: '3px 0 0' }}>{todays.length} bookings today&nbsp;·&nbsp;{holds.length} holds awaiting payment</p>
        </div>
      </div>

      {/* KPI strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 30 }}>
        <Kpi label="Bookings today" value={String(todays.length)} sub={`${holds.length} unpaid holds`} />
        <Kpi label="Collected today" value={formatCents(revenueTodayCents)} accent={GREEN} sub="all payment methods" />
        <Kpi label="Client accounts" value={String(clients.length)} sub="signed up in the store" />
        <Kpi label="Owed to you" value={formatCents(owing.reduce((n, c) => n + c.balanceCents, 0))} accent={owing.length > 0 ? RED : undefined} sub={`${owing.length} accounts`} />
        <Kpi label="People inside" value="—" sub="door hardware coming" />
      </div>

      {/* Needs a person */}
      <div style={{ marginBottom: 32 }}>
        <SectionLabel meta={queue.length === 0 ? 'all clear' : `${queue.length} items`}>Needs a person</SectionLabel>
        {queue.length === 0 ? (
          <div className="sq-card" style={{ ...card, padding: '18px 22px' }}>
            <p style={{ fontSize: 13.5, color: SUB, margin: 0 }}>Nothing needs a human right now — holds are paid and balances are settled.</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 14 }}>
            {queue.map((q, i) => (
              <Link key={i} href={q.href} style={{ textDecoration: 'none' }}>
                <div className="sq-card" style={{ ...card, padding: '16px 18px', height: '100%', borderTop: `3px solid ${q.urgent ? RED : GOLD}` }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 4 }}>
                    <p style={{ fontSize: 14, fontWeight: 700, color: INK, margin: 0, lineHeight: 1.3 }}>{q.title}</p>
                    <span style={{ fontSize: 10.5, fontWeight: 700, color: q.urgent ? RED : '#b07818', background: q.urgent ? '#fae7e4' : '#faf0dc', padding: '2px 9px', borderRadius: 999, flexShrink: 0 }}>{q.urgent ? 'urgent' : 'soon'}</span>
                  </div>
                  <p style={{ fontSize: 12.5, color: SUB, margin: '0 0 10px', lineHeight: 1.5 }}>{q.detail}</p>
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: BLUE }}>Open →</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* The Board */}
      <div style={{ marginBottom: 32 }}>
        <SectionLabel meta="6 AM – 11 PM · striped blocks are unpaid holds">The Board</SectionLabel>
        <div className="sq-card" style={{ ...card, padding: '4px 14px 14px' }}>
          <Board />
        </div>
      </div>

      {/* Recent payments */}
      <div className="sq-card" style={{ ...card, marginBottom: 10 }}>
        <div style={{ padding: '14px 18px', borderBottom: `1px solid ${LINE}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 13.5, fontWeight: 600, color: INK }}>Latest payments</span>
          <Link href="/admin/payments" style={{ fontSize: 12.5, color: BLUE, fontWeight: 600, textDecoration: 'none' }}>All payments →</Link>
        </div>
        {payments.length === 0 ? (
          <p style={{ fontSize: 13, color: SUB, padding: '16px 18px', margin: 0 }}>No payments yet today.</p>
        ) : (
          payments.slice(0, 5).map((p, i) => (
            <div key={p.code} className="sq-row" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 18px', borderBottom: i < Math.min(payments.length, 5) - 1 ? `1px solid ${LINE}` : 'none' }}>
              <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 11.5, color: FAINT, minWidth: 62 }}>{p.code}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 13, fontWeight: 600, color: INK, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.client} · {p.memo}</p>
                <p style={{ fontSize: 11.5, color: SUB, margin: 0 }}>{p.when} · by {p.takenBy}</p>
              </div>
              <span style={{ fontSize: 13.5, fontWeight: 700, color: GREEN, fontVariantNumeric: 'tabular-nums' }}>{formatCents(p.amountCents)}</span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
