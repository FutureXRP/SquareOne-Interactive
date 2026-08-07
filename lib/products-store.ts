'use client'
// Shop merch catalog — live from Supabase. Admin writes upsert; the store,
// home teaser, and cart refetch on the 'sq-products' event. Money is integer
// cents end to end. Falls back to the built-in catalog when Supabase isn't
// configured so local previews still render.

import { supabase, tryWrite, emit, isSupabaseConfigured } from '@/lib/supabase'
import { PRODUCTS as BUILTIN } from '@/lib/store-data'

export const PRODUCTS_EVENT = 'sq-products'

export interface ProductConfig {
  id: string
  name: string
  priceCents: number
  tag: string
  colors: [string, string]
  active: boolean
  sort: number
}

export const PRODUCT_COLORS = [
  '#182740', '#2f6db8', '#64748c', '#e8a13a', '#1d9a8f', '#c2478f', '#8a4bbf', '#cf4436', '#2e8b57', '#e07020',
]

interface ProductRow {
  id: string
  name: string
  price_cents: number
  tag: string | null
  color_a: string
  color_b: string
  active: boolean
  sort: number
}

function fromRow(r: ProductRow): ProductConfig {
  return {
    id: r.id,
    name: r.name,
    priceCents: r.price_cents,
    tag: r.tag ?? '',
    colors: [r.color_a, r.color_b],
    active: r.active,
    sort: r.sort,
  }
}

function builtinAsConfig(): ProductConfig[] {
  return BUILTIN.map((p, i) => ({
    id: p.id, name: p.name, priceCents: p.priceCents, tag: p.tag ?? '',
    colors: [p.colors[0], p.colors[1]] as [string, string], active: true, sort: i,
  }))
}

let cache: ProductConfig[] = []

export async function getProducts(): Promise<ProductConfig[]> {
  if (!isSupabaseConfigured()) { cache = builtinAsConfig(); return cache }
  const { data, error } = await supabase()
    .from('products')
    .select('id, name, price_cents, tag, color_a, color_b, active, sort')
    .order('sort')
  if (error) throw error
  cache = (data as ProductRow[]).map(fromRow)
  return cache
}

export async function getActiveProducts(): Promise<ProductConfig[]> {
  return (await getProducts()).filter((p) => p.active)
}

async function orgId(): Promise<string> {
  const { data, error } = await supabase().from('organizations').select('id').limit(1).single()
  if (error) throw error
  return (data as { id: string }).id
}

export async function saveProduct(p: ProductConfig): Promise<boolean> {
  const ok = await tryWrite(() => supabase().from('products').update({
    name: p.name,
    price_cents: p.priceCents,
    tag: p.tag.trim() || null,
    color_a: p.colors[0],
    color_b: p.colors[1],
    active: p.active,
    sort: p.sort,
  }).eq('id', p.id))
  if (ok) emit(PRODUCTS_EVENT)
  return ok
}

export async function addProduct(p: Omit<ProductConfig, 'sort'>): Promise<boolean> {
  const org = await orgId()
  const sort = cache.reduce((n, x) => Math.max(n, x.sort), 0) + 1
  const ok = await tryWrite(() => supabase().from('products').insert({
    id: p.id,
    org_id: org,
    name: p.name,
    price_cents: p.priceCents,
    tag: p.tag.trim() || null,
    color_a: p.colors[0],
    color_b: p.colors[1],
    active: p.active,
    sort,
  }))
  if (ok) emit(PRODUCTS_EVENT)
  return ok
}

// Nothing else references products yet, so deletes are always hard deletes —
// the 'hidden' arm is here for when orders land and add a FK.
export async function deleteProduct(id: string): Promise<'deleted' | 'hidden' | 'failed'> {
  const { error } = await supabase().from('products').delete().eq('id', id)
  if (!error) {
    emit(PRODUCTS_EVENT)
    return 'deleted'
  }
  if (error.code === '23503') {
    const ok = await tryWrite(() => supabase().from('products').update({ active: false }).eq('id', id))
    if (ok) emit(PRODUCTS_EVENT)
    return ok ? 'hidden' : 'failed'
  }
  console.error('[products]', error.message)
  return 'failed'
}

export function productSlug(name: string, taken: Set<string>): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'product'
  let slug = base
  let n = 2
  while (taken.has(slug)) slug = `${base}-${n++}`
  return slug
}

// Synchronous lookup for cart rows — uses the last fetch's cache, then the
// built-in catalog, so carts render even before the live fetch lands.
export function productLookup(id: string): ProductConfig | null {
  const hit = cache.find((p) => p.id === id)
  if (hit) return hit
  const builtin = builtinAsConfig().find((p) => p.id === id)
  return builtin ?? null
}
