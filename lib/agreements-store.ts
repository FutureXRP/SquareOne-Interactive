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
  // 'uploaded' = a PDF signed outside the system, attached by staff (0059).
  source?: 'online' | 'uploaded'
  fileName?: string | null
  // What it said when signed — to tell whether it still matches the booking.
  snapshot?: Pick<AgreementSnapshot, 'eventDate' | 'timeFrom' | 'timeTo'>
}

export interface AgreementRecord extends AgreementStatus {
  bookingId: string
  answers: AgreementAnswers
  snapshot: AgreementSnapshot
  repSignedAt: string | null
}

// booking id → signed status, for the Bookings tab's badges.
export async function getAgreementStatuses(): Promise<Map<string, AgreementStatus> | null> {
  let res: { data: unknown; error: unknown } = await supabase().from('rental_agreements')
    .select('booking_id, signed_at, signature, rep_name, source, file_name, snapshot').limit(5000)
  if (res.error) res = await supabase().from('rental_agreements').select('booking_id, signed_at, signature, rep_name, snapshot').limit(5000)
  if (res.error) return null
  return new Map((res.data as { booking_id: string; signed_at: string; signature: string; rep_name: string | null; source?: 'online' | 'uploaded'; file_name?: string | null; snapshot?: AgreementSnapshot | null }[])
    .map((r) => [r.booking_id, { signedAt: r.signed_at, signature: r.signature, repName: r.rep_name, source: r.source ?? 'online', fileName: r.file_name ?? null, snapshot: r.snapshot ?? undefined }]))
}

async function bearer(): Promise<string | null> {
  const { data } = await supabase().auth.getSession()
  return data.session?.access_token ?? null
}

// Open a booking's signed agreement as a PDF in a new tab — generated from
// the online signature, or the uploaded file.
export async function openAgreementPdf(bookingId: string): Promise<{ ok: boolean; message?: string }> {
  const token = await bearer()
  if (!token) return { ok: false, message: 'You are signed out — sign in and try again.' }
  // Open the tab first (inside the click) so popup blockers allow it.
  const win = window.open('', '_blank')
  const res = await fetch(`/api/staff/agreement-pdf?booking=${encodeURIComponent(bookingId)}`, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) {
    win?.close()
    const j = (await res.json().catch(() => ({}))) as { message?: string }
    return { ok: false, message: j.message ?? 'Could not open the PDF.' }
  }
  const url = URL.createObjectURL(await res.blob())
  if (win) win.location.href = url
  else window.location.assign(url)
  return { ok: true }
}

// Attach an agreement signed outside the system (0059).
export async function uploadSignedAgreement(bookingId: string, signer: string, signedOn: string, file: File): Promise<{ ok: boolean; message?: string }> {
  const token = await bearer()
  if (!token) return { ok: false, message: 'You are signed out — sign in and try again.' }
  const form = new FormData()
  form.set('booking', bookingId)
  form.set('signer', signer)
  form.set('signedOn', signedOn)
  form.set('file', file)
  try {
    const res = await fetch('/api/staff/agreement-upload', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form })
    const j = (await res.json().catch(() => ({}))) as { message?: string }
    if (!res.ok) return { ok: false, message: j.message ?? 'Upload failed.' }
    emit(AGREEMENTS_EVENT)
    return { ok: true }
  } catch {
    return { ok: false, message: 'Could not reach the server.' }
  }
}

export async function getAgreement(bookingId: string): Promise<AgreementRecord | null> {
  let res: { data: unknown; error: unknown } = await supabase().from('rental_agreements')
    .select('booking_id, signed_at, signature, rep_name, rep_signed_at, answers, snapshot, source, file_name')
    .eq('booking_id', bookingId).maybeSingle()
  if (res.error) {
    res = await supabase().from('rental_agreements')
      .select('booking_id, signed_at, signature, rep_name, rep_signed_at, answers, snapshot')
      .eq('booking_id', bookingId).maybeSingle()
  }
  if (res.error || !res.data) return null
  const r = res.data as {
    booking_id: string; signed_at: string; signature: string; rep_name: string | null; rep_signed_at: string | null
    answers: AgreementAnswers; snapshot: AgreementSnapshot; source?: 'online' | 'uploaded'; file_name?: string | null
  }
  return {
    bookingId: r.booking_id, signedAt: r.signed_at, signature: r.signature,
    repName: r.rep_name, repSignedAt: r.rep_signed_at, answers: r.answers, snapshot: r.snapshot,
    source: r.source ?? 'online', fileName: r.file_name ?? null,
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
