import { PageHero, HeroStat } from '@/components/admin/PageHero'
import { card, INK, SUB, FAINT, LINE, GREEN, RED } from '@/lib/theme'
import { doorLog, kpis } from '@/lib/demo-data'
import { doorDevices } from '@/lib/admin-data'

const OUTCOME: Record<string, { label: string; color: string; bg: string }> = {
  in: { label: 'IN', color: GREEN, bg: '#e5f2ea' },
  denied: { label: 'DENIED', color: RED, bg: '#fae7e4' },
  flagged: { label: 'FLAGGED', color: '#b07818', bg: '#faf0dc' },
}

export default function DoorsPage() {
  return (
    <div className="sq-page" style={{ padding: '34px 40px 20px', maxWidth: 1180, margin: '0 auto' }}>
      <PageHero title="Check-ins & Doors" sub="Every scan at every entrance — allow, deny, or flag with a reason. Synced with the facility door system." chip="live">
        <HeroStat label="Inside now" value={String(kpis.playersInside)} sub={`${kpis.checkInsToday} check-ins today`} />
      </PageHero>

      {/* Device status */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 24 }}>
        {doorDevices.map((d) => (
          <div key={d.name} className="sq-card" style={{ ...card, padding: '13px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ width: 8, height: 8, borderRadius: 99, background: d.state === 'online' ? GREEN : '#94a6bd', flexShrink: 0 }} />
            <div style={{ minWidth: 0 }}>
              <p style={{ fontSize: 12.5, fontWeight: 700, color: INK, margin: 0 }}>{d.name}</p>
              <p style={{ fontSize: 11, color: FAINT, margin: 0 }}>{d.state} · last scan {d.last}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="sq-card" style={card}>
        <div style={{ padding: '14px 20px', borderBottom: `1px solid ${LINE}` }}>
          <span style={{ fontSize: 13.5, fontWeight: 700, color: INK }}>Door log</span>
          <span style={{ fontSize: 11.5, color: FAINT, marginLeft: 10 }}>most recent first</span>
        </div>
        {doorLog.map((d, i) => {
          const o = OUTCOME[d.outcome]
          return (
            <div key={i} className="sq-row" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 20px', borderBottom: i < doorLog.length - 1 ? `1px solid ${LINE}` : 'none' }}>
              <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 11.5, color: FAINT, minWidth: 58, fontVariantNumeric: 'tabular-nums' }}>{d.time}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 13, fontWeight: 700, color: INK, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.who}</p>
                <p style={{ fontSize: 11.5, color: SUB, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {d.context} · {d.point} · {d.method}{d.reason ? ` — ${d.reason}` : ''}
                </p>
              </div>
              <span style={{ fontSize: 10.5, fontWeight: 700, color: o.color, background: o.bg, padding: '2px 9px', borderRadius: 999, flexShrink: 0 }}>{o.label}</span>
            </div>
          )
        })}
      </div>
      <p style={{ fontSize: 11.5, color: FAINT, marginTop: 16 }}>Member barcodes from the store become live credentials when this integration ships (Phase 3).</p>
    </div>
  )
}
