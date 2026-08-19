'use client'
import { useCallback, useEffect, useState } from 'react'
import { PageHero } from '@/components/admin/PageHero'
import { card, INK, SUB, FAINT, LINE, BLUE, GREEN, GOLD, RED } from '@/lib/theme'
import { supabase, isSupabaseConfigured } from '@/lib/supabase'
import { getStaff, type StaffMember } from '@/lib/staff-store'
import { EmailWordingEditor } from '@/components/admin/EmailWording'
import { AdminOnly } from '@/components/admin/AdminOnly'

interface EmailCheck { label: string; status: 'ok' | 'warn' | 'fail'; detail: string; fix?: string }
interface DomainRow { name: string; status: string; region: string }
interface Diagnosis {
  checks: EmailCheck[]
  from: string
  usingTestSender: boolean
  domains: DomainRow[]
  test: { ok: boolean; detail: string; to: string } | null
}

interface LogRow {
  kind: string
  to_email: string
  subject: string
  ok: boolean
  error: string | null
  created_at: string
}

const TONE = {
  ok: { color: GREEN, bg: '#e5f2ea', mark: '✓', label: 'Good' },
  warn: { color: '#7a5a14', bg: '#faf0dc', mark: '!', label: 'Heads up' },
  fail: { color: RED, bg: '#fae7e4', mark: '×', label: 'Broken' },
}

