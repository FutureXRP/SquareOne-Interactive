'use client'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useState } from 'react'
import { card, INK, SUB, FAINT, BLUE } from '@/lib/theme'
import { formatCents } from '@/lib/format'
import { planById } from '@/lib/store-data'
import { choosePlan, signUp } from '@/lib/demo-session'

function SignupForm() {
  const router = useRouter()
  const params = useSearchParams()
  const planParam = params.get('plan')
  const plan = planParam ? planById[planParam] : null

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const canSubmit = name.trim() && /.+@.+\..+/.test(email) && password.length >= 8

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSubmit) return
    signUp(name.trim(), email.trim())
    if (plan) choosePlan(plan.id as 'individual' | 'family')
    router.push(plan ? '/account/billing?welcome=1' : '/account')
  }

  return (
    <div className="sq-page" style={{ padding: '40px 20px 10px', maxWidth: 440, margin: '0 auto' }}>
      <div style={{ textAlign: 'center', marginBottom: 22 }}>
        <h1 style={{ fontSize: 26, fontWeight: 800, color: INK, margin: '0 0 6px', letterSpacing: '-0.03em' }}>Create your profile</h1>
        <p style={{ fontSize: 13.5, color: SUB, margin: 0 }}>
          {plan
            ? <>Joining on the <strong style={{ color: INK }}>{plan.name}</strong> plan · {formatCents(plan.priceCents)}/{plan.period}</>
            : 'One profile for memberships, bookings, waivers, and door access.'}
        </p>
      </div>

      <form onSubmit={submit} className="sq-card" style={{ ...card, padding: '24px 26px' }}>
        <div style={{ marginBottom: 14 }}>
          <label className="sq-label" htmlFor="name">Full name</label>
          <input id="name" className="sq-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Jordan Alvarez" autoComplete="name" />
        </div>
        <div style={{ marginBottom: 14 }}>
          <label className="sq-label" htmlFor="email">Email</label>
          <input id="email" type="email" className="sq-input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" />
        </div>
        <div style={{ marginBottom: 18 }}>
          <label className="sq-label" htmlFor="password">Password</label>
          <input id="password" type="password" className="sq-input" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="8+ characters" autoComplete="new-password" />
        </div>
        <button type="submit" className="sq-btn sq-btn-primary" style={{ width: '100%' }} disabled={!canSubmit}>
          {plan ? `Join · ${plan.name}` : 'Create profile'}
        </button>
        <p style={{ fontSize: 12, color: FAINT, margin: '12px 0 0', textAlign: 'center' }}>
          Already have one? <Link href="/login" style={{ color: BLUE, fontWeight: 600 }}>Sign in</Link>
        </p>
      </form>

      <p style={{ fontSize: 11, color: FAINT, margin: '14px 0 0', textAlign: 'center', lineHeight: 1.5 }}>
        Demo signup — real accounts (Supabase Auth) arrive with the backend. Nothing you enter here leaves your device.
      </p>
    </div>
  )
}

export default function SignupPage() {
  return <Suspense fallback={null}><SignupForm /></Suspense>
}
