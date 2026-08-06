import Link from 'next/link'
import { PageHero, HeroStat } from '@/components/admin/PageHero'
import { card, INK, SUB, FAINT, LINE, BLUE, GREEN, RED } from '@/lib/theme'
import { formatCents } from '@/lib/format'
import { membershipStats, recentSignups } from '@/lib/admin-data'

export default function AdminMembershipsPage() {
  const m = membershipStats
  return (
    <div className="sq-page" style={{ padding: '34px 40px 20px', maxWidth: 1180, margin: '0 auto' }}>
      <PageHero title="Fitness Memberships" sub="Family $75 and Individual $25 ongoing plans — mirrored from Stripe subscriptions when billing goes live." chip={`${m.active} active`}>
        <HeroStat label="Monthly recurring" value={formatCents(m.mrrCents)} sub={`+${m.newThisMonth} new this month`} />
      </PageHero>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 24 }}>
        {[
          { label: 'Family plans', value: String(m.family), sub: `${formatCents(7500)}/mo each` },
          { label: 'Individual plans', value: String(m.individual), sub: `${formatCents(2500)}/mo each` },
          { label: 'New this month', value: `+${m.newThisMonth}`, accent: GREEN, sub: 'signups' },
          { label: 'Canceling', value: String(m.canceling), accent: '#b07818', sub: 'end of period' },
          { label: 'Past due', value: formatCents(m.pastDueCents), accent: RED, sub: 'dunning via Stripe' },
        ].map((k) => (
          <div key={k.label} className="sq-card" style={{ ...card, padding: '15px 17px' }}>
            <p style={{ fontSize: 11, color: FAINT, margin: '0 0 6px', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>{k.label}</p>
            <p style={{ fontSize: 22, fontWeight: 700, color: k.accent ?? INK, margin: 0, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}>{k.value}</p>
            <p style={{ fontSize: 11.5, color: SUB, margin: '4px 0 0' }}>{k.sub}</p>
          </div>
        ))}
      </div>

      <div className="sq-card" style={card}>
        <div style={{ padding: '14px 20px', borderBottom: `1px solid ${LINE}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 13.5, fontWeight: 700, color: INK }}>Recent signups</span>
          <Link href="/memberships" style={{ fontSize: 12.5, color: BLUE, fontWeight: 600, textDecoration: 'none' }}>View public plans page →</Link>
        </div>
        {recentSignups.map((s, i) => (
          <div key={s.name} className="sq-row" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 20px', borderBottom: i < recentSignups.length - 1 ? `1px solid ${LINE}` : 'none' }}>
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: INK, margin: 0 }}>{s.name}</p>
              <p style={{ fontSize: 12, color: SUB, margin: 0 }}>{s.plan} plan</p>
            </div>
            <span style={{ fontSize: 12, color: FAINT }}>{s.when}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
