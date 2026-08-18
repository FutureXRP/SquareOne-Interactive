'use client'
import Link from 'next/link'
import { card, HERO_GRADIENT, INK, SUB, FAINT, LINE, BLUE } from '@/lib/theme'
import { FacilityGrid } from '@/components/store/FacilityGrid'
import { PlanCards } from '@/components/store/PlanCards'
import { ProductTeaser } from '@/components/store/ProductTeaser'
import { getSiteContent, navTabOn, CONTENT_EVENT, type SiteContent } from '@/lib/content-store'
import { useLive } from '@/lib/use-live'

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
  const { data: content } = useLive<SiteContent | null>(getSiteContent, [CONTENT_EVENT], null)
  const t = (key: string, fallback: string) => content?.text[key] ?? fallback
  return (
    <div className="sq-page" style={{ padding: '30px 20px 10px', maxWidth: 1180, margin: '0 auto' }}>
      {/* Hero */}
      <div style={{ position: 'relative', overflow: 'hidden', background: HERO_GRADIENT, borderRadius: 22, padding: '54px 44px', color: '#fff', marginBottom: 34, boxShadow: '0 18px 44px rgba(24,39,64,.30)' }}>
        <div style={{ position: 'absolute', right: -70, top: -80, width: 300, height: 300, border: '2px solid rgba(255,255,255,0.08)', borderRadius: 40, transform: 'rotate(18deg)' }} />
        <div style={{ position: 'absolute', right: 20, top: -30, width: 170, height: 170, border: '2px solid rgba(255,255,255,0.12)', borderRadius: 26, transform: 'rotate(18deg)' }} />
        <div style={{ position: 'absolute', right: 90, top: 30, width: 80, height: 80, border: '2px solid rgba(255,255,255,0.16)', borderRadius: 16, transform: 'rotate(18deg)' }} />
        <div style={{ position: 'relative', maxWidth: 560 }}>
          <p style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', opacity: 0.8, margin: '0 0 10px' }}>{t('hero.kicker', 'Fitness · Play · Community — Tulsa, OK')}</p>
          <h1 style={{ fontSize: 38, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.12, margin: '0 0 14px' }}>
            {t('hero.heading', 'One place for your family to move, play, and celebrate.')}
          </h1>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 22 }}>
            <Link href="/memberships" className="sq-btn" style={{ background: '#fff', color: '#182740' }}>{t('hero.cta1', 'Become a member')}</Link>
            <Link href="/facilities" className="sq-btn" style={{ background: 'rgba(255,255,255,0.14)', color: '#fff', border: '1px solid rgba(255,255,255,0.35)' }}>{t('hero.cta2', 'Rent a room')}</Link>
          </div>
        </div>
      </div>

      {/* Quick tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14, marginBottom: 40 }}>
        {[
          { href: '/facilities', title: t('tile1.title', 'Rent a room'), sub: t('tile1.sub', 'Gym, party rooms & more — book online'), icon: <svg width="18" height="18" viewBox="0 0 16 16" fill="none"><rect x="1.5" y="2.5" width="13" height="12" rx="2" stroke="currentColor" strokeWidth="1.5"/><path d="M5 1v3M11 1v3M1.5 6.5h13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg> },
          { href: '/memberships', title: t('tile2.title', 'Join the gym'), sub: t('tile2.sub', 'Monthly plans · cancel anytime'), icon: <svg width="18" height="18" viewBox="0 0 16 16" fill="none"><rect x="1.5" y="3.5" width="13" height="9" rx="1.8" stroke="currentColor" strokeWidth="1.5"/><circle cx="5" cy="7.2" r="1.4" stroke="currentColor" strokeWidth="1.2"/><path d="M8.5 6.4h4.2M8.5 8.8h4.2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg> },
          { href: '/shop', title: t('tile3.title', 'Shop merch'), sub: t('tile3.sub', 'Tees, hoodies & more'), icon: <svg width="18" height="18" viewBox="0 0 16 16" fill="none"><path d="M5.5 1.5h5l3 3-2 2-1-1v9h-7v-9l-1 1-2-2 3-3z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/></svg> },
          { href: '/facilities/party', title: t('tile4.title', 'Book a party'), sub: t('tile4.sub', 'Arcade party packages with a host'), icon: <svg width="18" height="18" viewBox="0 0 16 16" fill="none"><path d="M4.5 6.5L8 2l3.5 4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/><path d="M2.5 6.5h11l-1.2 7a1.5 1.5 0 01-1.5 1.2H5.2a1.5 1.5 0 01-1.5-1.2l-1.2-7z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/><circle cx="8" cy="10.5" r="1.1" fill="currentColor"/></svg> },
        ].map((tile) => (
          <Link key={tile.href} href={tile.href} style={{ textDecoration: 'none' }}>
            <div className="sq-card" style={{ ...card, padding: '18px 20px', height: '100%' }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: '#eef4fb', color: BLUE, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>{tile.icon}</div>
              <p style={{ fontSize: 14.5, fontWeight: 700, color: INK, margin: '0 0 3px' }}>{tile.title}</p>
              <p style={{ fontSize: 12.5, color: SUB, margin: 0 }}>{tile.sub}</p>
            </div>
          </Link>
        ))}
      </div>

      {/* Memberships */}
      <div style={{ marginBottom: 40 }}>
        <SectionLabel meta={<Link href="/memberships" style={{ fontSize: 12.5, color: BLUE, fontWeight: 600, textDecoration: 'none' }}>Compare plans →</Link>}>{t('home.section.plans', 'Fitness memberships')}</SectionLabel>
        <PlanCards showFeatures={false} />
      </div>

      {/* Facilities */}
      <div style={{ marginBottom: 40 }}>
        <SectionLabel meta={<Link href="/facilities" style={{ fontSize: 12.5, color: BLUE, fontWeight: 600, textDecoration: 'none' }}>See all &amp; book →</Link>}>{t('home.section.rooms', 'Rooms & facilities')}</SectionLabel>
        <FacilityGrid limit={4} compact />
      </div>

      {/* Shop teaser — the whole section follows the Shop nav tab's switch */}
      {navTabOn(content, 'shop') && (
        <div style={{ marginBottom: 8 }}>
          <SectionLabel meta={<Link href="/shop" style={{ fontSize: 12.5, color: BLUE, fontWeight: 600, textDecoration: 'none' }}>Shop all →</Link>}>{t('home.section.gear', 'SquareOne gear')}</SectionLabel>
          <ProductTeaser />
        </div>
      )}

      {/* Hours live in the footer, which reads the admin-editable site config */}
      <p style={{ fontSize: 12, color: FAINT, margin: '26px 0 0' }}>
        {t('home.footnote', 'Members enter any time we’re open with their member code — hours are below.')}
      </p>
    </div>
  )
}
