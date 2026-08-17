import { NextResponse } from 'next/server'
import { stripeConfigured } from '@/lib/server/billing'

// Lets the store know whether card payments are live on this deployment.
export async function GET() {
  return NextResponse.json({
    stripe: stripeConfigured(),
    // Publishable by definition — it's the browser half of Stripe.
    publishableKey: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? null,
  })
}
