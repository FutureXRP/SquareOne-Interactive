'use client'
// A booking's change history (0056) — who moved it, re-roomed it, canceled
// it, or asked for different spaces, and when. Staff-only by RLS.

import { supabase, isSupabaseConfigured } from '@/lib/supabase'

export interface BookingChange {
  id: string
  at: string
  kind: 'moved' | 'room' | 'canceled' | 'spaces_requested'
  actor: 'customer' | 'staff' | 'system'
  oldDuring: string | null
  newDuring: string | null
  oldRoomId: string | null
  newRoomId: string | null
  detail: { booked?: string[]; requested?: string[]; addonsAdded?: string[]; addonsDropped?: string[] } | null
}

// Empty before 0056 runs.
export async function getBookingChanges(bookingId: string): Promise<BookingChange[]> {
  if (!isSupabaseConfigured()) return []
  const { data, error } = await supabase().from('booking_changes')
    .select('id, changed_at, kind, actor, old_during, new_during, old_facility_id, new_facility_id, detail')
    .eq('booking_id', bookingId)
    .order('changed_at', { ascending: false })
    .limit(10)
  if (error) return []
  return (data as {
    id: string; changed_at: string; kind: BookingChange['kind']; actor: BookingChange['actor']
    old_during: string | null; new_during: string | null; old_facility_id: string | null; new_facility_id: string | null
    detail: BookingChange['detail']
  }[]).map((r) => ({
    id: r.id, at: r.changed_at, kind: r.kind, actor: r.actor,
    oldDuring: r.old_during, newDuring: r.new_during, oldRoomId: r.old_facility_id, newRoomId: r.new_facility_id,
    detail: r.detail,
  }))
}

// "Sat, Nov 21, 2 PM – 5 PM" from a Postgres range, in the viewer's time.
export function rangeLabel(range: string | null): string {
  if (!range) return '—'
  const m = /^[[(]"?([^",]+)"?\s*,\s*"?([^")\]]+)"?[)\]]$/.exec(range)
  if (!m) return '—'
  const from = new Date(m[1])
  const to = new Date(m[2])
  const t = (d: Date) => d.toLocaleTimeString('en-US', { hour: 'numeric', minute: d.getMinutes() ? '2-digit' : undefined })
  return `${from.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}, ${t(from)} – ${t(to)}`
}
