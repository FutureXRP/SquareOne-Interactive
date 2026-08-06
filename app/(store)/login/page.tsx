'use client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { card, INK, SUB, FAINT, BLUE } from '@/lib/theme'
import { signIn } from '@/lib/demo-session'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const canSubmit = /.+@.+\..+/.test(email) && password.length > 0

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSubmit) return
    signIn(email.trim())
    router.push('/account')
  }

  return (
    <div className="sq-page" style={{ padding: '40px 20px 10px', maxWidth: 440, margin: '0 auto' }}>
      <div style={{ textAlign: 'center', marginBottom: 22 }}>
        <h1 style={{ fontSize: 26, fontWeight: 800, color: INK, margin: '0 0 6px', letterSpacing: '-0.03em' }}>Welcome back</h1>
        <p style={{ fontSize: 13.5, color: SUB, margin: 0 }}>Sign in to your SquareOne profile.</p>
      </div>

      <form onSubmit={submit} className="sq-card" style={{ ...card, padding: '24px 26px' }}>
        <div style={{ marginBottom: 14 }}>
          <label className="sq-label" htmlFor="email">Email</label>
          <input id="email" type="email" className="sq-input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" />
        </div>
        <div style={{ marginBottom: 18 }}>
          <label className="sq-label" htmlFor="password">Password</label>
          <input id="password" type="password" className="sq-input" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Your password" autoComplete="current-password" />
        </div>
        <button type="submit" className="sq-btn sq-btn-primary" style={{ width: '100%' }} disabled={!canSubmit}>Sign in</button>
        <p style={{ fontSize: 12, color: FAINT, margin: '12px 0 0', textAlign: 'center' }}>
          New to SquareOne? <Link href="/signup" style={{ color: BLUE, fontWeight: 600 }}>Create a profile</Link>
        </p>
      </form>

      <p style={{ fontSize: 11, color: FAINT, margin: '14px 0 0', textAlign: 'center', lineHeight: 1.5 }}>
        Demo sign-in — any email works and stays on your device until real auth lands.
      </p>
    </div>
  )
}
