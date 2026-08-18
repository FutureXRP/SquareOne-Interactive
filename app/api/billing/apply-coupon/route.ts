import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { stripe, stripeConfigured, serviceDb } from '@/lib/server/billing'
import { validCoupon, stripeCouponFor } from '@/lib/server/coupon-shared'

// Staff apply a coupon to an EXISTING membership — for members who signed
// up before a code existed and would otherwise be stuck canceling and
// waiting out the month to use it. The discount lands on their live
// Stripe subscription: the next invoice (and however many the coupon's
// duration covers) bills at the discounted rate, then full price resumes
// on its own. A membership mid-cancel is resumed at the same time, since
// "make this membership free" and "let it die at month end" can't both
// be meant.

async function callerStaff(req: Request): Promise<{ id: string } | null> {
  const token = req.headers.get('authorization')?.replace(/^Bearer /, '')
  if (!token) return null
  const anon = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
    { global: { headers: { Authorization: `Bearer ${token}` } } },
  )
  const { data } = await anon.auth.getUser()
  const userId = data?.user?.id
  if (!userId) return null
  const { data: row } = await serviceDb().from('staff').select('id, active').eq('user_id', userId).maybeSingle()
  const s = row as { id: string; active: boolean } | null
  return s?.active ? { id: s.id } : null
}

export async function POST(req: Request) {
  if (!stripeConfigured()) return NextResponse.json({ message: 'Stripe is not configured.' }, { status: 501 })
  const staff = await callerStaff(req)
  if (!staff) return NextResponse.json({ message: 'unauthorized' }, { status: 401 })

  const { accountId, couponCode } = (await req.json().catch(() => ({}))) as { accountId?: string; couponCode?: string }
  if (!accountId || !couponCode?.trim()) return NextResponse.json({ message: 'bad_request' }, { status: 400 })

  const db = serviceDb()
  const { data: subRow } = await db.from('member_subscriptions')
    .select('id, plan_id, status, stripe_subscription_id')
    .eq('account_id', accountId)
    .in('status', ['active', 'canceling', 'past_due'])
    .not('stripe_subscription_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  const sub = subRow as { id: string; plan_id: string; status: string; stripe_subscription_id: string } | null
  if (!sub) {
    return NextResponse.json({ message: 'No live card-billed membership on this account — new signups enter the code at checkout instead.' }, { status: 404 })
  }

  try {
    const coupon = await validCoupon(couponCode, sub.plan_id, accountId)
    if (!coupon) {
      return NextResponse.json({ message: 'That code is not valid here — inactive, expired, fully redeemed, already used by this account, or for a different plan.' }, { status: 400 })
    }
    const discountId = await stripeCouponFor(coupon)
    if (!discountId) {
      // A free-months-only code is a signup trial; it has nothing to hang
      // on a subscription that is already billing.
      return NextResponse.json({ message: 'That code only grants free months at signup — it has no discount to apply to a running membership.' }, { status: 400 })
    }

    await stripe().subscriptions.update(sub.stripe_subscription_id, {
      discounts: [{ coupon: discountId }],
      // Resuming is part of the point for a member who already hit cancel.
      cancel_at_period_end: false,
    })
    if (sub.status !== 'active') {
      await db.from('member_subscriptions').update({ status: 'active' }).eq('id', sub.id)
    }

    const { data: org } = await db.from('organizations').select('id').limit(1).single()
    await db.from('coupon_redemptions').insert({
      org_id: (org as { id: string }).id,
      code: coupon.code,
      account_id: accountId,
      free_months: 0,
      discount_cents: coupon.kind === 'amount' ? coupon.value : 0,
      note: 'Applied by staff to an existing membership',
    })

    const off = coupon.kind === 'percent' ? `${coupon.value}% off` : `a discount`
    const forHowLong = coupon.discountMonths === 0 ? 'every month from now on'
      : coupon.discountMonths <= 1 ? 'their next payment'
      : `their next ${coupon.discountMonths} monthly payments`
    return NextResponse.json({ ok: true, message: `${coupon.code} applied — ${off} on ${forHowLong}${sub.status !== 'active' ? ', and the membership is resumed' : ''}.` })
  } catch (e) {
    console.error('[billing/apply-coupon]', e)
    const message = e instanceof Error ? e.message : 'Could not apply the coupon.'
    return NextResponse.json({ message }, { status: 500 })
  }
}
