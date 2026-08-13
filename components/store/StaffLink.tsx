'use client'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { getMyStaff, ROLE_LABEL, type StaffMember } from '@/lib/staff-store'
import { isSupabaseConfigured } from '@/lib/supabase'
import { SESSION_EVENT } from '@/lib/session'

// A quiet way into the dashboard from the bottom of the store — handy on
// a phone, where the admin app isn't installed. It only renders for
// someone whose signed-in account has an active staff row; everyone else
// never sees it. The dashboard itself is still gated on its own, so this
// is convenience, not the lock.
export function StaffLink() {
  const [staff, setStaff] = useState<StaffMember | null>(null)

  useEffect(() => {
    if (!isSupabaseConfigured()) return
    let on = true
    const sync = () => {
      getMyStaff().then((s) => { if (on) setStaff(s) }).catch(() => { if (on) setStaff(null) })
    }
    sync()
    window.addEventListener(SESSION_EVENT, sync)
    return () => { on = false; window.removeEventListener(SESSION_EVENT, sync) }
  }, [])

  if (!staff) return null

  return (
    <Link
      href="/admin"
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 7,
        fontSize: 11.5, fontWeight: 700, color: '#fff', textDecoration: 'none',
        background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.22)',
        borderRadius: 999, padding: '5px 13px',
      }}
    >
      <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden>
        <rect x="1.5" y="2.5" width="13" height="11" rx="2" stroke="currentColor" strokeWidth="1.5" />
        <path d="M1.5 6.5h13M5.5 10h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
      Staff dashboard
      <span style={{ opacity: 0.7, fontWeight: 600 }}>· {ROLE_LABEL[staff.role]}</span>
    </Link>
  )
}