export default function EmailHealthPage() {
  const [diag, setDiag] = useState<Diagnosis | null>(null)
  const [log, setLog] = useState<LogRow[] | null>(null)
  const [testTo, setTestTo] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Booking-assignment alert test: pick a staff member, run the exact
  // lookup a real assignment uses, and see where it breaks.
  const [staff, setStaff] = useState<StaffMember[]>([])
  const [assignStaffId, setAssignStaffId] = useState('')
  const [assignBusy, setAssignBusy] = useState(false)
  const [assignResult, setAssignResult] = useState<{ ok: boolean; detail: string } | null>(null)

  const testAssignment = async () => {
    if (assignBusy || !assignStaffId) return
    setAssignBusy(true)
    setAssignResult(null)
    try {
      const { data } = await supabase().auth.getSession()
      const token = data.session?.access_token
      if (!token) { setAssignResult({ ok: false, detail: 'Sign in again — your session expired.' }); setAssignBusy(false); return }
      const res = await fetch('/api/email/test-assignment', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ staffId: assignStaffId }),
      })
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; detail?: string }
      setAssignResult({ ok: !!json.ok, detail: json.detail ?? `The test itself failed (${res.status}).` })
    } catch (e) {
      setAssignResult({ ok: false, detail: e instanceof Error ? e.message : 'Could not run the test.' })
    }
    setAssignBusy(false)
    loadLog()
  }

  const run = useCallback(async (sendTo?: string) => {
    setBusy(true)
    setError(null)
    try {
      const { data } = await supabase().auth.getSession()
      const token = data.session?.access_token
      if (!token) { setError('Sign in again — your session expired.'); setBusy(false); return }
      const res = await fetch('/api/email/diagnose', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify(sendTo ? { testTo: sendTo } : {}),
      })
      if (!res.ok) {
        setError(res.status === 401 ? 'Only staff can run this check.' : `The check itself failed (${res.status}).`)
      } else {
        setDiag(await res.json() as Diagnosis)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not run the check.')
    }
    setBusy(false)
    loadLog()
  }, [])

  const loadLog = async () => {
    const { data, error } = await supabase()
      .from('email_log')
      .select('kind, to_email, subject, ok, error, created_at')
      .order('created_at', { ascending: false })
      .limit(25)
    setLog(error ? null : (data as LogRow[]))
  }

  useEffect(() => {
    if (!isSupabaseConfigured()) return
    run()
    getStaff().then(setStaff).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const worst = diag?.checks.some((c) => c.status === 'fail') ? 'fail'
    : diag?.checks.some((c) => c.status === 'warn') ? 'warn' : 'ok'
  const failures = (log ?? []).filter((l) => !l.ok)

  return (
    <AdminOnly>
    <div className="sq-page" style={{ padding: '34px 40px 20px', maxWidth: 1000, margin: '0 auto' }}>
      <PageHero
        title="Email health"
        sub="What's actually happening when the store tries to send a confirmation — the key, the domain, the From address, and a real test send."
        chip={diag ? TONE[worst].label : 'checking…'}
      >
        <button className="sq-btn" style={{ background: '#fff', color: '#182740' }} disabled={busy} onClick={() => run()}>
          {busy ? 'Checking…' : 'Re-check'}
        </button>
      </PageHero>

      {error && (
        <div className="sq-card" style={{ ...card, padding: '16px 20px', marginBottom: 16, borderLeft: `3px solid ${RED}` }}>
          <p style={{ fontSize: 13, color: RED, margin: 0, fontWeight: 600 }}>{error}</p>
        </div>
      )}

      {/* The checks */}
      <div className="sq-card" style={{ ...card, overflow: 'hidden', marginBottom: 16 }}>
        <div style={{ padding: '14px 20px', borderBottom: `1px solid ${LINE}` }}>
          <span style={{ fontSize: 13.5, fontWeight: 700, color: INK }}>Setup check</span>
        </div>
        {!diag && !error && <p style={{ fontSize: 13, color: SUB, padding: '16px 20px', margin: 0 }}>Running the check…</p>}
        {diag?.checks.map((c, i) => {
          const t = TONE[c.status]
          return (
            <div key={c.label} style={{ display: 'flex', gap: 12, padding: '14px 20px', borderBottom: i < diag.checks.length - 1 ? `1px solid ${LINE}` : 'none' }}>
              <span style={{
                width: 22, height: 22, borderRadius: 999, background: t.bg, color: t.color,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 13, fontWeight: 800, flexShrink: 0, marginTop: 1,
              }}>{t.mark}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 13.5, fontWeight: 700, color: INK, margin: '0 0 3px' }}>{c.label}</p>
                <p style={{ fontSize: 12.5, color: SUB, margin: 0, lineHeight: 1.6 }}>{c.detail}</p>
                {c.fix && (
                  <p style={{ fontSize: 12.5, color: t.color, margin: '6px 0 0', lineHeight: 1.6, fontWeight: 600 }}>
                    Fix: <span style={{ fontWeight: 500 }}>{c.fix}</span>
                  </p>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Domains as Resend sees them */}
      {diag && diag.domains.length > 0 && (
        <div className="sq-card" style={{ ...card, overflow: 'hidden', marginBottom: 16 }}>
          <div style={{ padding: '14px 20px', borderBottom: `1px solid ${LINE}` }}>
            <span style={{ fontSize: 13.5, fontWeight: 700, color: INK }}>Domains on your Resend account</span>
          </div>
          {diag.domains.map((d, i) => (
            <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 20px', borderBottom: i < diag.domains.length - 1 ? `1px solid ${LINE}` : 'none' }}>
              <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: INK }}>{d.name}</span>
              {d.region && <span style={{ fontSize: 11.5, color: FAINT }}>{d.region}</span>}
              <span style={{
                fontSize: 10.5, fontWeight: 700, borderRadius: 999, padding: '2px 10px',
                color: d.status === 'verified' ? GREEN : GOLD,
                background: d.status === 'verified' ? '#e5f2ea' : '#faf0dc',
              }}>{d.status}</span>
            </div>
          ))}
        </div>
      )}

      {/* Real send */}
      <div className="sq-card" style={{ ...card, padding: '18px 20px', marginBottom: 16 }}>
        <p style={{ fontSize: 13.5, fontWeight: 700, color: INK, margin: '0 0 4px' }}>Send a real test</p>
        <p style={{ fontSize: 12.5, color: SUB, margin: '0 0 12px', lineHeight: 1.55 }}>
          This sends an actual email through the same path a member confirmation takes. If Resend refuses it,
          you&apos;ll see its exact words below instead of silence.
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input
            className="sq-input"
            style={{ flex: 1, minWidth: 220 }}
            type="email"
            placeholder="where should the test go?"
            value={testTo}
            onChange={(e) => setTestTo(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && testTo.includes('@')) run(testTo) }}
          />
          <button className="sq-btn sq-btn-primary" style={{ padding: '10px 20px' }} disabled={busy || !testTo.includes('@')} onClick={() => run(testTo)}>
            {busy ? 'Sending…' : 'Send test email'}
          </button>
        </div>

        {diag?.test && (
          <div style={{
            marginTop: 12, padding: '12px 14px', borderRadius: 10,
            background: diag.test.ok ? '#e5f2ea' : '#fae7e4',
            border: `1px solid ${diag.test.ok ? '#bfe0cc' : '#f0c9c3'}`,
          }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: diag.test.ok ? GREEN : RED, margin: '0 0 3px' }}>
              {diag.test.ok ? `Sent to ${diag.test.to}` : `Not sent to ${diag.test.to}`}
            </p>
            <p style={{ fontSize: 12.5, color: INK, margin: 0, lineHeight: 1.6 }}>{diag.test.detail}</p>
            {!diag.test.ok && diag.usingTestSender && (
              <p style={{ fontSize: 12, color: SUB, margin: '6px 0 0', lineHeight: 1.55 }}>
                While the test sender is in use, Resend only allows delivery to the address that owns your Resend
                account. Any other address fails exactly like this.
              </p>
            )}
          </div>
        )}
      </div>

      {/* Every outgoing email's wording, editable */}
      <EmailWordingEditor />

      {/* Do assignment alerts reach this staff member? */}
      <div className="sq-card" style={{ ...card, padding: '18px 20px', marginBottom: 16 }}>
        <p style={{ fontSize: 13.5, fontWeight: 700, color: INK, margin: '0 0 4px' }}>Booking assignment alerts</p>
        <p style={{ fontSize: 12.5, color: SUB, margin: '0 0 12px', lineHeight: 1.55 }}>
          When someone is set as &ldquo;Run by&rdquo; on a booking, the alert goes to their <strong style={{ color: INK }}>login
          email</strong>. This runs that exact lookup for one person and either sends them a sample alert or tells you
          which link in the chain is missing — a staff member with no login linked gets nothing, silently.
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <select className="sq-select" style={{ flex: 1, minWidth: 220 }} value={assignStaffId} onChange={(e) => { setAssignStaffId(e.target.value); setAssignResult(null) }}>
            <option value="">— which staff member? —</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>{s.name}{s.linked ? '' : ' (no login linked)'}</option>
            ))}
          </select>
          <button className="sq-btn sq-btn-primary" style={{ padding: '10px 20px' }} disabled={assignBusy || !assignStaffId} onClick={testAssignment}>
            {assignBusy ? 'Testing…' : 'Send test alert'}
          </button>
        </div>
        {assignResult && (
          <div style={{
            marginTop: 12, padding: '12px 14px', borderRadius: 10,
            background: assignResult.ok ? '#e5f2ea' : '#fae7e4',
            border: `1px solid ${assignResult.ok ? '#bfe0cc' : '#f0c9c3'}`,
          }}>
            <p style={{ fontSize: 12.5, color: INK, margin: 0, lineHeight: 1.6, fontWeight: assignResult.ok ? 500 : 600 }}>{assignResult.detail}</p>
          </div>
        )}
      </div>

      {/* What actually went out */}
      <div className="sq-card" style={{ ...card, overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: `1px solid ${LINE}`, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 13.5, fontWeight: 700, color: INK }}>Recent sends</span>
          {failures.length > 0 && (
            <span style={{ fontSize: 10.5, fontWeight: 700, color: RED, background: '#fae7e4', padding: '2px 10px', borderRadius: 999 }}>
              {failures.length} failed
            </span>
          )}
        </div>
        {log === null ? (
          <p style={{ fontSize: 12.5, color: SUB, padding: '16px 20px', margin: 0 }}>
            The send log needs 0029_email_notifications.sql — run it in Supabase and every send gets recorded here.
          </p>
        ) : log.length === 0 ? (
          <p style={{ fontSize: 13, color: SUB, padding: '16px 20px', margin: 0 }}>Nothing sent yet.</p>
        ) : log.map((l, i) => (
          <div key={i} style={{ display: 'flex', gap: 12, padding: '11px 20px', borderBottom: i < log.length - 1 ? `1px solid ${LINE}` : 'none' }}>
            <span style={{
              width: 18, height: 18, borderRadius: 999, flexShrink: 0, marginTop: 2,
              background: l.ok ? '#e5f2ea' : '#fae7e4', color: l.ok ? GREEN : RED,
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800,
            }}>{l.ok ? '✓' : '×'}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 12.5, fontWeight: 600, color: INK, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {l.subject}
              </p>
              <p style={{ fontSize: 11.5, color: SUB, margin: 0 }}>
                {l.to_email} · {l.kind} · {new Date(l.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
              </p>
              {l.error && <p style={{ fontSize: 11.5, color: RED, margin: '3px 0 0', lineHeight: 1.5 }}>{l.error}</p>}
            </div>
          </div>
        ))}
      </div>

      <p style={{ fontSize: 11.5, color: FAINT, marginTop: 14, lineHeight: 1.6 }}>
        Nothing here reveals your API key — only whether it works. Remember that adding or changing an environment
        variable in Vercel does nothing until you <strong style={{ color: SUB }}>redeploy</strong>; that alone explains
        most &quot;I already set it&quot; cases.
      </p>
    </div>
    </AdminOnly>
  )
}
