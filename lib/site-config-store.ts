'use client'
// Site basics (hours, address, phone) — live from Supabase. Hours are stored
// as integer minutes after midnight for the legacy two-row columns, and as
// decimal hours in the per-day hours_by_day array (migration 0010). Until
// 0010 runs, the legacy weekday/Sunday pair keeps working everywhere.

import { supabase, tryWrite, emit } from '@/lib/supabase'
import type { DaySchedule } from '@/lib/facilities-store'

export const SITE_CONFIG_EVENT = 'sq-site-config'

export interface Closure {
  date: string // YYYY-MM-DD
  label: string
}

export interface SiteConfig {
  address: string
  phone: string
  weekdayLabel: string
  weekdayOpenH: number
  weekdayCloseH: number
  sundayLabel: string
  sundayOpenH: number
  sundayCloseH: number
  // Per-day hours, Sunday(0)–Saturday(6). undefined = migration 0010 not run.
  hoursByDay?: DaySchedule[]
  closures?: Closure[]
  // Our $cashtag for direct Cash App payments (0040). undefined = not
  // migrated; '' = feature off.
  cashappCashtag?: string
  // Who gets a heads-up email when someone joins the fitness membership.
  // Empty = nobody. Arrives with 0044.
  membershipAlertEmail?: string
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
  hours_by_day?: unknown
  closures?: unknown
  cashapp_cashtag?: string
  membership_alert_email?: string
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

function normalizeHours(v: unknown): DaySchedule[] | undefined {
  if (!Array.isArray(v) || v.length !== 7) return undefined
  return v.map((d) => {
    const day = (d ?? {}) as Partial<DaySchedule>
    return {
      closed: !!day.closed,
      openH: typeof day.openH === 'number' ? day.openH : 8,
      closeH: typeof day.closeH === 'number' ? day.closeH : 22,
    }
  })
}

function normalizeClosures(v: unknown): Closure[] {
  if (!Array.isArray(v)) return []
  return v
    .filter((c): c is Closure => !!c && typeof (c as Closure).date === 'string')
    .map((c) => ({ date: c.date, label: typeof c.label === 'string' ? c.label : '' }))
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
    hoursByDay: 'hours_by_day' in r ? normalizeHours(r.hours_by_day) : undefined,
    closures: 'closures' in r ? normalizeClosures(r.closures) : undefined,
    cashappCashtag: 'cashapp_cashtag' in r ? (r.cashapp_cashtag ?? '') : undefined,
    membershipAlertEmail: 'membership_alert_email' in r ? (r.membership_alert_email ?? '') : undefined,
  }
}

export async function saveSiteConfig(cfg: SiteConfig): Promise<boolean> {
  if (!orgIdCache) await getSiteConfig()
  if (!orgIdCache) return false
  // Keep the legacy weekday/Sunday columns in sync with the per-day hours so
  // anything still reading them (older clients) shows sensible values.
  const monday = cfg.hoursByDay?.[1]
  const sunday = cfg.hoursByDay?.[0]
  const ok = await tryWrite(() => supabase().from('site_config').update({
    address: cfg.address,
    phone: cfg.phone,
    weekday_label: cfg.weekdayLabel,
    weekday_open_min: Math.round((monday?.openH ?? cfg.weekdayOpenH) * 60),
    weekday_close_min: Math.round((monday?.closeH ?? cfg.weekdayCloseH) * 60),
    sunday_label: cfg.sundayLabel,
    sunday_open_min: Math.round((sunday?.openH ?? cfg.sundayOpenH) * 60),
    sunday_close_min: Math.round((sunday?.closeH ?? cfg.sundayCloseH) * 60),
    ...(cfg.hoursByDay !== undefined ? { hours_by_day: cfg.hoursByDay } : {}),
    ...(cfg.closures !== undefined ? { closures: cfg.closures } : {}),
    ...(cfg.cashappCashtag !== undefined ? { cashapp_cashtag: cfg.cashappCashtag.replace(/^\$/, '').trim() } : {}),
    ...(cfg.membershipAlertEmail !== undefined ? { membership_alert_email: cfg.membershipAlertEmail.trim() } : {}),
  }).eq('org_id', orgIdCache))
  if (ok) emit(SITE_CONFIG_EVENT)
  return ok
}

// The business hours for a weekday (0=Sunday), preferring the per-day
// schedule and falling back to the legacy weekday/Sunday pair.
export function siteDayHours(cfg: SiteConfig, weekday: number): { closed: boolean; openH: number; closeH: number } {
  const day = cfg.hoursByDay?.[weekday]
  if (day) return { closed: day.closed, openH: day.openH, closeH: day.closeH }
  return weekday === 0
    ? { closed: false, openH: cfg.sundayOpenH, closeH: cfg.sundayCloseH }
    : { closed: false, openH: cfg.weekdayOpenH, closeH: cfg.weekdayCloseH }
}

// The holiday closure covering an ISO date, if any.
export function closureFor(cfg: SiteConfig, isoDate: string): Closure | null {
  return cfg.closures?.find((c) => c.date === isoDate) ?? null
}
