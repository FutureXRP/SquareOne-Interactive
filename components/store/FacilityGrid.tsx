'use client'
import Link from 'next/link'
import { card, INK, SUB, FAINT, BLUE } from '@/lib/theme'
import { formatCents } from '@/lib/format'
import { getActiveRooms, ROOMS_EVENT, type RoomConfig } from '@/lib/facilities-store'
import { useLive } from '@/lib/use-live'

// Room cards for the store — reads the admin-editable room catalog.
export function FacilityGrid({ limit, compact = false }: { limit?: number; compact?: boolean }) {
  const { data: rooms } = useLive<RoomConfig[]>(getActiveRooms, [ROOMS_EVENT], [])

  const shown = limit ? rooms.slice(0, limit) : rooms

  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(${compact ? 240 : 260}px, 1fr))`, gap: compact ? 14 : 16 }}>
      {shown.map((f) => (
        <Link key={f.id} href={`/facilities/${f.id}`} style={{ textDecoration: 'none' }}>
          <div className="sq-card" style={{ ...card, overflow: 'hidden', height: '100%', display: 'flex', flexDirection: 'column' }}>
            <div style={{
              height: compact ? 74 : 92, position: 'relative',
              background: f.photoUrl
                ? `linear-gradient(180deg, rgba(24,39,64,0) 40%, rgba(24,39,64,.28)), url(${f.photoUrl}) center/cover no-repeat`
                : `linear-gradient(135deg, ${f.color}2e, ${f.color}0d)`,
            }}>
              {!f.photoUrl && <div style={{ position: 'absolute', right: 16, top: 12, width: compact ? 34 : 44, height: compact ? 34 : 44, border: `2px solid ${f.color}55`, borderRadius: 11, transform: 'rotate(18deg)' }} />}
              <span style={{ position: 'absolute', left: 16, bottom: 10, fontSize: 10.5, fontWeight: 700, color: f.color, background: '#fff', padding: '2px 9px', borderRadius: 999 }}>{f.capacity}</span>
            </div>
            <div style={{ padding: compact ? '13px 16px' : '14px 18px 16px', flex: 1, display: 'flex', flexDirection: 'column' }}>
              <p style={{ fontSize: compact ? 14 : 15, fontWeight: 700, color: INK, margin: '0 0 4px' }}>{f.name}</p>
              <p style={{ fontSize: 12.5, color: SUB, margin: '0 0 12px', lineHeight: 1.55, flex: 1 }}>{f.blurb}</p>
              {!compact && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                  {f.pricing.map((p) => (
                    <span key={p.label} style={{ fontSize: 11, fontWeight: 600, color: SUB, background: '#eef4fb', padding: '3px 9px', borderRadius: 999, fontVariantNumeric: 'tabular-nums' }}>
                      {p.label} · {formatCents(p.cents)}
                    </span>
                  ))}
                </div>
              )}
              {compact ? (
                <p style={{ fontSize: 12.5, fontWeight: 700, color: BLUE, margin: 0, fontVariantNumeric: 'tabular-nums' }}>
                  from {formatCents(Math.min(...f.pricing.map((p) => p.cents)))} <span style={{ fontWeight: 500, color: FAINT }}>· book online</span>
                </p>
              ) : (
                <span style={{ fontSize: 12.5, fontWeight: 700, color: BLUE }}>Check availability →</span>
              )}
            </div>
          </div>
        </Link>
      ))}
    </div>
  )
}
