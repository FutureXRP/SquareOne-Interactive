import { stripe, serviceDb } from '@/lib/server/billing'

// Coupon validation and Stripe minting, shared by membership checkout
// (new signups) and the staff apply-to-existing-membership route. A code
// posted by a browser means nothing until the database says it's still
// good — re-checked here every time.

export interface CouponFacts {
  code: string
  kind: 'percent' | 'amount'
  value: number
  freeMonths: number
  // 1 = first payment only, N = that many monthly payments, 0 = forever.
  discountMonths: number
}

const COLS = 'code, kind, value, active, applies_to, free_months, max_redemptions, once_per_account, expires_on, plan_ids'

interface CouponRow {
  code: string; kind: 'percent' | 'amount'; value: number; active: boolean
  applies_to: string; free_months: number; max_redemptions: number | null
  once_per_account: boolean; expires_on: string | null; plan_ids: string[] | null
  discount_months?: number
}

export async function validCoupon(code: string | undefined, planId: string, accountId: string): Promise<CouponFacts | null> {
  if (!code?.trim()) return null
  const db = serviceDb()
  // discount_months arrives with 0042 — fall back to the pre-0042 shape.
  let data: CouponRow | null = null
  for (const cols of [`${COLS}, discount_months`, COLS]) {
    const res = await db.from('coupons').select(cols).eq('code', code.trim().toUpperCase()).maybeSingle()
    if (!res.error) { data = res.data as unknown as CouponRow | null; break }
  }
  if (!data) return null
  const c = data
  if (!c.active) return null
  if (c.expires_on && c.expires_on < new Date().toISOString().slice(0, 10)) return null
  if (c.applies_to !== 'all' && c.applies_to !== 'memberships') return null
  if (c.plan_ids && c.plan_ids.length > 0 && !c.plan_ids.includes(planId)) return null
  if (c.max_redemptions != null) {
    const { count } = await db.from('coupon_redemptions').select('id', { count: 'exact', head: true }).eq('code', c.code)
    if ((count ?? 0) >= c.max_redemptions) return null
  }
  if (c.once_per_account) {
    const { count } = await db.from('coupon_redemptions')
      .select('id', { count: 'exact', head: true }).eq('code', c.code).eq('account_id', accountId)
    if ((count ?? 0) > 0) return null
  }
  return { code: c.code, kind: c.kind, value: c.value, freeMonths: c.free_months ?? 0, discountMonths: c.discount_months ?? 1 }
}

// Free months become a Stripe trial: the card is captured now, nothing is
// charged until the trial ends, and normal billing picks up after.
export function trialDays(months: number): number {
  return Math.round(months * 30)
}

// Percent/amount off becomes a Stripe coupon whose duration carries the
// switch-back: 'once' discounts the first payment, 'repeating' discounts N
// monthly payments and then Stripe bills the full plan price on its own,
// 'forever' discounts every payment. The minted id carries the terms, so
// editing a code's value or duration mints a fresh Stripe coupon instead
// of silently reusing the old terms.
export async function stripeCouponFor(c: CouponFacts, currency = 'usd'): Promise<string | null> {
  if (c.value <= 0) return null
  const s = stripe()
  const id = `sq-${c.code.toLowerCase()}-${c.kind === 'percent' ? 'p' : 'a'}${c.value}-m${c.discountMonths}`
  try {
    const existing = await s.coupons.retrieve(id)
    if (existing && !existing.deleted) return existing.id
  } catch {
    // not minted yet
  }
  const duration =
    c.discountMonths === 0 ? ({ duration: 'forever' } as const)
    : c.discountMonths <= 1 ? ({ duration: 'once' } as const)
    : ({ duration: 'repeating', duration_in_months: c.discountMonths } as const)
  const created = await s.coupons.create({
    id,
    name: c.code,
    ...duration,
    ...(c.kind === 'percent' ? { percent_off: c.value } : { amount_off: c.value, currency }),
  })
  return created.id
}
