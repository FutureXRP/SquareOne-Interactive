'use client'
// Editable store wording + nav tabs. Overrides live in site_content
// (migration 0011); every key falls back to the built-in wording below, so
// the store never renders blank and works before the migration runs.

import { supabase, tryWrite, emit, isSupabaseConfigured } from '@/lib/supabase'

export const CONTENT_EVENT = 'sq-content'

export interface TextField {
  key: string
  group: string
  label: string
  def: string
  multiline?: boolean
}

// Every editable string in the store, grouped for the editor.
export const TEXT_FIELDS: TextField[] = [
  { key: 'brand.name', group: 'Header & brand', label: 'Brand name', def: 'SquareOne' },
  { key: 'brand.sub', group: 'Header & brand', label: 'Brand subtitle', def: 'Interactive · Tulsa' },

  { key: 'hero.kicker', group: 'Home hero banner', label: 'Small line above the headline', def: 'Fitness · Play · Community — Tulsa, OK' },
  { key: 'hero.heading', group: 'Home hero banner', label: 'Headline', def: 'One place for your family to move, play, and celebrate.', multiline: true },
  { key: 'hero.cta1', group: 'Home hero banner', label: 'First button', def: 'Become a member' },
  { key: 'hero.cta2', group: 'Home hero banner', label: 'Second button', def: 'Rent a room' },

  { key: 'tile1.title', group: 'Home quick tiles', label: 'Tile 1 title', def: 'Rent a room' },
  { key: 'tile1.sub', group: 'Home quick tiles', label: 'Tile 1 subtitle', def: 'Gym, party rooms & more — book online' },
  { key: 'tile2.title', group: 'Home quick tiles', label: 'Tile 2 title', def: 'Join the gym' },
  { key: 'tile2.sub', group: 'Home quick tiles', label: 'Tile 2 subtitle', def: 'Monthly plans · cancel anytime' },
  { key: 'tile3.title', group: 'Home quick tiles', label: 'Tile 3 title', def: 'Shop merch' },
  { key: 'tile3.sub', group: 'Home quick tiles', label: 'Tile 3 subtitle', def: 'Tees, hoodies & more' },
  { key: 'tile4.title', group: 'Home quick tiles', label: 'Tile 4 title', def: 'Book a party' },
  { key: 'tile4.sub', group: 'Home quick tiles', label: 'Tile 4 subtitle', def: 'Arcade party packages with a host' },

  { key: 'home.section.plans', group: 'Home sections', label: 'Memberships section label', def: 'Fitness memberships' },
  { key: 'home.section.rooms', group: 'Home sections', label: 'Rooms section label', def: 'Rooms & facilities' },
  { key: 'home.section.gear', group: 'Home sections', label: 'Shop section label', def: 'SquareOne gear' },
  { key: 'home.footnote', group: 'Home sections', label: 'Note under the sections', def: 'Members enter any time we’re open with their member code — hours are below.', multiline: true },

  { key: 'facilities.heading', group: 'Rooms page', label: 'Page heading', def: 'Rent a room or facility' },
  { key: 'facilities.sub', group: 'Rooms page', label: 'Intro paragraph', def: 'Pick a space, choose a time, and request your booking online — 1 to 6 hours, at least 48 hours ahead. A hold keeps your slot while you pay the deposit, and members get member pricing automatically.', multiline: true },

  { key: 'memberships.heading', group: 'Memberships page', label: 'Page heading', def: 'Simple fitness memberships, no surprises' },
  { key: 'memberships.sub', group: 'Memberships page', label: 'Intro paragraph', def: 'Month to month, cancel anytime, and every dollar supports SquareOne Compassion’s work in Tulsa.', multiline: true },

  { key: 'shop.heading', group: 'Shop page', label: 'Page heading', def: 'SquareOne gear' },
  { key: 'shop.sub', group: 'Shop page', label: 'Intro paragraph', def: 'Rep the square. Every purchase supports SquareOne Compassion programs. Pick up in person at the front desk — shipping comes later.', multiline: true },

  { key: 'footer.org', group: 'Footer', label: 'Organization name', def: 'SquareOne Interactive' },
  { key: 'footer.tagline', group: 'Footer', label: 'Bottom tagline', def: 'part of SquareOne Compassion · a 501(c)(3)' },
]

const TEXT_DEFAULTS: Record<string, string> = Object.fromEntries(TEXT_FIELDS.map((f) => [f.key, f.def]))

export interface NavItem {
  id: string
  href: string
  label: string
  visible: boolean
  custom?: boolean
}

export const NAV_DEFAULT: NavItem[] = [
  { id: 'facilities', href: '/facilities', label: 'Rent a room', visible: true },
  { id: 'packages', href: '/packages', label: 'Event Packages', visible: true },
  { id: 'memberships', href: '/memberships', label: 'Fitness Memberships', visible: true },
  { id: 'shop', href: '/shop', label: 'Shop', visible: true },
]

const NAV_KEY = '__nav__'

export interface SiteContent {
  text: Record<string, string> // merged: defaults + overrides
  nav: NavItem[]
  available: boolean // false until migration 0011 has been run
}

const DEFAULT_CONTENT: SiteContent = { text: { ...TEXT_DEFAULTS }, nav: NAV_DEFAULT, available: false }

function normalizeNav(v: unknown): NavItem[] {
  if (!Array.isArray(v) || v.length === 0) return NAV_DEFAULT
  return v
    .filter((n): n is NavItem => !!n && typeof (n as NavItem).href === 'string' && typeof (n as NavItem).label === 'string')
    .map((n) => ({ id: n.id ?? n.href, href: n.href, label: n.label, visible: n.visible !== false, custom: !!n.custom }))
}

export async function getSiteContent(): Promise<SiteContent> {
  if (!isSupabaseConfigured()) return DEFAULT_CONTENT
  const { data, error } = await supabase().from('site_content').select('key, value')
  if (error) return DEFAULT_CONTENT // table missing until 0011 runs
  const text = { ...TEXT_DEFAULTS }
  let nav = NAV_DEFAULT
  for (const row of data as { key: string; value: unknown }[]) {
    if (row.key === NAV_KEY) nav = normalizeNav(row.value)
    else if (typeof row.value === 'string' && row.value.trim()) text[row.key] = row.value
  }
  return { text, nav, available: true }
}

async function orgId(): Promise<string | null> {
  const { data, error } = await supabase().from('organizations').select('id').limit(1).single()
  return error ? null : (data as { id: string }).id
}

// Empty value deletes the override so the built-in wording returns.
export async function saveTextKey(key: string, value: string): Promise<boolean> {
  const trimmed = value.trim()
  if (!trimmed || trimmed === TEXT_DEFAULTS[key]) {
    const ok = await tryWrite(() => supabase().from('site_content').delete().eq('key', key))
    if (ok) emit(CONTENT_EVENT)
    return ok
  }
  const org = await orgId()
  if (!org) return false
  const ok = await tryWrite(() => supabase().from('site_content').upsert({ key, org_id: org, value: trimmed }))
  if (ok) emit(CONTENT_EVENT)
  return ok
}

export async function saveNav(nav: NavItem[]): Promise<boolean> {
  const org = await orgId()
  if (!org) return false
  const ok = await tryWrite(() => supabase().from('site_content').upsert({ key: NAV_KEY, org_id: org, value: nav }))
  if (ok) emit(CONTENT_EVENT)
  return ok
}
