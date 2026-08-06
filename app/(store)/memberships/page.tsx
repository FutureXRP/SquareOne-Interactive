import Link from 'next/link'
import { card, INK, SUB, FAINT, LINE, BLUE, GREEN } from '@/lib/theme'
import { formatCents } from '@/lib/format'
import { PLANS } from '@/lib/store-data'

export const metadata = { title: 'Memberships — SquareOne Interactive' }

const faqs = [
  ['How do I get in the door?', 'Your profile includes a member code — scan it at any entrance during open hours. Family plans give every household member their own code.'],
  ['Can I cancel anytime?', 'Yes. Cancel from your account and your membership stays active through the end of the paid period. No cancellation fees.'],
  ['Do members get discounts?', 'Members get member pricing on room rentals, birthday parties, and programs like Speed & Agility.'],
  ['Is there a joining fee?', 'No joining fee. Your first payment is your first month.'],
]

export default function MembershipsPage() {
  return (
    <div className="sq-page" style={{ padding: '34px 20px 10px', maxWidth: 1180, margin: '0 auto' }}>
      <div style={{ textAlign: 'center', maxWidth: 560, margin: '0 auto 32px' }}>
        <h1 style={{ fontSize: 30, fontWeight: 800, color: INK, margin: '0 0 8px', letterSpacing: '-0.03em' }}>Simple memberships, no surprises</h1>
        <p style={{ fontSize: 14, color: SUB, margin: 0, lineHeight: 1.6 }}>
          Month to month, cancel anytime, and every dollar supports SquareOne
          Compassion&apos;s work in Tulsa.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 18, maxWidth: 760, margin: '0 auto 44px' }}>
        {PLANS.map((p) => (
          <div key={p.id} className="sq-card" style={{ ...card, padding: '26px 28px', position: 'relative', border: p.featured ? `2px solid ${BLUE}` : undefined }}>
            {p.featured && <span style={{ position: 'absolute', top: -11, left: 26, fontSize: 10.5, fontWeight: 700, color: '#fff', background: BLUE, padding: '2px 10px', borderRadius: 999 }}>Most popular</span>}
            <p style={{ fontSize: 16, fontWeight: 700, color: INK, margin: '0 0 2px' }}>{p.name}</p>
            <p style={{ fontSize: 12.5, color: SUB, margin: '0 0 14px' }}>{p.tagline}</p>
            <p style={{ fontSize: 34, fontWeight: 800, color: INK, margin: '0 0 18px', letterSpacing: '-0.03em', fontVariantNumeric: 'tabular-nums' }}>
              {formatCents(p.priceCents)}<span style={{ fontSize: 13.5, fontWeight: 500, color: FAINT }}>/{p.period}</span>
            </p>
            <ul style={{ listStyle: 'none', margin: '0 0 20px', padding: 0 }}>
              {p.features.map((feat) => (
                <li key={feat} style={{ display: 'flex', alignItems: 'flex-start', gap: 9, fontSize: 13, color: SUB, padding: '5px 0', lineHeight: 1.5 }}>
                  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0, marginTop: 2 }}><rect x="1.5" y="1.5" width="13" height="13" rx="4" fill={p.featured ? '#eef4fb' : '#e5f2ea'}/><path d="M4.8 8.3l2.2 2.2 4.2-4.8" stroke={p.featured ? BLUE : GREEN} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  {feat}
                </li>
              ))}
            </ul>
            <Link href={`/signup?plan=${p.id}`} className={`sq-btn ${p.featured ? 'sq-btn-primary' : 'sq-btn-ghost'}`} style={{ width: '100%' }}>Choose {p.name}</Link>
          </div>
        ))}
      </div>

      <div style={{ maxWidth: 640, margin: '0 auto' }}>
        <h2 style={{ fontSize: 18, fontWeight: 800, color: INK, margin: '0 0 14px', letterSpacing: '-0.02em' }}>Common questions</h2>
        {faqs.map(([q, a]) => (
          <div key={q} style={{ padding: '14px 0', borderBottom: `1px solid ${LINE}` }}>
            <p style={{ fontSize: 13.5, fontWeight: 700, color: INK, margin: '0 0 4px' }}>{q}</p>
            <p style={{ fontSize: 13, color: SUB, margin: 0, lineHeight: 1.6 }}>{a}</p>
          </div>
        ))}
        <p style={{ fontSize: 11.5, color: FAINT, margin: '18px 0 0' }}>Placeholder plans — billing goes live with Stripe in Phase 2.</p>
      </div>
    </div>
  )
}
