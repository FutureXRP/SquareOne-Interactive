'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { getCart, getProfile, SESSION_EVENT } from '@/lib/session'
import { isSupabaseConfigured } from '@/lib/supabase'
import { Logo } from '@/components/Logo'
import { getSiteContent, CONTENT_EVENT, NAV_DEFAULT, type SiteContent } from '@/lib/content-store'
import { useLive } from '@/lib/use-live'

export function StoreHeader() {
  const pathname = usePathname()
  const [cartCount, setCartCount] = useState(0)
  const [userName, setUserName] = useState<string | null>(null)
  // Phone nav: the tab row collapses into a hamburger dropdown — no
  // finger-sliding an invisible strip. Closes itself on navigation.
  const [menuOpen, setMenuOpen] = useState(false)
  useEffect(() => { setMenuOpen(false) }, [pathname])
  const { data: content } = useLive<SiteContent | null>(getSiteContent, [CONTENT_EVENT], null)
  const links = (content?.nav ?? NAV_DEFAULT).filter((l) => l.visible)

  useEffect(() => {
    let on = true
    const sync = () => {
      setCartCount(getCart().reduce((n, c) => n + c.qty, 0))
      if (isSupabaseConfigured()) {
        getProfile().then((p) => { if (on) setUserName(p?.name ?? null) }).catch(() => {})
      }
    }
    sync()
    window.addEventListener(SESSION_EVENT, sync)
    return () => { on = false; window.removeEventListener(SESSION_EVENT, sync) }
  }, [])

  return (
    <header style={{ position: 'sticky', top: 0, zIndex: 20, background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(8px)', borderBottom: '1px solid #dbe4f0' }}>
      <div className="sq-store-header" style={{ maxWidth: 1180, margin: '0 auto', padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 14 }}>
        <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 9, textDecoration: 'none', marginRight: 6 }}>
          <Logo size={30} />
          <span>
            <span style={{ display: 'block', fontSize: 14.5, fontWeight: 800, color: '#1f2c42', letterSpacing: '-0.02em', lineHeight: 1.15 }}>{content?.text['brand.name'] ?? 'SquareOne'}</span>
            <span style={{ display: 'block', fontSize: 10, color: '#94a6bd', lineHeight: 1.15 }}>{content?.text['brand.sub'] ?? 'Interactive · Tulsa'}</span>
          </span>
        </Link>

        <nav className="sq-store-nav" style={{ flex: 1 }}>
          {links.map((l) => l.href.startsWith('http')
            ? <a key={l.id} href={l.href} target="_blank" rel="noreferrer">{l.label}</a>
            : <Link key={l.id} href={l.href} className={pathname.startsWith(l.href) ? 'active' : ''}>{l.label}</Link>
          )}
        </nav>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto' }}>
          <Link href="/cart" aria-label="Cart" style={{ position: 'relative', display: 'flex', alignItems: 'center', padding: 8, borderRadius: 8, textDecoration: 'none', color: '#64748c' }}>
            <svg width="18" height="18" viewBox="0 0 16 16" fill="none"><path d="M1.5 2h2l1.8 8.5a1 1 0 001 .8h6.6a1 1 0 001-.8L15 5H4.2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/><circle cx="6.5" cy="13.7" r="1.1" fill="currentColor"/><circle cx="12" cy="13.7" r="1.1" fill="currentColor"/></svg>
            {cartCount > 0 && (
              <span style={{ position: 'absolute', top: 0, right: 0, fontSize: 9.5, fontWeight: 700, background: '#e8a13a', color: '#fff', borderRadius: 99, minWidth: 15, height: 15, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px' }}>{cartCount}</span>
            )}
          </Link>
          {userName ? (
            <Link href="/account" className="sq-btn sq-btn-ghost" style={{ padding: '8px 14px' }}>
              <span style={{ width: 20, height: 20, borderRadius: '50%', background: '#eef4fb', color: '#2f6db8', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase' }}>{userName.charAt(0)}</span>
              My account
            </Link>
          ) : (
            <>
              <Link href="/login" className="sq-btn sq-btn-ghost" style={{ padding: '8px 14px' }}>Sign in</Link>
              <Link href="/signup" className="sq-btn sq-btn-primary" style={{ padding: '8px 14px' }}>Join</Link>
            </>
          )}
          {/* The three-lines menu, phones only — the top-right way into
              every store tab. CSS shows it under 900px. */}
          <button
            className="sq-store-menu-btn"
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
            style={{ font: 'inherit', alignItems: 'center', justifyContent: 'center', background: '#fff', border: '1.5px solid #dbe4f0', borderRadius: 10, padding: 9, cursor: 'pointer' }}
          >
            <span aria-hidden style={{ display: 'flex', flexDirection: 'column', gap: 3.5 }}>
              <span style={{ width: 17, height: 2, background: '#1f2c42', borderRadius: 2, display: 'block' }} />
              <span style={{ width: 17, height: 2, background: '#1f2c42', borderRadius: 2, display: 'block' }} />
              <span style={{ width: 17, height: 2, background: '#1f2c42', borderRadius: 2, display: 'block' }} />
            </span>
          </button>
        </div>
      </div>

      {/* The same tabs as a dropdown under the header bar, phones only */}
      {menuOpen && (
        <div className="sq-store-menu" style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', borderBottom: '1px solid #dbe4f0', boxShadow: '0 14px 30px rgba(24,39,64,0.16)' }}>
          {links.map((l, i) => {
            const active = !l.href.startsWith('http') && pathname.startsWith(l.href)
            const itemStyle = {
              display: 'block', fontSize: 14, fontWeight: active ? 700 : 500,
              color: active ? '#2f6db8' : '#1f2c42', background: active ? '#eef4fb' : '#fff',
              textDecoration: 'none', padding: '14px 20px',
              borderBottom: i < links.length - 1 ? '1px solid #eef2f8' : 'none',
            } as const
            return l.href.startsWith('http')
              ? <a key={l.id} href={l.href} target="_blank" rel="noreferrer" onClick={() => setMenuOpen(false)} style={itemStyle}>{l.label}</a>
              : <Link key={l.id} href={l.href} onClick={() => setMenuOpen(false)} style={itemStyle}>{l.label}</Link>
          })}
        </div>
      )}
    </header>
  )
}
