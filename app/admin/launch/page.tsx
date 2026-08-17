'use client'
import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { PageHero } from '@/components/admin/PageHero'
import { card, INK, SUB, FAINT, LINE, BLUE, GREEN, RED } from '@/lib/theme'
import { supabase, isSupabaseConfigured } from '@/lib/supabase'
import { AdminOnly } from '@/components/admin/AdminOnly'

// Everything that has to be true before real customers arrive, checked
// against the real services rather than a list somebody remembered to
// keep up to date. Refresh until it's green.

interface Check {
  group: string
  label: string
  status: 'ok' | 'warn' | 'fail'
  detail: string
  fix?: string
}

interface Result { checks: Check[]; failed: number; warned: number; ready: boolean }

const TONE = {
  ok: { color: GREEN, bg: '#e5f2ea', mark: '✓' },
  warn: { color: '#7a5a14', bg: '#faf0dc', mark: '!' },
  fail: { color: RED, bg: '#fae7e4', mark: '×' },
}

const GROUP_ORDER = ['Payments', 'Email', 'Site', 'Database', 'Storefront']

export default function LaunchPage() {
  const [result, setResult] = useState<Result | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const run = useCallback(async () => {
    setBusy(true)
    setError(null)
    try {
      const { data } = await supabase().auth.getSession()
      const token = data.session?.access_token
      const res = await fetch('/api/preflight', {
        method: 'POST',
        headers: { authorization: `Bearer ${token ?? ''}`, 'content-type': 'application/json' },
      })
      if (!res.ok) throw new Error(res.status === 401 ? 'Sign in as staff to run this.' : 'Could not run the check.')
      setResult(await res.json() as Result)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not run the check.')
    }
    setBusy(false)
  }, [])

  useEffect(() => { if (isSupabaseConfigured()) run() }, [run])

  const groups = GROUP_ORDER
    .map((g) => [g, (result?.checks ?? []).filter((c) => c.group === g)] as const)
    .filter(([, list]) => list.length > 0)

  return (
    <AdminOnly>
      <div className="sq-page" style={{ padding: '34px 40px 20px', maxWidth: 1180, margin: '0 auto' }}>
        <PageHero
          title="Go live"
          sub="Every check below actually calls the service it names — Stripe is asked, the database is queried. Nothing here trusts a setting just because it exists."
          chip={result ? (result.ready ? 'Ready' : `${result.failed} blocking`) : 'Checking…'}
        >
          <button className="sq-btn" style={{ background: '#fff', color: '#182740' }} disabled={busy} onClick={run}>
            {busy ? 'Checking…' : 'Run checks again'}
          </button>
        </PageHero>

        {error && (
          <div className="sq-card" style={{ ...card, padding: '16px 20px', marginBottom: 16 }}>
            <p style={{ fontSize: 13, color: RED, margin: 0, fontWeight: 600 }}>{error}</p>
          </div>
        )}

        {result && (
          <div className="sq-card" style={{
            ...card, padding: '18px 22px', marginBottom: 18,
            background: result.ready ? '#e5f2ea' : '#fae7e4',
            border: `1px solid ${result.ready ? '#bcdfc9' : '#f0cdc7'}`,
          }}>
            <p style={{ fontSize: 15, fontWeight: 800, color: result.ready ? '#1d6b3f' : '#a33427', margin: '0 0 4px' }}>
              {result.ready
                ? 'Everything needed to take real customers is in place.'
                : `${result.failed} thing${result.failed === 1 ? '' : 's'} would break for a real customer right now.`}
            </p>
            <p style={{ fontSize: 12.5, color: SUB, margin: 0, lineHeight: 1.55 }}>
              {result.ready
                ? result.warned > 0
                  ? `${result.warned} item${result.warned === 1 ? '' : 's'} worth a look below, but nothing that stops a sale.`
                  : 'No warnings either. Take a test booking end to end and you are open.'
                : 'Fix the red items below, redeploy if you changed an environment variable, then run the checks again.'}
            </p>
          </div>
        )}

        {groups.map(([group, list]) => (
          <div key={group} className="sq-card" style={{ ...card, marginBottom: 16, overflow: 'hidden' }}>
            <div style={{ padding: '12px 20px', borderBottom: `1px solid ${LINE}` }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: FAINT, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{group}</span>
            </div>
            {list.map((c, i) => {
              const tone = TONE[c.status]
              return (
                <div key={c.label} style={{ display: 'flex', gap: 12, padding: '13px 20px', borderBottom: i < list.length - 1 ? `1px solid ${LINE}` : 'none' }}>
                  <span style={{
                    width: 20, height: 20, borderRadius: 999, background: tone.bg, color: tone.color,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 12, fontWeight: 800, flexShrink: 0, marginTop: 1,
                  }}>{tone.mark}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 700, color: INK, margin: '0 0 2px' }}>{c.label}</p>
                    <p style={{ fontSize: 12.5, color: SUB, margin: 0, lineHeight: 1.55 }}>{c.detail}</p>
                    {c.fix && (
                      <p style={{ fontSize: 12, color: INK, margin: '6px 0 0', lineHeight: 1.55, background: '#f3f6fb', border: `1px solid ${LINE}`, borderRadius: 8, padding: '8px 10px', wordBreak: 'break-word' }}>
                        <strong style={{ color: BLUE }}>Fix:</strong> {c.fix}
                      </p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        ))}

        <div className="sq-card" style={{ ...card, padding: '16px 20px' }}>
          <p style={{ fontSize: 12.5, fontWeight: 700, color: INK, margin: '0 0 6px' }}>Last thing, and no page can check it for you</p>
          <p style={{ fontSize: 12.5, color: SUB, margin: 0, lineHeight: 1.6 }}>
            Buy something. Join a membership with a real card, book a room and pay the deposit from the member
            account, then cancel and refund both from the desk. That single pass exercises Stripe, the webhook,
            the email sender, and the booking book together — which is the only proof that matters.
            {' '}<Link href="/admin/email" style={{ color: BLUE, fontWeight: 600 }}>Email health</Link> can send a
            real test message on its own if you want to check that part first.
          </p>
        </div>
      </div>
    </AdminOnly>
  )
}
