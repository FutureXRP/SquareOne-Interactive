'use client'
import { useEffect, useState } from 'react'
import { PageHero, HeroStat } from '@/components/admin/PageHero'
import { card, INK, SUB, FAINT, LINE, GREEN, RED, BLUE } from '@/lib/theme'
import { formatCents } from '@/lib/format'
import { payments } from '@/lib/admin-data'
import { roomLabel } from '@/lib/facilities-store'
import { recordedPayments, PAY_LABEL, isoDate, type StaffBooking } from '@/lib/staff-bookings-store'

const STATUS: Record<string, { label: string; color: string; bg: string }> = {
  paid: { label: 'Paid', color: GREEN, bg: '#e5f2ea' },
  pending: { label: 'Pending', color: '#b07818', bg: '#faf0dc' },
  failed: { label: 'Failed', color: RED, bg: '#fae7e4' },
}

const METHOD: Record<string, string> = { card: 'Card', ach: 'ACH', cash: 'Cash', check: 'Check' }

export default function PaymentsPage() {
  const [recorded, setRecorded] = useState<StaffBooking[]>([])

  useEffect(() => {
    const sync = () => setRecorded(recordedPayments())
    sync()
    window.addEventListener('sq-staff-bookings', sync)
    return () => window.removeEventListener('sq-staff-bookings', sync)
  }, [])

  const collectedCents = payments.filter((p) => p.status === 'paid').reduce((n, p) => n + p.amountCents, 0)
    + recorded.reduce((n, b) => n + b.paidCents, 0)
  const failed = payments.filter((p) => p.status === 'failed')
  const dateLabel = (d: string) => (d === isoDate(0) ? 'Today' : d === isoDate(1) ? 'Tomorrow' : d)

  return (
    <div className="sq-page" style={{ padding: '34px 40px 20px', maxWidth: 1180, margin: '0 auto' }}>
      <PageHero title="Payments" sub="Stripe, cash, Cash App, ACH, and checks unified into the double-entry ledger — balances always come from the ledger sum." chip={failed.length > 0 ? `${failed.length} failed` : 'all clear'}>
        <HeroStat label="Collected" value={formatCents(collectedCents)} sub="including desk payments" />
      </PageHero>

      {failed.length > 0 && (
        <div className="sq-card" style={{ ...card, borderLeft: `4px solid ${RED}`, padding: '14px 20px', marginBottom: 18 }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: INK, margin: '0 0 2px' }}>Failed payments retrying</p>
          <p style={{ fontSize: 12.5, color: SUB, margin: 0 }}>
            {failed.map((f) => `${f.who} — ${formatCents(f.amountCents)} (${f.what})`).join(' · ')}. Stripe handles retries and dunning automatically.
          </p>
        </div>
      )}

      {/* Payments staff took at the desk */}
      {recorded.length > 0 && (
        <div className="sq-card" style={{ ...card, overflow: 'hidden', marginBottom: 18, borderTop: `3px solid ${BLUE}` }}>
          <div style={{ padding: '14px 20px', borderBottom: `1px solid ${LINE}` }}>
            <span style={{ fontSize: 13.5, fontWeight: 700, color: INK }}>Taken at the desk</span>
            <span style={{ fontSize: 11.5, color: FAINT, marginLeft: 10 }}>from staff bookings</span>
          </div>
          {recorded.map((b, i) => (
            <div key={b.id} className="sq-row" style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 20px', borderBottom: i < recorded.length - 1 ? `1px solid ${LINE}` : 'none' }}>
              <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 11.5, color: FAINT, minWidth: 62 }}>{b.id}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 13, fontWeight: 700, color: INK, margin: 0 }}>{b.client}</p>
                <p style={{ fontSize: 12, color: SUB, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {b.title} · {roomLabel(b.roomId).name} · {b.payMethod ? PAY_LABEL[b.payMethod] : ''} · {dateLabel(b.date)} · by {b.takenBy}
                </p>
              </div>
              <span style={{ fontSize: 10.5, fontWeight: 700, color: GREEN, background: '#e5f2ea', padding: '2px 10px', borderRadius: 999, flexShrink: 0 }}>Paid</span>
              <span style={{ fontSize: 13.5, fontWeight: 700, color: INK, minWidth: 74, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{formatCents(b.paidCents)}</span>
            </div>
          ))}
        </div>
      )}

      <div className="sq-card" style={{ ...card, overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: `1px solid ${LINE}` }}>
          <span style={{ fontSize: 13.5, fontWeight: 700, color: INK }}>Recent activity</span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <div style={{ minWidth: 640 }}>
            {payments.map((p, i) => {
              const s = STATUS[p.status]
              return (
                <div key={p.id} className="sq-row" style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 20px', borderBottom: i < payments.length - 1 ? `1px solid ${LINE}` : 'none' }}>
                  <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 11.5, color: FAINT, minWidth: 62 }}>{p.id}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 700, color: INK, margin: 0 }}>{p.who}</p>
                    <p style={{ fontSize: 12, color: SUB, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.what} · {METHOD[p.method]} · {p.when}</p>
                  </div>
                  <span style={{ fontSize: 10.5, fontWeight: 700, color: s.color, background: s.bg, padding: '2px 10px', borderRadius: 999, flexShrink: 0 }}>{s.label}</span>
                  <span style={{ fontSize: 13.5, fontWeight: 700, color: p.status === 'failed' ? RED : INK, minWidth: 74, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{formatCents(p.amountCents)}</span>
                </div>
              )
            })}
          </div>
        </div>
      </div>
      <p style={{ fontSize: 11.5, color: FAINT, marginTop: 16 }}>Invoices, receipts, and the real Stripe terminal arrive with Phase 2 — desk payments here are demo records.</p>
    </div>
  )
}
