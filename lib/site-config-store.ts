'use client'
// Editable site basics — hours, address, contact. The store footer and the
// booking flow's slot windows read from here.

import { createLocalStore } from '@/lib/local-store'

export interface SiteConfig {
  address: string
  phone: string
  weekdayLabel: string
  weekdayOpenH: number // decimal hour
  weekdayCloseH: number
  sundayLabel: string
  sundayOpenH: number
  sundayCloseH: number
}

const store = createLocalStore<SiteConfig>('sq-site-config-v1', () => ({
  address: '5323 S 65th W Ave, Tulsa, OK 74107',
  phone: '(918) 555-0142',
  weekdayLabel: 'Mon – Sat',
  weekdayOpenH: 5.5,
  weekdayCloseH: 22,
  sundayLabel: 'Sunday',
  sundayOpenH: 13,
  sundayCloseH: 22,
}))

export const SITE_CONFIG_EVENT = store.event

export function getSiteConfig(): SiteConfig {
  return store.get()
}

export function saveSiteConfig(config: SiteConfig) {
  store.save(config)
}

export function resetSiteConfig() {
  store.reset()
}
