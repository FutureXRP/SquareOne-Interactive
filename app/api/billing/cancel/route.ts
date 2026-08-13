import { NextResponse } from 'next/server'
import { stripe, stripeConfigured, getCaller, subscriptionIdFor, serviceDb, sendAndLog } from '@/lib/server/billing'
import { membershipCanceled, membershipResumed } from '@/lib/server/emails'

// Cancels (or resumes) the membership. Stripe stops (or continues) the
// recurring charge at the period end; access lasts through what's paid.
//
// The confirmation email is sent from here, not from the Stripe webhook.
// This route writes the new status itself, so by the time the webhook
// arrives there is no change left for it to notice — relying on the
// webhook meant the cancellation email never went out at all.
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
    const db = serviceDb()
    await db.from('member_subscriptions')
      .update({ status: resume ? 'active' : 'canceling' })
      .eq('account_id', caller.accountId)

    // Tell them what just happened, and through when they still have access.
    const [{ data: sub }, { data: people }] = await Promise.all([
      db.from('member_subscriptions').select('current_period_end').eq('account_id', caller.accountId).maybeSingle(),
      db.from('clients').select('full_name, email, is_primary')
        .eq('account_id', caller.accountId)
        .order('is_primary', { ascending: false }).limit(1),
    ])
    const person = (people as { full_name: string; email: string | null }[] | null)?.[0]
    if (person?.email) {
      const ends = (sub as { current_period_end: string | null } | null)?.current_period_end
      const endsOn = ends
        ? new Date(`${ends}T12:00:00`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
        : null
      await sendAndLog(
        resume ? 'membership.resumed' : 'membership.canceled',
        person.email,
        resume ? membershipResumed({ name: person.full_name }) : membershipCanceled({ name: person.full_name, endsOn }),
        { accountId: caller.accountId },
      )
    }
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[billing/cancel]', e)
    return NextResponse.json({ error: 'cancel_failed' }, { status: 500 })
  }
}
