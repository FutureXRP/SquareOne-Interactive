import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { serviceDb, stripe, stripeConfigured, DEFAULT_FROM } from '@/lib/server/billing'

// Go-live readiness. Every check actually probes the thing it names —
// Stripe is called, the database is queried, the columns are looked for —
// rather than trusting that an environment variable being present means
// the service behind it works. Staff only, and no secret is ever returned.

export interface Check {
  group: string
  label: string
  status: 'ok' | 'warn' | 'fail'
  detail: string
  fix?: string
}

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

// Does this column exist? A `limit 0` select is the cheapest honest way to
// ask, and it's how we tell which migrations have actually been run.
async function hasColumn(table: string, column: string): Promise<boolean> {
  const { error } = await serviceDb().from(table).select(column).limit(1)
  return !error
}

async function hasTable(table: string): Promise<boolean> {
  const { error } = await serviceDb().from(table).select('*').limit(1)
  return !error
}

function domainOf(from: string): string | null {
  const m = /<([^>]+)>/.exec(from)
  const addr = (m ? m[1] : from).trim()
  const at = addr.lastIndexOf('@')
  return at > 0 ? addr.slice(at + 1).toLowerCase() : null
}

export async function POST(req: Request) {
  if (!(await callerStaff(req))) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const checks: Check[] = []
  const add = (c: Check) => checks.push(c)

  // ── Payments ───────────────────────────────────────────────
  const key = process.env.STRIPE_SECRET_KEY ?? ''
  if (!key) {
    add({
      group: 'Payments', label: 'Stripe secret key', status: 'fail',
      detail: 'STRIPE_SECRET_KEY is not set, so no card can be charged anywhere on the site.',
      fix: 'Stripe → Developers → API keys → copy the secret key into Vercel as STRIPE_SECRET_KEY, then redeploy.',
    })
  } else {
    const live = key.startsWith('sk_live_')
    add({
      group: 'Payments', label: 'Stripe mode', status: live ? 'ok' : 'warn',
      detail: live
        ? 'Live keys — real cards will be charged.'
        : 'Test keys are in place. Real customers cannot pay; test cards will appear to work.',
      fix: live ? undefined : 'Swap STRIPE_SECRET_KEY for the sk_live_… key when you are ready to take real money.',
    })
    // Prove the key actually works rather than assuming a well-formed
    // string is a working one.
    try {
      // Called with no id, this returns the account the key belongs to.
      // The typings insist on an id; the API does not.
      const accounts = stripe().accounts as unknown as { retrieve: () => Promise<{ id: string; charges_enabled: boolean; business_profile?: { name?: string | null } | null }> }
      const account = await accounts.retrieve()
      const ready = account.charges_enabled
      add({
        group: 'Payments', label: 'Stripe account', status: ready ? 'ok' : 'fail',
        detail: ready
          ? `Connected to ${account.business_profile?.name || account.id} and able to accept charges.`
          : 'Stripe answered, but this account cannot accept charges yet.',
        fix: ready ? undefined : 'Finish Stripe onboarding — Stripe dashboard → Home will list what it still needs.',
      })
    } catch (e) {
      add({
        group: 'Payments', label: 'Stripe account', status: 'fail',
        detail: `Stripe refused the key: ${e instanceof Error ? e.message : 'unknown error'}`,
        fix: 'Check the key was copied whole, with no trailing spaces.',
      })
    }
  }

  // Which wallets Checkout will actually offer. Cash App Pay is a
  // dashboard toggle, so say whether it's on rather than leaving it to
  // "book something and see".
  if (key) {
    try {
      const configs = await stripe().paymentMethodConfigurations.list({ limit: 10 })
      const active = configs.data.find((c) => c.is_default) ?? configs.data[0]
      // The SDK types lag the API here; the shape is documented.
      const cashapp = (active as unknown as { cashapp?: { available?: boolean; display_preference?: { value?: string } } } | undefined)?.cashapp
      const cashOn = !!cashapp?.available && cashapp.display_preference?.value === 'on'
      add({
        group: 'Payments', label: 'Cash App Pay', status: cashOn ? 'ok' : 'warn',
        detail: cashOn
          ? 'Enabled — checkout and pay links offer Cash App alongside cards, and payments record as Cash App.'
          : 'Not enabled. Customers only see card at checkout.',
        fix: cashOn ? undefined : 'Stripe → Settings → Payments → Payment methods → turn on Cash App Pay. No code change needed.',
      })
    } catch {
      // Older accounts without payment method configurations — skip quietly.
    }
  }

  const whsec = process.env.STRIPE_WEBHOOK_SECRET ?? ''
  add({
    group: 'Payments', label: 'Stripe webhook', status: whsec ? 'ok' : 'fail',
    detail: whsec
      ? 'Signing secret is set, so Stripe can tell us when a payment lands.'
      : 'No signing secret. Payments would go through at Stripe but never be recorded here — memberships would not activate and booking balances would not update.',
    fix: whsec ? undefined
      : 'Stripe → Developers → Webhooks → add endpoint https://YOUR-DOMAIN/api/billing/webhook with events checkout.session.completed, customer.subscription.updated, customer.subscription.deleted, invoice.paid, invoice.payment_failed. Copy its signing secret to STRIPE_WEBHOOK_SECRET.',
  })

  // ── Site address ───────────────────────────────────────────
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? ''
  const origin = req.headers.get('origin') ?? ''
  if (!site) {
    add({
      group: 'Site', label: 'Site address', status: 'fail',
      detail: 'NEXT_PUBLIC_SITE_URL is not set. Stripe would send customers back to the wrong place after paying, and email links would point at localhost.',
      fix: 'Set NEXT_PUBLIC_SITE_URL to the address customers actually type, then redeploy.',
    })
  } else {
    // This one is easy to fill in wrongly, and the failure is expensive:
    // everything else is built by appending a path to it, so a scheme-less
    // value or a stray path silently corrupts every payment redirect and
    // every link in every email.
    let shape: string | null = null
    if (!/^https?:\/\//i.test(site)) {
      shape = 'It has no https:// on the front. Stripe rejects a redirect URL that isn\'t absolute, so checkout would fail before the customer saw a card form.'
    } else {
      let path = ''
      try { path = new URL(site).pathname } catch { shape = 'That is not a URL Stripe or a browser can use.' }
      if (!shape && path && path !== '/') {
        shape = `It ends in a path (${path}). This is the base address everything else gets appended to, so pay links would come out as ${site}/pay/… — set it to just the scheme and host.`
      }
    }

    if (shape) {
      add({
        group: 'Site', label: 'Site address', status: 'fail',
        detail: `NEXT_PUBLIC_SITE_URL is ${site}. ${shape}`,
        fix: `Set it to just the address customers open, with nothing after the host — for example ${origin || 'https://your-app.vercel.app'} — then redeploy.`,
      })
    } else {
      const matches = !origin || site.replace(/\/$/, '') === origin.replace(/\/$/, '')
      add({
        group: 'Site', label: 'Site address', status: matches ? 'ok' : 'warn',
        detail: matches ? `Set to ${site}.` : `Set to ${site}, but you are looking at this page on ${origin}.`,
        fix: matches ? undefined : `Point NEXT_PUBLIC_SITE_URL at the address customers use — probably ${origin} — so payment redirects and email links land there. The Stripe webhook endpoint has to match it too.`,
      })
    }
  }

  // ── Email ──────────────────────────────────────────────────
  const resendKey = process.env.RESEND_API_KEY ?? ''
  const from = process.env.RESEND_FROM || DEFAULT_FROM
  if (!resendKey) {
    add({
      group: 'Email', label: 'Resend key', status: 'fail',
      detail: 'RESEND_API_KEY is not set — no confirmation, receipt, or cancellation email will go out.',
      fix: 'Resend → API Keys → create one, add it to Vercel as RESEND_API_KEY.',
    })
  } else if (!process.env.RESEND_FROM || from.includes('resend.dev')) {
    // This one bites quietly: the shared test sender only ever delivers to
    // the Resend account owner, so every customer email silently fails.
    add({
      group: 'Email', label: 'From address', status: 'fail',
      detail: 'Still sending as onboarding@resend.dev. Resend only delivers that address to your own inbox, so no customer would receive anything.',
      fix: 'Set RESEND_FROM to an address on your verified domain, e.g. SquareOne Interactive <hello@squareoneinteractive.com>.',
    })
  } else {
    add({
      group: 'Email', label: 'From address', status: 'ok',
      detail: `Sending as ${from} (${domainOf(from)}). Confirm that domain shows Verified in Resend — the Email tab can send a real test.`,
    })
  }

  // ── Scheduled reminders ────────────────────────────────────
  add({
    group: 'Site', label: 'Reminder schedule', status: process.env.CRON_SECRET ? 'ok' : 'warn',
    detail: process.env.CRON_SECRET
      ? 'Hourly tour and event reminders can run unattended.'
      : 'CRON_SECRET is not set. The hourly reminder job will refuse unauthenticated calls, so staff and guests get no tour reminders unless someone presses the button on the Calendar tab.',
    fix: process.env.CRON_SECRET ? undefined
      : 'Add CRON_SECRET to Vercel as any long random string. Vercel Cron sends it automatically.',
  })

  // ── Database ───────────────────────────────────────────────
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    add({
      group: 'Database', label: 'Service role key', status: 'fail',
      detail: 'SUPABASE_SERVICE_ROLE_KEY is not set — webhooks, emails, and password resets cannot reach the database.',
      fix: 'Supabase → Project Settings → API → service_role key. Never prefix it with NEXT_PUBLIC.',
    })
  } else {
    const migrations: [string, string, () => Promise<boolean>][] = [
      ['0033 — reservations in review', 'Bookings would not wait for staff sign-off, and members could not cancel or move their own.', () => hasColumn('bookings', 'approved_at')],
      ['0034 — waiver records', 'Signatures would not keep a copy of the wording people agreed to.', () => hasColumn('form_submissions', 'signed_terms')],
      ['0035 — standing reservations', 'Recurring groups cannot be scheduled.', () => hasTable('standing_reservations')],
    ]
    for (const [label, why, probe] of migrations) {
      const present = await probe()
      add({
        group: 'Database', label, status: present ? 'ok' : 'fail',
        detail: present ? 'Applied.' : `Not applied. ${why}`,
        fix: present ? undefined : 'Run this migration in the Supabase SQL editor, in order.',
      })
    }
  }

  // ── What customers will actually see ───────────────────────
  const db = serviceDb()
  const { count: planCount } = await db.from('membership_plans').select('id', { count: 'exact', head: true }).eq('active', true)
  add({
    group: 'Storefront', label: 'Membership plans', status: (planCount ?? 0) > 0 ? 'ok' : 'fail',
    detail: (planCount ?? 0) > 0 ? `${planCount} plan${planCount === 1 ? '' : 's'} on sale.` : 'No active plans — the memberships page would be empty.',
    fix: (planCount ?? 0) > 0 ? undefined : 'Publish at least one plan on the Memberships tab.',
  })

  const { count: roomCount } = await db.from('facilities').select('id', { count: 'exact', head: true }).eq('active', true)
  add({
    group: 'Storefront', label: 'Bookable rooms', status: (roomCount ?? 0) > 0 ? 'ok' : 'fail',
    detail: (roomCount ?? 0) > 0 ? `${roomCount} room${roomCount === 1 ? '' : 's'} bookable.` : 'No active rooms — nobody could book anything.',
    fix: (roomCount ?? 0) > 0 ? undefined : 'Activate rooms on the Rooms tab.',
  })

  // A published waiver with nothing to read or decide asks people to agree
  // to nothing. Paragraphs, choice questions, and agreement checkboxes all
  // count as substance — a photo release that is only an either/or question
  // is a complete form.
  const { data: forms } = await db.from('forms').select('id, name, fields').eq('status', 'active')
  const empty = ((forms ?? []) as { name: string; fields: { type: string; label?: string; content?: string; options?: string[] }[] }[])
    .filter((f) => !(Array.isArray(f.fields) ? f.fields : []).some((fl) =>
      (fl.type === 'paragraph' && fl.content?.trim())
      || ((fl.type === 'multi' || fl.type === 'single') && (fl.options ?? []).length > 0)
      || (fl.type === 'checkbox' && fl.label?.trim())))
    .map((f) => f.name)
  add({
    group: 'Storefront', label: 'Waiver wording', status: empty.length === 0 ? 'ok' : 'fail',
    detail: empty.length === 0
      ? 'Every published waiver has text people can read and agree to.'
      : `Nothing to read or agree to yet in: ${empty.join(', ')}. Nobody will be asked to sign these, so you would be operating with no signed waiver on file.`,
    fix: empty.length === 0 ? undefined
      : 'Forms & Waivers tab → open each one → add an info paragraph, a pick-one question, or an agreement checkbox.',
  })

  // Somebody has to be able to get into the admin side.
  const { count: linkedStaff } = await db.from('staff').select('id', { count: 'exact', head: true })
    .eq('active', true).not('user_id', 'is', null)
  add({
    group: 'Storefront', label: 'Staff sign-in', status: (linkedStaff ?? 0) > 0 ? 'ok' : 'fail',
    detail: (linkedStaff ?? 0) > 0
      ? `${linkedStaff} staff member${linkedStaff === 1 ? '' : 's'} can sign in to the admin side.`
      : 'No staff row is linked to a login, so nobody can reach the admin pages.',
    fix: (linkedStaff ?? 0) > 0 ? undefined
      : "In Supabase SQL: update staff set user_id = (select id from auth.users where email = 'you@example.com') where role = 'owner';",
  })

  const failed = checks.filter((c) => c.status === 'fail').length
  const warned = checks.filter((c) => c.status === 'warn').length
  return NextResponse.json({ checks, failed, warned, ready: failed === 0 })
}
