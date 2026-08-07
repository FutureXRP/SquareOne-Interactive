'use client'
// Event packages — live from Supabase. Money is integer cents.

import { supabase, tryWrite, emit } from '@/lib/supabase'

export const PACKAGES_EVENT = 'sq-packages'

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
  sort: number
}

interface PackageRow {
  id: string
  name: string
  blurb: string
  price_cents: number
  hours: number
  capacity_label: string
  featured: boolean
  active: boolean
  sort: number
  event_package_rooms: { facility_id: string }[]
  event_package_items: { label: string; sort: number }[]
}

function fromRow(r: PackageRow): EventPackage {
  return {
    id: r.id,
    name: r.name,
    blurb: r.blurb,
    priceCents: r.price_cents,
    hours: r.hours,
    capacity: r.capacity_label,
    featured: r.featured,
    active: r.active,
    sort: r.sort,
    roomIds: r.event_package_rooms.map((x) => x.facility_id),
    includes: [...r.event_package_items].sort((a, b) => a.sort - b.sort).map((x) => x.label),
  }
}

const SELECT = 'id, name, blurb, price_cents, hours, capacity_label, featured, active, sort, event_package_rooms(facility_id), event_package_items(label, sort)'

let cache: EventPackage[] = []

export async function getPackages(): Promise<EventPackage[]> {
  const { data, error } = await supabase().from('event_packages').select(SELECT).order('sort')
  if (error) throw error
  cache = (data as PackageRow[]).map(fromRow)
  return cache
}

export async function getActivePackages(): Promise<EventPackage[]> {
  return (await getPackages()).filter((p) => p.active)
}

export async function savePackage(p: EventPackage): Promise<boolean> {
  const sb = supabase()
  const ok = await tryWrite(() => sb.from('event_packages').update({
    name: p.name,
    blurb: p.blurb,
    price_cents: p.priceCents,
    hours: p.hours,
    capacity_label: p.capacity,
    featured: p.featured,
    active: p.active,
    sort: p.sort,
  }).eq('id', p.id))
  if (!ok) return false
  await tryWrite(() => sb.from('event_package_rooms').delete().eq('package_id', p.id))
  if (p.roomIds.length > 0) {
    await tryWrite(() => sb.from('event_package_rooms').insert(p.roomIds.map((rid) => ({ package_id: p.id, facility_id: rid }))))
  }
  await tryWrite(() => sb.from('event_package_items').delete().eq('package_id', p.id))
  if (p.includes.length > 0) {
    await tryWrite(() => sb.from('event_package_items').insert(p.includes.map((label, i) => ({ package_id: p.id, label, sort: i }))))
  }
  emit(PACKAGES_EVENT)
  return true
}

export async function addPackage(p: Omit<EventPackage, 'sort'>): Promise<boolean> {
  const { data: org } = await supabase().from('organizations').select('id').limit(1).single()
  const sort = cache.reduce((n, x) => Math.max(n, x.sort), 0) + 1
  const ok = await tryWrite(() => supabase().from('event_packages').insert({
    id: p.id,
    org_id: (org as { id: string }).id,
    name: p.name,
    blurb: p.blurb,
    price_cents: p.priceCents,
    hours: p.hours,
    capacity_label: p.capacity,
    featured: p.featured,
    active: p.active,
    sort,
  }))
  if (ok) emit(PACKAGES_EVENT)
  return ok
}

export async function deletePackage(id: string): Promise<boolean> {
  const ok = await tryWrite(() => supabase().from('event_packages').delete().eq('id', id))
  if (ok) emit(PACKAGES_EVENT)
  return ok
}
