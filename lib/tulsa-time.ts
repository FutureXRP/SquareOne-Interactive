// Booking times live in Tulsa time (America/Chicago), whatever time zone
// the browser is in. A grandparent in California booking a 2 PM party
// means 2 PM in Tulsa — not 2 PM Pacific, which is 4 PM here. Every place a
// booking's time is built from a date + hour, or read back as one, goes
// through these two helpers.

export const TULSA_TZ = 'America/Chicago'

const fmt = new Intl.DateTimeFormat('en-US', {
  timeZone: TULSA_TZ, hourCycle: 'h23',
  year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
})

function partsOf(ms: number): { y: number; m: number; d: number; h: number; min: number; s: number } {
  const p: Record<string, number> = {}
  for (const x of fmt.formatToParts(new Date(ms))) if (x.type !== 'literal') p[x.type] = Number(x.value)
  return { y: p.year, m: p.month, d: p.day, h: p.hour === 24 ? 0 : p.hour, min: p.minute, s: p.second }
}

// Minutes Tulsa is ahead of UTC at this instant (negative: -300 / -360).
function offsetMinutes(ms: number): number {
  const p = partsOf(ms)
  return (Date.UTC(p.y, p.m - 1, p.d, p.h, p.min, p.s) - Math.floor(ms / 1000) * 1000) / 60_000
}

// The instant that is `hours` (fractional ok) on this Tulsa calendar day.
export function tulsaInstant(dateIso: string, hours = 0): Date {
  const [y, m, d] = dateIso.split('-').map(Number)
  const h = Math.floor(hours)
  const min = Math.round((hours - h) * 60)
  const guess = Date.UTC(y, m - 1, d, h, min)
  let t = guess - offsetMinutes(guess) * 60_000
  // Across a daylight-saving change the first guess can be an hour off.
  const again = guess - offsetMinutes(t) * 60_000
  if (again !== t) t = again
  return new Date(t)
}

// A moment as a Tulsa calendar day ("2026-12-19") and hour of day (14.5).
export function tulsaDayHour(at: Date | number | string): { dateIso: string; hour: number } {
  const ms = typeof at === 'number' ? at : new Date(at).getTime()
  const p = partsOf(ms)
  return {
    dateIso: `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`,
    hour: p.h + p.min / 60,
  }
}

// Today's date in Tulsa, optionally offset by whole days.
export function tulsaToday(offsetDays = 0): string {
  return tulsaDayHour(Date.now() + offsetDays * 24 * 3600_000).dateIso
}
