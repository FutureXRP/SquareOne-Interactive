'use client'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { card, INK, SUB, FAINT, LINE, BLUE, GREEN } from '@/lib/theme'
import { formatCents } from '@/lib/format'
import { getActivePackages, PACKAGES_EVENT, type EventPackage } from '@/lib/packages-store'
import { getRooms, roomLabel, ROOMS_EVENT } from '@/lib/facilities-store'
import { isSignedIn, SESSION_EVENT } from '@/lib/session'
import { isSupabaseConfigured } from '@/lib/supabase'

export default function PackagesPage() {
  const [packages, setPackages] = useState<EventPackage[]>([])
  const [requested, setRequested] = useState<string | null>(null)
  const [signedIn, setSignedIn] = useState(false)

  useEffect(() => {
    if (!isSupabaseConfigured()) return
    let on = true
    const sync = () => {
      Promise.all([getActivePackages(), getRooms(), isSignedIn()]).then(([pkgs, , signed]) => {
        if (on) { setPackages(pkgs); setSignedIn(signed) }
      }).catch(() => {})
    }
    sync()
    window.addEventListener(PACKAGES_EVENT, sync)
    window.addEventListener(ROOMS_EVENT, sync)
    window.addEventListener(SESSION_EVENT, sync)
    return () => {
      on = false
      window.removeEventListener(PACKAGES_EVENT, sync)
      window.removeEventListener(ROOMS_EVENT, sync)
      window.removeEventListener(SESSION_EVENT, sync)
    }
  }, [])

  return (
    <div className="sq-page" style={{ padding: '34px 20px 10px', maxWidth: 1180, margin: '0 auto' }}>
      <h1 style={{ fontSize: 28, fontWeight: 800, color: INK, margin: '0 0 6px', letterSpacing: '-0.03em' }}>Event packages</h1>
      <p style={{ fontSize: 14, color: SUB, margin: '0 0 28px', maxWidth: 560 }}>
        Bundles that combine our best spaces into one price — birthdays, team parties,
        and family nights with staff and setup included.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))', gap: 16 }}>
        {packages.map((p) => (
          <div key={p.id} className="sq-card" style={{ ...card, padding: '22px 24px', position: 'relative', display: 'flex', flexDirection: 'column', border: p.featured ? `2px solid ${BLUE}` : undefined }}>
            {p.featured && <span style={{ position: 'absolute', top: -11, left: 22, fontSize: 10.5, fontWeight: 700, color: '#fff', background: BLUE, padding: '2px 10px', borderRadius: 999 }}>Most popular</span>}
            <p style={{ fontSize: 16, fontWeight: 800, color: INK, margin: '0 0 4px' }}>{p.name}</p>
            <p style={{ fontSize: 12.5, color: SUB, margin: '0 0 10px', lineHeight: 1.55 }}>{p.blurb}</p>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
              {p.roomIds.map((id) => {
                const r = roomLabel(id)
                return (
                  <span key={id} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 600, color: SUB, background: '#eef4fb', padding: '3px 10px', borderRadius: 999 }}>
                    <span style={{ width: 8, height: 8, borderRadius: 2, background: r.color }} />
                    {r.name}
                  </span>
                )
              })}
              <span style={{ fontSize: 11, fontWeight: 600, color: SUB, background: '#eef4fb', padding: '3px 10px', borderRadius: 999, fontVariantNumeric: 'tabular-nums' }}>{p.hours} hours</span>
              <span style={{ fontSize: 11, fontWeight: 600, color: SUB, background: '#eef4fb', padding: '3px 10px', borderRadius: 999 }}>{p.capacity}</span>
            </div>

            <ul style={{ listStyle: 'none', margin: '0 0 16px', padding: 0, flex: 1 }}>
              {p.includes.map((inc) => (
                <li key={inc} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12.5, color: SUB, padding: '3px 0', lineHeight: 1.5 }}>
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0, marginTop: 2, color: GREEN }}><rect x="1.5" y="1.5" width="13" height="13" rx="4" fill="#e5f2ea"/><path d="M4.8 8.3l2.2 2.2 4.2-4.8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  {inc}
                </li>
              ))}
            </ul>

            <div style={{ borderTop: `1px solid ${LINE}`, paddingTop: 14 }}>
              <p style={{ fontSize: 24, fontWeight: 800, color: INK, margin: '0 0 10px', letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}>
                {formatCents(p.priceCents)} <span style={{ fontSize: 12, fontWeight: 500, color: FAINT }}>flat</span>
              </p>
              {requested === p.id ? (
                <div style={{ background: '#e5f2ea', border: '1px solid #bfe0cc', borderRadius: 10, padding: '10px 13px' }}>
                  <p style={{ fontSize: 12.5, fontWeight: 700, color: GREEN, margin: '0 0 2px' }}>Request received!</p>
                  <p style={{ fontSize: 12, color: SUB, margin: 0 }}>The front desk will call to lock in your date and take the deposit.</p>
                </div>
              ) : signedIn ? (
                <button className={`sq-btn ${p.featured ? 'sq-btn-primary' : 'sq-btn-ghost'}`} style={{ width: '100%' }} onClick={() => setRequested(p.id)}>
                  Request this package
                </button>
              ) : (
                <Link href="/signup" className={`sq-btn ${p.featured ? 'sq-btn-primary' : 'sq-btn-ghost'}`} style={{ width: '100%' }}>
                  Create a profile to request
                </Link>
              )}
            </div>
          </div>
        ))}
      </div>

      <p style={{ fontSize: 11.5, color: FAINT, margin: '26px 0 0' }}>
        Want something custom? <Link href="/facilities" style={{ color: BLUE, fontWeight: 600 }}>Rent rooms individually →</Link>
      </p>
    </div>
  )
}
