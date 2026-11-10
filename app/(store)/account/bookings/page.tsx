'use client'
import { StatusChip, stageOf } from '@/components/store/MyBookingsCard'
import { DEPOSIT_RULE_GENERAL } from '@/lib/payment-policy'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { AccountShell } from '@/components/store/AccountShell'
import { card, INK, SUB, FAINT, LINE, BLUE, GREEN, GOLD } from '@/lib/theme'
import { getRooms, roomLabel } from '@/lib/facilities-store'
import { isSupabaseConfigured } from '@/lib/supabase'
import { formatCents, formatHour } from '@/lib/format'
import { getMyBookings, SESSION_EVENT, type MemberBooking } from '@/lib/session'

export default function MyBookingsPage() {
  const [bookings, setBookings] = useState<MemberBooking[]>([])

  useEffect(() => {
    if (!isSupabaseConfigured()) return
    let on = true
    const sync = () => {
      Promise.all([getMyBookings(), getRooms().catch(() => [])])
        .then(([b]) => { if (on) setBookings(b) })
        .catch(() => {})
    }
    sync()
    window.addEventListener(SESSION_EVENT, sync)
    return () => { on = false; window.removeEventListener(SESSION_EVENT, sync) }
  }, [])

  return (
    <AccountShell>
      {() => (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
            <p style={{ fontSize: 13.5, color: SUB, margin: 0 }}>Rentals and holds on your account.</p>
            <Link href="/facilities" className="sq-btn sq-btn-primary" style={{ padding: '8px 16px' }}>Book a room</Link>
          </div>

          {bookings.length === 0 ? (
            <div className="sq-card" style={{ ...card, padding: '30px 32px', textAlign: 'center' }}>
              <p style={{ fontSize: 14, color: SUB, margin: '0 0 14px' }}>No bookings yet.</p>
              <Link href="/facilities" className="sq-btn sq-btn-ghost">Browse rooms &amp; facilities</Link>
            </div>
          ) : (
            <div className="sq-card" style={card}>
              {bookings.map((b, i) => {
                const zone = roomLabel(b.roomId)
                return (
                  <div key={b.code} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 20px', borderBottom: i < bookings.length - 1 ? `1px solid ${LINE}` : 'none', flexWrap: 'wrap' }}>
                    <div style={{ width: 38, height: 38, borderRadius: 10, background: `${zone.color}1f`, borderLeft: `3px solid ${zone.color}`, flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 160 }}>
                      <p style={{ fontSize: 13.5, fontWeight: 700, color: INK, margin: 0 }}>{zone.name}</p>
                      <p style={{ fontSize: 12, color: SUB, margin: 0, fontVariantNumeric: 'tabular-nums' }}>
                        {b.date} · {formatHour(b.startH)}–{formatHour(b.startH + b.hours)} · {b.code}
                      </p>
                    </div>
                    {/* Same labels as My bookings on the account page. */}
                    <StatusChip stage={stageOf(b)} />
                    <span style={{ fontSize: 14, fontWeight: 800, color: INK, fontVariantNumeric: 'tabular-nums' }}>{formatCents(b.priceCents)}</span>
                  </div>
                )
              })}
            </div>
          )}

          <p style={{ fontSize: 11.5, color: FAINT, margin: '18px 0 0' }}>
            {DEPOSIT_RULE_GENERAL} Pay from your booking&rsquo;s page or email. Questions? Call the front desk or <Link href="/facilities" style={{ color: BLUE, fontWeight: 600 }}>book another room</Link>.
          </p>
        </div>
      )}
    </AccountShell>
  )
}
