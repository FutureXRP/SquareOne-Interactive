import { NextResponse } from 'next/server'
import type Stripe from 'stripe'
import { stripe, stripeConfigured, getCaller, ensureCustomer, ensurePlanPrice, siteUrl, serviceDb } from '@/lib/server/billing'
import { validCoupon, stripeCouponFor, trialDays } from '@/lib/server/coupon-shared'

// Starts a Stripe Checkout session for a fitness membership subscription.
// The member enters their card once; Stripe charges it on the cycle after
// that. A coupon can grant free months up front (how current members move
// over from the old system) or a discount on the price.

export async function POST(req: Request) {
  if (!stripeConfigured()) return NextResponse.json({ error: 'stripe_not_configured' }, { status: 501 })
  const caller = await getCaller(req)
  if (!caller) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { planId, couponCode } = (await req.json().catch(() => ({}))) as { planId?: string; couponCode?: string }
  if (!planId) return NextResponse.json({ error: 'missing planId' }, { status: 400 })

  // One membership per account — a member who already has one joining
  // again is an accident (two tabs, a forgotten signup), and the second
  // subscription just double-bills them. Checked in our rows AND at
  // Stripe, so even a half-synced duplicate gets caught.
  const { data: existingSub } = await serviceDb()
    .from('member_subscriptions')
    .select('status')
    .eq('account_id', caller.accountId)
    .maybeSingle()
  const existingStatus = (existingSub as { status: string } | null)?.status
  if (existingStatus === 'active' || existingStatus === 'canceling' || existingStatus === 'past_due') {
    return NextResponse.json({ error: 'already_member' }, { status: 409 })
  }

  try {
    const [customer, price] = await Promise.all([ensureCustomer(caller), ensurePlanPrice(planId)])
    try {
      const live = await stripe().subscriptions.list({ customer, status: 'active', limit: 5 })
      if (live.data.length > 0) return NextResponse.json({ error: 'already_member' }, { status: 409 })
    } catch { /* listing failed — the DB check above still stands */ }
    const coupon = await validCoupon(couponCode, planId, caller.accountId)
    const base = siteUrl(req)

    const subscriptionData: Stripe.Checkout.SessionCreateParams.SubscriptionData = {
      metadata: {
        account_id: caller.accountId,
        plan_id: planId,
        ...(coupon ? { coupon_code: coupon.code, coupon_free_months: String(coupon.freeMonths) } : {}),
      },
      ...(coupon && coupon.freeMonths > 0 ? { trial_period_days: trialDays(coupon.freeMonths) } : {}),
    }

    const discountId = coupon ? await stripeCouponFor(coupon) : null

    const session = await stripe().checkout.sessions.create({
      mode: 'subscription',
      customer,
      line_items: [{ price, quantity: 1 }],
      subscription_data: subscriptionData,
      metadata: {
        account_id: caller.accountId,
        plan_id: planId,
        ...(coupon ? { coupon_code: coupon.code } : {}),
      },
      success_url: `${base}/account/billing?welcome=1`,
      cancel_url: `${base}/memberships`,
      // A code we already validated is applied for them; otherwise Stripe's
      // own promotion box stays available.
      ...(discountId ? { discounts: [{ coupon: discountId }] } : { allow_promotion_codes: true }),
    })

    // Record the redemption now so caps and once-per-account hold even if
    // the member abandons checkout — a claimed free month is claimed.
    if (coupon) {
      const db = serviceDb()
      const { data: org } = await db.from('organizations').select('id').limit(1).single()
      await db.from('coupon_redemptions').insert({
        org_id: (org as { id: string }).id,
        code: coupon.code,
        account_id: caller.accountId,
        free_months: coupon.freeMonths,
        discount_cents: coupon.kind === 'amount' ? coupon.value : 0,
        note: coupon.freeMonths > 0 ? `${coupon.freeMonths} free month(s) at membership signup` : 'Membership signup discount',
      })
    }

    return NextResponse.json({ url: session.url })
  } catch (e) {
    console.error('[billing/checkout]', e)
    return NextResponse.json({ error: 'checkout_failed' }, { status: 500 })
  }
}
