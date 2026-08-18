import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { serviceDb, sendEmail, resendFrom } from '@/lib/server/billing'
import { emailForStaffUser } from '@/lib/server/event-facts'

// Answers "why didn't Alexis get an assignment email?" with a live test.
// Runs the exact same address lookup a real booking assignment uses —
// staff row → linked login → that login's email — and either sends a
// sample alert there or says precisely which link in that chain is
// missing. The commonest answer: the staff member has no login linked,
// so there is no address to send to.

async function callerStaff(req: Request): Promise<{ id: string; name: string } | null> {
  const token = req.headers.get('authorization')?.replace(/^Bearer /, '')
  if (!token) return null
  const anon = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
    { global: { headers: { Authorization: `Bearer ${token}` } } },
  )
  const { data: userData } = await anon.auth.getUser()
  const userId = userData?.user?.id
  if (!userId) return null
  const { data } = await serviceDb().from('staff').select('id, name, active').eq('user_id', userId).maybeSingle()
  const row = data as { id: string; name: string; active: boolean } | null
  return row?.active ? { id: row.id, name: row.name } : null
}

export async function POST(req: Request) {
  const caller = await callerStaff(req)
  if (!caller) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { staffId } = (await req.json().catch(() => ({}))) as { staffId?: string }
  if (!staffId) return NextResponse.json({ ok: false, detail: 'Pick a staff member first.' }, { status: 400 })

  const db = serviceDb()
  const { data } = await db.from('staff').select('id, name, user_id').eq('id', staffId).maybeSingle()
  const s = data as { id: string; name: string; user_id: string | null } | null
  if (!s) return NextResponse.json({ ok: false, detail: 'That staff member no longer exists.' }, { status: 404 })

  if (!s.user_id) {
    return NextResponse.json({
      ok: false,
      detail: `${s.name} has no login linked, so there is no address to send to — this is why real assignment alerts aren't arriving either. Link a login for them on the Settings tab's staff list, then test again.`,
    })
  }
  const to = await emailForStaffUser(s.user_id)
  if (!to) {
    return NextResponse.json({ ok: false, detail: `${s.name}'s linked login has no email address on it.` })
  }

  let ok = true
  let detail: string
  try {
    await sendEmail(
      to,
      'Test — booking assignment alerts work',
      `<p>Hi ${s.name.split(' ')[0]},</p>
       <p>${caller.name} sent this from the Email health tab to confirm your booking-assignment
       alerts are working. When you're put on a booking as the one running it, the real alert
       arrives at this address with the room, date, and time.</p>
       <p style="color:#5b6b82;font-size:13px">Sent from ${resendFrom()}</p>`,
    )
    detail = `Sent to ${to} — the same address real booking assignments go to. Check that inbox (and spam). If this arrived but real alerts don't, the assignment was made before this fix or the emails are landing in spam.`
  } catch (e) {
    ok = false
    detail = `The address is right (${to}) but the send failed: ${e instanceof Error ? e.message : 'unknown error'}`
  }
  try {
    const { data: org } = await db.from('organizations').select('id').limit(1).single()
    await db.from('email_log').insert({
      org_id: (org as { id: string }).id,
      kind: 'test',
      to_email: to,
      subject: 'Test — booking assignment alerts work',
      ok,
      error: ok ? null : detail,
    })
  } catch { /* email_log needs 0029 */ }

  return NextResponse.json({ ok, detail })
}
