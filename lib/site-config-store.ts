'use client'
// Site basics (hours, address, phone) — live from Supabase. Hours are stored
// as integer minutes after midnight; the app works in decimal hours.

import { supabase, tryWrite, emit } from '@/lib/supabase'

export const SITE_CONFIG_EVENT = 'sq-site-config'

export interface SiteConfig {
  address: string
  phone: string
  weekdayLabel: string
  weekdayOpenH: number
  weekdayCloseH: number
  sundayLabel: string
  sundayOpenH: number
  sundayCloseH: number
}

interface Row {
  org_id: string
  address: string
  phone: string
  weekday_label: string
  weekday_open_min: number
  weekday_close_min: number
  sunday_label: string
  sunday_open_min: number
  sunday_close_min: number
}

const FALLBACK: SiteConfig = {
  address: '5323 S 65th W Ave, Tulsa, OK 74107',
  phone: '',
  weekdayLabel: 'Mon – Sat',
  weekdayOpenH: 5.5,
  weekdayCloseH: 22,
  sundayLabel: 'Sunday',
  sundayOpenH: 13,
  sundayCloseH: 22,
}

let orgIdCache: string | null = null

export async function getSiteConfig(): Promise<SiteConfig> {
  const { data, error } = await supabase().from('site_config').select('*').limit(1).maybeSingle()
  if (error) throw error
  if (!data) return FALLBACK
  const r = data as Row
  orgIdCache = r.org_id
  return {
    address: r.address,
    phone: r.phone,
    weekdayLabel: r.weekday_label,
    weekdayOpenH: r.weekday_open_min / 60,
    weekdayCloseH: r.weekday_close_min / 60,
    sundayLabel: r.sunday_label,
    sundayOpenH: r.sunday_open_min / 60,
    sundayCloseH: r.sunday_close_min / 60,
  }
}

export async function saveSiteConfig(cfg: SiteConfig): Promise<boolean> {
  if (!orgIdCache) await getSiteConfig()
  if (!orgIdCache) return false
  const ok = await tryWrite(() => supabase().from('site_config').update({
    address: cfg.address,
    phone: cfg.phone,
    weekday_label: cfg.weekdayLabel,
    weekday_open_min: Math.round(cfg.weekdayOpenH * 60),
    weekday_close_min: Math.round(cfg.weekdayCloseH * 60),
    sunday_label: cfg.sundayLabel,
    sunday_open_min: Math.round(cfg.sundayOpenH * 60),
    sunday_close_min: Math.round(cfg.sundayCloseH * 60),
  }).eq('org_id', orgIdCache))
  if (ok) emit(SITE_CONFIG_EVENT)
  return ok
}
