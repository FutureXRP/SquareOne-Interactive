'use client'
// Refunds — any amount up to what's still refundable on a payment, as
// many times as needed. Card refunds go back through Stripe via the
// server route; cash and Cash App refunds are handed back at the desk
// and recorded here (cash also leaves the cash bag). Needs 0027.

import { supabase, emit } from '@/lib/supabase'

export const REFUNDS_EVENT = 'sq-refunds'

export interface RefundRow {
  id: string
  paymentId: string
  amountCents: number
  method: string
  reason: string
  staffName: string | null
  when: string
  viaStripe: boolean
}

// How much has already been sent back per payment id. Null until 0027 runs.
export async function getRefundedByPayment(): Promise<Map<string, number> | null> {
  const { data, error } = await supabase()
    .from('refunds')
    .select('payment_id, amount_cents')
    .limit(10000)
  if (error) return null
  const m = new Map<string, number>()
  for (const r of data as { payment_id: string; amount_cents: number }[]) {
    m.set(r.payment_id, (m.get(r.payment_id) ?? 0) + r.amount_cents)
  }
  return m
}

export async function getRecentRefunds(limit = 20): Promise<RefundRow[]> {
  const { data, error } = await supabase()
    .from('refunds')
    .select('id, payment_id, amount_cents, method, reason, stripe_refund_id, created_at, staff:refunded_by(name)')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) return []
  return (data as unknown as {
    id: string; payment_id: string; amount_cents: number; method: string; reason: string
    stripe_refund_id: string | null; created_at: string; staff: { name: string } | null
  }[]).map((r) => ({
    id: r.id,
    paymentId: r.payment_id,
    amountCents: r.amount_cents,
    method: r.method,
    reason: r.reason,
    staffName: r.staff?.name ?? null,
    when: new Date(r.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }),
    viaStripe: !!r.stripe_refund_id,
  }))
}

export type RefundOutcome =
  | { ok: true; viaStripe: boolean }
  | { ok: false; reason: 'not_migrated' | 'too_much' | 'stripe_failed' | 'failed'; message?: string }

interface PaymentLike {
  id: string
  method: string
  amountCents: number
  accountId?: string | null
  bookingId?: string | null
  memo?: string
  client?: string
}

// Card payments route through the server (Stripe needs the secret key).
// Cash and Cash App are recorded straight from the browser under the
// staff member's own credentials.
export async function refundPayment(
  payment: PaymentLike,
  amountCents: number,
  reason: string,
  staffId: string | null,
): Promise<RefundOutcome> {
  if (amountCents <= 0) return { ok: false, reason: 'too_much' }
  const sb = supabase()

  if (payment.method === 'stripe') {
    const { data: session } = await sb.auth.getSession()
    const token = session.session?.access_token
    if (!token) return { ok: false, reason: 'failed', message: 'Sign in again and retry.' }
    const res = await fetch('/api/billing/refund', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ paymentId: payment.id, amountCents, reason }),
    })
    const body = (await res.json().catch(() => ({}))) as { error?: string; message?: string }
    if (res.ok) {
      emit(REFUNDS_EVENT)
      return { ok: true, viaStripe: true }
    }
    if (body.error === 'exceeds_refundable') return { ok: false, reason: 'too_much' }
    return { ok: false, reason: 'stripe_failed', message: body.message ?? body.error }
  }

  // Cash / Cash App / check / ACH — money handed back in person.
  const { data: org, error: orgErr } = await sb.from('organizations').select('id').limit(1).single()
  if (orgErr) return { ok: false, reason: 'failed', message: orgErr.message }
  const { error } = await sb.from('refunds').insert({
    org_id: (org as { id: string }).id,
    payment_id: payment.id,
    account_id: payment.accountId ?? null,
    booking_id: payment.bookingId ?? null,
    amount_cents: amountCents,
    method: payment.method,
    reason,
    refunded_by: staffId,
  })
  if (error) {
    if (error.code === '42P01') return { ok: false, reason: 'not_migrated' }
    if (error.message.includes('refund_exceeds_payment')) return { ok: false, reason: 'too_much' }
    console.error('[refunds]', error.message)
    return { ok: false, reason: 'failed', message: error.message }
  }

  // Cash physically leaves the bag.
  if (payment.method === 'cash') {
    await sb.from('cash_drawer_entries').insert({
      org_id: (org as { id: string }).id,
      amount_cents: -amountCents,
      reason: `Refund — ${payment.client ?? 'customer'}${payment.memo ? ` · ${payment.memo}` : ''}${reason ? ` (${reason})` : ''}`,
      staff_id: staffId,
    })
  }
  emit(REFUNDS_EVENT)
  return { ok: true, viaStripe: false }
}
