import { NextResponse } from 'next/server'
import { stripe, stripeConfigured, getCaller, subscriptionIdFor, serviceDb } from '@/lib/server/billing'

// Cancels (or resumes) the membership. Stripe stops (or continues) the
// recurring charge at the period end; access lasts through what's paid.
export async function POST(req: Request) {
  const caller = await getCaller(req)
  if (!caller) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { resume } = (await req.json().catch(() => ({}))) as { resume?: boolean }

  try {
    if (stripeConfigured()) {
      const subId = await subscriptionIdFor(caller.accountId)
      if (subId) {
        await stripe().subscriptions.update(subId, { cancel_at_period_end: !resume })
      }
    }
    await serviceDb().from('member_subscriptions')
      .update({ status: resume ? 'active' : 'canceling' })
      .eq('account_id', caller.accountId)
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[billing/cancel]', e)
    return NextResponse.json({ error: 'cancel_failed' }, { status: 500 })
  }
}
