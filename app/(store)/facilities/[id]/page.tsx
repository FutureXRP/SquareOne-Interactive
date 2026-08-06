'use client'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import { BookingFlow } from '@/components/store/BookingFlow'
import { INK, SUB, FAINT, BLUE } from '@/lib/theme'
import { formatCents } from '@/lib/format'
import { getRoom, type RoomConfig } from '@/lib/facilities-store'

export default function FacilityPage() {
  const params = useParams<{ id: string }>()
  const [room, setRoom] = useState<RoomConfig | null | undefined>(undefined)

  useEffect(() => {
    const sync = () => setRoom(getRoom(params.id))
    sync()
    window.addEventListener('sq-rooms', sync)
    return () => window.removeEventListener('sq-rooms', sync)
  }, [params.id])

  if (room === undefined) return <div style={{ minHeight: '50vh' }} />

  if (room === null || !room.active) {
    return (
      <div className="sq-page" style={{ padding: '48px 20px 10px', maxWidth: 480, margin: '0 auto', textAlign: 'center' }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: INK, margin: '0 0 8px' }}>That room isn&apos;t available</h1>
        <p style={{ fontSize: 13.5, color: SUB, margin: '0 0 18px' }}>It may have been renamed or retired.</p>
        <Link href="/facilities" className="sq-btn sq-btn-primary">See all rooms</Link>
      </div>
    )
  }

  return (
    <div className="sq-page" style={{ padding: '30px 20px 10px', maxWidth: 1180, margin: '0 auto' }}>
      <Link href="/facilities" style={{ fontSize: 12.5, color: BLUE, fontWeight: 600, textDecoration: 'none' }}>← All rooms</Link>

      <div style={{ margin: '14px 0 24px', borderRadius: 18, overflow: 'hidden', background: `linear-gradient(135deg, ${room.color}30, ${room.color}0d)`, padding: '26px 28px', position: 'relative' }}>
        <div style={{ position: 'absolute', right: 24, top: -18, width: 110, height: 110, border: `2px solid ${room.color}45`, borderRadius: 20, transform: 'rotate(18deg)' }} />
        <h1 style={{ fontSize: 27, fontWeight: 800, color: INK, margin: '0 0 6px', letterSpacing: '-0.03em' }}>{room.name}</h1>
        <p style={{ fontSize: 13.5, color: SUB, margin: '0 0 10px', maxWidth: 520, lineHeight: 1.6 }}>{room.blurb}</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: room.color, background: '#fff', padding: '3px 10px', borderRadius: 999 }}>{room.capacity}</span>
          {room.pricing.map((p) => (
            <span key={p.label} style={{ fontSize: 11, fontWeight: 600, color: SUB, background: '#fff', padding: '3px 10px', borderRadius: 999, fontVariantNumeric: 'tabular-nums' }}>
              {p.label} · {formatCents(p.cents)}
            </span>
          ))}
        </div>
      </div>

      <BookingFlow facilityId={room.id} />

      <p style={{ fontSize: 11.5, color: FAINT, margin: '28px 0 0' }}>
        Placeholder availability — live availability and payment arrive with the booking engine.
      </p>
    </div>
  )
}
