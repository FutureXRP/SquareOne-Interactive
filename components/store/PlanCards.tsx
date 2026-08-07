'use client'
import Link from 'next/link'
import { card, INK, SUB, FAINT, BLUE, GREEN } from '@/lib/theme'
import { formatCents } from '@/lib/format'
import { getActivePlans, PLANS_EVENT, type EditablePlan } from '@/lib/plans-store'
import { useLive } from '@/lib/use-live'

// Membership plan cards — read live from the admin-editable plans catalog.
export function PlanCards({ showFeatures = true }: { showFeatures?: boolean }) {
  const { data: plans } = useLive<EditablePlan[]>(getActivePlans, [PLANS_EVENT], [])

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(270px, 1fr))', gap: showFeatures ? 18 : 14 }}>
      {plans.map((p) => (
        <div key={p.id} className="sq-card" style={{ ...card, padding: showFeatures ? '26px 28px' : '22px 24px', position: 'relative', display: 'flex', flexDirection: 'column', border: p.featured ? `2px solid ${BLUE}` : undefined }}>
          {p.featured && <span style={{ position: 'absolute', top: -11, left: 24, fontSize: 10.5, fontWeight: 700, color: '#fff', background: BLUE, padding: '2px 10px', borderRadius: 999 }}>Most popular</span>}
          <p style={{ fontSize: showFeatures ? 16 : 15, fontWeight: 700, color: INK, margin: '0 0 2px' }}>{p.name}</p>
          <p style={{ fontSize: 12.5, color: SUB, margin: '0 0 12px' }}>{p.tagline}</p>
          <p style={{ fontSize: showFeatures ? 34 : 30, fontWeight: 800, color: INK, margin: `0 0 ${showFeatures ? 18 : 14}px`, letterSpacing: '-0.03em', fontVariantNumeric: 'tabular-nums' }}>
            {formatCents(p.priceCents)}<span style={{ fontSize: 13, fontWeight: 500, color: FAINT }}>/{p.period}</span>
          </p>
          {showFeatures && (
            <ul style={{ listStyle: 'none', margin: '0 0 20px', padding: 0, flex: 1 }}>
              {p.features.map((feat) => (
                <li key={feat} style={{ display: 'flex', alignItems: 'flex-start', gap: 9, fontSize: 13, color: SUB, padding: '5px 0', lineHeight: 1.5 }}>
                  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0, marginTop: 2 }}><rect x="1.5" y="1.5" width="13" height="13" rx="4" fill={p.featured ? '#eef4fb' : '#e5f2ea'}/><path d="M4.8 8.3l2.2 2.2 4.2-4.8" stroke={p.featured ? BLUE : GREEN} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  {feat}
                </li>
              ))}
            </ul>
          )}
          <Link href={`/signup?plan=${p.id}`} className={`sq-btn ${p.featured ? 'sq-btn-primary' : 'sq-btn-ghost'}`} style={{ width: '100%', marginTop: 'auto' }}>Choose {p.name}</Link>
        </div>
      ))}
    </div>
  )
}
