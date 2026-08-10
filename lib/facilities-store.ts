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
  // Rate for hour one; perHourCents covers each additional hour.
  // undefined = rate column not migrated yet (flat perHourCents pricing).
  firstHourCents?: number
  // When this room can be booked. undefined = column not migrated yet;
  // null = follows the business hours in Settings; otherwise a 7-entry
  // array indexed Sunday(0)–Saturday(6).
  bookingHours?: DaySchedule[] | null
  // Deposit that locks a booking in. undefined = column not migrated yet.
  depositCents?: number
  depositRequired?: boolean
  // Time/day pricing overrides. undefined = column not migrated yet.
  rateRules?: RateRule[]
  // How far ahead online bookings must be made. undefined = not migrated.
  minNoticeHours?: number
}

export interface RateRule {
  days: number[]  // 0=Sunday … 6=Saturday
  fromH: number   // decimal hours, rule covers [fromH, toH)
  toH: number
  cents: number   // $/hr for hours inside the window
  label?: string
}

export interface DaySchedule {
  closed: boolean
  openH: number  // decimal hours: 8.5 = 8:30 AM
  closeH: number
}

export const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

function normalizeSchedule(v: unknown): DaySchedule[] | null {
  if (!Array.isArray(v) || v.length !== 7) return null
  const out: DaySchedule[] = []
  for (const d of v) {
    const day = d as Partial<DaySchedule> | null
    if (!day || typeof day !== 'object') return null
    out.push({
      closed: !!day.closed,
      openH: typeof day.openH === 'number' ? day.openH : 8,
      closeH: typeof day.closeH === 'number' ? day.closeH : 22,
    })
  }
  return out
}

function normalizeRules(v: unknown): RateRule[] {
  if (!Array.isArray(v)) return []
  return v
    .filter((r): r is RateRule => !!r && typeof r === 'object' && Array.isArray((r as RateRule).days))
    .map((r) => ({
      days: r.days.filter((d) => typeof d === 'number' && d >= 0 && d <= 6),
      fromH: typeof r.fromH === 'number' ? r.fromH : 9,
      toH: typeof r.toH === 'number' ? r.toH : 17,
      cents: typeof r.cents === 'number' ? r.cents : 0,
      label: typeof r.label === 'string' ? r.label : '',
    }))
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
  first_hour_cents?: number | null
  booking_hours?: unknown
  deposit_cents?: number | null
  deposit_required?: boolean | null
  rate_rules?: unknown
  min_notice_hours?: number | null
  facility_prices: { label: string; cents: number; sort: number }[]
}

function fromRow(r: FacilityRow): RoomConfig {
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
    photoUrl: 'photo_url' in r ? (r.photo_url ?? null) : undefined,
    firstHourCents: 'first_hour_cents' in r ? (r.first_hour_cents ?? r.per_hour_cents) : undefined,
    bookingHours: 'booking_hours' in r ? normalizeSchedule(r.booking_hours) : undefined,
    depositCents: 'deposit_cents' in r ? (r.deposit_cents ?? 0) : undefined,
    depositRequired: 'deposit_required' in r ? !!r.deposit_required : undefined,
    rateRules: 'rate_rules' in r ? normalizeRules(r.rate_rules) : undefined,
    minNoticeHours: 'min_notice_hours' in r ? (r.min_notice_hours ?? 48) : undefined,
  }
}

const BASE_COLS = 'id, name, color, blurb, capacity_label, min_hours, per_hour_cents, active, sort, facility_prices(label, cents, sort)'
// Columns added by later migrations, newest first — we retry without them
// until the matching migration has been run, so rooms never disappear.
const COL_SETS = [
  `photo_url, first_hour_cents, booking_hours, deposit_cents, deposit_required, rate_rules, min_notice_hours, ${BASE_COLS}`,
  `photo_url, first_hour_cents, booking_hours, deposit_cents, deposit_required, rate_rules, ${BASE_COLS}`,
  `photo_url, first_hour_cents, booking_hours, deposit_cents, deposit_required, ${BASE_COLS}`,
  `photo_url, first_hour_cents, booking_hours, ${BASE_COLS}`,
  `photo_url, first_hour_cents, ${BASE_COLS}`,
  `photo_url, ${BASE_COLS}`,
  BASE_COLS,
]

