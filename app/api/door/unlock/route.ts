import { NextResponse } from 'next/server'
import { getCaller, serviceDb } from '@/lib/server/billing'

// Fitness-door unlock for members. Verifies the caller holds a current
// fitness membership (active, or canceling but still inside the paid
// period), then asks the SquareOne Dashboard to open the fitness door once.
//
// Env (both required): DASHBOARD_URL — the deployed SquareOne-Dashboard
// backend; DOOR_SERVICE_TOKEN — shared secret, same value in both apps.
export async function POST(req: Request) {
  const dashboardUrl = process.env.DASHBOARD_URL
  const token = process.env.DOOR_SERVICE_TOKEN
  if (!dashboardUrl || !token) return NextResponse.json({ error: 'not_configured' }, { status: 501 })

  const caller = await getCaller(req)
  if (!caller) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  // Membership check happens server-side — the button in the UI is honest,
  // this is the enforcement.
  const { data } = await serviceDb()
    .from('member_subscriptions')
    .select('status')
    .eq('account_id', caller.accountId)
    .maybeSingle()
  const status = (data as { status: string } | null)?.status
  if (status !== 'active' && status !== 'canceling') {
    return NextResponse.json({ error: 'no_membership' }, { status: 403 })
  }

  try {
    const res = await fetch(`${dashboardUrl.replace(/\/$/, '')}/api/member-door/unlock`, {
      method: 'POST',
      headers: { 'x-door-token': token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ member: caller.name }),
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) {
      // Pass the dashboard's status through so the button can say exactly
      // which link in the chain is broken (deploy, secret, or hardware).
      let message = ''
      try { message = ((await res.json()) as { message?: string }).message ?? '' } catch { /* non-JSON body */ }
      return NextResponse.json({ error: 'door_offline', dashboardStatus: res.status, message }, { status: 502 })
    }
    const json = (await res.json()) as { relockSeconds?: number }
    return NextResponse.json({ ok: true, relockSeconds: json.relockSeconds ?? 7 })
  } catch (e) {
    console.error('[door/unlock]', e)
    return NextResponse.json({ error: 'door_offline', dashboardStatus: 0, message: 'unreachable' }, { status: 502 })
  }
}
