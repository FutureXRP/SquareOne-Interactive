'use client'
// Editable room/facility catalog. Admin edits (and new rooms) persist in
// localStorage and the store reads from here, so the dashboard controls the
// storefront. Falls back to the built-in catalog until the backend lands.
// Money is integer cents.

import { ZONES } from '@/lib/theme'
import { FACILITIES } from '@/lib/store-data'

export interface RoomPrice {
  label: string
  cents: number
}

export interface RoomConfig {
  id: string
  name: string
  color: string
  blurb: string
  capacity: string
  minHours: number
  perHourCents: number
  pricing: RoomPrice[]
  active: boolean
}

const KEY = 'sq-rooms-v1'

// Colors offered for new rooms — the validated zone palette plus a few extras.
export const ROOM_COLORS = [
  '#b8860b', '#cf4436', '#2e8b57', '#2f6db8', '#1d9a8f', '#8a4bbf', '#e07020', '#c2478f', '#5b93d6', '#182740',
]

export function defaultRooms(): RoomConfig[] {
  return FACILITIES.map((f) => ({
    id: f.zone.id,
    name: f.zone.name,
    color: f.zone.color,
    blurb: f.blurb,
    capacity: f.capacity,
    minHours: f.minHours,
    perHourCents: f.perHourCents,
    pricing: f.pricing.map((p) => ({ ...p })),
    active: true,
  }))
}

export function getRooms(): RoomConfig[] {
  if (typeof window === 'undefined') return defaultRooms()
  try {
    const raw = window.localStorage.getItem(KEY)
    if (!raw) return defaultRooms()
    const parsed = JSON.parse(raw) as RoomConfig[]
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : defaultRooms()
  } catch {
    return defaultRooms()
  }
}

export function getActiveRooms(): RoomConfig[] {
  return getRooms().filter((r) => r.active)
}

export function getRoom(id: string): RoomConfig | null {
  return getRooms().find((r) => r.id === id) ?? null
}

export function saveRooms(rooms: RoomConfig[]) {
  window.localStorage.setItem(KEY, JSON.stringify(rooms))
  window.dispatchEvent(new Event('sq-rooms'))
}

export function resetRooms() {
  window.localStorage.removeItem(KEY)
  window.dispatchEvent(new Event('sq-rooms'))
}

export function slugify(name: string, taken: Set<string>): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'room'
  let slug = base
  let n = 2
  while (taken.has(slug)) slug = `${base}-${n++}`
  return slug
}

// Fallback-safe lookup for anything rendering a room name/color from an id
// (old bookings may reference a deleted room).
export function roomLabel(id: string): { name: string; color: string } {
  const room = getRoom(id)
  if (room) return { name: room.name, color: room.color }
  const zone = ZONES.find((z) => z.id === id)
  return zone ? { name: zone.name, color: zone.color } : { name: id, color: '#94a6bd' }
}
