'use client'
// Rental add-ons (inflatable, photo booth, …) — live from Supabase. The
// Add Ons tab edits the catalog; each room offers a subset; the booking
// flow prices picked add-ons by rental length: one price for the first
// hour, optionally a different rate per additional hour.

import { supabase, tryWrite, emit, isSupabaseConfigured } from '@/lib/supabase'
import { formatCents } from '@/lib/format'

export const ADDONS_EVENT = 'sq-addons'

export interface AddonConfig {
  id: string
  name: string
  blurb: string
  priceCents: number // covers includedHours — or the one-off price when extraHourCents is null
  includedHours: number // hours the base price buys (migration 0028; 1 before it)
  extraHourCents: number | null // per hour past includedHours; null = charged once
  photoUrl: string | null
  active: boolean
  sort: number
}

interface Row {
  id: string
  name: string
  blurb: string
  price_cents: number
  extra_hour_cents?: number | null
  included_hours?: number | null
  photo_url?: string | null
  active: boolean
  sort: number
}

function fromRow(r: Row): AddonConfig {
  return {
    id: r.id,
    name: r.name,
    blurb: r.blurb,
    priceCents: r.price_cents,
    includedHours: r.included_hours ?? 1,
    extraHourCents: r.extra_hour_cents ?? null,
    photoUrl: r.photo_url ?? null,
    active: r.active,
    sort: r.sort,
  }
}

const BASE_COLS = 'id, name, blurb, price_cents, active, sort'
// extra_hour_cents / photo_url arrive with 0021, included_hours with
// 0028 — retry with fewer columns until each has been run.
const COL_SETS = [
  `included_hours, extra_hour_cents, photo_url, ${BASE_COLS}`,
  `extra_hour_cents, photo_url, ${BASE_COLS}`,
  BASE_COLS,
]

let cache: AddonConfig[] = []
let hasHourlyCols = false // whether 0021 columns exist, learned from the read
let hasIncludedHours = false // whether 0028 has been run

export async function getAddons(): Promise<AddonConfig[]> {
  if (!isSupabaseConfigured()) return []
  for (const cols of COL_SETS) {
    const { data, error } = await supabase().from('addons').select(cols).order('sort')
    if (!error) {
      hasHourlyCols = cols !== BASE_COLS
      hasIncludedHours = cols.includes('included_hours')
      cache = (data as unknown as Row[]).map(fromRow)
      return cache
    }
  }
  return [] // table arrives with migration 0016
}

export function addonHoursSupported(): boolean {
  return hasIncludedHours
}

export async function getActiveAddons(): Promise<AddonConfig[]> {
  return (await getAddons()).filter((a) => a.active)
}

export function addonLookup(id: string): AddonConfig | null {
  return cache.find((a) => a.id === id) ?? null
}

// What this add-on costs for a rental of the given length: the base
// price covers includedHours, each hour past that adds extraHourCents.
export function addonPriceCents(a: AddonConfig, hours: number): number {
  if (a.extraHourCents === null) return a.priceCents // one flat charge
  const extra = Math.max(0, Math.ceil(hours) - a.includedHours)
  return a.priceCents + a.extraHourCents * extra
}

// "$100" · "$100 first hour, then $25/hr" · "$100 for 2 hours, then $25/hr"
export function addonPriceLabel(a: AddonConfig): string {
  if (a.extraHourCents === null) return formatCents(a.priceCents)
  const block = a.includedHours === 1 ? 'first hour' : `for ${a.includedHours} hours`
  return `${formatCents(a.priceCents)} ${block}, then ${formatCents(a.extraHourCents)}/hr`
}

async function orgId(): Promise<string> {
  const { data, error } = await supabase().from('organizations').select('id').limit(1).single()
  if (error) throw error
  return (data as { id: string }).id
}

export async function saveAddon(a: AddonConfig): Promise<boolean> {
  const ok = await tryWrite(() => supabase().from('addons').update({
    name: a.name,
    blurb: a.blurb,
    price_cents: a.priceCents,
    active: a.active,
    sort: a.sort,
    ...(hasHourlyCols ? { extra_hour_cents: a.extraHourCents, photo_url: a.photoUrl } : {}),
    ...(hasIncludedHours ? { included_hours: a.includedHours } : {}),
  }).eq('id', a.id))
  if (ok) emit(ADDONS_EVENT)
  return ok
}

export async function addAddon(a: Omit<AddonConfig, 'sort' | 'extraHourCents' | 'photoUrl' | 'includedHours'>): Promise<boolean> {
  const org = await orgId()
  const sort = cache.reduce((n, x) => Math.max(n, x.sort), 0) + 1
  const ok = await tryWrite(() => supabase().from('addons').insert({
    id: a.id,
    org_id: org,
    name: a.name,
    blurb: a.blurb,
    price_cents: a.priceCents,
    active: a.active,
    sort,
  }))
  if (ok) emit(ADDONS_EVENT)
  return ok
}

export async function deleteAddon(id: string): Promise<boolean> {
  const { error } = await supabase().from('addons').delete().eq('id', id)
  if (error) {
    console.error('[addons]', error.message)
    return false
  }
  emit(ADDONS_EVENT)
  return true
}

// Upload an add-on photo into the public room-photos bucket (addons/
// prefix) and return its URL. Null on failure — bucket missing (0005),
// not staff, or file too large.
export async function uploadAddonPhoto(addonId: string, file: File): Promise<string | null> {
  if (file.size > 5 * 1024 * 1024) return null
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg'
  const path = `addons/${addonId}/${Date.now()}.${ext}`
  const { error } = await supabase().storage.from('room-photos').upload(path, file, {
    cacheControl: '3600',
    contentType: file.type || 'image/jpeg',
    upsert: true,
  })
  if (error) {
    console.error('[addons]', error.message)
    return null
  }
  return supabase().storage.from('room-photos').getPublicUrl(path).data.publicUrl
}

export function addonSlug(name: string, taken: Set<string>): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'addon'
  let slug = base
  let n = 2
  while (taken.has(slug)) slug = `${base}-${n++}`
  return slug
}
