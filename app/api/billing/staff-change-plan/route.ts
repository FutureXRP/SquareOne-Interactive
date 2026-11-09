import { NextResponse } from 'next/server'
import { getStaffCaller, serviceDb } from '@/lib/server/billing'
import { changeMemberPlan } from '@/lib/server/plan-change'

// Staff moving a member to another plan from the Memberships tab — the
// desk-side twin of the member's own Change plan. Same Stripe proration,
// same confirmation email; only who may press it differs. Owners,
// admins, and managers only: a plan change moves money.
export async function POST(req: Request) {
  const staff = await getStaffCaller(req)
  if (!staff) return NextResponse.json({ message: 'unauthorized' }, { status: 401 })
  if (!['owner', 'admin', 'manager'].includes(staff.role)) {
    return NextResponse.json({ message: 'Changing a membership plan takes an owner, admin, or manager.' }, { status: 403 })
  }
  const { accountId, planId } = (await req.json().catch(() => ({}))) as { accountId?: string; planId?: string }
  if (!accountId || !planId) return NextResponse.json({ message: 'bad_request' }, { status: 400 })

  // Only an account that actually holds a membership can be moved.
  const { data } = await serviceDb().from('member_subscriptions')
    .select('status, plan_id').eq('account_id', accountId).maybeSingle()
  const sub = data as { status: string; plan_id: string } | null
  if (!sub || !['active', 'canceling', 'past_due'].includes(sub.status)) {
    return NextResponse.json({ message: 'That account has no current membership to change.' }, { status: 409 })
  }
  if (sub.plan_id === planId) return NextResponse.json({ ok: true, unchanged: true })

  try {
    await changeMemberPlan(accountId, planId)
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[billing/staff-change-plan]', e)
    return NextResponse.json({ message: e instanceof Error ? e.message : 'Could not change the plan.' }, { status: 500 })
  }
}
