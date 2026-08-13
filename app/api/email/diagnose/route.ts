import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { serviceDb, sendEmail, DEFAULT_FROM } from '@/lib/server/billing'

// Tells staff exactly why email is or isn't working: whether the key is
// set, whether Resend accepts it, which domains are verified, whether the
// From address matches one of them, and — on demand — the raw result of a
// real send. Never returns the key itself.

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

export interface EmailCheck {
  label: string
  status: 'ok' | 'warn' | 'fail'
  detail: string
  fix?: string
}

interface ResendDomain { id: string; name: string; status: string; region?: string }

function mask(key: string): string {
  return key.length <= 8 ? '••••' : `${key.slice(0, 5)}…${key.slice(-4)}`
}

// "Name <a@b.com>" or "a@b.com" → "b.com"
function domainOf(from: string): string | null {
  const m = /<([^>]+)>/.exec(from)
  const addr = (m ? m[1] : from).trim()
  const at = addr.lastIndexOf('@')
  return at > 0 ? addr.slice(at + 1).toLowerCase() : null
}

export async function POST(req: Request) {
  const staff = await callerStaff(req)
  if (!staff) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { testTo } = (await req.json().catch(() => ({}))) as { testTo?: string }

  const key = process.env.RESEND_API_KEY ?? ''
  const from = process.env.RESEND_FROM || DEFAULT_FROM
  const usingTestSender = !process.env.RESEND_FROM || from.includes('resend.dev')
  const checks: EmailCheck[] = []

  // 1 — is there a key at all?
  if (!key) {
    checks.push({
      label: 'API key',
      status: 'fail',
      detail: 'RESEND_API_KEY is not set on this deployment.',
      fix: 'Vercel → Settings → Environment Variables → add RESEND_API_KEY, then redeploy. Adding a variable does not take effect until you redeploy.',
    })
    return NextResponse.json({ checks, from, usingTestSender, domains: [], test: null })
  }
  checks.push({ label: 'API key', status: 'ok', detail: `Set (${mask(key)}).` })

  // 2 — does Resend accept it, and what does it see?
  let domains: ResendDomain[] = []
  try {
    const res = await fetch('https://api.resend.com/domains', {
      headers: { Authorization: `Bearer ${key}` },
    })
    const text = await res.text()
    if (!res.ok) {
      let msg = text.slice(0, 200)
      try { msg = (JSON.parse(text) as { message?: string }).message ?? msg } catch { /* keep raw */ }
      checks.push({
        label: 'Resend connection',
        status: 'fail',
        detail: `Resend rejected the key (${res.status}): ${msg}`,
        fix: res.status === 401
          ? 'The key is wrong, was revoked, or belongs to a different Resend account. Create a fresh key at resend.com → API Keys and replace it in Vercel, then redeploy.'
          : 'Check the key in Vercel matches one in your Resend dashboard.',
      })
      return NextResponse.json({ checks, from, usingTestSender, domains: [], test: null })
    }
    domains = ((JSON.parse(text) as { data?: ResendDomain[] }).data ?? [])
    checks.push({ label: 'Resend connection', status: 'ok', detail: `Key works. ${domains.length} domain${domains.length === 1 ? '' : 's'} on the account.` })
  } catch (e) {
    checks.push({
      label: 'Resend connection',
      status: 'fail',
      detail: `Could not reach Resend: ${e instanceof Error ? e.message : 'network error'}`,
      fix: 'This is usually temporary. Try again in a minute.',
    })
    return NextResponse.json({ checks, from, usingTestSender, domains: [], test: null })
  }

  // 3 — the From address
  const fromDomain = domainOf(from)
  const verified = domains.filter((d) => d.status === 'verified')
  if (usingTestSender) {
    checks.push({
      label: 'From address',
      status: 'warn',
      detail: `Using Resend's test sender (${from}). It only delivers to the email address that owns the Resend account — everyone else gets nothing, with no error.`,
      fix: verified.length > 0
        ? `Set RESEND_FROM in Vercel to something like "SquareOne Interactive <noreply@${verified[0].name}>" and redeploy.`
        : 'Verify your domain in Resend first, then set RESEND_FROM in Vercel and redeploy.',
    })
  } else if (!fromDomain) {
    checks.push({
      label: 'From address',
      status: 'fail',
      detail: `RESEND_FROM is "${from}" — no email address found in it.`,
      fix: 'It must be an address, optionally with a name: SquareOne Interactive <noreply@squareoneinteractive.com>',
    })
  } else {
    const match = domains.find((d) => d.name.toLowerCase() === fromDomain)
    if (!match) {
      checks.push({
        label: 'From address',
        status: 'fail',
        detail: `Sending as ${fromDomain}, but that domain isn't on this Resend account.`,
        fix: `Add ${fromDomain} at resend.com → Domains, or change RESEND_FROM to a domain you have verified${verified.length ? ` (e.g. ${verified[0].name})` : ''}.`,
      })
    } else if (match.status !== 'verified') {
      checks.push({
        label: 'From address',
        status: 'fail',
        detail: `${fromDomain} is on the account but its status is "${match.status}", not verified. Resend refuses every send until it verifies.`,
        fix: 'Open the domain in Resend and add the DNS records it shows at your DNS host. Most failures are a doubled name — if Resend says "resend._domainkey.yourdomain.com", many hosts want just "resend._domainkey".',
      })
    } else {
      checks.push({ label: 'From address', status: 'ok', detail: `Sending as ${from} — ${fromDomain} is verified.` })
    }
  }

  // 4 — site URL, since every email links back to it
  const site = process.env.NEXT_PUBLIC_SITE_URL
  if (!site) {
    checks.push({
      label: 'Site address',
      status: 'warn',
      detail: 'NEXT_PUBLIC_SITE_URL is not set, so buttons in emails have no link to point at.',
      fix: 'Set it in Vercel to your live address, e.g. https://squareoneinteractive.com',
    })
  } else if (!/^https?:\/\//.test(site) || site.includes('https://https://')) {
    checks.push({
      label: 'Site address',
      status: 'fail',
      detail: `NEXT_PUBLIC_SITE_URL is "${site}", which isn't a clean URL.`,
      fix: 'It should look exactly like https://squareoneinteractive.com — no trailing slash, no doubled scheme.',
    })
  } else {
    checks.push({ label: 'Site address', status: 'ok', detail: site })
  }

  // 5 — an actual send, when asked
  let test: { ok: boolean; detail: string; to: string } | null = null
  if (testTo?.trim()) {
    const to = testTo.trim()
    try {
      const id = await sendEmail(
        to,
        'SquareOne Interactive — email test',
        `<p>This is a test from your SquareOne dashboard, sent by ${staff.name}.</p>
         <p>If you're reading this, confirmations and receipts will reach your members too.</p>
         <p style="color:#5b6b82;font-size:13px">Sent from ${from}</p>`,
      )
      test = { ok: true, to, detail: id ? `Resend accepted it (id ${id}). Check that inbox — and the spam folder.` : 'Resend accepted it. Check that inbox.' }
    } catch (e) {
      test = { ok: false, to, detail: e instanceof Error ? e.message : 'Send failed.' }
    }
    // Record the attempt like any other send.
    try {
      const db = serviceDb()
      const { data: org } = await db.from('organizations').select('id').limit(1).single()
      await db.from('email_log').insert({
        org_id: (org as { id: string }).id,
        kind: 'test',
        to_email: to,
        subject: 'SquareOne Interactive — email test',
        ok: test.ok,
        error: test.ok ? null : test.detail,
      })
    } catch { /* email_log needs 0029 */ }
  }

  return NextResponse.json({
    checks,
    from,
    usingTestSender,
    domains: domains.map((d) => ({ name: d.name, status: d.status, region: d.region ?? '' })),
    test,
  })
}
