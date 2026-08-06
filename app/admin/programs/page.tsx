import { PageHero, HeroStat } from '@/components/admin/PageHero'
import { card, INK, SUB, FAINT, LINE, BLUE, GREEN, RED } from '@/lib/theme'
import { formatCents } from '@/lib/format'
import { programs } from '@/lib/admin-data'

export default function ProgramsPage() {
  const enrolled = programs.reduce((n, p) => n + p.enrolled, 0)
  const waiversMissing = programs.reduce((n, p) => n + p.waiversMissing, 0)

  return (
    <div className="sq-page" style={{ padding: '34px 40px 20px', maxWidth: 1180, margin: '0 auto' }}>
      <PageHero title="Programs" sub="Recurring activities with rosters, capacity, waitlists, and waiver tracking." chip={`${waiversMissing} waivers missing`}>
        <HeroStat label="Enrolled" value={String(enrolled)} sub={`across ${programs.length} programs`} />
      </PageHero>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
        {programs.map((p) => {
          const fillPct = Math.round((p.enrolled / p.capacity) * 100)
          return (
            <div key={p.name} className="sq-card" style={{ ...card, padding: '18px 22px' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 4 }}>
                <p style={{ fontSize: 15, fontWeight: 800, color: INK, margin: 0 }}>{p.name}</p>
                <span style={{ fontSize: 12.5, fontWeight: 700, color: BLUE, fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>{formatCents(p.feeCents)} <span style={{ fontWeight: 500, color: FAINT }}>{p.fee}</span></span>
              </div>
              <p style={{ fontSize: 12.5, color: SUB, margin: '0 0 14px' }}>{p.schedule} · {p.coach}</p>

              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                <span style={{ fontSize: 11.5, color: SUB, fontVariantNumeric: 'tabular-nums' }}>{p.enrolled}/{p.capacity} enrolled{p.waitlist > 0 ? ` · ${p.waitlist} waitlisted` : ''}</span>
                <span style={{ fontSize: 11.5, fontWeight: 700, color: fillPct >= 100 ? '#b07818' : GREEN, fontVariantNumeric: 'tabular-nums' }}>{fillPct}%</span>
              </div>
              <div style={{ height: 8, borderRadius: 99, background: '#eef2f8', overflow: 'hidden', marginBottom: 12 }}>
                <div style={{ width: `${Math.min(fillPct, 100)}%`, height: '100%', borderRadius: 99, background: fillPct >= 100 ? '#e8a13a' : `linear-gradient(90deg, #5b93d6, ${BLUE})` }} />
              </div>

              <p style={{ fontSize: 12, margin: 0, paddingTop: 10, borderTop: `1px solid ${LINE}`, color: p.waiversMissing > 0 ? RED : SUB, fontWeight: p.waiversMissing > 0 ? 600 : 400 }}>
                {p.waiversMissing > 0 ? `${p.waiversMissing} signed waiver${p.waiversMissing > 1 ? 's' : ''} missing` : 'All waivers on file ✓'}
              </p>
            </div>
          )
        })}
      </div>
      <p style={{ fontSize: 11.5, color: FAINT, marginTop: 16 }}>Registration, drop-ins, and roster check-in arrive in Phase 3.</p>
    </div>
  )
}
