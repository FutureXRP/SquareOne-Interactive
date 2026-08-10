'use client'
import { useEffect, useState } from 'react'
import { PageHero, HeroStat } from '@/components/admin/PageHero'
import { card, INK, SUB, FAINT, LINE, BLUE } from '@/lib/theme'
import { formatCents } from '@/lib/format'
import { getReport, type ReportData } from '@/lib/reports-store'
import { getRooms, roomLabel } from '@/lib/facilities-store'
import { getPayments, BOOKINGS_EVENT, PAY_LABEL, type PaymentRow } from '@/lib/staff-bookings-store'
import { isSupabaseConfigured } from '@/lib/supabase'

const RANGES = [
  { days: 7, label: 'Last 7 days' },
  { days: 30, label: 'Last 30 days' },
  { days: 90, label: 'Last 90 days' },
]

export default function ReportsPage() {
  const [range, setRange] = useState(7)
  const [data, setData] = useState<ReportData | null>(null)
  const [payments, setPayments] = useState<PaymentRow[]>([])

  useEffect(() => {
    if (!isSupabaseConfigured()) return
    let on = true
    const sync = () => {
      Promise.all([getReport(range), getPayments(), getRooms().catch(() => [])])
        .then(([r, p]) => { if (on) { setData(r); setPayments(p) } })
        .catch(() => {})
    }
    sync()
    const timer = window.setInterval(sync, 60_000) // stays current while it's open
    window.addEventListener(BOOKINGS_EVENT, sync)
    return () => { on = false; window.clearInterval(timer); window.removeEventListener(BOOKINGS_EVENT, sync) }
  }, [range])

  const maxBucket = Math.max(...(data?.perBucket.map((b) => b.cents) ?? [0]), 1)
  const maxRoom = Math.max(...(data?.byRoom.map((r) => r.cents) ?? [0]), 1)
  const methodTotal = data?.byMethod.reduce((n, m) => n + m.cents, 0) ?? 0

  return (
    <div className="sq-page" style={{ padding: '34px 40px 20px', maxWidth: 1180, margin: '0 auto' }}>
      <PageHero title="Reports" sub="Live numbers straight from payments, bookings, memberships, and check-ins — refreshed as they happen." chip="live">
        <HeroStat label="Collected" value={formatCents(data?.totalRevenueCents ?? 0)} sub={`last ${range} days`} />
      </PageHero>

      {/* Range filter */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {RANGES.map((r) => (
          <button key={r.days} onClick={() => setRange(r.days)} style={{
            font: 'inherit', cursor: 'pointer', fontSize: 12.5, fontWeight: 600, padding: '6px 15px', borderRadius: 999,
            color: range === r.days ? '#fff' : SUB, background: range === r.days ? BLUE : '#fff',
            border: `1.5px solid ${range === r.days ? BLUE : LINE}`,
          }}>
            {r.label}
          </button>
        ))}
      </div>

      {/* Stat tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14, marginBottom: 16 }}>
        {[
          { label: 'Revenue collected', value: formatCents(data?.totalRevenueCents ?? 0) },
          { label: 'Bookings made', value: String(data?.bookings ?? 0), sub: `${data?.holds ?? 0} still on hold` },
          { label: 'New fitness members', value: String(data?.newMembers ?? 0), sub: `${data?.activeMembers ?? 0} active total` },
          { label: 'Check-ins', value: String(data?.checkIns ?? 0) },
        ].map((t) => (
          <div key={t.label} className="sq-card" style={{ ...card, padding: '16px 20px' }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: FAINT, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 6px' }}>{t.label}</p>
            <p style={{ fontSize: 22, fontWeight: 800, color: INK, margin: 0, fontVariantNumeric: 'tabular-nums' }}>{t.value}</p>
            {t.sub && <p style={{ fontSize: 11.5, color: SUB, margin: '2px 0 0' }}>{t.sub}</p>}
          </div>
        ))}
      </div>

      <div className="sq-grid-2" style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 16, marginBottom: 16 }}>
        {/* Revenue over time */}
        <div className="sq-card" style={{ ...card, padding: '18px 22px' }}>
          <p style={{ fontSize: 13.5, fontWeight: 700, color: INK, margin: '0 0 14px' }}>
            Revenue by {data?.bucketLabel === 'week' ? 'week' : 'day'}
          </p>
          {data && data.perBucket.length > 0 ? (
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: data.perBucket.length > 14 ? 3 : 8, height: 110 }}>
              {data.perBucket.map((b, i) => {
                const h = Math.max((b.cents / maxBucket) * 84, b.cents > 0 ? 6 : 2)
                const showLabel = data.perBucket.length <= 8 || i % Math.ceil(data.perBucket.length / 8) === 0
                return (
                  <div key={b.iso} style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}
                    title={`${b.iso}: ${formatCents(b.cents)}`}>
                    <div style={{ width: '100%', maxWidth: 34, height: h, borderRadius: '4px 4px 0 0', background: b.cents > 0 ? `linear-gradient(180deg, #5b93d6, ${BLUE})` : '#eef2f8' }} />
                    <span style={{ fontSize: 9, color: FAINT, whiteSpace: 'nowrap', overflow: 'hidden', maxWidth: '100%' }}>{showLabel ? b.label : ''}</span>
                  </div>
                )
              })}
            </div>
          ) : (
            <p style={{ fontSize: 13, color: SUB, margin: 0 }}>
              {isSupabaseConfigured() ? 'No payments in this range yet — the chart fills in as money comes in.' : 'Connect Supabase to see live reports.'}
            </p>
          )}
        </div>

        {/* Payments by method */}
        <div className="sq-card" style={{ ...card, padding: '18px 22px' }}>
          <p style={{ fontSize: 13.5, fontWeight: 700, color: INK, margin: '0 0 12px' }}>Payments by method</p>
          {(data?.byMethod.length ?? 0) === 0 && <p style={{ fontSize: 13, color: SUB, margin: 0 }}>Nothing collected in this range yet.</p>}
          {data?.byMethod.map((m) => {
            const pct = methodTotal > 0 ? Math.round((m.cents / methodTotal) * 100) : 0
            return (
              <div key={m.method} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 9 }} title={`${PAY_LABEL[m.method] ?? m.method}: ${formatCents(m.cents)} (${pct}%)`}>
                <span style={{ fontSize: 11.5, color: SUB, width: 74, flexShrink: 0 }}>{PAY_LABEL[m.method] ?? m.method}</span>
                <div style={{ flex: 1, height: 14, borderRadius: 4, background: '#eef2f8', overflow: 'hidden' }}>
                  <div style={{ width: `${pct}%`, height: '100%', borderRadius: 4, background: BLUE, minWidth: m.cents > 0 ? 3 : 0 }} />
                </div>
                <span style={{ fontSize: 11.5, fontWeight: 700, color: INK, width: 74, textAlign: 'right', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>{formatCents(m.cents)}</span>
              </div>
            )
          })}
          {(data?.byMethod.length ?? 0) > 0 && (
            <p style={{ fontSize: 11, color: FAINT, margin: '10px 0 0', paddingTop: 10, borderTop: `1px solid ${LINE}` }}>
              Card payments post from Stripe; cash and Cash App are recorded at the desk.
            </p>
          )}
        </div>
      </div>

      <div className="sq-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 16 }}>
        {/* Revenue by room */}
        <div className="sq-card" style={{ ...card, padding: '18px 22px', alignSelf: 'start' }}>
          <p style={{ fontSize: 13.5, fontWeight: 700, color: INK, margin: '0 0 14px' }}>Rental revenue by room</p>
          {(data?.byRoom.length ?? 0) === 0 && <p style={{ fontSize: 13, color: SUB, margin: 0 }}>No rental payments in this range yet.</p>}
          {data?.byRoom.map((r) => {
            const room = r.roomId === 'other' ? { name: 'Memberships & other', color: '#94a6bd' } : roomLabel(r.roomId)
            const pct = (r.cents / maxRoom) * 100
            return (
              <div key={r.roomId} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 9 }} title={`${room.name}: ${formatCents(r.cents)}`}>
                <span style={{ fontSize: 11.5, color: SUB, width: 118, flexShrink: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{room.name}</span>
                <div style={{ flex: 1, height: 14, borderRadius: 4, background: '#eef2f8', overflow: 'hidden' }}>
                  <div style={{ width: `${pct}%`, height: '100%', borderRadius: 4, background: room.color, minWidth: 3 }} />
                </div>
                <span style={{ fontSize: 11.5, fontWeight: 700, color: INK, width: 68, textAlign: 'right', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>{formatCents(r.cents)}</span>
              </div>
            )
          })}
        </div>

        {/* Recent payments table */}
        <div className="sq-card" style={{ ...card, overflow: 'hidden', alignSelf: 'start' }}>
          <div style={{ padding: '13px 20px', borderBottom: `1px solid ${LINE}` }}>
            <span style={{ fontSize: 13.5, fontWeight: 700, color: INK }}>Recent payments</span>
          </div>
          {payments.length === 0 && <p style={{ fontSize: 13, color: SUB, padding: '16px 20px', margin: 0 }}>No payments yet — they appear here the moment one is taken.</p>}
          {payments.slice(0, 8).map((p, i) => (
            <div key={`${p.code}-${i}`} className="sq-row" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 20px', borderBottom: i < Math.min(payments.length, 8) - 1 ? `1px solid ${LINE}` : 'none', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 140 }}>
                <p style={{ fontSize: 12.5, fontWeight: 700, color: INK, margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.client}</p>
                <p style={{ fontSize: 11, color: FAINT, margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.memo || p.code} · {p.when}</p>
              </div>
              <span style={{ fontSize: 10.5, fontWeight: 700, color: SUB, background: '#eef2f8', padding: '2px 9px', borderRadius: 999 }}>{PAY_LABEL[p.method] ?? p.method}</span>
              <span style={{ fontSize: 12.5, fontWeight: 700, color: INK, fontVariantNumeric: 'tabular-nums' }}>{formatCents(p.amountCents)}</span>
            </div>
          ))}
        </div>
      </div>

      <p style={{ fontSize: 11.5, color: FAINT, marginTop: 16 }}>
        Every number reads live from the ledger — no snapshots. The page also refreshes itself every minute while open.
      </p>
    </div>
  )
}
