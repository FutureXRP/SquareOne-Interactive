import { NextResponse } from 'next/server'
import type Stripe from 'stripe'
import { stripe, stripeConfigured, serviceDb, sendEmail, sendAndLog } from '@/lib/server/billing'
import {
  membershipWelcome, membershipStaffAlert, membershipCanceled, membershipEnded, membershipResumed, renewalReceipt, paymentFailed,
  bookingPayment,
} from '@/lib/server/emails'
import { recordInvoicePayment, recordBookingCheckout, recordBookingIntent } from '@/lib/server/record-payments'

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



// The member's own email + name, for the confirmation emails below.
async function memberContact(accountId: string): Promise<{ email: string; name: string } | null> {
  const { data } = await serviceDb()
    .from('clients')
    .select('full_name, email, is_primary')
    .eq('account_id', accountId)
    .order('is_primary', { ascending: false })
    .limit(1)
  const row = (data as { full_name: string; email: string | null }[] | null)?.[0]
  return row?.email ? { email: row.email, name: row.full_name } : null
}

async function upsertSubscription(sub: Stripe.Subscription): Promise<void> {
  const accountId = sub.metadata.account_id
  const planId = sub.metadata.plan_id
  if (!accountId) return
  const db = serviceDb()
  const status = statusOf(sub)
  const row = {
    status,
    stripe_subscription_id: sub.id,
    current_period_end: periodEnd(sub),
    ...(planId ? { plan_id: planId } : {}),
  }
  const { data: existing } = await db.from('member_subscriptions').select('id, status').eq('account_id', accountId).maybeSingle()
  const wasStatus = (existing as { status: string } | null)?.status
  if (existing) {
    await db.from('member_subscriptions').update(row).eq('account_id', accountId)
  } else if (planId) {
    await db.from('member_subscriptions').insert({ account_id: accountId, ...row })
  }

  // Tell the member when the state of their membership actually changes.
  if (!wasStatus || wasStatus === status) return
  const to = await memberContact(accountId)
  if (!to) return
  if (status === 'canceling') {
    const ends = periodEnd(sub)
    const endsOn = ends ? new Date(`${ends}T12:00:00`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : null
    await sendAndLog('membership.canceled', to.email, membershipCanceled({ name: to.name, endsOn }), { accountId })
  } else if (status === 'canceled') {
    await sendAndLog('membership.ended', to.email, membershipEnded({ name: to.name }), { accountId })
  } else if (status === 'active' && wasStatus === 'canceling') {
    await sendAndLog('membership.resumed', to.email, membershipResumed({ name: to.name }), { accountId })
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
        // A member paying their own booking deposit or balance.
        if (session.mode === 'payment' && session.metadata?.kind === 'booking') {
          await recordBookingCheckout(session)
          break
        }
        if (session.mode === 'subscription' && session.subscription) {
          const sub = await stripe().subscriptions.retrieve(session.subscription as string)
          await upsertSubscription(sub)
          // Record the first charge here too (idempotent with invoice.paid),
          // so signups hit the payments ledger even before that event is
          // added to the webhook destination.
          if (session.invoice) {
            const invoice = await stripe().invoices.retrieve(session.invoice as string)
            await recordInvoicePayment(invoice)
          }
          // Membership confirmation email (silently skipped until Resend is set up —
          // Stripe's own receipt email covers the payment itself).
          const email = session.customer_details?.email
          if (email) {
            const planId = sub.metadata.plan_id
            const { data: plan } = planId
              ? await serviceDb().from('membership_plans').select('name').eq('id', planId).maybeSingle()
              : { data: null }
            const planName = (plan as { name: string } | null)?.name ?? 'Fitness'
            const memberName = session.customer_details?.name ?? 'there'
            await sendAndLog('membership.welcome', email, membershipWelcome({
              name: memberName,
              plan: planName,
            }), { accountId: sub.metadata.account_id ?? null })
            // The internal heads-up, to whoever Settings names (0044).
            try {
              const { data: cfgRow } = await serviceDb().from('site_config').select('membership_alert_email').limit(1).maybeSingle()
              const alertTo = ((cfgRow as { membership_alert_email?: string } | null)?.membership_alert_email ?? '').trim()
              if (alertTo && alertTo.toLowerCase() !== email.toLowerCase()) {
                await sendAndLog('membership.staff_alert', alertTo, membershipStaffAlert({
                  name: memberName,
                  email,
                  plan: planName,
                }), { accountId: sub.metadata.account_id ?? null })
              }
            } catch {
              // pre-0044 — no alert address to consult
            }
          }
        }
        break
      }
      // Desk charges (card on file, phone orders) are bare PaymentIntents
      // with no Checkout session around them.
      case 'payment_intent.succeeded': {
        const pi = event.data.object
        if (pi.metadata?.kind === 'booking') await recordBookingIntent(pi)
        break
      }
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        await upsertSubscription(event.data.object)
        break
      // Membership charges land in our payments ledger too — add the
      // invoice.paid event to the Stripe webhook destination.
      case 'invoice.paid': {
        await recordInvoicePayment(event.data.object)
        // Renewals get a receipt; the first invoice is covered by the
        // welcome email that goes out at checkout.
        const invoice = event.data.object
        if (invoice.billing_reason === 'subscription_cycle') {
          const customerId = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id
          if (customerId) {
            const { data: acct } = await serviceDb()
              .from('client_accounts').select('id').eq('stripe_customer_id', customerId).maybeSingle()
            const accountId = (acct as { id: string } | null)?.id
            if (accountId) {
              const to = await memberContact(accountId)
              if (to) {
                const line = invoice.lines?.data?.[0]
                const ends = invoice.period_end ? new Date(invoice.period_end * 1000).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : null
                await sendAndLog('membership.renewed', to.email, renewalReceipt({
                  name: to.name,
                  plan: line?.description ?? 'Fitness membership',
                  amountCents: invoice.amount_paid ?? 0,
                  nextOn: ends,
                }), { accountId })
              }
            }
          }
        }
        break
      }
      case 'invoice.payment_failed': {
        const invoice = event.data.object
        const customerId = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id
        if (customerId) {
          const { data: acct } = await serviceDb()
            .from('client_accounts').select('id').eq('stripe_customer_id', customerId).maybeSingle()
          const accountId = (acct as { id: string } | null)?.id
          if (accountId) {
            const to = await memberContact(accountId)
            if (to) {
              await sendAndLog('membership.payment_failed', to.email, paymentFailed({
                name: to.name,
                amountCents: invoice.amount_due ?? 0,
              }), { accountId })
            }
          }
        }
        break
      }
    }
  } catch (e) {
    console.error('[billing/webhook]', e)
    return NextResponse.json({ error: 'handler_failed' }, { status: 500 })
  }
  return NextResponse.json({ received: true })
}
