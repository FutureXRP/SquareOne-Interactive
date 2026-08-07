'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { card, INK, SUB, FAINT, BLUE } from '@/lib/theme'
import { getProfile, signOut, SESSION_EVENT, type Profile } from '@/lib/session'
import { getPlans } from '@/lib/plans-store'
import { isSupabaseConfigured } from '@/lib/supabase'
import { NOT_CONFIGURED_MSG } from '@/lib/use-live'

const tabs = [
  { href: '/account', label: 'Overview' },
  { href: '/account/card', label: 'Member card' },
  { href: '/account/bookings', label: 'My bookings' },
  { href: '/account/billing', label: 'Billing' },
  { href: '/account/settings', label: 'Settings' },
]

export function AccountShell({ children }: { children: (profile: Profile) => React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined)

  useEffect(() => {
    let on = true
    const sync = async () => {
      if (!isSupabaseConfigured()) { if (on) setProfile(null); return }
      try {
        // Warm the plans cache so pages can resolve plan names synchronously.
        const [p] = await Promise.all([getProfile(), getPlans().catch(() => [])])
        if (on) setProfile(p)
      } catch {
        if (on) setProfile(null)
      }
    }
    sync()
    window.addEventListener(SESSION_EVENT, sync)
    return () => { on = false; window.removeEventListener(SESSION_EVENT, sync) }
  }, [])

  if (profile === undefined) return <div style={{ minHeight: '50vh' }} />

  if (profile === null) {
    return (
      <div className="sq-page" style={{ padding: '48px 20px 10px', maxWidth: 440, margin: '0 auto', textAlign: 'center' }}>
        <div className="sq-card" style={{ ...card, padding: '30px 32px' }}>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: INK, margin: '0 0 8px' }}>Sign in to see your account</h1>
          <p style={{ fontSize: 13.5, color: SUB, margin: '0 0 18px' }}>
            {isSupabaseConfigured() ? 'Your membership, member card, bookings, and billing live here.' : NOT_CONFIGURED_MSG}
          </p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link href="/login" className="sq-btn sq-btn-primary">Sign in</Link>
            <Link href="/signup" className="sq-btn sq-btn-ghost">Create a profile</Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="sq-page" style={{ padding: '30px 20px 10px', maxWidth: 980, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', marginBottom: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#eef4fb', color: BLUE, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 800, textTransform: 'uppercase' }}>{profile.name.charAt(0)}</div>
          <div>
            <h1 style={{ fontSize: 19, fontWeight: 800, color: INK, margin: 0, letterSpacing: '-0.02em' }}>{profile.name}</h1>
            <p style={{ fontSize: 12, color: FAINT, margin: 0, fontVariantNumeric: 'tabular-nums' }}>{profile.memberId} · member since {profile.since}</p>
          </div>
        </div>
        <button className="sq-btn sq-btn-ghost" style={{ padding: '7px 14px' }} onClick={async () => { await signOut(); router.push('/') }}>Sign out</button>
      </div>

      <div style={{ display: 'flex', gap: 4, overflowX: 'auto', borderBottom: '1px solid #dbe4f0', marginBottom: 24 }}>
        {tabs.map((t) => {
          const active = pathname === t.href
          return (
            <Link key={t.href} href={t.href} style={{
              fontSize: 13, fontWeight: active ? 700 : 500, color: active ? BLUE : SUB,
              textDecoration: 'none', padding: '9px 14px', whiteSpace: 'nowrap',
              borderBottom: `2px solid ${active ? BLUE : 'transparent'}`, marginBottom: -1,
            }}>{t.label}</Link>
          )
        })}
      </div>

      {children(profile)}
    </div>
  )
}
