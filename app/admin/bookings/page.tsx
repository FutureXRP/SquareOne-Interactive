import Link from 'next/link'
import { PageHero, HeroStat } from '@/components/admin/PageHero'
import { card, INK, SUB, FAINT, LINE, BLUE, GREEN, GOLD, zoneById } from '@/lib/theme'
import { formatCents } from '@/lib/format'
import { adminBookings } from '@/lib/admin-data'

const STATUS: Record<string, { label: string; color: string; bg: string }> = {
  confirmed: { label: 'Confirmed', color: GREEN, bg: '#e5f2ea' },
  hold: { label: 'Hold', color: '#b07818', bg: '#faf0dc' },
  completed: { label: 'Done', color: SUB, bg: '#eef2f8' },
}

export default function AdminBookingsPage() {
  const holds = adminBookings.filter((b) => b.status === 'hold')
  const totalCents = adminBookings.filter((b) => b.status !== 'completed').reduce((n, b) => n + b.priceCents, 0)

  return (
    <div className="sq-page" style={{ padding: '34px 40px 20px', maxWidth: 1180, margin: '0 auto' }}>
      <PageHero title="Bookings" sub="Rentals and holds across every zone — holds release automatically when their deadline passes." chip={`${holds.length} holds open`}>
        <HeroStat label="On the books" value={formatCents(totalCents)} sub="today + upcoming" />
      </PageHero>

      {holds.length > 0 && (
        <div className="sq-card" style={{ ...card, borderLeft: `4px solid ${GOLD}`, padding: '14px 20px', marginBottom: 18 }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: INK, margin: '0 0 2px' }}>Holds needing attention</p>
          <p style={{ fontSize: 12.5, color: SUB, margin: 0 }}>
            {holds.map((h) => `${h.who} (${h.note})`).join(' · ')}
          </p>
        </div>
      )}

      <div className="sq-card" style={{ ...card, overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: `1px solid ${LINE}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13.5, fontWeight: 700, color: INK }}>All bookings</span>
          <Link href="/admin/board" style={{ fontSize: 12.5, color: BLUE, fontWeight: 600, textDecoration: 'none' }}>See them on the Board →</Link>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <div style={{ minWidth: 680 }}>
            {adminBookings.map((b, i) => {
              const zone = zoneById[b.zoneId]
              const s = STATUS[b.status]
              return (
                <div key={b.id} className="sq-row" style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 20px', borderBottom: i < adminBookings.length - 1 ? `1px solid ${LINE}` : 'none' }}>
                  <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 11.5, color: FAINT, minWidth: 62 }}>{b.id}</span>
                  <span style={{ width: 9, height: 9, borderRadius: 2, background: zone.color, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 700, color: INK, margin: 0 }}>{b.title} · {zone.name}</p>
                    <p style={{ fontSize: 12, color: SUB, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {b.who} · {b.date} {b.time}{b.note ? ` — ${b.note}` : ''}
                    </p>
                  </div>
                  <span style={{ fontSize: 10.5, fontWeight: 700, color: s.color, background: s.bg, padding: '2px 10px', borderRadius: 999, flexShrink: 0 }}>{s.label}</span>
                  <span style={{ fontSize: 13.5, fontWeight: 700, color: INK, minWidth: 74, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{formatCents(b.priceCents)}</span>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
