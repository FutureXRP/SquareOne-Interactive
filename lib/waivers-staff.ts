'use client'
// Which waivers a booking still owes — the desk's view, read under staff
// access. The same rules the pay link enforces (lib/waiver-forms.ts), so
// the warning staff see is exactly what stops a customer paying online.

import { supabase, isSupabaseConfigured } from '@/lib/supabase'
import {
  FORM_COL_SETS, rentalWaiversForRooms, waiverCovered,
  type FormRow, type RequiredWaiver, type WaiverSignature,
} from '@/lib/waiver-forms'

export async function bookingWaiversDue(b: { id: string; roomId: string; accountId: string | null; createdAt?: string | null; extraRoomIds?: string[] }): Promise<RequiredWaiver[]> {
  if (!isSupabaseConfigured()) return []
  const sb = supabase()
  let rows: FormRow[] | null = null
  for (const cols of FORM_COL_SETS) {
    let q = sb.from('forms').select(cols).eq('status', 'active')
    if (cols.includes('assign_to')) q = q.eq('assign_to', 'rentals')
    const { data, error } = await q.order('id')
    if (!error) { rows = data as unknown as FormRow[]; break }
  }
  // The rooms it spans: its own plus any companions linked to it (0055).
  const rooms = new Set([b.roomId, ...(b.extraRoomIds ?? [])])
  const comps = await sb.from('bookings').select('facility_id').eq('lead_booking_id', b.id)
  if (!comps.error) for (const c of (comps.data ?? []) as { facility_id: string }[]) rooms.add(c.facility_id)
  const required = rentalWaiversForRooms(rows ?? [], [...rooms])
  if (required.length === 0) return []
  const ids = required.map((w) => w.id)
  const sigs: WaiverSignature[] = []
  const byBooking = await sb.from('form_submissions').select('form_id, account_id, booking_id, signed_at').in('form_id', ids).eq('booking_id', b.id)
  if (!byBooking.error) sigs.push(...(byBooking.data as WaiverSignature[]))
  else if (!b.accountId) return [] // pre-0054: a desk guest's signature can't be tracked yet
  if (b.accountId) {
    const byAccount = await sb.from('form_submissions').select('form_id, account_id, signed_at').in('form_id', ids).eq('account_id', b.accountId)
    if (!byAccount.error) sigs.push(...(byAccount.data as unknown as WaiverSignature[]))
  }
  return required.filter((w) => !waiverCovered(w, sigs, { id: b.id, accountId: b.accountId, createdAt: b.createdAt }))
}
