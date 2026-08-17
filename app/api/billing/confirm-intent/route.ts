import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { stripe, stripeConfigured, serviceDb } from '@/lib/server/billing'
import { recordBookingIntent } from '@/lib/server/record-payments'

// After the desk's Elements form confirms a phone-order charge, this
// records it right away rather than waiting on the webhook. Nothing is
// trusted from the browser: the intent is fetched from Stripe and only a
// genuinely succeeded booking payment is written. Idempotent with the
// webhook's own recording.

async function callerStaff(req: Request): Promise<boolean> {
  const token = req.headers.get('authorization')?.replace(/^Bearer /, '')
  if (!token) return false
  const anon = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
    { global: { headers: { Authorization: `Bearer ${token}` } } },
  )
  const { data } = await anon.auth.getUser()
  const userId = data?.user?.id
  if (!userId) return false
  const { data: row } = await serviceDb().from('staff').select('active').eq('user_id', userId).maybeSingle()
  return !!(row as { active: boolean } | null)?.active
}

export async function POST(req: Request) {
  if (!stripeConfigured()) return NextResponse.json({ error: 'stripe_not_configured' }, { status: 501 })
  if (!(await callerStaff(req))) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { paymentIntentId } = (await req.json().catch(() => ({}))) as { paymentIntentId?: string }
  if (!paymentIntentId?.startsWith('pi_')) return NextResponse.json({ error: 'bad_request' }, { status: 400 })
  try {
    const pi = await stripe().paymentIntents.retrieve(paymentIntentId, { expand: ['latest_charge'] })
    if (pi.metadata?.kind !== 'booking') return NextResponse.json({ error: 'not_a_booking_payment' }, { status: 409 })
    const ok = await recordBookingIntent(pi)
    return NextResponse.json({ ok, status: pi.status })
  } catch (e) {
    console.error('[confirm-intent]', e)
    return NextResponse.json({ error: 'failed' }, { status: 500 })
  }
}
