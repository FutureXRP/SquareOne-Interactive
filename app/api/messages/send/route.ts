import { NextResponse } from 'next/server'
import { serviceDb, resendFrom } from '@/lib/server/billing'

// Mass communication: sends an email to a member segment via Resend.
// Owner/Admin only — verified against the staff table, not just the UI.
//
// Audiences:
//   members  — accounts with an active (or paid-through-cancel) fitness membership
//   bookers  — everyone who has ever booked a room or event with an account
//   everyone — every person in the database with an email
//
// Body: { audience, subject, body, dryRun } — dryRun returns the recipient
// count without sending (the compose screen shows it live).

type Audience = 'members' | 'bookers' | 'everyone'

async function callerIsAdmin(req: Request): Promise<{ ok: boolean; name: string }> {
  const auth = req.headers.get('authorization') ?? ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null
  if (!token) return { ok: false, name: '' }
  const db = serviceDb()
  const { data: userData, error } = await db.auth.getUser(token)
  if (error || !userData.user) return { ok: false, name: '' }
  const { data } = await db
    .from('staff')
    .select('name, role, active')
    .eq('user_id', userData.user.id)
    .eq('active', true)
    .maybeSingle()
  const row = data as { name: string; role: string } | null
  return { ok: !!row && (row.role === 'owner' || row.role === 'admin'), name: row?.name ?? '' }
}

async function recipientEmails(audience: Audience): Promise<string[]> {
  const db = serviceDb()
  let accountIds: string[] | null = null

  if (audience === 'members') {
    const { data } = await db.from('member_subscriptions').select('account_id').in('status', ['active', 'canceling'])
    accountIds = [...new Set(((data ?? []) as { account_id: string }[]).map((r) => r.account_id))]
  } else if (audience === 'bookers') {
    const { data } = await db.from('bookings').select('account_id').not('account_id', 'is', null).limit(5000)
    accountIds = [...new Set(((data ?? []) as { account_id: string }[]).map((r) => r.account_id))]
  }

  let query = db.from('clients').select('email, account_id').not('email', 'is', null)
  if (accountIds !== null) {
    if (accountIds.length === 0) return []
    query = query.in('account_id', accountIds)
  }
  const { data } = await query.limit(10000)
  const emails = ((data ?? []) as { email: string | null }[])
    .map((r) => (r.email ?? '').trim().toLowerCase())
    .filter((e) => /.+@.+\..+/.test(e))
  return [...new Set(emails)]
}

export async function POST(req: Request) {
  const caller = await callerIsAdmin(req)
  if (!caller.ok) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { audience, subject, body, dryRun } = (await req.json().catch(() => ({}))) as {
    audience?: Audience; subject?: string; body?: string; dryRun?: boolean
  }
  if (!audience || !['members', 'bookers', 'everyone'].includes(audience)) {
    return NextResponse.json({ error: 'bad_audience' }, { status: 400 })
  }

  const emails = await recipientEmails(audience)
  if (dryRun) return NextResponse.json({ count: emails.length })

  if (!subject?.trim() || !body?.trim()) return NextResponse.json({ error: 'missing_content' }, { status: 400 })
  const key = process.env.RESEND_API_KEY
  if (!key) return NextResponse.json({ error: 'email_not_configured' }, { status: 501 })
  if (emails.length === 0) return NextResponse.json({ error: 'no_recipients' }, { status: 400 })

  const from = resendFrom()
  const html = `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto">
    <h2 style="color:#182740">${subject.trim()}</h2>
    <div style="color:#333;line-height:1.6;font-size:15px">${body.trim().replace(/\n/g, '<br/>')}</div>
    <p style="color:#94a6bd;font-size:12px;margin-top:28px">SquareOne Interactive · part of SquareOne Compassion · Tulsa, OK</p>
  </div>`

  // Each recipient gets their own email (never a shared "to" list).
  let sent = 0
  for (let i = 0; i < emails.length; i += 100) {
    const chunk = emails.slice(i, i + 100)
    try {
      const res = await fetch('https://api.resend.com/emails/batch', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(chunk.map((to) => ({ from, to: [to], subject: subject.trim(), html }))),
      })
      if (res.ok) sent += chunk.length
      else console.error('[messages] resend batch failed', res.status, await res.text().catch(() => ''))
    } catch (e) {
      console.error('[messages] resend batch error', e)
    }
  }

  // Log the send (best effort — the messages table arrives with 0018).
  try {
    const db = serviceDb()
    const { data: org } = await db.from('organizations').select('id').limit(1).single()
    await db.from('messages').insert({
      org_id: (org as { id: string }).id,
      audience,
      subject: subject.trim(),
      body: body.trim(),
      recipient_count: sent,
      sent_by: caller.name,
    })
  } catch (e) {
    console.warn('[messages] log failed', e)
  }

  return NextResponse.json({ ok: sent > 0, sent, total: emails.length })
}
