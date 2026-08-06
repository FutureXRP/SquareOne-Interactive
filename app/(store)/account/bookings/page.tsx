'use client'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { AccountShell } from '@/components/store/AccountShell'
import { card, INK, SUB, FAINT, LINE, BLUE, GREEN, GOLD, zoneById } from '@/lib/theme'
import { formatCents, formatHour } from '@/lib/format'
import { getBookings, type DemoBooking } from '@/lib/demo-session'

export default function MyBookingsPage() {
  const [bookings, setBookings] = useState<DemoBooking[]>([])

  useEffect(() => {
    const sync = () => setBookings(getBookings())
    sync()
    window.addEventListener('sq-session', sync)
    return () => window.removeEventListener('sq-session', sync)
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
                const zone = zoneById[b.zoneId]
                return (
                  <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 20px', borderBottom: i < bookings.length - 1 ? `1px solid ${LINE}` : 'none', flexWrap: 'wrap' }}>
                    <div style={{ width: 38, height: 38, borderRadius: 10, background: `${zone.color}1f`, borderLeft: `3px solid ${zone.color}`, flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 160 }}>
                      <p style={{ fontSize: 13.5, fontWeight: 700, color: INK, margin: 0 }}>{zone.name}</p>
                      <p style={{ fontSize: 12, color: SUB, margin: 0, fontVariantNumeric: 'tabular-nums' }}>
                        {b.date} · {formatHour(b.startH)}–{formatHour(b.startH + b.hours)} · {b.id}
                      </p>
                    </div>
                    {b.status === 'hold'
                      ? <span style={{ fontSize: 10.5, fontWeight: 700, color: GOLD, background: '#faf0dc', padding: '3px 11px', borderRadius: 999 }}>Hold — deposit due</span>
                      : <span style={{ fontSize: 10.5, fontWeight: 700, color: GREEN, background: '#e5f2ea', padding: '3px 11px', borderRadius: 999 }}>Confirmed</span>}
                    <span style={{ fontSize: 14, fontWeight: 800, color: INK, fontVariantNumeric: 'tabular-nums' }}>{formatCents(b.priceCents)}</span>
                  </div>
                )
              })}
            </div>
          )}

          <p style={{ fontSize: 11.5, color: FAINT, margin: '18px 0 0' }}>
            Holds are kept for 24 hours. Questions? Call the front desk or <Link href="/facilities" style={{ color: BLUE, fontWeight: 600 }}>book another room</Link>.
          </p>
        </div>
      )}
    </AccountShell>
  )
}
