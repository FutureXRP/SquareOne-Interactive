'use client'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { card, INK, SUB, FAINT, BLUE, GREEN, RED } from '@/lib/theme'
import { supabase, isSupabaseConfigured } from '@/lib/supabase'
import { setMyPassword, sendResetEmail } from '@/lib/password-client'

// Where the "set a new password" email lands. Supabase signs the browser
// in with a short-lived recovery session when the link is opened, so the
// only thing left to do is choose the new password.
export default function ResetPasswordPage() {
  const [ready, setReady] = useState<'checking' | 'ok' | 'no-session'>('checking')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Fallback when the link has already expired
  const [email, setEmail] = useState('')
  const [resent, setResent] = useState(false)

  useEffect(() => {
    if (!isSupabaseConfigured()) { setReady('no-session'); return }
    let on = true
    const check = async () => {
      const { data } = await supabase().auth.getSession()
      if (on) setReady(data.session ? 'ok' : 'no-session')
    }
    // The recovery session arrives moments after the redirect, so listen as
    // well as look.
    const { data: sub } = supabase().auth.onAuthStateChange((_e, session) => {
      if (on && session) setReady('ok')
    })
    check()
    return () => { on = false; sub.subscription.unsubscribe() }
  }, [])

  const save = async () => {
    if (busy) return
    if (password !== confirm) { setError('Those two passwords don\'t match.'); return }
    setBusy(true)
    setError(null)
    const res = await setMyPassword(password)
    setBusy(false)
    if (res.ok) setDone(true)
    else setError(res.error ?? 'Could not set the password.')
  }

  const resend = async () => {
    setBusy(true)
    const res = await sendResetEmail(email)
    setBusy(false)
    if (res.ok) setResent(true)
    else setError(res.error ?? 'Could not send the email.')
  }

  return (
    <div className="sq-page" style={{ padding: '56px 20px', maxWidth: 440, margin: '0 auto' }}>
      {done ? (
        <div className="sq-card" style={{ ...card, padding: '30px 32px', textAlign: 'center' }}>
          <div style={{ width: 40, height: 40, borderRadius: 11, background: '#e5f2ea', color: GREEN, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
            <svg width="20" height="20" viewBox="0 0 16 16" fill="none"><path d="M3 8.5l3.2 3.2L13 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </div>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: INK, margin: '0 0 8px' }}>Password updated</h1>
          <p style={{ fontSize: 13.5, color: SUB, margin: '0 0 18px', lineHeight: 1.6 }}>
            You&apos;re signed in with your new password. Keep it somewhere safe.
          </p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link href="/account" className="sq-btn sq-btn-primary">My account</Link>
            <Link href="/" className="sq-btn sq-btn-ghost">Back to the store</Link>
          </div>
        </div>
      ) : ready === 'ok' ? (
        <div className="sq-card" style={{ ...card, padding: '28px 30px' }}>
          <h1 style={{ fontSize: 21, fontWeight: 800, color: INK, margin: '0 0 6px', letterSpacing: '-0.02em' }}>Choose a new password</h1>
          <p style={{ fontSize: 13, color: SUB, margin: '0 0 18px', lineHeight: 1.6 }}>At least 8 characters. Longer is better than complicated.</p>
          <div style={{ marginBottom: 14 }}>
            <label className="sq-label" htmlFor="rp-new">New password</label>
            <input id="rp-new" type="password" className="sq-input" autoComplete="new-password"
              value={password} onChange={(e) => { setPassword(e.target.value); setError(null) }} />
          </div>
          <div style={{ marginBottom: 18 }}>
            <label className="sq-label" htmlFor="rp-confirm">Type it again</label>
            <input id="rp-confirm" type="password" className="sq-input" autoComplete="new-password"
              value={confirm} onChange={(e) => { setConfirm(e.target.value); setError(null) }}
              onKeyDown={(e) => { if (e.key === 'Enter') save() }} />
          </div>
          <button className="sq-btn sq-btn-primary" style={{ width: '100%' }} disabled={busy || password.length < 8 || !confirm} onClick={save}>
            {busy ? 'Saving…' : 'Save new password'}
          </button>
          {error && <p style={{ fontSize: 12.5, color: RED, fontWeight: 600, margin: '10px 0 0', textAlign: 'center' }}>{error}</p>}
        </div>
      ) : ready === 'checking' ? (
        <p style={{ fontSize: 13, color: FAINT, textAlign: 'center' }}>One moment…</p>
      ) : (
        <div className="sq-card" style={{ ...card, padding: '28px 30px' }}>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: INK, margin: '0 0 8px', letterSpacing: '-0.02em' }}>That link has expired</h1>
          <p style={{ fontSize: 13, color: SUB, margin: '0 0 16px', lineHeight: 1.6 }}>
            Reset links are good for a short window. Enter your email and we&apos;ll send a fresh one.
          </p>
          {resent ? (
            <p style={{ fontSize: 13.5, color: GREEN, fontWeight: 700, margin: 0 }}>
              Sent. Check your inbox — and the spam folder, just in case.
            </p>
          ) : (
            <>
              <input className="sq-input" type="email" placeholder="you@email.com" style={{ marginBottom: 12 }}
                value={email} onChange={(e) => { setEmail(e.target.value); setError(null) }} />
              <button className="sq-btn sq-btn-primary" style={{ width: '100%' }} disabled={busy || !email.includes('@')} onClick={resend}>
                {busy ? 'Sending…' : 'Send a new link'}
              </button>
              {error && <p style={{ fontSize: 12.5, color: RED, fontWeight: 600, margin: '10px 0 0', textAlign: 'center' }}>{error}</p>}
              <p style={{ fontSize: 11.5, color: FAINT, margin: '14px 0 0', textAlign: 'center' }}>
                Staff resetting a dashboard login? <Link href="/admin" style={{ color: BLUE, fontWeight: 600 }}>Sign in here</Link> once it&apos;s done.
              </p>
            </>
          )}
        </div>
      )}
    </div>
  )
}
