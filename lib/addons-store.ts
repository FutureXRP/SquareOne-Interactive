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
  priceCents: number // first hour — or the one-off price when extraHourCents is null
  extraHourCents: number | null // per additional hour; null = charged once
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
    extraHourCents: r.extra_hour_cents ?? null,
    photoUrl: r.photo_url ?? null,
    active: r.active,
    sort: r.sort,
  }
}

const BASE_COLS = 'id, name, blurb, price_cents, active, sort'
// extra_hour_cents / photo_url arrive with migration 0021 — retry without.
const COL_SETS = [`extra_hour_cents, photo_url, ${BASE_COLS}`, BASE_COLS]

let cache: AddonConfig[] = []
let hasHourlyCols = false // whether 0021 columns exist, learned from the read

export async function getAddons(): Promise<AddonConfig[]> {
  if (!isSupabaseConfigured()) return []
  for (const cols of COL_SETS) {
    const { data, error } = await supabase().from('addons').select(cols).order('sort')
    if (!error) {
      hasHourlyCols = cols !== BASE_COLS
      cache = (data as unknown as Row[]).map(fromRow)
      return cache
    }
  }
  return [] // table arrives with migration 0016
}

export async function getActiveAddons(): Promise<AddonConfig[]> {
  return (await getAddons()).filter((a) => a.active)
}

export function addonLookup(id: string): AddonConfig | null {
  return cache.find((a) => a.id === id) ?? null
}

// What this add-on costs for a rental of the given length.
export function addonPriceCents(a: AddonConfig, hours: number): number {
  if (a.extraHourCents === null) return a.priceCents // one flat charge
  return a.priceCents + a.extraHourCents * Math.max(0, hours - 1)
}

// "one-off" or "first hour, then $25/hr" — for chips and admin lists.
export function addonPriceLabel(a: AddonConfig): string {
  if (a.extraHourCents === null) return formatCents(a.priceCents)
  return `${formatCents(a.priceCents)} first hour, then ${formatCents(a.extraHourCents)}/hr`
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
  }).eq('id', a.id))
  if (ok) emit(ADDONS_EVENT)
  return ok
}

export async function addAddon(a: Omit<AddonConfig, 'sort' | 'extraHourCents' | 'photoUrl'>): Promise<boolean> {
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
