'use client'
// Editable fitness membership plans — the store's plan cards, signup flow,
// and member portal all read from here. Money is integer cents.

import { createLocalStore } from '@/lib/local-store'
import { PLANS as DEFAULT_PLANS, type Plan } from '@/lib/store-data'

export interface EditablePlan extends Plan {
  active: boolean
}

const store = createLocalStore<EditablePlan[]>('sq-plans-v1', () =>
  DEFAULT_PLANS.map((p) => ({ ...p, features: [...p.features], active: true }))
)

export const PLANS_EVENT = store.event

export function getPlans(): EditablePlan[] {
  return store.get()
}

export function getActivePlans(): EditablePlan[] {
  return store.get().filter((p) => p.active)
}

export function getPlan(id: string): EditablePlan | null {
  return store.get().find((p) => p.id === id) ?? null
}

export function savePlans(plans: EditablePlan[]) {
  store.save(plans)
}

export function resetPlans() {
  store.reset()
}
