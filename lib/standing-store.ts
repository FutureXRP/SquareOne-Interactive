'use client'
// Standing reservations — the groups that use the building on a schedule.
// Each one writes its occurrences into the booking book as real bookings,
// so the calendar's no-overlap rule guards them like anything else. Nothing
// downstream has to know a recurrence exists.

import { supabase, emit } from '@/lib/supabase'

export const STANDING_EVENT = 'sq-standing'

export type StandingPattern = 'weekly' | 'monthly'

export interface StandingReservation {
  id: string
  facilityId: string
  title: string
  groupName: string
  contactEmail: string | null
  pattern: StandingPattern
  days: number[]            // 0=Sunday … 6=Saturday
  weekInterval: number      // weekly: every Nth week
  monthlyNths: number[]     // monthly: 1,2,3,4 and -1 for "last"
  startH: number
  hours: number
  startsOn: string          // YYYY-MM-DD
  endsOn: string | null
  priceCents: number
  active: boolean
}

interface Row {
  id: string
  facility_id: string
  title: string
  group_name: string
  contact_email: string | null
  pattern: StandingPattern
  days: number[] | null
  week_interval: number
  monthly_nths: number[] | null
  start_h: number | string
  hours: number | string
  starts_on: string
  ends_on: string | null
  price_cents: number
  active: boolean
}

const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const NTH_LABEL: Record<number, string> = { 1: '1st', 2: '2nd', 3: '3rd', 4: '4th', [-1]: 'last' }

// "Tue & Thu, every week" / "1st & 3rd Wed of the month"
export function patternLabel(r: StandingReservation): string {
  const days = [...r.days].sort((a, b) => a - b).map((d) => DAY_SHORT[d]).join(' & ') || 'no days picked'
  if (r.pattern === 'weekly') {
    return r.weekInterval > 1 ? `${days}, every ${r.weekInterval} weeks` : `${days}, every week`
  }
  const nths = [...r.monthlyNths].sort((a, b) => (a === -1 ? 9 : a) - (b === -1 ? 9 : b))
    .map((n) => NTH_LABEL[n] ?? `${n}th`).join(' & ')
  return `${nths || 'no weeks picked'} ${days} of the month`
}

function fromRow(r: Row): StandingReservation {
  return {
    id: r.id,
    facilityId: r.facility_id,
    title: r.title,
    groupName: r.group_name ?? '',
    contactEmail: r.contact_email ?? null,
    pattern: r.pattern ?? 'weekly',
    days: r.days ?? [],
    weekInterval: r.week_interval ?? 1,
    monthlyNths: r.monthly_nths ?? [],
    startH: Number(r.start_h),
    hours: Number(r.hours),
    startsOn: r.starts_on,
    endsOn: r.ends_on,
    priceCents: r.price_cents ?? 0,
    active: r.active,
  }
}

// Returns null when migration 0035 hasn't run, so the page can say so
// instead of looking broken.
export async function getStandingReservations(): Promise<StandingReservation[] | null> {
  const { data, error } = await supabase()
    .from('standing_reservations')
    .select('id, facility_id, title, group_name, contact_email, pattern, days, week_interval, monthly_nths, start_h, hours, starts_on, ends_on, price_cents, active')
    .order('created_at')
  if (error) return null
  return (data as Row[]).map(fromRow)
}

export async function addStandingReservation(r: {
  facilityId: string; title: string; groupName: string; contactEmail?: string
  pattern: StandingPattern; days: number[]; weekInterval: number; monthlyNths: number[]
  startH: number; hours: number; startsOn: string; endsOn?: string | null; priceCents: number
}): Promise<string | null> {
  const sb = supabase()
  const { data: org } = await sb.from('organizations').select('id').limit(1).single()
  const { data, error } = await sb.from('standing_reservations').insert({
    org_id: (org as { id: string }).id,
    facility_id: r.facilityId,
    title: r.title,
    group_name: r.groupName,
    contact_email: r.contactEmail?.trim() || null,
    pattern: r.pattern,
    days: r.days,
    week_interval: r.weekInterval,
    monthly_nths: r.monthlyNths,
    start_h: r.startH,
    hours: r.hours,
    starts_on: r.startsOn,
    ends_on: r.endsOn || null,
    price_cents: r.priceCents,
  }).select('id').single()
  if (error) {
    console.error('[standing]', error.message)
    return null
  }
  emit(STANDING_EVENT)
  return (data as { id: string }).id
}

