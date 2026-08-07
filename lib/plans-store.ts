'use client'
// Fitness membership plans — live from Supabase. Money is integer cents.

import { supabase, tryWrite, emit } from '@/lib/supabase'

export const PLANS_EVENT = 'sq-plans'

export interface EditablePlan {
  id: string
  name: string
  priceCents: number
  period: string
  tagline: string
  features: string[]
  featured: boolean
  active: boolean
  sort: number
}

interface PlanRow {
  id: string
  name: string
  tagline: string
  price_cents: number
  period: string
  featured: boolean
  active: boolean
  sort: number
  membership_plan_features: { label: string; sort: number }[]
}

function fromRow(r: PlanRow): EditablePlan {
  return {
    id: r.id,
    name: r.name,
    tagline: r.tagline,
    priceCents: r.price_cents,
    period: r.period,
    featured: r.featured,
    active: r.active,
    sort: r.sort,
    features: [...r.membership_plan_features].sort((a, b) => a.sort - b.sort).map((f) => f.label),
  }
}

const SELECT = 'id, name, tagline, price_cents, period, featured, active, sort, membership_plan_features(label, sort)'

let cache: EditablePlan[] = []

export async function getPlans(): Promise<EditablePlan[]> {
  const { data, error } = await supabase().from('membership_plans').select(SELECT).order('sort')
  if (error) throw error
  cache = (data as PlanRow[]).map(fromRow)
  return cache
}

export async function getActivePlans(): Promise<EditablePlan[]> {
  return (await getPlans()).filter((p) => p.active)
}

export async function getPlanLive(id: string): Promise<EditablePlan | null> {
  const { data, error } = await supabase().from('membership_plans').select(SELECT).eq('id', id).maybeSingle()
  if (error) throw error
  return data ? fromRow(data as PlanRow) : null
}

// Cache-backed synchronous lookup for render paths that already fetched.
export function getPlan(id: string): EditablePlan | null {
  return cache.find((p) => p.id === id) ?? null
}

export async function savePlan(p: EditablePlan): Promise<boolean> {
  const sb = supabase()
  const ok = await tryWrite(() => sb.from('membership_plans').update({
    name: p.name,
    tagline: p.tagline,
    price_cents: p.priceCents,
    period: p.period,
    featured: p.featured,
    active: p.active,
    sort: p.sort,
  }).eq('id', p.id))
  if (!ok) return false
  await tryWrite(() => sb.from('membership_plan_features').delete().eq('plan_id', p.id))
  if (p.features.length > 0) {
    await tryWrite(() => sb.from('membership_plan_features').insert(p.features.map((label, i) => ({ plan_id: p.id, label, sort: i }))))
  }
  emit(PLANS_EVENT)
  return true
}

export async function addPlan(p: Omit<EditablePlan, 'sort'>): Promise<boolean> {
  const { data: org } = await supabase().from('organizations').select('id').limit(1).single()
  const sort = cache.reduce((n, x) => Math.max(n, x.sort), 0) + 1
  const ok = await tryWrite(() => supabase().from('membership_plans').insert({
    id: p.id,
    org_id: (org as { id: string }).id,
    name: p.name,
    tagline: p.tagline,
    price_cents: p.priceCents,
    period: p.period,
    featured: p.featured,
    active: p.active,
    sort,
  }))
  if (ok) emit(PLANS_EVENT)
  return ok
}

// Delete a plan. If members are subscribed to it, the database blocks the
// delete — we hide it from the store instead.
export async function deletePlan(id: string): Promise<'deleted' | 'hidden' | 'failed'> {
  const { error } = await supabase().from('membership_plans').delete().eq('id', id)
  if (!error) {
    emit(PLANS_EVENT)
    return 'deleted'
  }
  if (error.code === '23503') {
    const { error: e2 } = await supabase().from('membership_plans').update({ active: false }).eq('id', id)
    if (!e2) emit(PLANS_EVENT)
    return e2 ? 'failed' : 'hidden'
  }
  console.error('[plans]', error.message)
  return 'failed'
}
