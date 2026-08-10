// Server-only Stripe + Supabase helpers for the billing API routes.
// Never import this from client components.

import Stripe from 'stripe'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export function stripeConfigured(): boolean {
  return !!process.env.STRIPE_SECRET_KEY
}

export function stripe(): Stripe {
  return new Stripe(process.env.STRIPE_SECRET_KEY as string)
}

// Service-role client — bypasses RLS; used only after verifying the caller.
export function serviceDb(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
    { auth: { persistSession: false } },
  )
}

export interface Caller {
  userId: string
  email: string
  name: string
  accountId: string
}

// Verifies the browser's Supabase access token and resolves the caller's
// member account. Returns null when the token is missing/invalid or the
// user has no account yet.
export async function getCaller(req: Request): Promise<Caller | null> {
  const auth = req.headers.get('authorization') ?? ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null
  if (!token) return null
  const db = serviceDb()
  const { data: userData, error } = await db.auth.getUser(token)
  if (error || !userData.user) return null
  const { data: client } = await db
    .from('clients')
    .select('account_id, full_name, email')
    .eq('user_id', userData.user.id)
    .maybeSingle()
  if (!client) return null
  const row = client as { account_id: string; full_name: string; email: string | null }
  return {
    userId: userData.user.id,
    email: row.email ?? userData.user.email ?? '',
    name: row.full_name,
    accountId: row.account_id,
  }
}

// The Stripe customer for an account, created on first use.
export async function ensureCustomer(caller: Caller): Promise<string> {
  const db = serviceDb()
  const { data } = await db.from('client_accounts').select('stripe_customer_id').eq('id', caller.accountId).single()
  const existing = (data as { stripe_customer_id: string | null } | null)?.stripe_customer_id
  if (existing) return existing
  const customer = await stripe().customers.create({
    email: caller.email || undefined,
    name: caller.name,
    metadata: { account_id: caller.accountId },
  })
  await db.from('client_accounts').update({ stripe_customer_id: customer.id }).eq('id', caller.accountId)
  return customer.id
}

// The Stripe price for a membership plan, created from the live plan row on
// first use and found by lookup key after that. Recreated if the plan's
// price has changed since.
export async function ensurePlanPrice(planId: string): Promise<string> {
  const db = serviceDb()
  const { data, error } = await db.from('membership_plans').select('id, name, price_cents').eq('id', planId).single()
  if (error || !data) throw new Error(`unknown plan ${planId}`)
  const plan = data as { id: string; name: string; price_cents: number }
  const lookupKey = `plan-${plan.id}`
  const s = stripe()
  const found = await s.prices.list({ lookup_keys: [lookupKey], active: true, limit: 1 })
  const hit = found.data[0]
  if (hit && hit.unit_amount === plan.price_cents) return hit.id
  // New plan or changed price: mint a fresh price (transfers the lookup key).
  const price = await s.prices.create({
    currency: 'usd',
    unit_amount: plan.price_cents,
    recurring: { interval: 'month' },
    lookup_key: lookupKey,
    transfer_lookup_key: true,
    product_data: { name: `${plan.name} fitness membership` },
    metadata: { plan_id: plan.id },
  })
  return price.id
}

// The account's current Stripe subscription id, if any.
export async function subscriptionIdFor(accountId: string): Promise<string | null> {
  const { data } = await serviceDb()
    .from('member_subscriptions')
    .select('stripe_subscription_id')
    .eq('account_id', accountId)
    .maybeSingle()
  return (data as { stripe_subscription_id: string | null } | null)?.stripe_subscription_id ?? null
}

export function siteUrl(req: Request): string {
  return process.env.NEXT_PUBLIC_SITE_URL || req.headers.get('origin') || 'http://localhost:3000'
}

// Optional welcome/confirmation email via Resend — silently skipped until
// RESEND_API_KEY (and optionally RESEND_FROM) are set.
export async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  const key = process.env.RESEND_API_KEY
  if (!key || !to) return
  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: process.env.RESEND_FROM || 'SquareOne Interactive <onboarding@resend.dev>',
        to: [to],
        subject,
        html,
      }),
    })
  } catch (e) {
    console.error('[email]', e)
  }
}
