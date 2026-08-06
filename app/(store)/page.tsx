import Link from 'next/link'
import { card, HERO_GRADIENT, INK, SUB, FAINT, LINE, BLUE } from '@/lib/theme'
import { formatCents } from '@/lib/format'
import { PRODUCTS } from '@/lib/store-data'
import { FacilityGrid } from '@/components/store/FacilityGrid'
import { PlanCards } from '@/components/store/PlanCards'

function SectionLabel({ children, meta }: { children: string; meta?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '0 0 16px' }}>
      <span style={{ width: 8, height: 8, background: BLUE, borderRadius: 2, flexShrink: 0 }} />
      <span style={{ fontSize: 12, fontWeight: 700, color: BLUE, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{children}</span>
      <div style={{ height: 1, flex: 1, background: LINE }} />
      {meta}
    </div>
  )
}

export default function StoreHome() {
  return (
    <div className="sq-page" style={{ padding: '30px 20px 10px', maxWidth: 1180, margin: '0 auto' }}>
      {/* Hero */}
      <div style={{ position: 'relative', overflow: 'hidden', background: HERO_GRADIENT, borderRadius: 22, padding: '54px 44px', color: '#fff', marginBottom: 34, boxShadow: '0 18px 44px rgba(24,39,64,.30)' }}>
        <div style={{ position: 'absolute', right: -70, top: -80, width: 300, height: 300, border: '2px solid rgba(255,255,255,0.08)', borderRadius: 40, transform: 'rotate(18deg)' }} />
        <div style={{ position: 'absolute', right: 20, top: -30, width: 170, height: 170, border: '2px solid rgba(255,255,255,0.12)', borderRadius: 26, transform: 'rotate(18deg)' }} />
        <div style={{ position: 'absolute', right: 90, top: 30, width: 80, height: 80, border: '2px solid rgba(255,255,255,0.16)', borderRadius: 16, transform: 'rotate(18deg)' }} />
        <div style={{ position: 'relative', maxWidth: 560 }}>
          <p style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', opacity: 0.8, margin: '0 0 10px' }}>Fitness · Play · Community — Tulsa, OK</p>
          <h1 style={{ fontSize: 38, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.12, margin: '0 0 14px' }}>
            One place for your family to move, play, and celebrate.
          </h1>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 22 }}>
            <Link href="/memberships" className="sq-btn" style={{ background: '#fff', color: '#182740' }}>Become a member</Link>
            <Link href="/facilities" className="sq-btn" style={{ background: 'rgba(255,255,255,0.14)', color: '#fff', border: '1px solid rgba(255,255,255,0.35)' }}>Rent a room</Link>
          </div>
        </div>
      </div>

      {/* Quick tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14, marginBottom: 40 }}>
        {[
          { href: '/facilities', title: 'Rent a room', sub: 'Gym, party rooms & more — book online', icon: <svg width="18" height="18" viewBox="0 0 16 16" fill="none"><rect x="1.5" y="2.5" width="13" height="12" rx="2" stroke="currentColor" strokeWidth="1.5"/><path d="M5 1v3M11 1v3M1.5 6.5h13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg> },
          { href: '/memberships', title: 'Join the gym', sub: `From ${formatCents(2500)}/mo · cancel anytime`, icon: <svg width="18" height="18" viewBox="0 0 16 16" fill="none"><rect x="1.5" y="3.5" width="13" height="9" rx="1.8" stroke="currentColor" strokeWidth="1.5"/><circle cx="5" cy="7.2" r="1.4" stroke="currentColor" strokeWidth="1.2"/><path d="M8.5 6.4h4.2M8.5 8.8h4.2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg> },
          { href: '/shop', title: 'Shop merch', sub: 'Tees, hoodies & more', icon: <svg width="18" height="18" viewBox="0 0 16 16" fill="none"><path d="M5.5 1.5h5l3 3-2 2-1-1v9h-7v-9l-1 1-2-2 3-3z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/></svg> },
          { href: '/facilities/party', title: 'Book a party', sub: 'Arcade party packages with a host', icon: <svg width="18" height="18" viewBox="0 0 16 16" fill="none"><path d="M4.5 6.5L8 2l3.5 4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/><path d="M2.5 6.5h11l-1.2 7a1.5 1.5 0 01-1.5 1.2H5.2a1.5 1.5 0 01-1.5-1.2l-1.2-7z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/><circle cx="8" cy="10.5" r="1.1" fill="currentColor"/></svg> },
        ].map((t) => (
          <Link key={t.href} href={t.href} style={{ textDecoration: 'none' }}>
            <div className="sq-card" style={{ ...card, padding: '18px 20px', height: '100%' }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: '#eef4fb', color: BLUE, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>{t.icon}</div>
              <p style={{ fontSize: 14.5, fontWeight: 700, color: INK, margin: '0 0 3px' }}>{t.title}</p>
              <p style={{ fontSize: 12.5, color: SUB, margin: 0 }}>{t.sub}</p>
            </div>
          </Link>
        ))}
      </div>

      {/* Memberships */}
      <div style={{ marginBottom: 40 }}>
        <SectionLabel meta={<Link href="/memberships" style={{ fontSize: 12.5, color: BLUE, fontWeight: 600, textDecoration: 'none' }}>Compare plans →</Link>}>Fitness memberships</SectionLabel>
        <PlanCards showFeatures={false} />
      </div>

      {/* Facilities */}
      <div style={{ marginBottom: 40 }}>
        <SectionLabel meta={<Link href="/facilities" style={{ fontSize: 12.5, color: BLUE, fontWeight: 600, textDecoration: 'none' }}>See all &amp; book →</Link>}>Rooms &amp; facilities</SectionLabel>
        <FacilityGrid limit={4} compact />
      </div>

      {/* Shop teaser */}
      <div style={{ marginBottom: 8 }}>
        <SectionLabel meta={<Link href="/shop" style={{ fontSize: 12.5, color: BLUE, fontWeight: 600, textDecoration: 'none' }}>Shop all →</Link>}>SquareOne gear</SectionLabel>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 14 }}>
          {PRODUCTS.slice(0, 4).map((p) => (
            <Link key={p.id} href="/shop" style={{ textDecoration: 'none' }}>
              <div className="sq-card" style={{ ...card, overflow: 'hidden' }}>
                <div style={{ height: 96, background: '#eef4fb', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <div style={{ width: 44, height: 44, borderRadius: 12, background: `linear-gradient(135deg, ${p.colors[0]}, ${p.colors[1]})`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ width: 18, height: 18, border: '2px solid rgba(255,255,255,0.85)', borderRadius: 4 }} />
                  </div>
                </div>
                <div style={{ padding: '11px 14px 13px' }}>
                  <p style={{ fontSize: 13, fontWeight: 600, color: INK, margin: '0 0 2px' }}>{p.name}</p>
                  <p style={{ fontSize: 12.5, fontWeight: 700, color: SUB, margin: 0, fontVariantNumeric: 'tabular-nums' }}>{formatCents(p.priceCents)}</p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* Hours live in the footer, which reads the admin-editable site config */}
      <p style={{ fontSize: 12, color: FAINT, margin: '26px 0 0' }}>
        Members enter any time we&apos;re open with their member code — hours are below.
      </p>
    </div>
  )
}
