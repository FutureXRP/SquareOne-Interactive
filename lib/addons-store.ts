'use client'
// Rental add-ons (inflatable, photo booth, …) — live from Supabase. The
// Add Ons tab edits the catalog; each room offers a subset; the booking
// flow adds the flat price of picked add-ons to the rental total.

import { supabase, tryWrite, emit, isSupabaseConfigured } from '@/lib/supabase'

export const ADDONS_EVENT = 'sq-addons'

export interface AddonConfig {
  id: string
  name: string
  blurb: string
  priceCents: number
  active: boolean
  sort: number
}

interface Row {
  id: string
  name: string
  blurb: string
  price_cents: number
  active: boolean
  sort: number
}

function fromRow(r: Row): AddonConfig {
  return { id: r.id, name: r.name, blurb: r.blurb, priceCents: r.price_cents, active: r.active, sort: r.sort }
}

let cache: AddonConfig[] = []

export async function getAddons(): Promise<AddonConfig[]> {
  if (!isSupabaseConfigured()) return []
  const { data, error } = await supabase()
    .from('addons')
    .select('id, name, blurb, price_cents, active, sort')
    .order('sort')
  if (error) return [] // table arrives with migration 0016
  cache = (data as Row[]).map(fromRow)
  return cache
}

export async function getActiveAddons(): Promise<AddonConfig[]> {
  return (await getAddons()).filter((a) => a.active)
}

export function addonLookup(id: string): AddonConfig | null {
  return cache.find((a) => a.id === id) ?? null
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
  }).eq('id', a.id))
  if (ok) emit(ADDONS_EVENT)
  return ok
}

export async function addAddon(a: Omit<AddonConfig, 'sort'>): Promise<boolean> {
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

export function addonSlug(name: string, taken: Set<string>): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'addon'
  let slug = base
  let n = 2
  while (taken.has(slug)) slug = `${base}-${n++}`
  return slug
}
