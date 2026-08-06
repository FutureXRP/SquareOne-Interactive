import Link from 'next/link'
import { Board } from '@/components/board/Board'
import { formatCents, formatHour } from '@/lib/format'
import { card, HERO_GRADIENT, INK, SUB, FAINT, LINE, BLUE, GOLD, GREEN, RED, NAVY, zoneById } from '@/lib/theme'
import { bookings, frontDeskQueue, doorLog, kpis, weekRevenue, type Urgency, type DoorOutcome } from '@/lib/demo-data'

export const dynamic = 'force-dynamic'

const URGENCY: Record<Urgency, { label: string; color: string; bg: string }> = {
  urgent: { label: 'urgent', color: RED, bg: '#fae7e4' },
  soon: { label: 'soon', color: '#b07818', bg: '#faf0dc' },
  idea: { label: 'idea', color: SUB, bg: '#eef2f8' },
}

const OUTCOME: Record<DoorOutcome, { label: string; color: string; bg: string }> = {
  in: { label: 'IN', color: GREEN, bg: '#e5f2ea' },
  denied: { label: 'DENIED', color: RED, bg: '#fae7e4' },
  flagged: { label: 'FLAGGED', color: '#b07818', bg: '#faf0dc' },
}

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
  const now = new Date()
  const today = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
  const holds = bookings.filter((b) => b.status === 'hold')
  const maxRev = Math.max(...weekRevenue.map((w) => w.cents))

  return (
    <div className="sq-page" style={{ padding: '34px 40px 48px', maxWidth: 1180, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 24, marginBottom: 26, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 800, color: INK, margin: '0 0 6px', letterSpacing: '-0.03em' }}>
            {greeting(now.getHours())} — busy evening ahead
          </h1>
          <p style={{ fontSize: 13, color: FAINT, margin: 0 }}>
            {today}&nbsp;&nbsp;·&nbsp;&nbsp;{kpis.playersInside} people inside&nbsp;&nbsp;·&nbsp;&nbsp;
            <span style={{ color: GREEN }}>●</span> doors &amp; thermostats synced
          </p>
        </div>
        <div style={{ position: 'relative', overflow: 'hidden', background: HERO_GRADIENT, color: '#fff', borderRadius: 18, padding: '16px 22px', textAlign: 'right', minWidth: 264, boxShadow: '0 14px 32px rgba(24,39,64,.28)' }}>
          {/* ghosted rotated-square brand texture */}
          <div style={{ position: 'absolute', left: -26, top: -30, width: 110, height: 110, border: '2px solid rgba(255,255,255,0.08)', borderRadius: 18, transform: 'rotate(20deg)' }} />
          <div style={{ position: 'absolute', left: -4, top: -8, width: 66, height: 66, border: '2px solid rgba(255,255,255,0.10)', borderRadius: 12, transform: 'rotate(20deg)' }} />
          <p style={{ fontSize: 11, margin: '0 0 2px', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700, opacity: 0.78 }}>Today so far</p>
          <p style={{ fontSize: 32, fontWeight: 800, color: '#fff', margin: 0, letterSpacing: '-0.03em', fontVariantNumeric: 'tabular-nums' }}>{formatCents(kpis.revenueTodayCents)}</p>
          <p style={{ fontSize: 12, opacity: 0.88, margin: '3px 0 0' }}>{kpis.checkInsToday} check-ins&nbsp;·&nbsp;{kpis.holdsOpen} holds awaiting payment</p>
        </div>
      </div>

      {/* KPI strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 30 }}>
        <Kpi label="People inside" value={String(kpis.playersInside)} sub={`${kpis.checkInsToday} check-ins today`} />
        <Kpi label="Bookings today" value={String(kpis.bookingsToday)} sub={`${kpis.holdsOpen} unpaid holds`} />
        <Kpi label="Revenue today" value={formatCents(kpis.revenueTodayCents)} accent={GREEN} sub="payments posted" />
        <Kpi label="Fitness memberships" value={String(kpis.activeMemberships)} sub="family + individual" />
        <Kpi label="Past due" value={formatCents(kpis.pastDueCents)} accent={RED} sub={`${kpis.pastDueAccounts} accounts flagged`} />
      </div>

      {/* Front desk queue */}
      <div style={{ marginBottom: 32 }}>
        <SectionLabel meta={`${frontDeskQueue.length} items`}>Needs a person</SectionLabel>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 14 }}>
          {frontDeskQueue.map((q, i) => {
            const u = URGENCY[q.urgency]
            return (
              <Link key={i} href={q.href} style={{ textDecoration: 'none' }}>
                <div className="sq-card" style={{ ...card, padding: '16px 18px', height: '100%' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 4 }}>
                    <p style={{ fontSize: 14, fontWeight: 600, color: INK, margin: 0, lineHeight: 1.3 }}>{q.title}</p>
                    <span style={{ fontSize: 10.5, fontWeight: 700, color: u.color, background: u.bg, padding: '2px 9px', borderRadius: 999, flexShrink: 0 }}>{u.label}</span>
                  </div>
                  <p style={{ fontSize: 12.5, color: SUB, margin: '0 0 10px', lineHeight: 1.5 }}>{q.detail}</p>
                  <span style={{ fontSize: 12.5, fontWeight: 600, color: BLUE }}>{q.action} →</span>
                </div>
              </Link>
            )
          })}
        </div>
      </div>

      {/* The Board */}
      <div style={{ marginBottom: 32 }}>
        <SectionLabel meta="6 AM – 11 PM · striped blocks are unpaid holds">The Board</SectionLabel>
        <div className="sq-card" style={{ ...card, padding: '4px 14px 14px' }}>
          <Board />
        </div>
      </div>

      {/* Door log + holds/revenue */}
      <div className="sq-grid-2" style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 1.5fr) minmax(260px, 1fr)', gap: 16, marginBottom: 34 }}>
        <div className="sq-card" style={card}>
          <div style={{ padding: '14px 18px', borderBottom: `1px solid ${LINE}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 13.5, fontWeight: 600, color: INK }}>At the doors</span>
            <span style={{ fontSize: 11.5, color: FAINT }}>live door log</span>
          </div>
          <div>
            {doorLog.map((d, i) => {
              const o = OUTCOME[d.outcome]
              return (
                <div key={i} className="sq-row" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 18px', borderBottom: i < doorLog.length - 1 ? `1px solid ${LINE}` : 'none' }}>
                  <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 11.5, color: FAINT, minWidth: 58, fontVariantNumeric: 'tabular-nums' }}>{d.time}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 600, color: INK, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.who}</p>
                    <p style={{ fontSize: 11.5, color: SUB, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {d.context} · {d.point} · {d.method}{d.reason ? ` — ${d.reason}` : ''}
                    </p>
                  </div>
                  <span style={{ fontSize: 10.5, fontWeight: 700, color: o.color, background: o.bg, padding: '2px 9px', borderRadius: 999, flexShrink: 0 }}>{o.label}</span>
                </div>
              )
            })}
            <div style={{ padding: '11px 18px' }}>
              <Link href="/admin/doors" style={{ fontSize: 12.5, color: BLUE, fontWeight: 600, textDecoration: 'none' }}>Open the full door log →</Link>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="sq-card" style={card}>
            <div style={{ padding: '14px 18px', borderBottom: `1px solid ${LINE}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 13.5, fontWeight: 600, color: INK }}>Holds expiring</span>
              <span style={{ fontSize: 11.5, fontWeight: 600, color: GOLD }}>{holds.length} open</span>
            </div>
            <div>
              {holds.map((h, i) => {
                const zone = zoneById[h.zoneId]
                return (
                  <Link key={h.id} href="/admin/bookings" style={{ textDecoration: 'none' }}>
                    <div className="sq-row" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 18px', borderBottom: i < holds.length - 1 ? `1px solid ${LINE}` : 'none' }}>
                      <span style={{ width: 9, height: 9, borderRadius: 2, background: zone.color, flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 13, fontWeight: 600, color: INK, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.who}</p>
                        <p style={{ fontSize: 11.5, color: SUB, margin: 0 }}>
                          {zone.name} · {formatHour(h.start)}–{formatHour(h.end)} · missing {h.missing}
                        </p>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <p style={{ fontSize: 12, fontWeight: 700, color: RED, margin: 0, fontVariantNumeric: 'tabular-nums' }}>→ {h.holdExpires}</p>
                        <p style={{ fontSize: 10.5, color: FAINT, margin: 0, fontVariantNumeric: 'tabular-nums' }}>{formatCents(h.priceCents)}</p>
                      </div>
                    </div>
                  </Link>
                )
              })}
            </div>
          </div>

          <div className="sq-card" style={{ ...card, padding: '14px 18px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <span style={{ fontSize: 13.5, fontWeight: 600, color: INK }}>This week</span>
              <Link href="/admin/reports" style={{ fontSize: 12.5, color: BLUE, fontWeight: 600, textDecoration: 'none' }}>Reports →</Link>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, height: 96, marginBottom: 10 }}>
              {weekRevenue.map((w, i) => {
                const h = Math.max((w.cents / maxRev) * 78, 4)
                return (
                  <div key={i} style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }} title={`${w.label}: ${formatCents(w.cents)}${w.projected ? ' (projected)' : ''}`}>
                    <span style={{ fontSize: 9.5, fontWeight: 600, color: w.projected ? FAINT : GREEN, fontVariantNumeric: 'tabular-nums' }}>
                      ${(w.cents / 100000).toFixed(1)}k
                    </span>
                    <div style={{ width: '100%', height: h, borderRadius: '4px 4px 0 0', background: w.projected ? 'transparent' : `linear-gradient(180deg, #5b93d6, ${BLUE})`, position: 'relative', minHeight: 4, outline: w.today ? `2px solid ${NAVY}` : 'none', outlineOffset: 1 }}>
                      {w.projected && <div style={{ position: 'absolute', inset: 0, border: `1.5px dashed #5b93d6`, borderRadius: '4px 4px 0 0' }} />}
                    </div>
                    <span style={{ fontSize: 10, color: w.today ? INK : FAINT, fontWeight: w.today ? 700 : 400 }}>{w.label}</span>
                  </div>
                )
              })}
            </div>
            <p style={{ fontSize: 11, color: FAINT, margin: 0, paddingTop: 9, borderTop: `1px solid ${LINE}` }}>dashed = projected · outlined = today</p>
          </div>
        </div>
      </div>

    </div>
  )
}
