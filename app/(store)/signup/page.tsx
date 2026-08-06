'use client'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useState } from 'react'
import { card, INK, SUB, FAINT, BLUE } from '@/lib/theme'
import { formatCents } from '@/lib/format'
import { getPlan } from '@/lib/plans-store'
import { choosePlan, signUp } from '@/lib/demo-session'
import { WaiverPanel } from '@/components/store/WaiverPanel'
import { FITNESS_WAIVER } from '@/lib/waiver-defs'

function SignupForm() {
  const router = useRouter()
  const params = useSearchParams()
  const planParam = params.get('plan')
  const plan = planParam ? getPlan(planParam) : null

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [step, setStep] = useState<'form' | 'waiver'>('form')

  const canSubmit = name.trim() && /.+@.+\..+/.test(email) && password.length >= 8

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSubmit) return
    signUp(name.trim(), email.trim())
    if (plan) {
      // Joining the fitness center — the fitness waiver is part of signup.
      setStep('waiver')
    } else {
      router.push('/account')
    }
  }

  const finishJoin = () => {
    if (plan) choosePlan(plan.id)
    router.push('/account/billing?welcome=1')
  }

  if (step === 'waiver' && plan) {
    return (
      <div className="sq-page" style={{ padding: '40px 20px 10px', maxWidth: 520, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 18 }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: BLUE, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 6px' }}>Step 2 of 2</p>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: INK, margin: '0 0 6px', letterSpacing: '-0.03em' }}>One signature and you&apos;re in</h1>
          <p style={{ fontSize: 13.5, color: SUB, margin: 0 }}>
            The fitness center waiver covers everyone on your {plan.name} plan.
          </p>
        </div>
        <WaiverPanel def={FITNESS_WAIVER} onSigned={finishJoin} />
      </div>
    )
  }

  return (
    <div className="sq-page" style={{ padding: '40px 20px 10px', maxWidth: 440, margin: '0 auto' }}>
      <div style={{ textAlign: 'center', marginBottom: 22 }}>
        {plan && <p style={{ fontSize: 11, fontWeight: 700, color: BLUE, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 6px' }}>Step 1 of 2</p>}
        <h1 style={{ fontSize: 26, fontWeight: 800, color: INK, margin: '0 0 6px', letterSpacing: '-0.03em' }}>Create your profile</h1>
        <p style={{ fontSize: 13.5, color: SUB, margin: 0 }}>
          {plan
            ? <>Joining on the <strong style={{ color: INK }}>{plan.name}</strong> plan · {formatCents(plan.priceCents)}/{plan.period} · fitness waiver next</>
            : 'One profile for fitness memberships, bookings, and door access.'}
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
          {plan ? 'Continue to waiver' : 'Create profile'}
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
