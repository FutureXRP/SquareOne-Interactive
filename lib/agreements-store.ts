'use client'
// Rental agreements as staff see them — which bookings have a signed
// agreement, the full record for viewing and printing, and the SquareOne
// representative's countersignature. Staff read and write under the
// "staff all rental_agreements" policy (0053); null before it runs.

import { supabase, emit } from '@/lib/supabase'
import type { AgreementAnswers, AgreementSnapshot } from '@/lib/rental-agreement'

export const AGREEMENTS_EVENT = 'sq-agreements'

export interface AgreementStatus {
  signedAt: string
  signature: string
  repName: string | null
}

export interface AgreementRecord extends AgreementStatus {
  bookingId: string
  answers: AgreementAnswers
  snapshot: AgreementSnapshot
  repSignedAt: string | null
}

// booking id → signed status, for the Bookings tab's badges.
export async function getAgreementStatuses(): Promise<Map<string, AgreementStatus> | null> {
  const { data, error } = await supabase()
    .from('rental_agreements')
    .select('booking_id, signed_at, signature, rep_name')
    .limit(5000)
  if (error) return null
  return new Map((data as { booking_id: string; signed_at: string; signature: string; rep_name: string | null }[])
    .map((r) => [r.booking_id, { signedAt: r.signed_at, signature: r.signature, repName: r.rep_name }]))
}

export async function getAgreement(bookingId: string): Promise<AgreementRecord | null> {
  const { data, error } = await supabase()
    .from('rental_agreements')
    .select('booking_id, signed_at, signature, rep_name, rep_signed_at, answers, snapshot')
    .eq('booking_id', bookingId)
    .maybeSingle()
  if (error || !data) return null
  const r = data as {
    booking_id: string; signed_at: string; signature: string; rep_name: string | null; rep_signed_at: string | null
    answers: AgreementAnswers; snapshot: AgreementSnapshot
  }
  return {
    bookingId: r.booking_id, signedAt: r.signed_at, signature: r.signature,
    repName: r.rep_name, repSignedAt: r.rep_signed_at, answers: r.answers, snapshot: r.snapshot,
  }
}

// The SquareOne representative's line on the agreement.
export async function countersignAgreement(bookingId: string, staff: { id: string; name: string }): Promise<boolean> {
  const { error } = await supabase()
    .from('rental_agreements')
    .update({ rep_staff_id: staff.id, rep_name: staff.name, rep_signed_at: new Date().toISOString() })
    .eq('booking_id', bookingId)
  if (error) { console.error('[agreements]', error.message); return false }
  emit(AGREEMENTS_EVENT)
  return true
}
