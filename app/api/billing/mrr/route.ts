import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { stripe, stripeConfigured, serviceDb } from '@/lib/server/billing'

// The real monthly recurring revenue — asked of Stripe, the only party
// that knows about coupons on live subscriptions. The admin page's DB
// math sums plan list prices, which counts a free staff membership at
// full price; this route previews each subscription's actual next
// invoice and sums what will truly be charged.

async function callerIsStaff(req: Request): Promise<boolean> {
  const token = req.headers.get('authorization')?.replace(/^Bearer /, '')
  if (!token) return false
  const anon = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
    { global: { headers: { Authorization: `Bearer ${token}` } } },
  )
  const { data: userData } = await anon.auth.getUser()
  const userId = userData?.user?.id
  if (!userId) return false
  const { data } = await serviceDb().from('staff').select('id, active').eq('user_id', userId).maybeSingle()
  return !!(data as { active: boolean } | null)?.active
}

export async function POST(req: Request) {
  if (!(await callerIsStaff(req))) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!stripeConfigured()) return NextResponse.json({ error: 'stripe_not_configured' }, { status: 501 })

  // The DB says which subscriptions are ours and live; MRR deliberately
  // excludes members already canceling (their money stops next cycle).
  const { data } = await serviceDb()
    .from('member_subscriptions')
    .select('stripe_subscription_id, membership_plans(price_cents)')
    .in('status', ['active', 'past_due'])
  const rows = (data ?? []) as unknown as {
    stripe_subscription_id: string | null
    membership_plans: { price_cents: number } | null
  }[]

  const results = await Promise.all(rows.map(async (r) => {
    const full = r.membership_plans?.price_cents ?? 0
    // No Stripe subscription behind the row (comped/manual member): no
    // recurring charge exists, so it contributes nothing.
    if (!r.stripe_subscription_id) return { full, actual: 0, stripeless: true }
    try {
      const preview = await stripe().invoices.createPreview({ subscription: r.stripe_subscription_id })
      return { full, actual: Math.max(preview.total, 0), stripeless: false }
    } catch {
      // Mid-transition or already gone at Stripe — the list price is the
      // best remaining truth rather than silently dropping the member.
      return { full, actual: full, stripeless: false }
    }
  }))

  const mrrCents = results.reduce((n, r) => n + r.actual, 0)
  const fullCents = results.reduce((n, r) => n + r.full, 0)
  const free = results.filter((r) => r.actual === 0 && r.full > 0).length
  const discounted = results.filter((r) => r.actual > 0 && r.actual < r.full).length
  return NextResponse.json({ ok: true, mrrCents, fullCents, free, discounted, count: results.length })
}
