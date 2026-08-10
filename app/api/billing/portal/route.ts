import { NextResponse } from 'next/server'
import { stripe, stripeConfigured, getCaller, ensureCustomer, siteUrl } from '@/lib/server/billing'

// Opens the Stripe billing portal, where members update or change their
// card, see invoices, and manage the subscription.
export async function POST(req: Request) {
  if (!stripeConfigured()) return NextResponse.json({ error: 'stripe_not_configured' }, { status: 501 })
  const caller = await getCaller(req)
  if (!caller) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  try {
    const customer = await ensureCustomer(caller)
    const session = await stripe().billingPortal.sessions.create({
      customer,
      return_url: `${siteUrl(req)}/account`,
    })
    return NextResponse.json({ url: session.url })
  } catch (e) {
    console.error('[billing/portal]', e)
    return NextResponse.json({ error: 'portal_failed' }, { status: 500 })
  }
}
