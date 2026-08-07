'use client'
import { useEffect, useState } from 'react'
import { getMyStaff, isAdminRole } from '@/lib/staff-store'
import { isSupabaseConfigured } from '@/lib/supabase'

// Wraps a structural editor page. Owners and Admins get it as-is; Managers
// and Staff see it read-only — every control inside is disabled and a banner
// explains why. This mirrors the database rules (RLS is the real boundary);
// the wrapper just keeps the UI honest.
export function AdminOnly({ children }: { children: React.ReactNode }) {
  const [limited, setLimited] = useState(false)

  useEffect(() => {
    if (!isSupabaseConfigured()) return
    getMyStaff()
      .then((me) => setLimited(!isAdminRole(me?.role)))
      .catch(() => {})
  }, [])

  if (!limited) return <>{children}</>

  return (
    <div>
      <div style={{ maxWidth: 1180, margin: '0 auto', padding: '14px 40px 0' }}>
        <div style={{ background: '#faf0dc', border: '1px solid #f0ddb8', borderRadius: 12, padding: '11px 16px' }}>
          <p style={{ fontSize: 12.5, color: '#7a5a14', margin: 0, lineHeight: 1.55 }}>
            <strong>View only.</strong> Your role covers day-to-day operations — bookings, payments,
            clients, and schedules. Changing what&apos;s on this page takes an Owner or Admin.
          </p>
        </div>
      </div>
      <fieldset disabled style={{ border: 'none', margin: 0, padding: 0, minWidth: 0, opacity: 0.75 }}>
        {children}
      </fieldset>
    </div>
  )
}
