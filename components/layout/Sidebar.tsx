'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { isSupabaseConfigured } from '@/lib/supabase'
import { Logo } from '@/components/Logo'
import { newBookingsSince, bookingsSeenAt, BOOKINGS_EVENT, SEEN_EVENT } from '@/lib/staff-bookings-store'

const nav = [
  { href: '/admin', label: 'Today',
    icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="1" y="1" width="6" height="6" rx="1.5" fill="currentColor" opacity=".7"/><rect x="9" y="1" width="6" height="6" rx="1.5" fill="currentColor" opacity=".4"/><rect x="1" y="9" width="6" height="6" rx="1.5" fill="currentColor" opacity=".4"/><rect x="9" y="9" width="6" height="6" rx="1.5" fill="currentColor" opacity=".7"/></svg> },
  { href: '/admin/board', label: 'The Board',
    icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M1.5 3.5h13M1.5 8h13M1.5 12.5h13" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity=".35"/><rect x="2" y="2.2" width="6" height="2.6" rx="1.3" fill="currentColor" opacity=".75"/><rect x="6" y="6.7" width="7" height="2.6" rx="1.3" fill="currentColor" opacity=".55"/><rect x="3.5" y="11.2" width="5" height="2.6" rx="1.3" fill="currentColor" opacity=".75"/></svg> },
  { href: '/admin/calendar', label: 'Calendar',
    icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="1.5" y="2.5" width="13" height="12" rx="2" stroke="currentColor" strokeWidth="1.5"/><path d="M5 1v3M11 1v3M1.5 6.5h13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><circle cx="5.2" cy="9.5" r="1" fill="currentColor"/><circle cx="8" cy="9.5" r="1" fill="currentColor"/><circle cx="10.8" cy="9.5" r="1" fill="currentColor"/><circle cx="5.2" cy="12" r="1" fill="currentColor"/><circle cx="8" cy="12" r="1" fill="currentColor"/></svg> },
  { href: '/admin/rooms', label: 'Rooms & Pricing',
    icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="1.5" y="1.5" width="5.5" height="5.5" rx="1.3" stroke="currentColor" strokeWidth="1.4"/><rect x="9" y="1.5" width="5.5" height="5.5" rx="1.3" stroke="currentColor" strokeWidth="1.4"/><rect x="1.5" y="9" width="5.5" height="5.5" rx="1.3" stroke="currentColor" strokeWidth="1.4"/><path d="M11.75 9v5.5M9 11.75h5.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg> },
  { href: '/admin/addons', label: 'Add Ons',
    icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="1.5" y="6.5" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.4"/><path d="M11.5 9.5V3.5a2 2 0 00-2-2h-6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/><path d="M12 12h3M13.5 10.5v3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg> },
  { href: '/admin/packages', label: 'Event Packages',
    icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M2 5.5l6-3 6 3v5l-6 3-6-3v-5z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/><path d="M2 5.5l6 3 6-3M8 8.5v6" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/></svg> },
  { href: '/admin/content', label: 'Site Content',
    icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M2 12.5l8.2-8.2a1.6 1.6 0 012.3 0l-.8-.8a1.6 1.6 0 010 2.3L3.5 14 1 15l1-2.5z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/><path d="M9.5 5.5l1.5 1.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg> },
  { href: '/admin/shop', label: 'Shop',
    icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M5.5 1.5h5l3 3-2 2-1-1v9h-7v-9l-1 1-2-2 3-3z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/></svg> },
  { href: '/admin/bookings', label: 'Bookings',
    icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="1.5" y="2.5" width="13" height="12" rx="2" stroke="currentColor" strokeWidth="1.5"/><path d="M5 1v3M11 1v3M1.5 6.5h13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg> },
  { href: '/admin/clients', label: 'Clients',
    icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="5.5" cy="5" r="2.5" stroke="currentColor" strokeWidth="1.4"/><path d="M1.5 13.5c0-2.3 1.8-3.8 4-3.8s4 1.5 4 3.8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/><circle cx="11.5" cy="5.5" r="2" stroke="currentColor" strokeWidth="1.3"/><path d="M11.8 9.8c1.7.3 2.9 1.6 2.9 3.2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg> },
  { href: '/admin/memberships', label: 'Fitness Memberships',
    icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="1.5" y="3.5" width="13" height="9" rx="1.8" stroke="currentColor" strokeWidth="1.5"/><circle cx="5" cy="7.2" r="1.4" stroke="currentColor" strokeWidth="1.2"/><path d="M8.5 6.4h4.2M8.5 8.8h4.2M3.4 10.4h3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg> },
  { href: '/admin/programs', label: 'Programs',
    icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.5"/><path d="M6.5 5.5l4 2.5-4 2.5v-5z" fill="currentColor"/></svg> },
  { href: '/admin/coupons', label: 'Coupons',
    icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M2 5.5A1.5 1.5 0 013.5 4h9A1.5 1.5 0 0114 5.5v1a1.5 1.5 0 000 3v1a1.5 1.5 0 01-1.5 1.5h-9A1.5 1.5 0 012 10.5v-1a1.5 1.5 0 000-3v-1z" stroke="currentColor" strokeWidth="1.4"/><path d="M6.5 6.5l3 3M6.6 6.6h.01M9.4 9.4h.01" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg> },
  { href: '/admin/payments', label: 'Payments',
    icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="1.5" y="3" width="13" height="10" rx="2" stroke="currentColor" strokeWidth="1.5"/><path d="M1.5 6.5h13" stroke="currentColor" strokeWidth="1.5"/><circle cx="11.5" cy="9.5" r="1" fill="currentColor"/></svg> },
  { href: '/admin/doors', label: 'Check-ins & Doors',
    icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="3" y="1.5" width="10" height="13" rx="1.5" stroke="currentColor" strokeWidth="1.5"/><circle cx="10" cy="8" r="1" fill="currentColor"/><path d="M3 14.5h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg> },
  { href: '/admin/queue', label: 'Front Desk',
    icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="2" y="2.5" width="12" height="11" rx="2" stroke="currentColor" strokeWidth="1.4"/><path d="M5 6.2l1.3 1.3L9 4.8M5 10.4l1.3 1.3L9 9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg> },
  { href: '/admin/timesheets', label: 'Time Clock',
    icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8.5" r="5.5" stroke="currentColor" strokeWidth="1.5"/><path d="M8 5.5v3l2 1.5M6 1.5h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg> },
  { href: '/admin/forms', label: 'Forms & Waivers',
    icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="2.5" y="1.5" width="11" height="13" rx="1.5" stroke="currentColor" strokeWidth="1.4"/><path d="M5 5.5h6M5 8h6M5 10.5h3.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/><path d="M9.5 11l1.2 1.2L13 9.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg> },
  { href: '/admin/reports', label: 'Reports',
    icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M2 12l3.5-4 3 3 3-6L15 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg> },
  { href: '/admin/messages', label: 'Messages',
    icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M14.5 1.5L7 9M14.5 1.5L10 14.5 7 9 1.5 6 14.5 1.5z" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg> },
  { href: '/admin/email', label: 'Email health',
    icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="1.5" y="3" width="13" height="10" rx="2" stroke="currentColor" strokeWidth="1.5"/><path d="M2 4.5l6 4.5 6-4.5" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/></svg> },
  { href: '/admin/settings', label: 'Settings',
    icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="2.5" stroke="currentColor" strokeWidth="1.5"/><path d="M8 1v1.5M8 13.5V15M15 8h-1.5M2.5 8H1M12.7 3.3l-1.1 1.1M4.4 11.6l-1.1 1.1M12.7 12.7l-1.1-1.1M4.4 4.4L3.3 3.3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg> },
]



export function Sidebar({ staffName, onSignOut }: { staffName?: string; onSignOut?: () => void }) {
  const pathname = usePathname()
  const [newBookings, setNewBookings] = useState(0)

  // New-booking notifications: poll for bookings created since this device
  // last opened the Bookings tab, so store requests surface without a refresh.
  useEffect(() => {
    if (!isSupabaseConfigured()) return
    let on = true
    const check = () => {
      newBookingsSince(bookingsSeenAt()).then((list) => { if (on) setNewBookings(list.length) }).catch(() => {})
    }
    check()
    const timer = window.setInterval(check, 60_000)
    window.addEventListener(BOOKINGS_EVENT, check)
    window.addEventListener(SEEN_EVENT, check)
    return () => { on = false; window.clearInterval(timer); window.removeEventListener(BOOKINGS_EVENT, check); window.removeEventListener(SEEN_EVENT, check) }
  }, [])

  return (
    <aside className="sq-sidebar" style={{ width: 220, flexShrink: 0, background: '#fff', borderRight: '1px solid #dbe4f0', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <div className="sq-sidebar-head" style={{ padding: '20px 20px 16px', borderBottom: '1px solid #eaf0f8' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
          <Logo size={28} />
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
              {item.href === '/admin/bookings' && newBookings > 0 && (
                <span style={{ fontSize: 10, fontWeight: 800, color: '#fff', background: '#cf4436', borderRadius: 999, minWidth: 17, height: 17, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 5px' }}>
                  {newBookings > 9 ? '9+' : newBookings}
                </span>
              )}
            </Link>
          )
        })}
      </nav>
      <div className="sq-sidebar-foot" style={{ padding: '14px 16px', borderTop: '1px solid #eaf0f8' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 10 }}>
          <div style={{ width: 30, height: 30, borderRadius: '50%', background: '#eef4fb', color: '#2f6db8', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 12, fontWeight: 800, textTransform: 'uppercase' }}>
            {staffName ? staffName.charAt(0) : <span style={{ width: 7, height: 7, borderRadius: 999, background: isSupabaseConfigured() ? '#2e8b57' : '#e8a13a', display: 'block' }} />}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 12.5, fontWeight: 600, color: '#33415e', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{staffName ?? (isSupabaseConfigured() ? 'Live' : 'Not connected')}</p>
            <p style={{ fontSize: 11, color: '#94a6bd', margin: 0 }}>{staffName ? 'signed in · staff' : isSupabaseConfigured() ? 'Supabase connected' : 'env vars missing'}</p>
          </div>
        </div>
        {onSignOut && (
          <button onClick={onSignOut} style={{ font: 'inherit', cursor: 'pointer', width: '100%', fontSize: 12, fontWeight: 600, color: '#64748c', background: '#f3f6fb', border: '1px solid #dbe4f0', borderRadius: 8, padding: '7px 0', marginBottom: 10 }}>
            Sign out
          </button>
        )}
        <Link href="/" style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#2f6db8', textDecoration: 'none', marginBottom: 8 }}>View public store →</Link>
        <p style={{ fontSize: 10.5, color: '#94a6bd', margin: 0, lineHeight: 1.5 }}>part of SquareOne Compassion</p>
      </div>
    </aside>
  )
}
