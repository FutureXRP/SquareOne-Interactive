'use client'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Suspense, useState } from 'react'
import { AccountShell } from '@/components/store/AccountShell'
import { card, INK, SUB, FAINT, LINE, BLUE, GREEN } from '@/lib/theme'
import { formatCents } from '@/lib/format'
import { getPlan } from '@/lib/plans-store'
import { setCard } from '@/lib/session'
import { billingConfigured, openBillingPortal } from '@/lib/billing-client'
import { useEffect } from 'react'

function BillingContent() {
  const params = useSearchParams()
  const welcome = params.get('welcome') === '1'
  const [stripeLive, setStripeLive] = useState(false)
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState(false)
  const [portalError, setPortalError] = useState<string | null>(null)

  useEffect(() => { billingConfigured().then(setStripeLive) }, [])
  const [number, setNumber] = useState('')
  const [exp, setExp] = useState('')
  const [cvc, setCvc] = useState('')
  const [saved, setSaved] = useState(false)

  const canSave = number.replace(/\s/g, '').length >= 12 && /^\d{2}\s*\/\s*\d{2}$/.test(exp) && cvc.length >= 3

  const save = () => {
    const digits = number.replace(/\D/g, '')
    setCard({ brand: digits.startsWith('4') ? 'Visa' : digits.startsWith('5') ? 'Mastercard' : 'Card', last4: digits.slice(-4), exp: exp.replace(/\s/g, '') })
    setEditing(false)
    setNumber(''); setExp(''); setCvc('')
    setSaved(true)
    window.setTimeout(() => setSaved(false), 2500)
  }

  return (
    <AccountShell>
      {(profile) => {
        const plan = profile.planId ? getPlan(profile.planId) : null
        return (
          <div style={{ maxWidth: 640 }}>
            {welcome && plan && (
              <div style={{ background: '#e5f2ea', border: '1px solid #bfe0cc', borderRadius: 12, padding: '13px 16px', marginBottom: 18 }}>
                <p style={{ fontSize: 13, fontWeight: 700, color: GREEN, margin: '0 0 2px' }}>Welcome to SquareOne! Your {plan.name} fitness membership is set up.</p>
                <p style={{ fontSize: 12.5, color: SUB, margin: 0 }}>Add a payment method below so your fitness membership stays active.</p>
              </div>
            )}

            {/* Plan */}
            <div className="sq-card" style={{ ...card, padding: '20px 24px', marginBottom: 16 }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: FAINT, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 8px' }}>Plan</p>
              {plan ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <div>
                    <p style={{ fontSize: 16, fontWeight: 800, color: INK, margin: '0 0 2px' }}>{plan.name} · {formatCents(plan.priceCents)}/{plan.period}</p>
                    <p style={{ fontSize: 12.5, color: SUB, margin: 0 }}>
                      {profile.status === 'active' ? `Next charge ${profile.renewsOn}` : `Cancels ${profile.renewsOn} — access continues until then`}
                    </p>
                  </div>
                  <Link href="/account/settings" className="sq-btn sq-btn-ghost" style={{ padding: '8px 14px' }}>Change or cancel</Link>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <p style={{ fontSize: 13.5, color: SUB, margin: 0 }}>No fitness membership on this profile.</p>
                  <Link href="/memberships" className="sq-btn sq-btn-primary" style={{ padding: '8px 14px' }}>See plans</Link>
                </div>
              )}
            </div>

            {/* Payment method */}
            <div className="sq-card" style={{ ...card, padding: '20px 24px', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: FAINT, textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>Payment method</p>
                {saved && <span style={{ fontSize: 11.5, fontWeight: 700, color: GREEN }}>Saved ✓</span>}
              </div>

              {stripeLive ? (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                    <p style={{ fontSize: 13.5, color: SUB, margin: 0, lineHeight: 1.5 }}>
                      Your card is stored securely with Stripe — add, update, or change it any time.
                    </p>
                    <button className="sq-btn sq-btn-primary" style={{ padding: '8px 14px' }} disabled={busy}
                      onClick={async () => {
                        setBusy(true)
                        setPortalError(null)
                        const res = await openBillingPortal()
                        setBusy(false)
                        if (!res.ok) setPortalError(res.message ?? 'Stripe could not open the billing portal. Give us a call and we will update your card at the desk.')
                      }}>
                      Manage card &amp; invoices
                    </button>
                  </div>
                  {portalError && (
                    <p style={{ fontSize: 12.5, color: '#a33427', background: '#fae7e4', border: '1px solid #f0cdc7', borderRadius: 9, padding: '10px 12px', margin: '12px 0 0', lineHeight: 1.55 }}>
                      {portalError}
                    </p>
                  )}
                </div>
              ) : !editing ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  {profile.card ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ width: 44, height: 30, borderRadius: 6, background: 'linear-gradient(135deg, #2f6db8, #182740)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <span style={{ fontSize: 8.5, fontWeight: 800, color: '#fff', letterSpacing: '0.06em' }}>{profile.card.brand.toUpperCase()}</span>
                      </div>
                      <div>
                        <p style={{ fontSize: 13.5, fontWeight: 700, color: INK, margin: 0, fontVariantNumeric: 'tabular-nums' }}>{profile.card.brand} •••• {profile.card.last4}</p>
                        <p style={{ fontSize: 12, color: FAINT, margin: 0, fontVariantNumeric: 'tabular-nums' }}>expires {profile.card.exp}</p>
                      </div>
                    </div>
                  ) : (
                    <p style={{ fontSize: 13.5, color: SUB, margin: 0 }}>No card on file yet.</p>
                  )}
                  <button className="sq-btn sq-btn-ghost" style={{ padding: '8px 14px' }} onClick={() => setEditing(true)}>
                    {profile.card ? 'Update card' : 'Add a card'}
                  </button>
                </div>
              ) : (
                <div>
                  <div style={{ marginBottom: 12 }}>
                    <label className="sq-label" htmlFor="cardnum">Card number</label>
                    <input id="cardnum" className="sq-input" inputMode="numeric" value={number} onChange={(e) => setNumber(e.target.value)} placeholder="4242 4242 4242 4242" autoComplete="cc-number" />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                    <div>
                      <label className="sq-label" htmlFor="exp">Expires</label>
                      <input id="exp" className="sq-input" value={exp} onChange={(e) => setExp(e.target.value)} placeholder="MM/YY" autoComplete="cc-exp" />
                    </div>
                    <div>
                      <label className="sq-label" htmlFor="cvc">CVC</label>
                      <input id="cvc" className="sq-input" inputMode="numeric" value={cvc} onChange={(e) => setCvc(e.target.value)} placeholder="123" autoComplete="cc-csc" />
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button className="sq-btn sq-btn-primary" disabled={!canSave} onClick={save}>Save card</button>
                    <button className="sq-btn sq-btn-ghost" onClick={() => setEditing(false)}>Cancel</button>
                  </div>
                  <p style={{ fontSize: 11, color: FAINT, margin: '10px 0 0', lineHeight: 1.5 }}>
                    Stripe checkout is coming next — until then this stays on your device. When live, card
                    details go straight to Stripe and never touch SquareOne servers.
                  </p>
                </div>
              )}
            </div>

            {/* History */}
            <div className="sq-card" style={card}>
              <div style={{ padding: '14px 20px', borderBottom: `1px solid ${LINE}` }}>
                <span style={{ fontSize: 13.5, fontWeight: 700, color: INK }}>Billing history</span>
              </div>
              {plan ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 20px' }}>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: 13, fontWeight: 700, color: INK, margin: 0 }}>{plan.name} fitness membership</p>
                    <p style={{ fontSize: 12, color: FAINT, margin: 0 }}>{profile.since}</p>
                  </div>
                  <span style={{ fontSize: 10.5, fontWeight: 700, color: GREEN, background: '#e5f2ea', padding: '2px 10px', borderRadius: 999 }}>Paid</span>
                  <span style={{ fontSize: 13.5, fontWeight: 700, color: INK, fontVariantNumeric: 'tabular-nums' }}>{formatCents(plan.priceCents)}</span>
                </div>
              ) : (
                <p style={{ fontSize: 13, color: SUB, padding: '16px 20px', margin: 0 }}>No charges yet.</p>
              )}
            </div>
            <p style={{ fontSize: 11.5, color: FAINT, margin: '16px 0 0' }}>Automatic charges, receipts, and invoices arrive with Stripe.</p>
          </div>
        )
      }}
    </AccountShell>
  )
}

export default function BillingPage() {
  return <Suspense fallback={null}><BillingContent /></Suspense>
}
