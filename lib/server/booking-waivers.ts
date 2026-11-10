import { serviceDb } from '@/lib/server/billing'
import {
  FORM_COL_SETS, rentalWaiversForRoom, waiverCovered,
  type FormRow, type RequiredWaiver, type WaiverSignature,
} from '@/lib/waiver-forms'

// The waivers a booking still owes, read with the service role so the
// pay link works for desk guests with no account. Every payment path —
// the pay link's card and Cash App buttons, and a member paying from their
// account — asks this first: waivers are signed before money moves, never
// at the door.

interface BookingBits { id: string; facility_id: string; account_id: string | null; created_at?: string | null }

async function rentalForms(): Promise<FormRow[]> {
  const db = serviceDb()
  for (const cols of FORM_COL_SETS) {
    let q = db.from('forms').select(cols).eq('status', 'active')
    if (cols.includes('assign_to')) q = q.eq('assign_to', 'rentals')
    const { data, error } = await q.order('id')
    if (!error) return data as unknown as FormRow[]
  }
  return []
}

async function signaturesFor(formIds: string[], b: BookingBits): Promise<{ sigs: WaiverSignature[]; trackable: boolean }> {
  const db = serviceDb()
  const out: WaiverSignature[] = []
  // booking_id on a signature arrives with 0054; before it, only the
  // account behind the booking can carry a signature.
  const byBooking = await db.from('form_submissions').select('form_id, account_id, booking_id, signed_at')
    .in('form_id', formIds).eq('booking_id', b.id)
  if (!byBooking.error) out.push(...(byBooking.data as WaiverSignature[]))
  if (b.account_id) {
    const cols = byBooking.error ? 'form_id, account_id, signed_at' : 'form_id, account_id, booking_id, signed_at'
    const byAccount = await db.from('form_submissions').select(cols)
      .in('form_id', formIds).eq('account_id', b.account_id)
    if (!byAccount.error) out.push(...(byAccount.data as unknown as WaiverSignature[]))
  }
  // A desk guest's signature can only be tied to their booking once 0054
  // adds booking_id — until then there's nothing to check it against.
  return { sigs: out, trackable: !byBooking.error || !!b.account_id }
}

export async function bookingBits(bookingId: string): Promise<BookingBits | null> {
  const { data, error } = await serviceDb().from('bookings')
    .select('id, facility_id, account_id, created_at').eq('id', bookingId).maybeSingle()
  if (error || !data) return null
  return data as BookingBits
}

// Every waiver this booking's room requires that isn't covered yet, in the
// order staff arranged them on the Forms tab. Empty when none apply — and
// on any read failure, since a broken lookup must not strand a customer
// who is trying to pay.
export async function waiversDueForBooking(bookingId: string): Promise<RequiredWaiver[]> {
  try {
    const b = await bookingBits(bookingId)
    if (!b) return []
    const required = rentalWaiversForRoom(await rentalForms(), b.facility_id)
    if (required.length === 0) return []
    const { sigs, trackable } = await signaturesFor(required.map((w) => w.id), b)
    // Never strand someone at the payment step over a signature the
    // database can't record yet.
    if (!trackable) return []
    const booking = { id: b.id, accountId: b.account_id, createdAt: b.created_at }
    return required.filter((w) => !waiverCovered(w, sigs, booking))
  } catch (e) {
    console.error('[booking-waivers]', e)
    return []
  }
}

// What a payment route says when the waivers come first.
export const WAIVER_FIRST_MESSAGE = 'Please sign the waiver for this booking first — it’s just above the payment buttons.'
