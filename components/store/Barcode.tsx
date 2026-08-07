'use client'
import { hashString, mulberry32 } from '@/lib/rng'

// Deterministic barcode art seeded from the real member code (seeded RNG per
// house rules). Becomes a scannable credential when the door-access hardware
// integration ships; until then the member code below it is the credential
// staff verify at the desk.
export function Barcode({ value, height = 44 }: { value: string; height?: number }) {
  const rng = mulberry32(hashString(value))
  const bars: { x: number; w: number }[] = []
  let x = 0
  while (x < 200) {
    const w = rng() < 0.55 ? 2 : rng() < 0.75 ? 4 : 6
    if (rng() < 0.62) bars.push({ x, w })
    x += w + 2
  }
  return (
    <svg viewBox={`0 0 200 ${height}`} width="100%" height={height} preserveAspectRatio="none" role="img" aria-label={`Member barcode ${value}`}>
      {bars.map((b, i) => (
        <rect key={i} x={b.x} y={0} width={b.w} height={height} fill="#1f2c42" />
      ))}
    </svg>
  )
}
