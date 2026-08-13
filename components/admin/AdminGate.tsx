'use client'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Sidebar } from '@/components/layout/Sidebar'
import { Logo } from '@/components/Logo'
import { card, INK, SUB, FAINT, NAVY } from '@/lib/theme'
import { getMyStaff, STAFF_EVENT, type StaffMember } from '@/lib/staff-store'
import { isSignedIn, signInAuth, signOut, SESSION_EVENT } from '@/lib/session'
import { isSupabaseConfigured } from '@/lib/supabase'
import { NOT_CONFIGURED_MSG } from '@/lib/use-live'
import { ForgotPassword } from '@/components/store/ForgotPassword'

type GateState =
  | { kind: 'loading' }
  | { kind: 'unconfigured' }
  | { kind: 'signed-out' }
  | { kind: 'not-staff' }
  | { kind: 'staff'; me: StaffMember }

function SquareMark() {
  return (
    <div style={{ margin: '0 auto 12px', width: 40 }}>
      <Logo size={40} radius={10} />
    </div>
  )
}

// A bare, centered screen — nothing about the dashboard (no nav, no module
// names) renders until a staff-linked login is verified. RLS in the database
// is the real enforcement; this is the honest UI for it.
function LockScreen({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 20px' }}>
      <div style={{ width: '100%', maxWidth: 400 }}>{children}</div>
      <p style={{ fontSize: 11, color: FAINT, marginTop: 26 }}>SquareOne Interactive · part of SquareOne Compassion</p>
    </div>
  )
}

// Wraps the ENTIRE admin shell: sidebar, content, and footer only exist for
// verified staff. Everyone else gets a sign-in screen and nothing more.
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

  if (state.kind === 'loading') return <div style={{ minHeight: '100vh' }} />

  if (state.kind === 'staff') {
    return (
      <div className="sq-shell" style={{ display: 'flex', minHeight: '100vh' }}>
        <Sidebar staffName={state.me.name} staffRole={state.me.role} onSignOut={() => signOut()} />
        <main style={{ flex: 1, overflow: 'auto', minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <div style={{ flex: 1 }}>{children}</div>
          <footer style={{ background: NAVY, color: 'rgba(255,255,255,0.62)', marginTop: 30 }}>
            <div style={{ maxWidth: 1180, margin: '0 auto', padding: '16px 40px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px 18px', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px 18px', flexWrap: 'wrap' }}>
                {['Early Learning Center', 'Interactive', 'Medical Center', 'Event Rooms', 'Donate'].map((s, i) => (
                  <span key={s} style={{ fontSize: 11.5, fontWeight: s === 'Interactive' ? 700 : 500, color: s === 'Interactive' ? '#fff' : 'rgba(255,255,255,0.62)', display: 'inline-flex', alignItems: 'center', gap: 18 }}>
                    {i > 0 && <span style={{ width: 4, height: 4, background: 'rgba(255,255,255,0.3)', borderRadius: 1, transform: 'rotate(45deg)' }} />}
                    {s}
                  </span>
                ))}
              </div>
              <span style={{ fontSize: 11.5 }}>part of SquareOne Compassion</span>
            </div>
          </footer>
        </main>
      </div>
    )
  }

  if (state.kind === 'unconfigured') {
    return (
      <LockScreen>
        <div className="sq-card" style={{ ...card, padding: '28px 30px', textAlign: 'center' }}>
          <SquareMark />
          <h1 style={{ fontSize: 19, fontWeight: 800, color: INK, margin: '0 0 8px' }}>Dashboard not connected</h1>
          <p style={{ fontSize: 13, color: SUB, margin: 0, lineHeight: 1.6 }}>{NOT_CONFIGURED_MSG}</p>
        </div>
      </LockScreen>
    )
  }

  if (state.kind === 'not-staff') {
    return (
      <LockScreen>
        <div className="sq-card" style={{ ...card, padding: '28px 30px', textAlign: 'center' }}>
          <SquareMark />
          <h1 style={{ fontSize: 19, fontWeight: 800, color: INK, margin: '0 0 8px' }}>Staff only</h1>
          <p style={{ fontSize: 13, color: SUB, margin: '0 0 16px', lineHeight: 1.6 }}>
            You&apos;re signed in, but this login isn&apos;t linked to a staff role.
            An owner or manager can link it in Settings → Staff &amp; roles.
          </p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button className="sq-btn sq-btn-ghost" onClick={() => signOut()}>Sign out</button>
            <Link href="/" className="sq-btn sq-btn-primary">Go to the store</Link>
          </div>
        </div>
      </LockScreen>
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
    <LockScreen>
      <div style={{ textAlign: 'center', marginBottom: 18 }}>
        <SquareMark />
        <h1 style={{ fontSize: 21, fontWeight: 800, color: INK, margin: '0 0 4px', letterSpacing: '-0.02em' }}>Staff sign in</h1>
        <p style={{ fontSize: 13, color: SUB, margin: 0 }}>This area is for SquareOne staff only.</p>
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
        <ForgotPassword defaultEmail={email} />
      </form>
      <p style={{ fontSize: 11.5, color: FAINT, margin: '14px 0 0', textAlign: 'center' }}>
        Looking for the gym? <Link href="/" style={{ color: '#2f6db8', fontWeight: 600 }}>Visit the store</Link>
      </p>
    </LockScreen>
  )
}
