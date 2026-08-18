'use client'
// Coupons — staff manage the list; shoppers never see it. A code is
// checked through check_coupon(), which decides in one place whether it
// is active, in date, still has redemptions left, allowed here, and not
// already used by this account. All math is integer cents.

import { supabase, tryWrite, emit } from '@/lib/supabase'
import { formatCents } from '@/lib/format'

export const COUPONS_EVENT = 'sq-coupons'

export type CouponContext = 'all' | 'memberships' | 'rentals' | 'shop'

export interface Coupon {
  code: string
  kind: 'percent' | 'amount'
  value: number // percent (1–100) or cents; 0 when the code only grants free months
  note: string
  active: boolean
  // Everything below arrives with migration 0030.
  appliesTo?: CouponContext
  freeMonths?: number
  maxRedemptions?: number | null
  oncePerAccount?: boolean
  expiresOn?: string | null // YYYY-MM-DD — required once 0031 has run
  planIds?: string[]
  redeemed?: number // count, filled by getCoupons
  // 0042: how many monthly payments the discount covers — 1 = first only,
  // N = that many then full price automatically, 0 = forever.
  discountMonths?: number
}

interface Row {
  code: string; kind: 'percent' | 'amount'; value: number; note: string; active: boolean
  applies_to?: string; free_months?: number; max_redemptions?: number | null
  once_per_account?: boolean; expires_on?: string | null; plan_ids?: string[] | null
  discount_months?: number
}

function fromRow(r: Row): Coupon {
  const migrated = 'applies_to' in r
  return {
    code: r.code,
    kind: r.kind,
    value: r.value,
    note: r.note,
    active: r.active,
    appliesTo: migrated ? ((r.applies_to as CouponContext) ?? 'all') : undefined,
    freeMonths: migrated ? (r.free_months ?? 0) : undefined,
    maxRedemptions: migrated ? (r.max_redemptions ?? null) : undefined,
    oncePerAccount: migrated ? (r.once_per_account ?? true) : undefined,
    expiresOn: migrated ? (r.expires_on ?? null) : undefined,
    planIds: migrated ? (r.plan_ids ?? []) : undefined,
    discountMonths: 'discount_months' in r ? (r.discount_months ?? 1) : undefined,
  }
}

const BASE = 'code, kind, value, note, active'
const FULL_0030 = `${BASE}, applies_to, free_months, max_redemptions, once_per_account, expires_on, plan_ids`
const COL_SETS = [`${FULL_0030}, discount_months`, FULL_0030, BASE]

export async function getCoupons(): Promise<Coupon[]> {
  for (const cols of COL_SETS) {
    const { data, error } = await supabase().from('coupons').select(cols).order('code')
    if (!error) {
      const list = (data as unknown as Row[]).map(fromRow)
      // Redemption counts, when the table exists.
      const { data: reds } = await supabase().from('coupon_redemptions').select('code').limit(10000)
      if (reds) {
        const counts = new Map<string, number>()
        for (const r of reds as { code: string }[]) counts.set(r.code, (counts.get(r.code) ?? 0) + 1)
        for (const c of list) c.redeemed = counts.get(c.code) ?? 0
      }
      return list
    }
  }
  throw new Error('coupons query failed')
}

// Every coupon carries an end date. A code with no expiry set yet gets
// the default window rather than living forever.
export const DEFAULT_EXPIRY_DAYS = 90

export function defaultExpiry(days = DEFAULT_EXPIRY_DAYS): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function isExpired(c: Coupon): boolean {
  if (!c.expiresOn) return false
  return c.expiresOn < defaultExpiry(0)
}

// "expires in 12 days" · "expired Aug 2" — for the admin list.
export function expiryLabel(c: Coupon): string {
  if (!c.expiresOn) return 'no end date yet'
  const when = new Date(`${c.expiresOn}T12:00:00`)
  const days = Math.round((when.getTime() - Date.now()) / 86_400_000)
  const pretty = when.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  if (days < 0) return `expired ${pretty}`
  if (days === 0) return 'expires today'
  if (days === 1) return 'expires tomorrow'
  if (days <= 30) return `expires in ${days} days`
  return `expires ${pretty}`
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
    // Only write the 0030 columns once they exist.
    ...(c.appliesTo !== undefined ? { applies_to: c.appliesTo } : {}),
    ...(c.freeMonths !== undefined ? { free_months: c.freeMonths } : {}),
    ...(c.maxRedemptions !== undefined ? { max_redemptions: c.maxRedemptions } : {}),
    ...(c.oncePerAccount !== undefined ? { once_per_account: c.oncePerAccount } : {}),
    // Never write a null end date — the column is required after 0031.
    ...(c.expiresOn !== undefined ? { expires_on: c.expiresOn || defaultExpiry() } : {}),
    ...(c.planIds !== undefined ? { plan_ids: c.planIds } : {}),
    ...(c.discountMonths !== undefined ? { discount_months: c.discountMonths } : {}),
  }))
  if (ok) emit(COUPONS_EVENT)
  return ok
}

