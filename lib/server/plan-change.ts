import { stripe, stripeConfigured, ensurePlanPrice, subscriptionIdFor, serviceDb, sendAndLog } from '@/lib/server/billing'
import { membershipChanged } from '@/lib/server/emails'

// Moves an account's fitness membership to another plan. With a live
// Stripe subscription the price swaps in place with proration — same
// subscription, same card, coupons carried over — so a plan change can
// never spawn a duplicate subscription. The database plan updates
// immediately and the member is emailed the new plan and price. Shared
// by the member's own Change plan and the staff button on Memberships.
export async function changeMemberPlan(accountId: string, planId: string): Promise<void> {
  const db = serviceDb()
  const { data: planRow } = await db.from('membership_plans')
    .select('name, price_cents, period').eq('id', planId).maybeSingle()
  if (!planRow) throw new Error('unknown_plan')

  if (stripeConfigured()) {
    const subId = await subscriptionIdFor(accountId)
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
  await db.from('member_subscriptions')
    .update({ plan_id: planId, status: 'active' })
    .eq('account_id', accountId)

  const p = planRow as { name: string; price_cents: number; period: string }
  const { data: people } = await db.from('clients')
    .select('full_name, email, is_primary')
    .eq('account_id', accountId)
    .order('is_primary', { ascending: false }).limit(1)
  const person = (people as { full_name: string; email: string | null }[] | null)?.[0]
  if (person?.email) {
    await sendAndLog('membership.changed', person.email, membershipChanged({
      name: person.full_name,
      plan: p.name,
      priceCents: p.price_cents,
      period: p.period,
    }), { accountId })
  }
}
