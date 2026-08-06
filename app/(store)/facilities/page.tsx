import Link from 'next/link'
import { card, INK, SUB, FAINT, BLUE } from '@/lib/theme'
import { formatCents } from '@/lib/format'
import { FACILITIES } from '@/lib/store-data'

export const metadata = { title: 'Rent a room — SquareOne Interactive' }

export default function FacilitiesPage() {
  return (
    <div className="sq-page" style={{ padding: '34px 20px 10px', maxWidth: 1180, margin: '0 auto' }}>
      <h1 style={{ fontSize: 28, fontWeight: 800, color: INK, margin: '0 0 6px', letterSpacing: '-0.03em' }}>Rent a room or facility</h1>
      <p style={{ fontSize: 14, color: SUB, margin: '0 0 28px', maxWidth: 560 }}>
        Pick a space, choose a time, and request your booking online. A hold keeps your
        slot while you pay the deposit — members get member pricing automatically.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
        {FACILITIES.map((f) => (
          <Link key={f.zone.id} href={`/facilities/${f.zone.id}`} style={{ textDecoration: 'none' }}>
            <div className="sq-card" style={{ ...card, overflow: 'hidden', height: '100%', display: 'flex', flexDirection: 'column' }}>
              <div style={{ height: 92, background: `linear-gradient(135deg, ${f.zone.color}2e, ${f.zone.color}0d)`, position: 'relative' }}>
                <div style={{ position: 'absolute', right: 16, top: 12, width: 44, height: 44, border: `2px solid ${f.zone.color}55`, borderRadius: 11, transform: 'rotate(18deg)' }} />
                <div style={{ position: 'absolute', right: 44, top: 40, width: 22, height: 22, border: `2px solid ${f.zone.color}40`, borderRadius: 6, transform: 'rotate(18deg)' }} />
                <span style={{ position: 'absolute', left: 16, bottom: 10, fontSize: 10.5, fontWeight: 700, color: f.zone.color, background: '#fff', padding: '2px 9px', borderRadius: 999 }}>{f.capacity}</span>
              </div>
              <div style={{ padding: '14px 18px 16px', flex: 1, display: 'flex', flexDirection: 'column' }}>
                <p style={{ fontSize: 15, fontWeight: 700, color: INK, margin: '0 0 4px' }}>{f.zone.name}</p>
                <p style={{ fontSize: 12.5, color: SUB, margin: '0 0 12px', lineHeight: 1.55, flex: 1 }}>{f.blurb}</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                  {f.pricing.map((p) => (
                    <span key={p.label} style={{ fontSize: 11, fontWeight: 600, color: SUB, background: '#eef4fb', padding: '3px 9px', borderRadius: 999, fontVariantNumeric: 'tabular-nums' }}>
                      {p.label} · {formatCents(p.cents)}
                    </span>
                  ))}
                </div>
                <span style={{ fontSize: 12.5, fontWeight: 700, color: BLUE }}>Check availability →</span>
              </div>
            </div>
          </Link>
        ))}
      </div>

      <p style={{ fontSize: 11.5, color: FAINT, margin: '26px 0 0' }}>Placeholder pricing — final rates confirmed at checkout once the live system flows.</p>
    </div>
  )
}
