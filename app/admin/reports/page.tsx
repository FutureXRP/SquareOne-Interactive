import { PageHero, HeroStat } from '@/components/admin/PageHero'
import { card, INK, SUB, FAINT, LINE, BLUE, zoneById } from '@/lib/theme'
import { formatCents } from '@/lib/format'
import { weekRevenue } from '@/lib/demo-data'
import { zoneRevenueWeekCents, utilization } from '@/lib/admin-data'

export default function ReportsPage() {
  const weekTotalCents = zoneRevenueWeekCents.reduce((n, z) => n + z.cents, 0)
  const maxZone = Math.max(...zoneRevenueWeekCents.map((z) => z.cents))
  const maxDay = Math.max(...weekRevenue.map((w) => w.cents))

  return (
    <div className="sq-page" style={{ padding: '34px 40px 20px', maxWidth: 1180, margin: '0 auto' }}>
      <PageHero title="Reports" sub="Live views over the ledger and bookings — not canned exports. These charts read straight from the data." chip="this week">
        <HeroStat label="Rental revenue" value={formatCents(weekTotalCents)} sub="by zone, Mon–Sun" />
      </PageHero>

      <div className="sq-grid-2" style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 16 }}>
        {/* Revenue by zone */}
        <div className="sq-card" style={{ ...card, padding: '18px 22px' }}>
          <p style={{ fontSize: 13.5, fontWeight: 700, color: INK, margin: '0 0 14px' }}>Rental revenue by zone · this week</p>
          {zoneRevenueWeekCents.map((z) => {
            const zone = zoneById[z.zoneId]
            const pct = (z.cents / maxZone) * 100
            return (
              <div key={z.zoneId} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 9 }} title={`${zone.name}: ${formatCents(z.cents)}`}>
                <span style={{ fontSize: 11.5, color: SUB, width: 104, flexShrink: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{zone.name}</span>
                <div style={{ flex: 1, height: 14, borderRadius: 4, background: '#eef2f8', overflow: 'hidden' }}>
                  <div style={{ width: `${pct}%`, height: '100%', borderRadius: 4, background: zone.color, minWidth: 3 }} />
                </div>
                <span style={{ fontSize: 11.5, fontWeight: 700, color: INK, width: 64, textAlign: 'right', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>{formatCents(z.cents)}</span>
              </div>
            )
          })}
          <p style={{ fontSize: 11, color: FAINT, margin: '10px 0 0', paddingTop: 10, borderTop: `1px solid ${LINE}` }}>Zone colors match the Board.</p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Daily revenue */}
          <div className="sq-card" style={{ ...card, padding: '18px 22px' }}>
            <p style={{ fontSize: 13.5, fontWeight: 700, color: INK, margin: '0 0 14px' }}>Daily revenue · all sources</p>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 92 }}>
              {weekRevenue.map((w) => {
                const h = Math.max((w.cents / maxDay) * 72, 4)
                return (
                  <div key={w.label} style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }} title={`${w.label}: ${formatCents(w.cents)}${w.projected ? ' (projected)' : ''}`}>
                    <div style={{ width: '100%', height: h, borderRadius: '4px 4px 0 0', background: w.projected ? 'transparent' : `linear-gradient(180deg, #5b93d6, ${BLUE})`, position: 'relative', minHeight: 4 }}>
                      {w.projected && <div style={{ position: 'absolute', inset: 0, border: '1.5px dashed #5b93d6', borderRadius: '4px 4px 0 0' }} />}
                    </div>
                    <span style={{ fontSize: 9.5, color: w.today ? INK : FAINT, fontWeight: w.today ? 700 : 400 }}>{w.label}</span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Utilization */}
          <div className="sq-card" style={{ ...card, padding: '18px 22px' }}>
            <p style={{ fontSize: 13.5, fontWeight: 700, color: INK, margin: '0 0 12px' }}>Facility utilization</p>
            {utilization.map((u) => (
              <div key={u.label} style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 11.5, color: SUB }}>{u.label}</span>
                  <span style={{ fontSize: 11.5, fontWeight: 700, color: INK, fontVariantNumeric: 'tabular-nums' }}>{u.pct}%</span>
                </div>
                <div style={{ height: 8, borderRadius: 99, background: '#eef2f8', overflow: 'hidden' }}>
                  <div style={{ width: `${u.pct}%`, height: '100%', borderRadius: 99, background: `linear-gradient(90deg, #5b93d6, ${BLUE})` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <p style={{ fontSize: 11.5, color: FAINT, marginTop: 16 }}>Placeholder figures — these become live SQL views over the ledger in Phase 3.</p>
    </div>
  )
}
