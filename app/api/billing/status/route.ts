import { NextResponse } from 'next/server'
import { stripeConfigured } from '@/lib/server/billing'

// Lets the store know whether card payments are live on this deployment.
export async function GET() {
  return NextResponse.json({ stripe: stripeConfigured() })
}
