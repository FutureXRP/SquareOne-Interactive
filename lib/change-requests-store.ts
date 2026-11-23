'use client'
// Customer change requests waiting on an owner, admin, or manager (0057).
// Approving applies the change in the database in one step — and refuses
// it if a room or extra has been taken since; either answer emails the
// customer.

import { supabase, isSupabaseConfigured, emit } from '@/lib/supabase'
import { notify } from '@/lib/notify-client'
import { BOOKINGS_EVENT } from '@/lib/staff-bookings-store'

export const CHANGE_REQUESTS_EVENT = 'sq-change-requests'

export interface ChangeRequest {
  id: string
  bookingId: string
  createdAt: string
  source: 'reschedule' | 'agreement'
  oldDuring: string | null
  newDuring: string | null
  oldRoomIds: string[] | null
  newRoomIds: string[] | null
  oldAddonIds: string[] | null
  newAddonIds: string[] | null
  // Rooms already taken at the time asked for — approving would be refused.
  conflicts: string[]
}

// Null before 0057 runs.
export async function getPendingChangeRequests(): Promise<ChangeRequest[] | null> {
  if (!isSupabaseConfigured()) return null
  const sb = supabase()
  const { data, error } = await sb.from('booking_change_requests')
    .select('id, booking_id, created_at, source, old_during, new_during, old_room_ids, new_room_ids, old_addon_ids, new_addon_ids')
    .eq('status', 'pending')
    .order('created_at')
  if (error) return null
  const rows = (data ?? []) as {
    id: string; booking_id: string; created_at: string; source: ChangeRequest['source']
    old_during: string | null; new_during: string | null
    old_room_ids: string[] | null; new_room_ids: string[] | null
    old_addon_ids: string[] | null; new_addon_ids: string[] | null
  }[]
  return Promise.all(rows.map(async (r) => {
    const during = r.new_during ?? r.old_during
    const rooms = r.new_room_ids ?? r.old_room_ids
    let conflicts: string[] = []
    if (during && rooms && rooms.length > 0) {
      const res = await sb.rpc('booking_group_conflicts', { p_booking: r.booking_id, p_during: during, p_rooms: rooms })
      if (!res.error) conflicts = (res.data as string[] | null) ?? []
    }
    return {
      id: r.id, bookingId: r.booking_id, createdAt: r.created_at, source: r.source,
      oldDuring: r.old_during, newDuring: r.new_during,
      oldRoomIds: r.old_room_ids, newRoomIds: r.new_room_ids,
      oldAddonIds: r.old_addon_ids, newAddonIds: r.new_addon_ids,
      conflicts,
    }
  }))
}

// One request, whatever its state — for the page an email's Approve /
// Decline button opens.
export interface ChangeRequestDetail extends ChangeRequest {
  status: 'pending' | 'approved' | 'declined' | 'withdrawn'
  decidedAt: string | null
  decisionNote: string | null
  booking: { code: string; clientName: string; title: string; during: string; facilityId: string; status: string; priceCents: number } | null
}

export async function getChangeRequest(id: string): Promise<ChangeRequestDetail | null> {
  if (!isSupabaseConfigured()) return null
  const sb = supabase()
  const { data, error } = await sb.from('booking_change_requests')
    .select('id, booking_id, created_at, source, status, decided_at, decision_note, old_during, new_during, old_room_ids, new_room_ids, old_addon_ids, new_addon_ids, bookings:booking_id(code, client_name, title, during, facility_id, status, price_cents)')
    .eq('id', id).maybeSingle()
  if (error || !data) return null
  const r = data as unknown as {
    id: string; booking_id: string; created_at: string; source: ChangeRequest['source']
    status: ChangeRequestDetail['status']; decided_at: string | null; decision_note: string | null
    old_during: string | null; new_during: string | null
    old_room_ids: string[] | null; new_room_ids: string[] | null
    old_addon_ids: string[] | null; new_addon_ids: string[] | null
    bookings: { code: string; client_name: string; title: string; during: string; facility_id: string; status: string; price_cents: number } | null
  }
  let conflicts: string[] = []
  const during = r.new_during ?? r.old_during
  const rooms = r.new_room_ids ?? r.old_room_ids
  if (r.status === 'pending' && during && rooms && rooms.length > 0) {
    const res = await sb.rpc('booking_group_conflicts', { p_booking: r.booking_id, p_during: during, p_rooms: rooms })
    if (!res.error) conflicts = (res.data as string[] | null) ?? []
  }
  return {
    id: r.id, bookingId: r.booking_id, createdAt: r.created_at, source: r.source,
    oldDuring: r.old_during, newDuring: r.new_during,
    oldRoomIds: r.old_room_ids, newRoomIds: r.new_room_ids,
    oldAddonIds: r.old_addon_ids, newAddonIds: r.new_addon_ids,
    conflicts,
    status: r.status, decidedAt: r.decided_at, decisionNote: r.decision_note,
    booking: r.bookings ? {
      code: r.bookings.code, clientName: r.bookings.client_name, title: r.bookings.title,
      during: r.bookings.during, facilityId: r.bookings.facility_id, status: r.bookings.status, priceCents: r.bookings.price_cents,
    } : null,
  }
}

export async function decideChangeRequest(id: string, approve: boolean, note: string):
  Promise<{ ok: true } | { ok: false; message: string }> {
  const { error } = await supabase().rpc(approve ? 'approve_booking_change' : 'decline_booking_change', {
    p_request: id, p_note: note.trim() || null,
  })
  if (error) {
    const message = error.code === '23P01'
      ? 'A room or extra in this request is already booked at that time, so nothing was changed. Decline it with a note, or call the customer.'
      : error.code === '42501'
        ? 'Only an owner, admin, or manager can answer change requests.'
        : error.message
    return { ok: false, message }
  }
  emit(BOOKINGS_EVENT)
  emit(CHANGE_REQUESTS_EVENT)
  notify('booking.change_decided', id) // the customer's approved/declined email
  return { ok: true }
}
