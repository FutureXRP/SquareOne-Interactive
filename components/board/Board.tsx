'use client'
import { useEffect, useState } from 'react'
import { ZONES, LINE, INK, SUB, FAINT, RED } from '@/lib/theme'
import { BOARD_START, BOARD_END, bookings, type Booking } from '@/lib/demo-data'
import { formatHour } from '@/lib/format'

const SPAN = BOARD_END - BOARD_START
const LANE_LABEL_W = 132
const LANE_H = 44

function pct(hour: number) {
  return ((hour - BOARD_START) / SPAN) * 100
}

function Block({ b, color }: { b: Booking; color: string }) {
  const isHold = b.status === 'hold'
  const label = isHold ? `${b.title} · HOLD → ${b.holdExpires}` : b.title
  const detail = `${formatHour(b.start)}–${formatHour(b.end)} · ${b.who}${isHold ? ` · hold expires ${b.holdExpires}, missing ${b.missing}` : ''}`
  return (
    <div
      title={detail}
      style={{
        position: 'absolute',
        left: `${pct(b.start)}%`,
        width: `${pct(b.end) - pct(b.start)}%`,
        top: 5,
        height: LANE_H - 10,
        borderRadius: 6,
        background: isHold
          ? `repeating-linear-gradient(45deg, ${color}2e, ${color}2e 6px, ${color}0f 6px, ${color}0f 12px)`
          : `${color}1f`,
        border: isHold ? `1.5px dashed ${color}` : 'none',
        borderLeft: isHold ? `3px solid ${color}` : `3px solid ${color}`,
        padding: '3px 8px',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
      }}
    >
      <p style={{ fontSize: 11, fontWeight: 600, color: INK, margin: 0, lineHeight: 1.3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</p>
      <p style={{ fontSize: 9.5, color: SUB, margin: 0, lineHeight: 1.3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontVariantNumeric: 'tabular-nums' }}>
        {formatHour(b.start)}–{formatHour(b.end)} · {b.who}
      </p>
    </div>
  )
}

// The NOW line reads the real clock (renders client-side only, so the server
// markup never carries a fabricated time).
function NowLine() {
  const [now, setNow] = useState<Date | null>(null)
  useEffect(() => {
    const update = () => setNow(new Date())
    update()
    const t = setInterval(update, 30_000)
    return () => clearInterval(t)
  }, [])

  if (!now) return null
  const hour = now.getHours() + now.getMinutes() / 60
  if (hour < BOARD_START || hour > BOARD_END) return null
  const label = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  return (
    <div style={{ position: 'absolute', left: `${pct(hour)}%`, top: 0, bottom: 0, width: 0, zIndex: 2 }}>
      <div style={{ position: 'absolute', top: 0, bottom: 0, left: -1, width: 2, background: RED }} />
      <span style={{ position: 'absolute', top: -20, left: -1, transform: 'translateX(-50%)', fontSize: 9.5, fontWeight: 700, color: '#fff', background: RED, padding: '1px 6px', borderRadius: 99, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
        NOW {label}
      </span>
    </div>
  )
}

export function Board() {
  const hours = []
  for (let h = BOARD_START; h <= BOARD_END; h += 2) hours.push(h)

  return (
    <div style={{ overflowX: 'auto' }}>
      <div style={{ minWidth: 760, padding: '26px 4px 4px' }}>
        {/* Time axis */}
        <div style={{ display: 'flex', marginBottom: 6 }}>
          <div style={{ width: LANE_LABEL_W, flexShrink: 0 }} />
          <div style={{ flex: 1, position: 'relative', height: 14 }}>
            {hours.map((h) => (
              <span key={h} style={{ position: 'absolute', left: `${pct(h)}%`, transform: 'translateX(-50%)', fontSize: 10, color: FAINT, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                {formatHour(h)}
              </span>
            ))}
          </div>
        </div>

        {/* Lanes */}
        <div style={{ position: 'relative' }}>
          {ZONES.map((zone, zi) => {
            const laneBookings = bookings.filter((b) => b.zoneId === zone.id)
            return (
              <div key={zone.id} style={{ display: 'flex', alignItems: 'stretch' }}>
                <div style={{ width: LANE_LABEL_W, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 7, padding: '0 10px 0 2px' }}>
                  <span style={{ width: 9, height: 9, borderRadius: 2, background: zone.color, flexShrink: 0 }} />
                  <span style={{ fontSize: 11.5, fontWeight: 600, color: SUB, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{zone.name}</span>
                </div>
                <div style={{
                  flex: 1,
                  position: 'relative',
                  height: LANE_H,
                  background: zi % 2 === 0 ? '#fbfdff' : 'transparent',
                  borderTop: `1px solid ${zi === 0 ? LINE : '#eaf0f8'}`,
                  borderBottom: zi === ZONES.length - 1 ? `1px solid ${LINE}` : 'none',
                  backgroundImage: `repeating-linear-gradient(90deg, transparent, transparent calc(${100 / SPAN}% - 1px), #edf2f9 calc(${100 / SPAN}% - 1px), #edf2f9 ${100 / SPAN}%)`,
                }}>
                  {laneBookings.map((b) => <Block key={b.id} b={b} color={zone.color} />)}
                </div>
              </div>
            )
          })}
          {/* NOW line overlays booking area only */}
          <div style={{ position: 'absolute', top: 0, bottom: 0, left: LANE_LABEL_W, right: 0 }}>
            <div style={{ position: 'relative', height: '100%' }}>
              <NowLine />
            </div>
          </div>
        </div>

        {/* Legend */}
        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '6px 16px', marginTop: 14, paddingLeft: 2 }}>
          {ZONES.map((z) => (
            <span key={z.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10.5, color: SUB }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: z.color }} />
              {z.name}
            </span>
          ))}
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10.5, color: SUB }}>
            <span style={{ width: 14, height: 8, borderRadius: 2, border: '1px dashed #94a6bd', background: 'repeating-linear-gradient(45deg, #94a6bd44, #94a6bd44 3px, transparent 3px, transparent 6px)' }} />
            striped = unpaid hold
          </span>
        </div>
      </div>
    </div>
  )
}
