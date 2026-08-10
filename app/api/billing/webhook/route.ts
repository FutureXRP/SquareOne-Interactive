import { NextResponse } from 'next/server'
import type Stripe from 'stripe'
import { stripe, stripeConfigured, serviceDb, sendEmail } from '@/lib/server/billing'

// Stripe webhook — keeps member_subscriptions in sync with what actually
// happens to the card: subscription created, plan changed, payment failed,
// canceled. Point Stripe at POST /api/billing/webhook with
// STRIPE_WEBHOOK_SECRET set.

function periodEnd(sub: Stripe.Subscription): string | null {
  const ts = sub.items.data[0]?.current_period_end
  return ts ? new Date(ts * 1000).toISOString().slice(0, 10) : null
}

function statusOf(sub: Stripe.Subscription): 'active' | 'canceling' | 'past_due' | 'canceled' {
  if (sub.status === 'canceled') return 'canceled'
  if (sub.cancel_at_period_end) return 'canceling'
  if (sub.status === 'past_due' || sub.status === 'unpaid') return 'past_due'
  return 'active'
}

async function upsertSubscription(sub: Stripe.Subscription): Promise<void> {
  const accountId = sub.metadata.account_id
  const planId = sub.metadata.plan_id
  if (!accountId) return
  const db = serviceDb()
  const row = {
    status: statusOf(sub),
    stripe_subscription_id: sub.id,
    current_period_end: periodEnd(sub),
    ...(planId ? { plan_id: planId } : {}),
  }
  const { data: existing } = await db.from('member_subscriptions').select('id').eq('account_id', accountId).maybeSingle()
  if (existing) {
    await db.from('member_subscriptions').update(row).eq('account_id', accountId)
  } else if (planId) {
    await db.from('member_subscriptions').insert({ account_id: accountId, ...row })
  }
}

export async function POST(req: Request) {
  if (!stripeConfigured()) return NextResponse.json({ error: 'stripe_not_configured' }, { status: 501 })
  const secret = process.env.STRIPE_WEBHOOK_SECRET
  const body = await req.text()
  let event: Stripe.Event
  try {
    if (!secret) throw new Error('STRIPE_WEBHOOK_SECRET not set')
    event = await stripe().webhooks.constructEventAsync(body, req.headers.get('stripe-signature') ?? '', secret)
  } catch (e) {
    console.error('[billing/webhook] signature', e)
    return NextResponse.json({ error: 'bad_signature' }, { status: 400 })
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object
        if (session.mode === 'subscription' && session.subscription) {
          const sub = await stripe().subscriptions.retrieve(session.subscription as string)
          await upsertSubscription(sub)
          // Membership confirmation email (silently skipped until Resend is set up —
          // Stripe's own receipt email covers the payment itself).
          const email = session.customer_details?.email
          if (email) {
            await sendEmail(
              email,
              'Welcome to SquareOne Interactive — your membership is active',
              `<p>Hi ${session.customer_details?.name ?? 'there'},</p>
               <p>Your fitness membership is active. Your member code is on your account page —
               scan it at the door any time we're open.</p>
               <p>Manage your plan, card, or cancellation any time from
               <a href="${process.env.NEXT_PUBLIC_SITE_URL ?? ''}/account">your account</a>.</p>
               <p>— SquareOne Interactive, part of SquareOne Compassion</p>`,
            )
          }
        }
        break
      }
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        await upsertSubscription(event.data.object)
        break
    }
  } catch (e) {
    console.error('[billing/webhook]', e)
    return NextResponse.json({ error: 'handler_failed' }, { status: 500 })
  }
  return NextResponse.json({ received: true })
}
