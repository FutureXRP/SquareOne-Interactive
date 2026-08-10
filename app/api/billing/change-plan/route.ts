import { NextResponse } from 'next/server'
import { stripe, stripeConfigured, getCaller, ensurePlanPrice, subscriptionIdFor, serviceDb } from '@/lib/server/billing'

// Upgrades or downgrades the member's fitness plan. With an active Stripe
// subscription the price swaps with proration; either way the database plan
// updates immediately.
export async function POST(req: Request) {
  const caller = await getCaller(req)
  if (!caller) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { planId } = (await req.json().catch(() => ({}))) as { planId?: string }
  if (!planId) return NextResponse.json({ error: 'missing planId' }, { status: 400 })

  try {
    if (stripeConfigured()) {
      const subId = await subscriptionIdFor(caller.accountId)
      if (subId) {
        const s = stripe()
        const sub = await s.subscriptions.retrieve(subId)
        if (sub.status === 'active' || sub.status === 'trialing' || sub.status === 'past_due') {
          const price = await ensurePlanPrice(planId)
          await s.subscriptions.update(subId, {
            items: [{ id: sub.items.data[0].id, price }],
            proration_behavior: 'create_prorations',
            cancel_at_period_end: false,
            metadata: { ...sub.metadata, plan_id: planId },
          })
        }
      }
    }
    await serviceDb().from('member_subscriptions')
      .update({ plan_id: planId, status: 'active' })
      .eq('account_id', caller.accountId)
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[billing/change-plan]', e)
    return NextResponse.json({ error: 'change_failed' }, { status: 500 })
  }
}
