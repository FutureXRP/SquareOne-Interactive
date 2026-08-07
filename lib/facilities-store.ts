'use client'
// Rooms/facilities — live from Supabase. Admin writes upsert; the store,
// Board, and booking flow refetch on the 'sq-rooms' event. Money is integer
// cents end to end.

import { supabase, tryWrite, emit, isSupabaseConfigured } from '@/lib/supabase'
import { ZONES } from '@/lib/theme'

export const ROOMS_EVENT = 'sq-rooms'

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
  sort: number
  // undefined = photo column not migrated yet; null = no photo set
  photoUrl?: string | null
}

export const ROOM_COLORS = [
  '#b8860b', '#cf4436', '#2e8b57', '#2f6db8', '#1d9a8f', '#8a4bbf', '#e07020', '#c2478f', '#5b93d6', '#182740',
]

interface FacilityRow {
  id: string
  name: string
  color: string
  blurb: string
  capacity_label: string
  min_hours: number
  per_hour_cents: number
  active: boolean
  sort: number
  photo_url?: string | null
  facility_prices: { label: string; cents: number; sort: number }[]
}

function fromRow(r: FacilityRow, hasPhoto: boolean): RoomConfig {
  return {
    id: r.id,
    name: r.name,
    color: r.color,
    blurb: r.blurb,
    capacity: r.capacity_label,
    minHours: r.min_hours,
    perHourCents: r.per_hour_cents,
    pricing: [...r.facility_prices].sort((a, b) => a.sort - b.sort).map((p) => ({ label: p.label, cents: p.cents })),
    active: r.active,
    sort: r.sort,
    photoUrl: hasPhoto ? (r.photo_url ?? null) : undefined,
  }
}

const BASE_COLS = 'id, name, color, blurb, capacity_label, min_hours, per_hour_cents, active, sort, facility_prices(label, cents, sort)'

let cache: RoomConfig[] = []

export async function getRooms(): Promise<RoomConfig[]> {
  // photo_url arrives with migration 0005 — fall back to the old column set
  // until it's run so rooms never disappear.
  const withPhoto = await supabase().from('facilities').select(`photo_url, ${BASE_COLS}`).order('sort')
  if (!withPhoto.error) {
    cache = (withPhoto.data as unknown as FacilityRow[]).map((r) => fromRow(r, true))
    return cache
  }
  const { data, error } = await supabase().from('facilities').select(BASE_COLS).order('sort')
  if (error) throw error
  cache = (data as unknown as FacilityRow[]).map((r) => fromRow(r, false))
  return cache
}

export async function getActiveRooms(): Promise<RoomConfig[]> {
  return (await getRooms()).filter((r) => r.active)
}

export async function getRoom(id: string): Promise<RoomConfig | null> {
  const withPhoto = await supabase().from('facilities').select(`photo_url, ${BASE_COLS}`).eq('id', id).maybeSingle()
  if (!withPhoto.error) return withPhoto.data ? fromRow(withPhoto.data as unknown as FacilityRow, true) : null
  const { data, error } = await supabase().from('facilities').select(BASE_COLS).eq('id', id).maybeSingle()
  if (error) throw error
  return data ? fromRow(data as unknown as FacilityRow, false) : null
}

async function orgId(): Promise<string> {
  const { data, error } = await supabase().from('organizations').select('id').limit(1).single()
  if (error) throw error
  return (data as { id: string }).id
}

export async function saveRoom(room: RoomConfig): Promise<boolean> {
  const sb = supabase()
  const ok = await tryWrite(() => sb.from('facilities').update({
    name: room.name,
    color: room.color,
    blurb: room.blurb,
    capacity_label: room.capacity,
    min_hours: room.minHours,
    per_hour_cents: room.perHourCents,
    active: room.active,
    sort: room.sort,
    // Only write the photo column once migration 0005 has run (photoUrl defined)
    ...(room.photoUrl !== undefined ? { photo_url: room.photoUrl } : {}),
  }).eq('id', room.id))
  if (!ok) return false
  // Replace price chips wholesale — simple and idempotent.
  await tryWrite(() => sb.from('facility_prices').delete().eq('facility_id', room.id))
  if (room.pricing.length > 0) {
    await tryWrite(() => sb.from('facility_prices').insert(
      room.pricing.map((p, i) => ({ facility_id: room.id, label: p.label, cents: p.cents, sort: i }))
    ))
  }
  emit(ROOMS_EVENT)
  return true
}

export async function addRoom(room: Omit<RoomConfig, 'sort'>): Promise<boolean> {
  const org = await orgId()
  const sort = cache.reduce((n, r) => Math.max(n, r.sort), 0) + 1
  const ok = await tryWrite(() => supabase().from('facilities').insert({
    id: room.id,
    org_id: org,
    name: room.name,
    color: room.color,
    blurb: room.blurb,
    capacity_label: room.capacity,
    min_hours: room.minHours,
    per_hour_cents: room.perHourCents,
    active: room.active,
    sort,
  }))
  if (ok && room.pricing.length > 0) {
    await tryWrite(() => supabase().from('facility_prices').insert(
      room.pricing.map((p, i) => ({ facility_id: room.id, label: p.label, cents: p.cents, sort: i }))
    ))
  }
  if (ok) emit(ROOMS_EVENT)
  return ok
}

// Delete a room. If bookings reference it, the delete is blocked by the
// database — we hide it from the store instead and say so.
export async function deleteRoom(id: string): Promise<'deleted' | 'hidden' | 'failed'> {
  const { error } = await supabase().from('facilities').delete().eq('id', id)
  if (!error) {
    emit(ROOMS_EVENT)
    return 'deleted'
  }
  if (error.code === '23503') { // has bookings — hide instead
    const ok = await tryWrite(() => supabase().from('facilities').update({ active: false }).eq('id', id))
    if (ok) emit(ROOMS_EVENT)
    return ok ? 'hidden' : 'failed'
  }
  console.error('[rooms]', error.message)
  return 'failed'
}

export function slugify(name: string, taken: Set<string>): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'room'
  let slug = base
  let n = 2
  while (taken.has(slug)) slug = `${base}-${n++}`
  return slug
}

// Synchronous label lookup with graceful fallback — uses the last fetch's
// cache, then the built-in zone palette, so booking rows always render.
export function roomLabel(id: string): { name: string; color: string } {
  const hit = cache.find((r) => r.id === id)
  if (hit) return { name: hit.name, color: hit.color }
  const zone = ZONES.find((z) => z.id === id)
  return zone ? { name: zone.name, color: zone.color } : { name: id, color: '#94a6bd' }
}

export function roomsConfigured(): boolean {
  return isSupabaseConfigured()
}

// Upload a room photo to the public room-photos bucket and return its URL.
// Returns null on failure (bucket missing, not staff, file too large).
export async function uploadRoomPhoto(roomId: string, file: File): Promise<string | null> {
  if (file.size > 5 * 1024 * 1024) return null
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg'
  const path = `${roomId}/${Date.now()}.${ext}`
  const { error } = await supabase().storage.from('room-photos').upload(path, file, {
    cacheControl: '3600',
    contentType: file.type || 'image/jpeg',
    upsert: true,
  })
  if (error) {
    console.error('[rooms]', error.message)
    return null
  }
  return supabase().storage.from('room-photos').getPublicUrl(path).data.publicUrl
}
