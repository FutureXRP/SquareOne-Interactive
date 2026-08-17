'use client'
// Cash App payment claims — a customer says they paid our $cashtag, and a
// person at the desk confirms it against the real Cash App app before it
// becomes a payment. The claim is the queue, never the money.

import { supabase, emit } from '@/lib/supabase'

export const CLAIMS_EVENT = 'sq-claims'

export interface PaymentClaim {
  id: string
  bookingId: string
  amountCents: number
  createdAt: string
  // From the joined booking, so the desk can match it in Cash App.
  bookingCode: string
  bookingTitle: string
  client: string
}

interface Row {
  id: string
  booking_id: string
  amount_cents: number
  created_at: string
  bookings: { code: string; title: string; client_name: string } | null
}

// null = migration 0040 not run yet.
export async function getPendingClaims(): Promise<PaymentClaim[] | null> {
  const { data, error } = await supabase()
    .from('payment_claims')
    .select('id, booking_id, amount_cents, created_at, bookings:booking_id(code, title, client_name)')
    .eq('status', 'pending')
    .order('created_at')
  if (error) return null
  return (data as unknown as Row[]).map((r) => ({
    id: r.id,
    bookingId: r.booking_id,
    amountCents: r.amount_cents,
    createdAt: r.created_at,
    bookingCode: r.bookings?.code ?? '—',
    bookingTitle: r.bookings?.title ?? 'Booking',
    client: r.bookings?.client_name ?? '—',
  }))
}

export async function resolveClaim(id: string, status: 'confirmed' | 'rejected', staffId: string | null): Promise<boolean> {
  const { error } = await supabase().from('payment_claims')
    .update({ status, resolved_at: new Date().toISOString(), resolved_by: staffId })
    .eq('id', id)
  if (error) {
    console.error('[claims]', error.message)
    return false
  }
  emit(CLAIMS_EVENT)
  return true
}
