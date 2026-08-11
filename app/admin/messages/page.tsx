'use client'
import { useEffect, useState } from 'react'
import { PageHero } from '@/components/admin/PageHero'
import { AdminOnly } from '@/components/admin/AdminOnly'
import { card, INK, SUB, FAINT, LINE, BLUE, GREEN } from '@/lib/theme'
import { supabase, isSupabaseConfigured } from '@/lib/supabase'

type Audience = 'members' | 'bookers' | 'everyone'

const AUDIENCES: { id: Audience; label: string; sub: string }[] = [
  { id: 'members', label: 'Fitness members', sub: 'active memberships (incl. paid-through cancellations)' },
  { id: 'bookers', label: 'Room & event bookers', sub: 'everyone who has booked with an account' },
  { id: 'everyone', label: 'Everyone', sub: 'every person in the database with an email' },
]

interface SentMessage {
  id: string
  audience: Audience
  subject: string
  recipient_count: number
  sent_by: string
  created_at: string
}

export default function MessagesPage() {
  const [audience, setAudience] = useState<Audience>('members')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [count, setCount] = useState<number | null>(null)
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null)
  const [history, setHistory] = useState<SentMessage[]>([])

  const authedPost = async (payload: object) => {
    const { data } = await supabase().auth.getSession()
    const token = data.session?.access_token
    return fetch('/api/messages/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(payload),
    })
  }

  const loadHistory = async () => {
    const { data } = await supabase().from('messages').select('id, audience, subject, recipient_count, sent_by, created_at').order('created_at', { ascending: false }).limit(20)
    if (data) setHistory(data as SentMessage[])
  }

  useEffect(() => {
    if (!isSupabaseConfigured()) return
    loadHistory()
  }, [])

  // Live recipient count for the picked audience.
  useEffect(() => {
    if (!isSupabaseConfigured()) return
    let on = true
    setCount(null)
    authedPost({ audience, dryRun: true })
      .then(async (res) => { if (on && res.ok) setCount(((await res.json()) as { count: number }).count) })
      .catch(() => {})
    return () => { on = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audience])

  const send = async () => {
    if (sending || !subject.trim() || !body.trim()) return
    const label = AUDIENCES.find((a) => a.id === audience)?.label
    if (!window.confirm(`Send "${subject.trim()}" to ${count ?? '?'} ${label}? This emails real people.`)) return
    setSending(true)
    setResult(null)
    try {
      const res = await authedPost({ audience, subject, body })
      const json = (await res.json().catch(() => ({}))) as { sent?: number; total?: number; error?: string }
      if (res.ok) {
        setResult({ ok: true, text: `Sent to ${json.sent} of ${json.total} recipients.` })
        setSubject(''); setBody('')
        loadHistory()
      } else if (json.error === 'email_not_configured') {
        setResult({ ok: false, text: 'Email isn’t configured — add RESEND_API_KEY in Vercel and redeploy.' })
      } else if (json.error === 'no_recipients') {
        setResult({ ok: false, text: 'Nobody in that audience has an email on file yet.' })
      } else {
        setResult({ ok: false, text: 'Send failed — check the deployment logs.' })
      }
    } catch {
      setResult({ ok: false, text: 'Send failed — check your connection.' })
    }
    setSending(false)
  }

  return (
    <AdminOnly>
    <div className="sq-page" style={{ padding: '34px 40px 20px', maxWidth: 1180, margin: '0 auto' }}>
      <PageHero title="Messages" sub="Email your people in one send — fitness members, everyone who's booked, or the whole database. Every send is logged." chip="live" />

      <div className="sq-grid-2" style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 1.4fr) minmax(260px, 1fr)', gap: 16 }}>
        {/* Compose */}
        <div className="sq-card" style={{ ...card, padding: '20px 24px', alignSelf: 'start' }}>
          <p style={{ fontSize: 13.5, fontWeight: 700, color: INK, margin: '0 0 12px' }}>New message</p>

          <span className="sq-label">Send to</span>
          <div style={{ display: 'grid', gap: 8, marginBottom: 14 }}>
            {AUDIENCES.map((a) => (
              <label key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', border: `1.5px solid ${audience === a.id ? BLUE : LINE}`, background: audience === a.id ? '#eef4fb' : '#fff', borderRadius: 10, padding: '10px 13px' }}>
                <input type="radio" name="aud" checked={audience === a.id} onChange={() => setAudience(a.id)} style={{ accentColor: BLUE }} />
                <span style={{ flex: 1 }}>
                  <span style={{ display: 'block', fontSize: 13, fontWeight: 700, color: INK }}>{a.label}</span>
                  <span style={{ display: 'block', fontSize: 11.5, color: SUB }}>{a.sub}</span>
                </span>
                {audience === a.id && (
                  <span style={{ fontSize: 11.5, fontWeight: 700, color: BLUE, fontVariantNumeric: 'tabular-nums' }}>
                    {count === null ? '…' : `${count} recipient${count === 1 ? '' : 's'}`}
                  </span>
                )}
              </label>
            ))}
          </div>

          <div style={{ marginBottom: 12 }}>
            <label className="sq-label" htmlFor="msg-subject">Subject</label>
            <input id="msg-subject" className="sq-input" value={subject} placeholder="Holiday hours this weekend" onChange={(e) => setSubject(e.target.value)} />
          </div>
          <div style={{ marginBottom: 14 }}>
            <label className="sq-label" htmlFor="msg-body">Message</label>
            <textarea id="msg-body" className="sq-textarea" rows={7} value={body} placeholder="Write it like you'd say it at the front desk…" onChange={(e) => setBody(e.target.value)} />
          </div>

          <button className="sq-btn sq-btn-primary" style={{ width: '100%' }} disabled={sending || !subject.trim() || !body.trim() || count === 0} onClick={send}>
            {sending ? 'Sending…' : `Send to ${count ?? '…'} ${AUDIENCES.find((a) => a.id === audience)?.label.toLowerCase()}`}
          </button>
          {result && (
            <p style={{ fontSize: 12.5, fontWeight: 700, color: result.ok ? GREEN : '#cf4436', margin: '10px 0 0', textAlign: 'center' }}>{result.text}</p>
          )}
          <p style={{ fontSize: 10.5, color: FAINT, margin: '10px 0 0', lineHeight: 1.5 }}>
            Each person gets their own email — addresses are never shared. To send from your own address
            (instead of Resend&apos;s test sender), verify your domain at resend.com and set RESEND_FROM.
          </p>
        </div>

        {/* History */}
        <div className="sq-card" style={{ ...card, overflow: 'hidden', alignSelf: 'start' }}>
          <div style={{ padding: '13px 20px', borderBottom: `1px solid ${LINE}` }}>
            <span style={{ fontSize: 13.5, fontWeight: 700, color: INK }}>Sent messages</span>
          </div>
          {history.length === 0 && (
            <p style={{ fontSize: 13, color: SUB, padding: '16px 20px', margin: 0 }}>
              Nothing sent yet — your send log appears here (run 0018_messages.sql to enable it).
            </p>
          )}
          {history.map((h, i) => (
            <div key={h.id} style={{ padding: '11px 20px', borderBottom: i < history.length - 1 ? `1px solid ${LINE}` : 'none' }}>
              <p style={{ fontSize: 12.5, fontWeight: 700, color: INK, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.subject}</p>
              <p style={{ fontSize: 11, color: SUB, margin: '2px 0 0' }}>
                {AUDIENCES.find((a) => a.id === h.audience)?.label ?? h.audience} · {h.recipient_count} sent · {h.sent_by || 'staff'} ·{' '}
                {new Date(h.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
    </AdminOnly>
  )
}
