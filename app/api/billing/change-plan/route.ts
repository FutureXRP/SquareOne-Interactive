import { NextResponse } from 'next/server'
import { stripe, stripeConfigured, getCaller, ensurePlanPrice, subscriptionIdFor, serviceDb, sendAndLog } from '@/lib/server/billing'
import { membershipChanged } from '@/lib/server/emails'

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
    const db = serviceDb()
    await db.from('member_subscriptions')
      .update({ plan_id: planId, status: 'active' })
      .eq('account_id', caller.accountId)

    // Confirmation of the change, with the new price.
    const { data: plan } = await db.from('membership_plans')
      .select('name, price_cents, period').eq('id', planId).maybeSingle()
    const { data: people } = await db.from('clients')
      .select('full_name, email, is_primary')
      .eq('account_id', caller.accountId)
      .order('is_primary', { ascending: false }).limit(1)
    const person = (people as { full_name: string; email: string | null }[] | null)?.[0]
    const p = plan as { name: string; price_cents: number; period: string } | null
    if (person?.email && p) {
      await sendAndLog('membership.changed', person.email, membershipChanged({
        name: person.full_name,
        plan: p.name,
        priceCents: p.price_cents,
        period: p.period,
      }), { accountId: caller.accountId })
    }
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[billing/change-plan]', e)
    return NextResponse.json({ error: 'change_failed' }, { status: 500 })
  }
}
