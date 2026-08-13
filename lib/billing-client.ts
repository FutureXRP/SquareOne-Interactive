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

async function authedPost(path: string, body?: unknown): Promise<{ ok: boolean; url?: string }> {
  const { data } = await supabase().auth.getSession()
  const token = data.session?.access_token
  if (!token) return { ok: false }
  try {
    const res = await fetch(path, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : '{}',
    })
    if (!res.ok) return { ok: false }
    const json = (await res.json()) as { url?: string }
    return { ok: true, url: json.url }
  } catch {
    return { ok: false }
  }
}

// Card-first membership signup: redirects to Stripe Checkout.
// Returns false when Stripe isn't live so callers can fall back.
export async function startMembershipCheckout(planId: string, couponCode?: string): Promise<boolean> {
  if (!(await billingConfigured())) return false
  const res = await authedPost('/api/billing/checkout', { planId, couponCode })
  if (res.ok && res.url) {
    window.location.assign(res.url)
    return true
  }
  return false
}

// Stripe billing portal — update/change the card, see invoices.
export async function openBillingPortal(): Promise<boolean> {
  if (!(await billingConfigured())) return false
  const res = await authedPost('/api/billing/portal')
  if (res.ok && res.url) {
    window.location.assign(res.url)
    return true
  }
  return false
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
// anyone at the desk. Returns false when Stripe isn't live on this
// deployment so the caller can tell them to call instead.
export async function startBookingCheckout(bookingId: string, which: 'deposit' | 'balance'): Promise<boolean> {
  if (!(await billingConfigured())) return false
  const res = await authedPost('/api/billing/booking-checkout', { bookingId, which })
  if (res.ok && res.url) {
    window.location.assign(res.url)
    return true
  }
  return false
}
