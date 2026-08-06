import Link from 'next/link'
import { notFound } from 'next/navigation'
import { BookingFlow } from '@/components/store/BookingFlow'
import { INK, SUB, FAINT, BLUE } from '@/lib/theme'
import { formatCents } from '@/lib/format'
import { FACILITIES, facilityById } from '@/lib/store-data'

export function generateStaticParams() {
  return FACILITIES.map((f) => ({ id: f.zone.id }))
}

export default async function FacilityPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const f = facilityById[id]
  if (!f) notFound()

  return (
    <div className="sq-page" style={{ padding: '30px 20px 10px', maxWidth: 1180, margin: '0 auto' }}>
      <Link href="/facilities" style={{ fontSize: 12.5, color: BLUE, fontWeight: 600, textDecoration: 'none' }}>← All rooms</Link>

      <div style={{ margin: '14px 0 24px', borderRadius: 18, overflow: 'hidden', background: `linear-gradient(135deg, ${f.zone.color}30, ${f.zone.color}0d)`, padding: '26px 28px', position: 'relative' }}>
        <div style={{ position: 'absolute', right: 24, top: -18, width: 110, height: 110, border: `2px solid ${f.zone.color}45`, borderRadius: 20, transform: 'rotate(18deg)' }} />
        <h1 style={{ fontSize: 27, fontWeight: 800, color: INK, margin: '0 0 6px', letterSpacing: '-0.03em' }}>{f.zone.name}</h1>
        <p style={{ fontSize: 13.5, color: SUB, margin: '0 0 10px', maxWidth: 520, lineHeight: 1.6 }}>{f.blurb}</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: f.zone.color, background: '#fff', padding: '3px 10px', borderRadius: 999 }}>{f.capacity}</span>
          {f.pricing.map((p) => (
            <span key={p.label} style={{ fontSize: 11, fontWeight: 600, color: SUB, background: '#fff', padding: '3px 10px', borderRadius: 999, fontVariantNumeric: 'tabular-nums' }}>
              {p.label} · {formatCents(p.cents)}
            </span>
          ))}
        </div>
      </div>

      <BookingFlow facilityId={id} />

      <p style={{ fontSize: 11.5, color: FAINT, margin: '28px 0 0' }}>
        Placeholder availability — live availability and payment arrive with the booking engine.
      </p>
    </div>
  )
}
