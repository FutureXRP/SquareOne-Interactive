import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { serviceDb, sendAndLog } from '@/lib/server/billing'

// Owners and admins can help someone back into their account: email them a
// reset link, or set a temporary password when they can't reach their inbox.
// The caller's role is checked against the database, never trusted from the
// browser, and the target is looked up by id — an email address is never
// accepted from the request.

async function callerAdmin(req: Request): Promise<{ id: string; name: string } | null> {
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
  const { data } = await serviceDb().from('staff').select('id, name, role, active').eq('user_id', userId).maybeSingle()
  const row = data as { id: string; name: string; role: string; active: boolean } | null
  if (!row?.active) return null
  return row.role === 'owner' || row.role === 'admin' ? { id: row.id, name: row.name } : null
}

// Readable but not guessable: two short words plus digits, e.g. "River-Oak-4827".
function tempPassword(): string {
  const words = ['River', 'Oak', 'Maple', 'Cedar', 'Stone', 'Harbor', 'Summit', 'Meadow', 'Canyon', 'Prairie', 'Willow', 'Aspen']
  const pick = () => words[Math.floor(Math.random() * words.length)]
  const digits = String(Math.floor(1000 + Math.random() * 9000))
  return `${pick()}-${pick()}-${digits}`
}

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

export async function POST(req: Request) {
  const admin = await callerAdmin(req)
  if (!admin) return NextResponse.json({ error: 'forbidden', message: 'Only owners and admins can reset passwords.' }, { status: 403 })

  const { clientId, staffId, mode } = (await req.json().catch(() => ({}))) as {
    clientId?: string; staffId?: string; mode?: 'email' | 'temp'
  }
  if (!clientId && !staffId) return NextResponse.json({ error: 'bad_request' }, { status: 400 })

  const db = serviceDb()

  // Resolve the person from our own tables — the request never supplies an
  // email, so this can't be pointed at an arbitrary address.
  let email: string | null = null
  let userId: string | null = null
  let who = ''
  if (staffId) {
    const { data } = await db.from('staff').select('name, user_id').eq('id', staffId).maybeSingle()
    const row = data as { name: string; user_id: string | null } | null
    if (!row?.user_id) {
      return NextResponse.json({ error: 'no_login', message: 'That staff member has no login linked yet — link one in Settings first.' }, { status: 422 })
    }
    userId = row.user_id
    who = row.name
    const { data: authUser } = await adminClient().auth.admin.getUserById(row.user_id)
    email = authUser?.user?.email ?? null
  } else if (clientId) {
    const { data } = await db.from('clients').select('full_name, email, user_id').eq('id', clientId).maybeSingle()
    const row = data as { full_name: string; email: string | null; user_id: string | null } | null
    if (!row) return NextResponse.json({ error: 'not_found' }, { status: 404 })
    if (!row.user_id) {
      return NextResponse.json({ error: 'no_login', message: `${row.full_name} is on the account but has no login of their own — only the account holder signs in.` }, { status: 422 })
    }
    userId = row.user_id
    who = row.full_name
    email = row.email
    if (!email) {
      const { data: authUser } = await adminClient().auth.admin.getUserById(row.user_id)
      email = authUser?.user?.email ?? null
    }
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({
      error: 'not_configured',
      message: 'SUPABASE_SERVICE_ROLE_KEY is not set on this deployment, so password tools are off.',
    }, { status: 501 })
  }

  try {
    if (mode === 'temp') {
      if (!userId) return NextResponse.json({ error: 'not_found' }, { status: 404 })
      const password = tempPassword()
      const { error } = await adminClient().auth.admin.updateUserById(userId, { password })
      if (error) return NextResponse.json({ error: 'set_failed', message: error.message }, { status: 500 })
      // Tell them it changed, so a surprise reset is never silent.
      if (email) {
        await sendAndLog('password.reset_by_staff', email, {
          subject: 'Your SquareOne password was reset',
          html: `<p>Hi ${who.split(' ')[0]},</p>
                 <p>${admin.name} set a temporary password on your SquareOne Interactive account at your request.
                 You'll be given it in person — please change it once you're signed in.</p>
                 <p>If you didn't ask for this, reply to this email right away.</p>`,
        })
      }
      return NextResponse.json({ ok: true, tempPassword: password, who })
    }

    // Default: email them a reset link.
    if (!email) {
      return NextResponse.json({ error: 'no_email', message: `${who} has no email address on file, so a link can't be sent. Use a temporary password instead.` }, { status: 422 })
    }
    const site = (process.env.NEXT_PUBLIC_SITE_URL || '').replace(/\/$/, '')
    const { error } = await adminClient().auth.resetPasswordForEmail(email, {
      redirectTo: site ? `${site}/reset` : undefined,
    })
    if (error) return NextResponse.json({ error: 'send_failed', message: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, sentTo: email, who })
  } catch (e) {
    console.error('[reset-password]', e)
    return NextResponse.json({ error: 'failed', message: e instanceof Error ? e.message : 'Reset failed.' }, { status: 500 })
  }
}
