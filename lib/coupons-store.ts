'use client'
// Coupons — built in the dashboard, redeemable in the store. A coupon is a
// percent or fixed amount off; all math is integer cents at the point of use.

import { createLocalStore } from '@/lib/local-store'

export interface Coupon {
  code: string // stored uppercase
  kind: 'percent' | 'amount'
  value: number // percent (1–100) or cents
  note: string
  active: boolean
}

const store = createLocalStore<Coupon[]>('sq-coupons-v1', () => [
  { code: 'WELCOME10', kind: 'percent', value: 10, note: '10% off — new member welcome', active: true },
  { code: 'PARTY25', kind: 'amount', value: 2500, note: '$25 off any party or rental', active: true },
])

export const COUPONS_EVENT = store.event

export function getCoupons(): Coupon[] {
  return store.get()
}

export function saveCoupons(coupons: Coupon[]) {
  store.save(coupons)
}

export function resetCoupons() {
  store.reset()
}

export function findCoupon(code: string): Coupon | null {
  const c = code.trim().toUpperCase()
  return store.get().find((x) => x.active && x.code === c) ?? null
}

export function couponDiscountCents(coupon: Coupon, subtotalCents: number): number {
  const raw = coupon.kind === 'percent'
    ? Math.round((subtotalCents * Math.min(Math.max(coupon.value, 0), 100)) / 100)
    : coupon.value
  return Math.min(Math.max(raw, 0), subtotalCents)
}
