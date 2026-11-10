'use client'
// Browser side of Stripe billing. Every call degrades gracefully: when the
// deployment has no Stripe keys the caller falls back to the local plan
// switching that already works (set_my_plan / cancel_my_membership RPCs).

import { supabase, emit } from '@/lib/supabase'
import { SESSION_EVENT } from '@/lib/session'

let stripeLive: boolean | null = null

export async function billingConfigured(): Promise<boolean> {
  if (stripeLive !== null) return stripeLive
  try {
    const res = await fetch('/api/billing/status')
    stripeLive = res.ok && (await res.json()).stripe === true
  } catch {
    stripeLive = false
  }
  return stripeLive
}

async function authedPost(path: string, body?: unknown): Promise<{ ok: boolean; url?: string; message?: string } & Record<string, unknown>> {
  const { data } = await supabase().auth.getSession()
  const token = data.session?.access_token
  if (!token) return { ok: false, message: 'You are signed out — sign in and try again.' }
  try {
    const res = await fetch(path, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : '{}',
    })
    const json = (await res.json().catch(() => ({}))) as { url?: string; message?: string } & Record<string, unknown>
    // Carry the server's explanation back rather than dropping it — a
    // button that does nothing is the hardest kind of bug to report.
    if (!res.ok) return { ok: false, message: json.message, error: json.error }
    return { ...json, ok: true }
  } catch {
    return { ok: false, message: 'Could not reach the server.' }
  }
}

// Card-first membership signup: redirects to Stripe Checkout.
// 'redirected' = the browser is on its way to Stripe; 'already_member' =
// this account has a live membership and must not be double-billed;
// 'failed' = Stripe isn't live (or errored) so callers may fall back.
export async function startMembershipCheckout(planId: string, couponCode?: string): Promise<'redirected' | 'already_member' | 'failed'> {
  if (!(await billingConfigured())) return 'failed'
  const res = await authedPost('/api/billing/checkout', { planId, couponCode })
  if (res.ok && res.url) {
    window.location.assign(res.url)
    return 'redirected'
  }
  if (res.error === 'already_member') return 'already_member'
  return 'failed'
}

// Stripe billing portal — update/change the card, see invoices.
export async function openBillingPortal(): Promise<{ ok: boolean; message?: string }> {
  if (!(await billingConfigured())) return { ok: false }
  const res = await authedPost('/api/billing/portal')
  if (res.ok && res.url) {
    window.location.assign(res.url)
    return { ok: true }
  }
  return { ok: false, message: res.message }
}

// Upgrade/downgrade — swaps the Stripe price (prorated) and the DB plan.
export async function changePlanBilled(planId: string): Promise<boolean> {
  const res = await authedPost('/api/billing/change-plan', { planId })
  if (res.ok) emit(SESSION_EVENT)
  return res.ok
}

// Cancel (or resume) — stops the recurring charge at period end.
export async function cancelBilled(resume = false): Promise<boolean> {
  const res = await authedPost('/api/billing/cancel', { resume })
  if (res.ok) emit(SESSION_EVENT)
  return res.ok
}

// A member paying for their own booking — deposit or balance — without
// anyone at the desk. 'unavailable' when Stripe isn't live on this
// deployment so the caller can tell them to call instead; 'waiver' when
// the booking's waiver still has to be signed first.
export async function startBookingCheckout(bookingId: string, which: 'deposit' | 'balance' | 'custom', amountCents?: number): Promise<'redirected' | 'waiver' | 'unavailable'> {
  if (!(await billingConfigured())) return 'unavailable'
  const res = await authedPost('/api/billing/booking-checkout', { bookingId, which, ...(amountCents ? { amountCents } : {}) })
  if (res.ok && res.url) {
    window.location.assign(res.url)
    return 'redirected'
  }
  return res.error === 'waiver_required' ? 'waiver' : 'unavailable'
}

// Staff-only: land a coupon on a member's existing Stripe subscription —
// for members who signed up before the code existed. The server validates
// the code, applies the discount to their live billing, and resumes a
// membership that was mid-cancel.
export async function staffApplyCoupon(accountId: string, couponCode: string): Promise<{ ok: boolean; message?: string }> {
  const res = await authedPost('/api/billing/apply-coupon', { accountId, couponCode })
  if (res.ok) emit(SESSION_EVENT)
  return { ok: res.ok, message: res.message }
}

// Staff-only: move a member to another plan (prorated on their existing
// Stripe subscription, confirmation emailed). Owners/admins/managers.
export async function staffChangePlan(accountId: string, planId: string): Promise<{ ok: boolean; message?: string }> {
  const res = await authedPost('/api/billing/staff-change-plan', { accountId, planId })
  if (res.ok) emit(SESSION_EVENT)
  return { ok: res.ok, message: res.message }
}

// Staff-only: charge an extra fee (cleaning, damage, storage, overtime)
// to a booking's card on file. `notified` confirms the renter was told
// first, as the rental agreement promises.
export async function staffChargeFee(bookingId: string, amountCents: number, reason: string, notified: boolean): Promise<{ ok: boolean; message?: string; card?: string }> {
  const res = await authedPost('/api/billing/booking-fee', { bookingId, amountCents, reason, notified })
  return { ok: res.ok, message: res.message, card: res.card as string | undefined }
}

// The member's actual next bill, discounts included — null when Stripe
// isn't live, the account has no card-billed membership, or the ask fails.
export async function getNextPayment(): Promise<{ totalCents: number; label: string | null } | null> {
  const res = await authedPost('/api/billing/next-payment')
  if (!res.ok) return null
  const r = res as { ok: boolean; totalCents?: number; label?: string | null }
  return typeof r.totalCents === 'number' ? { totalCents: r.totalCents, label: r.label ?? null } : null
}
