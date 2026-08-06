'use client'
// Event bundle packages — built in the dashboard, displayed in the store.
// Same demo persistence pattern as rooms: localStorage until the backend
// lands. Money is integer cents.

export interface EventPackage {
  id: string
  name: string
  priceCents: number
  hours: number
  capacity: string
  blurb: string
  roomIds: string[]
  includes: string[]
  featured: boolean
  active: boolean
}

const KEY = 'sq-packages-v1'

export function defaultPackages(): EventPackage[] {
  return [
    {
      id: 'ultimate-birthday',
      name: 'Ultimate Birthday Bash',
      priceCents: 39900,
      hours: 3,
      capacity: 'Up to 20 kids',
      blurb: 'The big one — arcade party room plus the Gaming Zone, with a dedicated host from setup to cleanup.',
      roomIds: ['party', 'gaming'],
      includes: ['Dedicated party host', 'Arcade play for every guest', 'Console & VR gaming hour', 'Tables, setup & cleanup', 'Pizza & drinks for the group'],
      featured: true,
      active: true,
    },
    {
      id: 'team-celebration',
      name: 'Team Celebration',
      priceCents: 49900,
      hours: 4,
      capacity: 'Up to 60',
      blurb: 'End-of-season parties done right — full-court gym time plus the Dining Hall for the awards and the cake.',
      roomIds: ['gym', 'dining'],
      includes: ['Full-court gym block', 'Dining Hall for meals & awards', 'Tables, chairs & AV setup', 'Staff on site throughout'],
      featured: false,
      active: true,
    },
    {
      id: 'family-fun-night',
      name: 'Family Fun Night',
      priceCents: 24900,
      hours: 2,
      capacity: 'Up to 15',
      blurb: 'A two-hour sampler — climb in the Adventure Zone, then burn it off in the Multiball Zone.',
      roomIds: ['adventure', 'multiball'],
      includes: ['Adventure Zone hour with staff', 'Multiball Zone hour', 'Water & snacks included'],
      featured: false,
      active: true,
    },
  ]
}

export function getPackages(): EventPackage[] {
  if (typeof window === 'undefined') return defaultPackages()
  try {
    const raw = window.localStorage.getItem(KEY)
    if (!raw) return defaultPackages()
    const parsed = JSON.parse(raw) as EventPackage[]
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : defaultPackages()
  } catch {
    return defaultPackages()
  }
}

export function getActivePackages(): EventPackage[] {
  return getPackages().filter((p) => p.active)
}

export function savePackages(packages: EventPackage[]) {
  window.localStorage.setItem(KEY, JSON.stringify(packages))
  window.dispatchEvent(new Event('sq-packages'))
}

export function resetPackages() {
  window.localStorage.removeItem(KEY)
  window.dispatchEvent(new Event('sq-packages'))
}
