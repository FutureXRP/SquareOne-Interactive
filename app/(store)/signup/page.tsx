'use client'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useEffect, useState } from 'react'
import { card, INK, SUB, FAINT, BLUE, GREEN } from '@/lib/theme'
import { formatCents } from '@/lib/format'
import { getPlanLive, type EditablePlan } from '@/lib/plans-store'
import { signUpAuth, choosePlan, isSignedIn, getProfile } from '@/lib/session'
import { startMembershipCheckout } from '@/lib/billing-client'
import { WaiverPanel } from '@/components/store/WaiverPanel'
import { unsignedRequiredWaivers, type RequiredWaiver } from '@/lib/waivers-live'
import { isSupabaseConfigured } from '@/lib/supabase'
import { NOT_CONFIGURED_MSG } from '@/lib/use-live'

function SignupForm() {
  const router = useRouter()
  const params = useSearchParams()
  const planParam = params.get('plan')
  const [plan, setPlan] = useState<EditablePlan | null>(null)

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [step, setStep] = useState<'checking' | 'form' | 'waiver' | 'confirm-email'>('checking')
  const [waivers, setWaivers] = useState<RequiredWaiver[]>([])
  const [waiverIdx, setWaiverIdx] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (planParam && isSupabaseConfigured()) {
      getPlanLive(planParam).then(setPlan).catch(() => {})
    }
  }, [planParam])

  // Already signed in? Skip profile creation — go straight to the waiver,
  // or straight to the plan if the fitness waiver is already on file.
  useEffect(() => {
    let on = true
    const route = async () => {
      if (!isSupabaseConfigured() || !(await isSignedIn())) { if (on) setStep('form'); return }
      if (!planParam) { router.replace('/account'); return }
      const profile = await getProfile()
      if (profile?.name && on) setName(profile.name)
      const due = await unsignedRequiredWaivers({ planId: planParam })
      if (due.length === 0) {
        // Card first when Stripe is live; otherwise activate directly.
        if (await startMembershipCheckout(planParam)) return
        await choosePlan(planParam)
        router.replace('/account/billing?welcome=1')
        return
      }
      if (on) { setWaivers(due); setStep('waiver') }
    }
    route()
    return () => { on = false }
  }, [planParam, router])

  const canSubmit = name.trim() && /.+@.+\..+/.test(email) && password.length >= 8 && !submitting

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSubmit) return
    setSubmitting(true)
    setError(null)
    const res = await signUpAuth(name.trim(), email.trim(), password)
    setSubmitting(false)
    if (!res.ok) { setError(res.error ?? 'Signup failed'); return }
    if (res.needsConfirm) { setStep('confirm-email'); return }
    if (plan) {
      const due = await unsignedRequiredWaivers({ planId: plan.id })
      if (due.length === 0) { await finishJoin(); return }
      setWaivers(due)
      setStep('waiver')
    } else router.push('/account')
  }

  const finishJoin = async () => {
    if (plan) {
      // Stripe live: collect the card now and let the subscription activate
      // the membership. Otherwise activate directly (pay at the desk).
      if (await startMembershipCheckout(plan.id)) return
      await choosePlan(plan.id)
    }
    router.push('/account/billing?welcome=1')
  }

  const onWaiverSigned = () => {
    if (waiverIdx + 1 < waivers.length) setWaiverIdx(waiverIdx + 1)
    else finishJoin()
  }

  if (step === 'checking' || (step === 'waiver' && planParam && !plan)) {
    return (
      <div className="sq-page" style={{ padding: '64px 20px', textAlign: 'center' }}>
        <p style={{ fontSize: 13, color: FAINT, margin: 0 }}>One moment…</p>
      </div>
    )
  }

  if (step === 'confirm-email') {
    return (
      <div className="sq-page" style={{ padding: '48px 20px 10px', maxWidth: 460, margin: '0 auto', textAlign: 'center' }}>
        <div className="sq-card" style={{ ...card, padding: '30px 32px' }}>
          <div style={{ width: 40, height: 40, borderRadius: 11, background: '#e5f2ea', color: GREEN, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
            <svg width="20" height="20" viewBox="0 0 16 16" fill="none"><rect x="1.5" y="3" width="13" height="10" rx="2" stroke="currentColor" strokeWidth="1.5"/><path d="M2 4.5l6 4.5 6-4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </div>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: INK, margin: '0 0 8px' }}>Check your email</h1>
          <p style={{ fontSize: 13.5, color: SUB, margin: '0 0 18px', lineHeight: 1.6 }}>
            We sent a confirmation link to <strong style={{ color: INK }}>{email}</strong>.
            Click it, then sign in{plan ? ' to finish joining' : ''}.
          </p>
          <Link href="/login" className="sq-btn sq-btn-primary">Go to sign in</Link>
        </div>
      </div>
    )
  }

  if (step === 'waiver' && plan && waivers.length > 0) {
    const current = waivers[waiverIdx]
    return (
      <div className="sq-page" style={{ padding: '40px 20px 10px', maxWidth: 520, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 18 }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: BLUE, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 6px' }}>
            {waivers.length > 1 ? `Waiver ${waiverIdx + 1} of ${waivers.length}` : 'Step 2 of 2'}
          </p>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: INK, margin: '0 0 6px', letterSpacing: '-0.03em' }}>
            {waivers.length > 1 ? 'A few signatures and you’re in' : 'One signature and you’re in'}
          </h1>
          <p style={{ fontSize: 13.5, color: SUB, margin: 0 }}>
            Required to activate your {plan.name} plan — it covers everyone on it.
          </p>
        </div>
        <WaiverPanel key={current.id} def={current} defaultName={name.trim()} onSigned={onWaiverSigned} />
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
          {submitting ? 'Creating…' : plan ? 'Continue to waiver' : 'Create profile'}
        </button>
        {error && <p style={{ fontSize: 12, color: '#cf4436', fontWeight: 600, margin: '10px 0 0', textAlign: 'center' }}>{error}</p>}
        <p style={{ fontSize: 12, color: FAINT, margin: '12px 0 0', textAlign: 'center' }}>
          Already have one? <Link href="/login" style={{ color: BLUE, fontWeight: 600 }}>Sign in</Link>
        </p>
      </form>

      <p style={{ fontSize: 11, color: FAINT, margin: '14px 0 0', textAlign: 'center', lineHeight: 1.5 }}>
        {isSupabaseConfigured() ? 'Accounts are secured by Supabase Auth.' : NOT_CONFIGURED_MSG}
      </p>
    </div>
  )
}

export default function SignupPage() {
  return <Suspense fallback={null}><SignupForm /></Suspense>
}
