import { NextResponse } from 'next/server'
import { getCaller } from '@/lib/server/billing'
import { changeMemberPlan } from '@/lib/server/plan-change'

// A member upgrading or downgrading their own fitness plan. The work —
// Stripe proration, the database, the confirmation email — lives in
// changeMemberPlan, shared with the staff button on the Memberships tab.
export async function POST(req: Request) {
  const caller = await getCaller(req)
  if (!caller) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { planId } = (await req.json().catch(() => ({}))) as { planId?: string }
  if (!planId) return NextResponse.json({ error: 'missing planId' }, { status: 400 })

  try {
    await changeMemberPlan(caller.accountId, planId)
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[billing/change-plan]', e)
    return NextResponse.json({ error: 'change_failed' }, { status: 500 })
  }
}