export async function deleteCoupon(code: string): Promise<boolean> {
  const ok = await tryWrite(() => supabase().from('coupons').delete().eq('code', code))
  if (ok) emit(COUPONS_EVENT)
  return ok
}

// ── Shopper side ─────────────────────────────────────────────

export type CouponCheck =
  | { ok: true; coupon: Coupon }
  | { ok: false; reason: 'not_found' | 'expired' | 'wrong_context' | 'wrong_plan' | 'used_up' | 'already_used'; appliesTo?: string }

const REASON_TEXT: Record<string, string> = {
  not_found: "That code isn't valid.",
  expired: 'That code has expired.',
  wrong_context: 'That code doesn\'t apply here.',
  wrong_plan: "That code doesn't apply to this plan.",
  used_up: 'That code has been fully claimed.',
  already_used: "You've already used that code.",
}

export function couponMessage(res: Extract<CouponCheck, { ok: false }>): string {
  if (res.reason === 'wrong_context' && res.appliesTo) {
    const where = res.appliesTo === 'memberships' ? 'memberships' : res.appliesTo === 'rentals' ? 'room rentals' : 'the shop'
    return `That code only works on ${where}.`
  }
  return REASON_TEXT[res.reason] ?? "That code isn't valid."
}

export async function checkCoupon(code: string, context: CouponContext = 'all', planId?: string): Promise<CouponCheck> {
  if (!code.trim()) return { ok: false, reason: 'not_found' }
  const { data, error } = await supabase().rpc('check_coupon', {
    p_code: code, p_context: context, p_plan_id: planId ?? null,
  })
  if (error) {
    // Before 0030 the old validate_coupon RPC is all there is.
    const legacy = await supabase().rpc('validate_coupon', { p_code: code })
    const rows = (legacy.data ?? []) as { code: string; kind: 'percent' | 'amount'; value: number; note: string }[]
    if (rows.length === 0) return { ok: false, reason: 'not_found' }
    return { ok: true, coupon: { ...rows[0], active: true } }
  }
  const res = data as {
    ok: boolean; reason?: string; applies_to?: string
    code?: string; kind?: 'percent' | 'amount'; value?: number; note?: string; free_months?: number
  }
  if (!res.ok) {
    return { ok: false, reason: (res.reason ?? 'not_found') as Extract<CouponCheck, { ok: false }>['reason'], appliesTo: res.applies_to }
  }
  return {
    ok: true,
    coupon: {
      code: res.code!,
      kind: res.kind ?? 'percent',
      value: res.value ?? 0,
      note: res.note ?? '',
      active: true,
      freeMonths: res.free_months ?? 0,
      appliesTo: (res.applies_to as CouponContext) ?? 'all',
    },
  }
}

export function couponDiscountCents(coupon: Coupon, subtotalCents: number): number {
  const raw = coupon.kind === 'percent'
    ? Math.round((subtotalCents * Math.min(Math.max(coupon.value, 0), 100)) / 100)
    : coupon.value
  return Math.min(Math.max(raw, 0), subtotalCents)
}

// "1 month free" · "20% off" · "$15 off" — for chips and admin lists.
export function couponLabel(c: Coupon): string {
  const parts: string[] = []
  if ((c.freeMonths ?? 0) > 0) parts.push(`${c.freeMonths} month${c.freeMonths === 1 ? '' : 's'} free`)
  if (c.value > 0) parts.push(c.kind === 'percent' ? `${c.value}% off` : `${formatCents(c.value)} off`)
  return parts.join(' + ') || 'no discount set'
}

// Writes the redemption row so caps and once-per-account work.
export async function recordRedemption(o: {
  code: string
  accountId?: string | null
  bookingId?: string | null
  discountCents?: number
  freeMonths?: number
  note?: string
}): Promise<void> {
  const sb = supabase()
  const { data: org } = await sb.from('organizations').select('id').limit(1).single()
  await sb.from('coupon_redemptions').insert({
    org_id: (org as { id: string }).id,
    code: o.code,
    account_id: o.accountId ?? null,
    booking_id: o.bookingId ?? null,
    discount_cents: o.discountCents ?? 0,
    free_months: o.freeMonths ?? 0,
    note: o.note ?? '',
  })
  emit(COUPONS_EVENT)
}

export interface Redemption {
  code: string
  who: string
  discountCents: number
  freeMonths: number
  note: string
  when: string
}

export async function getRedemptions(limit = 50): Promise<Redemption[] | null> {
  const { data, error } = await supabase()
    .from('coupon_redemptions')
    .select('code, discount_cents, free_months, note, redeemed_at, client_accounts:account_id(name)')
    .order('redeemed_at', { ascending: false })
    .limit(limit)
  if (error) return null
  return (data as unknown as {
    code: string; discount_cents: number; free_months: number; note: string
    redeemed_at: string; client_accounts: { name: string } | null
  }[]).map((r) => ({
    code: r.code,
    who: r.client_accounts?.name ?? '—',
    discountCents: r.discount_cents,
    freeMonths: r.free_months,
    note: r.note,
    when: new Date(r.redeemed_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }),
  }))
}
