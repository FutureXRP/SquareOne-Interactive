import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { stripe, stripeConfigured, serviceDb } from '@/lib/server/billing'

// Stops every recurring charge behind a client account — called by the
// Clients tab BEFORE the account row is deleted. Deleting rows in our
// database never told Stripe anything, so a deleted member's card kept
// being charged every month. This route is the missing phone call:
// cancel at Stripe first (immediately, not at period end — the account
// is going away), then the delete may proceed.

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
  const { accountId } = (await req.json().catch(() => ({}))) as { accountId?: string }
  if (!accountId) return NextResponse.json({ error: 'bad_request' }, { status: 400 })

  // No Stripe on this deployment → nothing can be charging anyone.
  if (!stripeConfigured()) return NextResponse.json({ ok: true, canceled: 0 })

  const db = serviceDb()
  try {
    // Every subscription id we know of: the rows we recorded, plus
    // whatever Stripe holds under the account's customer — belt and
    // suspenders, because the charge the director saw proves our rows
    // and Stripe's can drift.
    const ids = new Set<string>()
    const { data: subs } = await db.from('member_subscriptions')
      .select('stripe_subscription_id')
      .eq('account_id', accountId)
      .not('stripe_subscription_id', 'is', null)
    for (const r of (subs ?? []) as { stripe_subscription_id: string }[]) ids.add(r.stripe_subscription_id)

    const { data: acct } = await db.from('client_accounts')
      .select('stripe_customer_id').eq('id', accountId).maybeSingle()
    const customerId = (acct as { stripe_customer_id: string | null } | null)?.stripe_customer_id
    if (customerId) {
      const live = await stripe().subscriptions.list({ customer: customerId, status: 'all', limit: 100 })
      for (const s of live.data) {
        if (s.status !== 'canceled' && s.status !== 'incomplete_expired') ids.add(s.id)
      }
    }

    let canceled = 0
    for (const id of ids) {
      try {
        await stripe().subscriptions.cancel(id)
        canceled++
      } catch (e) {
        const msg = e instanceof Error ? e.message : ''
        // Already gone at Stripe is success, not failure.
        if (!/No such subscription|canceled/i.test(msg)) throw e
      }
    }

    await db.from('member_subscriptions').update({ status: 'canceled' }).eq('account_id', accountId)
    return NextResponse.json({ ok: true, canceled })
  } catch (e) {
    console.error('[billing/cancel-account]', e)
    // The caller must NOT delete the account when this fails — that is
    // exactly the "deleted but still charging" hole this route closes.
    return NextResponse.json({ error: 'stripe_cancel_failed', message: e instanceof Error ? e.message : 'Stripe refused' }, { status: 502 })
  }
}
