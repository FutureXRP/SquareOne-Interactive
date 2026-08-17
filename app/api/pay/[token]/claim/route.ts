import { NextResponse } from 'next/server'
import { serviceDb } from '@/lib/server/billing'
import { bookingForToken } from '@/lib/server/pay-links'

// "I've sent it" on the pay page's Cash App option. Files a claim for the
// desk to confirm against the real Cash App app — it does not mark
// anything paid, because nothing has been verified yet. Amount is computed
// from the booking row; the browser picks deposit or balance, never a
// number.

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const { which } = (await req.json().catch(() => ({}))) as { which?: 'deposit' | 'balance' }

  const found = await bookingForToken(token)
  if (!found) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  const { row, target } = found
  if (row.status === 'canceled') return NextResponse.json({ error: 'canceled' }, { status: 409 })
  if (target.balanceCents <= 0) return NextResponse.json({ error: 'already_paid' }, { status: 409 })

  const amount = which === 'deposit' && target.depositDueCents > 0
    ? Math.min(target.depositDueCents, target.balanceCents)
    : target.balanceCents
  if (amount <= 0) return NextResponse.json({ error: 'nothing_due' }, { status: 409 })

  try {
    const db = serviceDb()
    // One open claim per booking — tapping the button twice, or two people
    // in the party both tapping it, must not stack up work for the desk.
    const { data: open, error: readErr } = await db.from('payment_claims')
      .select('id').eq('booking_id', row.id).eq('status', 'pending').limit(1)
    // 42P01 = table missing: migration 0040 hasn't run.
    if (readErr) return NextResponse.json({ error: 'not_available' }, { status: 501 })
    if ((open ?? []).length > 0) return NextResponse.json({ ok: true, already: true })

    const { data: org } = await db.from('organizations').select('id').limit(1).single()
    const { error } = await db.from('payment_claims').insert({
      org_id: (org as { id: string }).id,
      booking_id: row.id,
      amount_cents: amount,
    })
    if (error) return NextResponse.json({ error: 'failed' }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[pay/claim]', e)
    return NextResponse.json({ error: 'failed' }, { status: 500 })
  }
}