export async function patchStandingReservation(id: string, p: Partial<{
  title: string; groupName: string; contactEmail: string | null
  pattern: StandingPattern; days: number[]; weekInterval: number; monthlyNths: number[]
  startH: number; hours: number; startsOn: string; endsOn: string | null
  priceCents: number; active: boolean
}>): Promise<boolean> {
  const { error } = await supabase().from('standing_reservations').update({
    ...(p.title !== undefined ? { title: p.title } : {}),
    ...(p.groupName !== undefined ? { group_name: p.groupName } : {}),
    ...(p.contactEmail !== undefined ? { contact_email: p.contactEmail } : {}),
    ...(p.pattern !== undefined ? { pattern: p.pattern } : {}),
    ...(p.days !== undefined ? { days: p.days } : {}),
    ...(p.weekInterval !== undefined ? { week_interval: p.weekInterval } : {}),
    ...(p.monthlyNths !== undefined ? { monthly_nths: p.monthlyNths } : {}),
    ...(p.startH !== undefined ? { start_h: p.startH } : {}),
    ...(p.hours !== undefined ? { hours: p.hours } : {}),
    ...(p.startsOn !== undefined ? { starts_on: p.startsOn } : {}),
    ...(p.endsOn !== undefined ? { ends_on: p.endsOn } : {}),
    ...(p.priceCents !== undefined ? { price_cents: p.priceCents } : {}),
    ...(p.active !== undefined ? { active: p.active } : {}),
  }).eq('id', id)
  if (error) {
    console.error('[standing]', error.message)
    return false
  }
  emit(STANDING_EVENT)
  return true
}

// Deletes the rule and every future occurrence it put on the calendar.
// Past dates stay — they're the record of who was in the building.
export async function deleteStandingReservation(id: string): Promise<boolean> {
  await clearStanding(id)
  const { error } = await supabase().from('standing_reservations').delete().eq('id', id)
  if (error) {
    console.error('[standing]', error.message)
    return false
  }
  emit(STANDING_EVENT)
  return true
}

export interface ExtendResult {
  created: number
  blocked: number
  blockedOn: string[]
}

// Books every occurrence through a date. Occurrences that collide with a
// booking someone already has come back as `blockedOn` — the calendar
// decides, we just report what it wouldn't allow.
export async function extendStanding(id: string, through: string): Promise<ExtendResult | null> {
  const { data, error } = await supabase().rpc('extend_standing_reservation', { p_id: id, p_through: through })
  if (error) {
    console.error('[standing]', error.message)
    return null
  }
  const row = (data as { created: number; blocked: number; blocked_on: string[] | null }[] | null)?.[0]
  emit(STANDING_EVENT)
  return {
    created: row?.created ?? 0,
    blocked: row?.blocked ?? 0,
    blockedOn: row?.blocked_on ?? [],
  }
}

// Takes future occurrences back off the calendar without deleting the rule.
export async function clearStanding(id: string, from?: string): Promise<number> {
  const { data, error } = await supabase().rpc('clear_standing_reservation', {
    p_id: id, p_from: from ?? null,
  })
  if (error) {
    console.error('[standing]', error.message)
    return 0
  }
  emit(STANDING_EVENT)
  return (data as number) ?? 0
}

// The dates a reservation would land on — used to preview a schedule
// before anything is written.
export async function previewStanding(id: string, from: string, through: string): Promise<string[]> {
  const { data, error } = await supabase().rpc('standing_dates', { p_id: id, p_from: from, p_through: through })
  if (error) return []
  // Postgres hands back either bare dates or {standing_dates: date} rows.
  return (data as (string | { standing_dates: string })[]).map((d) => (typeof d === 'string' ? d : d.standing_dates))
}
