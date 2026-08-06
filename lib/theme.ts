// squareone-brand palette (build.md · Style 5), applied to the layout language
// of the CodeCompanion reference dashboard. Light UI, flows with
// squareonecompassion.com.

export const NAVY = '#182740'
export const BLUE = '#2f6db8'
export const BLUE_LIGHT = '#5b93d6'
export const SKY = '#eef4fb'
export const CLOUD = '#f8fafd'
export const LINE = '#dbe4f0'
export const INK = '#1f2c42'
export const SUB = '#64748c'
export const FAINT = '#94a6bd'
export const GOLD = '#e8a13a'
export const GREEN = '#2e8b57'
export const RED = '#cf4436'

export const HERO_GRADIENT = `linear-gradient(140deg, ${NAVY} 0%, #24518c 55%, ${BLUE} 100%)`
export const ROW_HOVER = '#f3f7fc'

export const card: React.CSSProperties = {
  background: '#fff',
  border: `1px solid ${LINE}`,
  borderRadius: 14,
  boxShadow: '0 1px 3px rgba(24,39,64,0.05)',
}

// Zone (facility) data colors — build.md zone assignments tuned to this
// palette. Lane order below is the Board's fixed order; adjacent pairs were
// validated for CVD separation on the #f8fafd surface (blocks additionally
// carry direct labels, and holds a stripe texture, as secondary encoding).
export interface Zone {
  id: string
  name: string
  color: string
}

export const ZONES: Zone[] = [
  { id: 'gym', name: 'Gym', color: '#b8860b' },
  { id: 'gaming', name: 'Gaming Zone', color: '#cf4436' },
  { id: 'dining', name: 'Dining Hall', color: '#2e8b57' },
  { id: 'multiball', name: 'Multiball', color: '#2f6db8' },
  { id: 'adventure', name: 'Adventure Zone', color: '#1d9a8f' },
  { id: 'multisport', name: 'Multisport', color: '#8a4bbf' },
  { id: 'party', name: 'Party Arcade', color: '#e07020' },
  { id: 'billiards', name: 'Billiards', color: '#c2478f' },
]

export const zoneById = Object.fromEntries(ZONES.map((z) => [z.id, z])) as Record<string, Zone>
