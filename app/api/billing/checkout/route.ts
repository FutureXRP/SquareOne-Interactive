import { NextResponse } from 'next/server'
import { stripe, stripeConfigured, getCaller, ensureCustomer, ensurePlanPrice, siteUrl } from '@/lib/server/billing'

// Starts a Stripe Checkout session for a fitness membership subscription.
// The member enters their card once; Stripe charges it monthly after that.
export async function POST(req: Request) {
  if (!stripeConfigured()) return NextResponse.json({ error: 'stripe_not_configured' }, { status: 501 })
  const caller = await getCaller(req)
  if (!caller) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { planId } = (await req.json().catch(() => ({}))) as { planId?: string }
  if (!planId) return NextResponse.json({ error: 'missing planId' }, { status: 400 })

  try {
    const [customer, price] = await Promise.all([ensureCustomer(caller), ensurePlanPrice(planId)])
    const base = siteUrl(req)
    const session = await stripe().checkout.sessions.create({
      mode: 'subscription',
      customer,
      line_items: [{ price, quantity: 1 }],
      subscription_data: { metadata: { account_id: caller.accountId, plan_id: planId } },
      metadata: { account_id: caller.accountId, plan_id: planId },
      success_url: `${base}/account/billing?welcome=1`,
      cancel_url: `${base}/memberships`,
      allow_promotion_codes: true,
    })
    return NextResponse.json({ url: session.url })
  } catch (e) {
    console.error('[billing/checkout]', e)
    return NextResponse.json({ error: 'checkout_failed' }, { status: 500 })
  }
}