let cache: RoomConfig[] = []

export async function getRooms(): Promise<RoomConfig[]> {
  for (const cols of COL_SETS) {
    const { data, error } = await supabase().from('facilities').select(cols).order('sort')
    if (!error) {
      cache = (data as unknown as FacilityRow[]).map(fromRow)
      return cache
    }
  }
  throw new Error('facilities query failed')
}

export async function getActiveRooms(): Promise<RoomConfig[]> {
  return (await getRooms()).filter((r) => r.active)
}

export async function getRoom(id: string): Promise<RoomConfig | null> {
  for (const cols of COL_SETS) {
    const { data, error } = await supabase().from('facilities').select(cols).eq('id', id).maybeSingle()
    if (!error) return data ? fromRow(data as unknown as FacilityRow) : null
  }
  throw new Error('facilities query failed')
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
    // Only write migration-added columns once they exist (values defined)
    ...(room.photoUrl !== undefined ? { photo_url: room.photoUrl } : {}),
    ...(room.firstHourCents !== undefined ? { first_hour_cents: room.firstHourCents } : {}),
    ...(room.bookingHours !== undefined ? { booking_hours: room.bookingHours } : {}),
    ...(room.depositCents !== undefined ? { deposit_cents: room.depositCents } : {}),
    ...(room.depositRequired !== undefined ? { deposit_required: room.depositRequired } : {}),
    ...(room.rateRules !== undefined ? { rate_rules: room.rateRules } : {}),
    ...(room.minNoticeHours !== undefined ? { min_notice_hours: room.minNoticeHours } : {}),
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
    ...(room.firstHourCents !== undefined ? { first_hour_cents: room.firstHourCents } : {}),
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

// The hours a room takes bookings on a given weekday (0=Sunday), after
// applying its custom schedule over the site-wide business hours.
// closed: true means no bookings that day.
export function roomDayHours(
  room: Pick<RoomConfig, 'bookingHours'>,
  weekday: number,
  site: { closed?: boolean; openH: number; closeH: number },
): { closed: boolean; openH: number; closeH: number } {
  const sched = room.bookingHours?.[weekday]
  if (!sched) return { closed: site.closed ?? false, openH: site.openH, closeH: site.closeH }
  return { closed: sched.closed, openH: sched.openH, closeH: sched.closeH }
}

// What a rental costs: the first hour at its own rate, every additional
// hour at the per-hour rate. Before migration 0006, both rates are equal.
export function rentalPriceCents(room: Pick<RoomConfig, 'perHourCents' | 'firstHourCents'>, hours: number): number {
  if (hours <= 0) return 0
  const first = room.firstHourCents ?? room.perHourCents
  return first + (hours - 1) * room.perHourCents
}

// The $/hr for one specific hour of the week: the first rate rule matching
// the day and time wins; otherwise the base rate (first-hour rate for the
// rental's opening hour, additional-hour rate after).
export function hourRateCents(
  room: Pick<RoomConfig, 'perHourCents' | 'firstHourCents' | 'rateRules'>,
  dow: number,
  hour: number,
  isFirstHour: boolean,
): number {
  const rule = room.rateRules?.find((r) => r.days.includes(dow) && hour >= r.fromH && hour < r.toH)
  if (rule) return rule.cents
  return isFirstHour ? (room.firstHourCents ?? room.perHourCents) : room.perHourCents
}

// What a rental costs for a specific slot — each rented hour is priced by
// the rules for its day/time, falling back to the base rates. Matches
// rentalPriceCents exactly when the room has no rules.
export function rentalPriceCentsAt(
  room: Pick<RoomConfig, 'perHourCents' | 'firstHourCents' | 'rateRules'>,
  dow: number,
  startH: number,
  hours: number,
): number {
  let total = 0
  for (let i = 0; i < hours; i++) {
    total += hourRateCents(room, dow, startH + i, i === 0)
  }
  return total
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
