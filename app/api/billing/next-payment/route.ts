import { NextResponse } from 'next/server'
import type Stripe from 'stripe'
import { stripe, stripeConfigured, getCaller, serviceDb } from '@/lib/server/billing'

// What the member's next bill actually is — asked of Stripe, which is the
// only party that knows about discounts on the live subscription. The
// account page shows the plan's list price; when a coupon has been
// applied (multi-month or forever), the truth is different and this route
// carries it: the real next total, plus a human line naming the discount.

function money(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}

function discountLabel(c: Stripe.Coupon | null): string | null {
  if (!c) return null
  const what = c.percent_off != null ? `${c.percent_off}% off` : c.amount_off != null ? `${money(c.amount_off)} off` : 'discount'
  const free = c.percent_off === 100
  if (c.duration === 'forever') return free ? `${c.name ?? 'Coupon'} applied — free every month` : `${c.name ?? 'Coupon'} applied — ${what} every month`
  if (c.duration === 'repeating' && c.duration_in_months) {
    return `${c.name ?? 'Coupon'} applied — ${what} for ${c.duration_in_months} monthly payments, then full price`
  }
  return `${c.name ?? 'Coupon'} applied — ${what} on your next payment`
}

export async function POST(req: Request) {
  if (!stripeConfigured()) return NextResponse.json({})
  const caller = await getCaller(req)
  if (!caller) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { data: subRow } = await serviceDb().from('member_subscriptions')
    .select('stripe_subscription_id')
    .eq('account_id', caller.accountId)
    .in('status', ['active', 'canceling', 'past_due'])
    .not('stripe_subscription_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  const subId = (subRow as { stripe_subscription_id: string } | null)?.stripe_subscription_id
  if (!subId) return NextResponse.json({})

  try {
    const [preview, sub] = await Promise.all([
      stripe().invoices.createPreview({ subscription: subId }),
      stripe().subscriptions.retrieve(subId, { expand: ['discounts'] }),
    ])
    const discounts = (sub.discounts ?? []).filter((d): d is Stripe.Discount => typeof d !== 'string')
    // The discount's coupon may come back as a bare id — fetch it then.
    let coupon: Stripe.Coupon | null = null
    const src = discounts[0]?.source?.coupon ?? null
    if (src && typeof src === 'object') coupon = src
    else if (typeof src === 'string') coupon = await stripe().coupons.retrieve(src).catch(() => null)
    return NextResponse.json({
      totalCents: preview.total,
      label: discountLabel(coupon),
    })
  } catch (e) {
    // A subscription mid-transition (or already ended in Stripe) has no
    // preview — the list price the page already shows is the best truth.
    console.error('[billing/next-payment]', e)
    return NextResponse.json({})
  }
}
