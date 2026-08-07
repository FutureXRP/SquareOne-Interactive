'use client'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { card, INK, SUB, FAINT } from '@/lib/theme'
import { getMyStaff, STAFF_EVENT, type StaffMember } from '@/lib/staff-store'
import { isSignedIn, signInAuth, signOut, SESSION_EVENT } from '@/lib/session'
import { isSupabaseConfigured } from '@/lib/supabase'
import { NOT_CONFIGURED_MSG } from '@/lib/use-live'

type GateState =
  | { kind: 'loading' }
  | { kind: 'unconfigured' }
  | { kind: 'signed-out' }
  | { kind: 'not-staff' }
  | { kind: 'staff'; me: StaffMember }

// Gates the whole admin behind a staff login. RLS is the real enforcement —
// this gate is the honest UI for it.
export function AdminGate({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<GateState>({ kind: 'loading' })
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!isSupabaseConfigured()) { setState({ kind: 'unconfigured' }); return }
    let on = true
    const sync = async () => {
      try {
        if (!(await isSignedIn())) { if (on) setState({ kind: 'signed-out' }); return }
        const me = await getMyStaff()
        if (on) setState(me ? { kind: 'staff', me } : { kind: 'not-staff' })
      } catch {
        if (on) setState({ kind: 'signed-out' })
      }
    }
    sync()
    window.addEventListener(SESSION_EVENT, sync)
    window.addEventListener(STAFF_EVENT, sync)
    return () => {
      on = false
      window.removeEventListener(SESSION_EVENT, sync)
      window.removeEventListener(STAFF_EVENT, sync)
    }
  }, [])

  if (state.kind === 'loading') return <div style={{ minHeight: '60vh' }} />
  if (state.kind === 'staff') return <>{children}</>

  if (state.kind === 'unconfigured') {
    return (
      <div className="sq-page" style={{ padding: '48px 40px', maxWidth: 560, margin: '0 auto' }}>
        <div className="sq-card" style={{ ...card, padding: '28px 30px' }}>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: INK, margin: '0 0 8px' }}>Connect Supabase to open the dashboard</h1>
          <p style={{ fontSize: 13.5, color: SUB, margin: 0, lineHeight: 1.6 }}>{NOT_CONFIGURED_MSG}</p>
        </div>
      </div>
    )
  }

  if (state.kind === 'not-staff') {
    return (
      <div className="sq-page" style={{ padding: '48px 40px', maxWidth: 560, margin: '0 auto' }}>
        <div className="sq-card" style={{ ...card, padding: '28px 30px' }}>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: INK, margin: '0 0 8px' }}>This account isn&apos;t staff</h1>
          <p style={{ fontSize: 13.5, color: SUB, margin: '0 0 16px', lineHeight: 1.6 }}>
            You&apos;re signed in, but this login isn&apos;t linked to a staff role. An owner or manager can link it
            in Settings → Staff &amp; roles, or run the owner-link SQL from the setup notes.
          </p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button className="sq-btn sq-btn-ghost" onClick={() => signOut()}>Sign out</button>
            <Link href="/" className="sq-btn sq-btn-primary">Go to the store</Link>
          </div>
        </div>
      </div>
    )
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    const res = await signInAuth(email.trim(), password)
    setSubmitting(false)
    if (!res.ok) setError(res.error ?? 'Sign-in failed')
  }

  return (
    <div className="sq-page" style={{ padding: '48px 40px', maxWidth: 440, margin: '0 auto' }}>
      <div style={{ textAlign: 'center', marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: INK, margin: '0 0 6px', letterSpacing: '-0.02em' }}>Staff sign in</h1>
        <p style={{ fontSize: 13, color: SUB, margin: 0 }}>The dashboard is for SquareOne staff.</p>
      </div>
      <form onSubmit={submit} className="sq-card" style={{ ...card, padding: '24px 26px' }}>
        <div style={{ marginBottom: 14 }}>
          <label className="sq-label" htmlFor="ga-email">Email</label>
          <input id="ga-email" type="email" className="sq-input" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
        </div>
        <div style={{ marginBottom: 18 }}>
          <label className="sq-label" htmlFor="ga-pass">Password</label>
          <input id="ga-pass" type="password" className="sq-input" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
        </div>
        <button type="submit" className="sq-btn sq-btn-primary" style={{ width: '100%' }} disabled={submitting}>
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>
        {error && <p style={{ fontSize: 12, color: '#cf4436', fontWeight: 600, margin: '10px 0 0', textAlign: 'center' }}>{error}</p>}
      </form>
      <p style={{ fontSize: 11, color: FAINT, margin: '14px 0 0', textAlign: 'center' }}>
        No staff account? Members use the <Link href="/" style={{ color: '#2f6db8', fontWeight: 600 }}>store</Link>.
      </p>
    </div>
  )
}
