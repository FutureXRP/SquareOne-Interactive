'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const nav = [
  { href: '/admin', label: 'Today', badge: null,
    icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="1" y="1" width="6" height="6" rx="1.5" fill="currentColor" opacity=".7"/><rect x="9" y="1" width="6" height="6" rx="1.5" fill="currentColor" opacity=".4"/><rect x="1" y="9" width="6" height="6" rx="1.5" fill="currentColor" opacity=".4"/><rect x="9" y="9" width="6" height="6" rx="1.5" fill="currentColor" opacity=".7"/></svg> },
  { href: '/admin/board', label: 'The Board', badge: null,
    icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M1.5 3.5h13M1.5 8h13M1.5 12.5h13" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity=".35"/><rect x="2" y="2.2" width="6" height="2.6" rx="1.3" fill="currentColor" opacity=".75"/><rect x="6" y="6.7" width="7" height="2.6" rx="1.3" fill="currentColor" opacity=".55"/><rect x="3.5" y="11.2" width="5" height="2.6" rx="1.3" fill="currentColor" opacity=".75"/></svg> },
  { href: '/admin/bookings', label: 'Bookings', badge: { count: 2, color: '#b07818', bg: '#faf0dc' },
    icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="1.5" y="2.5" width="13" height="12" rx="2" stroke="currentColor" strokeWidth="1.5"/><path d="M5 1v3M11 1v3M1.5 6.5h13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg> },
  { href: '/admin/clients', label: 'Clients', badge: null,
    icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="5.5" cy="5" r="2.5" stroke="currentColor" strokeWidth="1.4"/><path d="M1.5 13.5c0-2.3 1.8-3.8 4-3.8s4 1.5 4 3.8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/><circle cx="11.5" cy="5.5" r="2" stroke="currentColor" strokeWidth="1.3"/><path d="M11.8 9.8c1.7.3 2.9 1.6 2.9 3.2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg> },
  { href: '/admin/memberships', label: 'Memberships', badge: null,
    icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="1.5" y="3.5" width="13" height="9" rx="1.8" stroke="currentColor" strokeWidth="1.5"/><circle cx="5" cy="7.2" r="1.4" stroke="currentColor" strokeWidth="1.2"/><path d="M8.5 6.4h4.2M8.5 8.8h4.2M3.4 10.4h3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg> },
  { href: '/admin/programs', label: 'Programs', badge: { count: 2, color: '#b07818', bg: '#faf0dc' },
    icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.5"/><path d="M6.5 5.5l4 2.5-4 2.5v-5z" fill="currentColor"/></svg> },
  { href: '/admin/payments', label: 'Payments', badge: null,
    icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="1.5" y="3" width="13" height="10" rx="2" stroke="currentColor" strokeWidth="1.5"/><path d="M1.5 6.5h13" stroke="currentColor" strokeWidth="1.5"/><circle cx="11.5" cy="9.5" r="1" fill="currentColor"/></svg> },
  { href: '/admin/doors', label: 'Check-ins & Doors', badge: { count: 1, color: '#cf4436', bg: '#fae7e4' },
    icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="3" y="1.5" width="10" height="13" rx="1.5" stroke="currentColor" strokeWidth="1.5"/><circle cx="10" cy="8" r="1" fill="currentColor"/><path d="M3 14.5h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg> },
  { href: '/admin/queue', label: 'Front Desk', badge: { count: 2, color: '#cf4436', bg: '#fae7e4' },
    icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="2" y="2.5" width="12" height="11" rx="2" stroke="currentColor" strokeWidth="1.4"/><path d="M5 6.2l1.3 1.3L9 4.8M5 10.4l1.3 1.3L9 9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg> },
  { href: '/admin/reports', label: 'Reports', badge: null,
    icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M2 12l3.5-4 3 3 3-6L15 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg> },
  { href: '/admin/messages', label: 'Messages', badge: null,
    icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M14.5 1.5L7 9M14.5 1.5L10 14.5 7 9 1.5 6 14.5 1.5z" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg> },
  { href: '/admin/settings', label: 'Settings', badge: null,
    icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="2.5" stroke="currentColor" strokeWidth="1.5"/><path d="M8 1v1.5M8 13.5V15M15 8h-1.5M2.5 8H1M12.7 3.3l-1.1 1.1M4.4 11.6l-1.1 1.1M12.7 12.7l-1.1-1.1M4.4 4.4L3.3 3.3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg> },
]

// CSS-drawn nested-square mark — the square as design system (build.md).
function SquareMark() {
  return (
    <div style={{ width: 28, height: 28, borderRadius: 8, background: 'linear-gradient(135deg, #2f6db8 0%, #182740 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <div style={{ width: 14, height: 14, border: '2px solid #fff', borderRadius: 3, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 4, height: 4, background: '#fff', borderRadius: 1 }} />
      </div>
    </div>
  )
}

export function Sidebar() {
  const pathname = usePathname()
  return (
    <aside className="sq-sidebar" style={{ width: 220, flexShrink: 0, background: '#fff', borderRight: '1px solid #dbe4f0', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <div className="sq-sidebar-head" style={{ padding: '20px 20px 16px', borderBottom: '1px solid #eaf0f8' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
          <SquareMark />
          <span style={{ fontSize: 14, fontWeight: 700, color: '#1f2c42', letterSpacing: '-0.01em' }}>SquareOne</span>
        </div>
        <p style={{ fontSize: 11, color: '#94a6bd', marginLeft: 36, marginTop: 0, marginBottom: 0 }}>Interactive · Facility platform</p>
      </div>
      <nav className="sq-nav" style={{ flex: 1, padding: 10 }}>
        {nav.map((item) => {
          const active = pathname === item.href
          return (
            <Link key={item.href} href={item.href} style={{
              display: 'flex', alignItems: 'center', gap: 9,
              padding: '7px 10px', borderRadius: 8,
              fontSize: 13.5, fontWeight: active ? 500 : 400,
              color: active ? '#2f6db8' : '#64748c',
              background: active ? '#eef4fb' : 'transparent',
              textDecoration: 'none', marginBottom: 1, transition: 'all 0.1s',
            }}>
              <span style={{ color: active ? '#2f6db8' : '#94a6bd', display: 'flex', flexShrink: 0 }}>{item.icon}</span>
              <span style={{ flex: 1 }}>{item.label}</span>
              {item.badge && (
                <span style={{ fontSize: 11, fontWeight: 600, background: item.badge.bg, color: item.badge.color, padding: '1px 7px', borderRadius: 99 }}>
                  {item.badge.count}
                </span>
              )}
            </Link>
          )
        })}
      </nav>
      <div className="sq-sidebar-foot" style={{ padding: '14px 16px', borderTop: '1px solid #eaf0f8' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 10 }}>
          <div style={{ width: 30, height: 30, borderRadius: '50%', background: '#eef4fb', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <span style={{ width: 7, height: 7, borderRadius: 999, background: '#2e8b57', display: 'block' }} />
          </div>
          <div>
            <p style={{ fontSize: 12.5, fontWeight: 500, color: '#33415e', margin: 0 }}>Demo mode</p>
            <p style={{ fontSize: 11, color: '#94a6bd', margin: 0 }}>placeholder data</p>
          </div>
        </div>
        <p style={{ fontSize: 10.5, color: '#94a6bd', margin: 0, lineHeight: 1.5 }}>part of SquareOne Compassion</p>
      </div>
    </aside>
  )
}
