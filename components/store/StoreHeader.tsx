'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { getCart, getProfile, SESSION_EVENT } from '@/lib/session'
import { isSupabaseConfigured } from '@/lib/supabase'
import { Logo } from '@/components/Logo'

const links = [
  { href: '/facilities', label: 'Rent a room' },
  { href: '/packages', label: 'Event Packages' },
  { href: '/memberships', label: 'Fitness Memberships' },
  { href: '/shop', label: 'Shop' },
]



export function StoreHeader() {
  const pathname = usePathname()
  const [cartCount, setCartCount] = useState(0)
  const [userName, setUserName] = useState<string | null>(null)

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
            <span style={{ display: 'block', fontSize: 14.5, fontWeight: 800, color: '#1f2c42', letterSpacing: '-0.02em', lineHeight: 1.15 }}>SquareOne</span>
            <span style={{ display: 'block', fontSize: 10, color: '#94a6bd', lineHeight: 1.15 }}>Interactive · Tulsa</span>
          </span>
        </Link>

        <nav className="sq-store-nav" style={{ flex: 1 }}>
          {links.map((l) => (
            <Link key={l.href} href={l.href} className={pathname.startsWith(l.href) ? 'active' : ''}>{l.label}</Link>
          ))}
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
        </div>
      </div>
    </header>
  )
}
