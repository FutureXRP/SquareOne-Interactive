'use client'
// Shared factory for the demo persistence layer: every admin-editable catalog
// (rooms, plans, coupons, clients, programs, forms, site config) is a
// localStorage-backed store with a change event, seeded from defaults.
// Swapping these for Supabase later means reimplementing this one file's
// contract server-side — the UIs don't change.

export interface LocalStore<T> {
  get: () => T
  save: (value: T) => void
  reset: () => void
  event: string
}

export function createLocalStore<T>(key: string, seed: () => T): LocalStore<T> {
  const event = `${key}-change`
  return {
    event,
    get(): T {
      if (typeof window === 'undefined') return seed()
      try {
        const raw = window.localStorage.getItem(key)
        if (raw == null) return seed()
        return JSON.parse(raw) as T
      } catch {
        return seed()
      }
    },
    save(value: T) {
      window.localStorage.setItem(key, JSON.stringify(value))
      window.dispatchEvent(new Event(event))
    },
    reset() {
      window.localStorage.removeItem(key)
      window.dispatchEvent(new Event(event))
    },
  }
}
