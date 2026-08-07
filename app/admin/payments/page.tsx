'use client'
import { PageHero, HeroStat } from '@/components/admin/PageHero'
import { card, INK, SUB, FAINT, LINE, GREEN } from '@/lib/theme'
import { formatCents } from '@/lib/format'
import { getPayments, BOOKINGS_EVENT, PAY_LABEL, type PaymentRow } from '@/lib/staff-bookings-store'
import { useLive } from '@/lib/use-live'

export default function PaymentsPage() {
  const { data: payments, loading } = useLive<PaymentRow[]>(getPayments, [BOOKINGS_EVENT], [])
  const collectedCents = payments.reduce((n, p) => n + p.amountCents, 0)

  return (
    <div className="sq-page" style={{ padding: '34px 40px 20px', maxWidth: 1180, margin: '0 auto' }}>
      <PageHero title="Payments" sub="Every payment taken at the desk or online — Stripe, cash, Cash App — feeding the ledger." chip="live">
        <HeroStat label="Collected" value={formatCents(collectedCents)} sub={`${payments.length} recent payments`} />
      </PageHero>

      <div className="sq-card" style={{ ...card, overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: `1px solid ${LINE}` }}>
          <span style={{ fontSize: 13.5, fontWeight: 700, color: INK }}>Recent activity</span>
        </div>
        {payments.length === 0 ? (
          <p style={{ fontSize: 13, color: SUB, padding: '18px 20px', margin: 0 }}>
            {loading ? 'Loading…' : 'No payments yet — they appear here the moment staff take one on a booking.'}
          </p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <div style={{ minWidth: 640 }}>
              {payments.map((p, i) => (
                <div key={p.code} className="sq-row" style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 20px', borderBottom: i < payments.length - 1 ? `1px solid ${LINE}` : 'none' }}>
                  <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 11.5, color: FAINT, minWidth: 62 }}>{p.code}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 700, color: INK, margin: 0 }}>{p.client}</p>
                    <p style={{ fontSize: 12, color: SUB, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {p.memo} · {PAY_LABEL[p.method] ?? p.method} · {p.when} · by {p.takenBy}
                    </p>
                  </div>
                  <span style={{ fontSize: 10.5, fontWeight: 700, color: GREEN, background: '#e5f2ea', padding: '2px 10px', borderRadius: 999, flexShrink: 0 }}>Paid</span>
                  <span style={{ fontSize: 13.5, fontWeight: 700, color: INK, minWidth: 74, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{formatCents(p.amountCents)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      <p style={{ fontSize: 11.5, color: FAINT, marginTop: 16 }}>Card payments are recorded at the desk today — the integrated Stripe terminal and online checkout arrive next.</p>
    </div>
  )
}
