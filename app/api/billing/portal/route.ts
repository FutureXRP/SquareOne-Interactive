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
    // Say what actually went wrong. A blank 500 here sent someone hunting
    // through logs for what Stripe was willing to explain in one sentence.
    const raw = e instanceof Error ? e.message : 'Stripe would not open the billing portal.'
    // The one failure that needs a person, not a retry: the customer portal
    // has its own settings page, and until it's saved once in this mode
    // Stripe refuses every session.
    const needsPortalSetup = /no configuration provided|default configuration has not been created/i.test(raw)
    return NextResponse.json({
      error: 'portal_failed',
      message: needsPortalSetup
        ? 'Stripe has no customer portal configured for this mode yet. Open Stripe → Settings → Billing → Customer portal, save it once, and this will work.'
        : raw,
    }, { status: 500 })
  }
}
