'use client'
// Coupons — staff manage the list; shoppers validate through the
// validate_coupon() RPC so codes are never listable publicly.
// All math is integer cents.

import { supabase, tryWrite, emit } from '@/lib/supabase'

export const COUPONS_EVENT = 'sq-coupons'

export interface Coupon {
  code: string
  kind: 'percent' | 'amount'
  value: number // percent (1–100) or cents
  note: string
  active: boolean
}

export async function getCoupons(): Promise<Coupon[]> {
  const { data, error } = await supabase().from('coupons').select('code, kind, value, note, active').order('code')
  if (error) throw error
  return data as Coupon[]
}

export async function upsertCoupon(c: Coupon, previousCode?: string): Promise<boolean> {
  const sb = supabase()
  if (previousCode && previousCode !== c.code) {
    await tryWrite(() => sb.from('coupons').delete().eq('code', previousCode))
  }
  const { data: org } = await sb.from('organizations').select('id').limit(1).single()
  const ok = await tryWrite(() => sb.from('coupons').upsert({
    code: c.code,
    org_id: (org as { id: string }).id,
    kind: c.kind,
    value: c.value,
    note: c.note,
    active: c.active,
  }))
  if (ok) emit(COUPONS_EVENT)
  return ok
}

export async function deleteCoupon(code: string): Promise<boolean> {
  const ok = await tryWrite(() => supabase().from('coupons').delete().eq('code', code))
  if (ok) emit(COUPONS_EVENT)
  return ok
}

// Shopper-side validation (works for anon too).
export async function findCoupon(code: string): Promise<Coupon | null> {
  if (!code.trim()) return null
  const { data, error } = await supabase().rpc('validate_coupon', { p_code: code })
  if (error) throw error
  const rows = data as { code: string; kind: 'percent' | 'amount'; value: number; note: string }[]
  return rows.length > 0 ? { ...rows[0], active: true } : null
}

export function couponDiscountCents(coupon: Coupon, subtotalCents: number): number {
  const raw = coupon.kind === 'percent'
    ? Math.round((subtotalCents * Math.min(Math.max(coupon.value, 0), 100)) / 100)
    : coupon.value
  return Math.min(Math.max(raw, 0), subtotalCents)
}
