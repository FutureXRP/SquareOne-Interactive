'use client'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { AccountShell } from '@/components/store/AccountShell'
import { card, INK, SUB, FAINT, LINE, BLUE, GREEN, GOLD } from '@/lib/theme'
import { formatCents, formatHour } from '@/lib/format'
import { getPlan, getActivePlans, type EditablePlan } from '@/lib/plans-store'
import { getRooms, roomLabel } from '@/lib/facilities-store'
import { getMyBookings, getMyWaivers, choosePlan, cancelMembership, resumeMembership, SESSION_EVENT, type MemberBooking, type SignedWaiver } from '@/lib/session'
import { changePlanBilled, cancelBilled, openBillingPortal } from '@/lib/billing-client'
import { isSupabaseConfigured, emit } from '@/lib/supabase'
import { WaiverPanel } from '@/components/store/WaiverPanel'
import { FITNESS_WAIVER, WAIVERS } from '@/lib/waiver-defs'

export default function AccountOverview() {
  const [bookings, setBookings] = useState<MemberBooking[]>([])
  const [waivers, setWaivers] = useState<SignedWaiver[]>([])
  const [plans, setPlans] = useState<EditablePlan[]>([])
  const [signingFitness, setSigningFitness] = useState(false)
  const [changingPlan, setChangingPlan] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!isSupabaseConfigured()) return
    let on = true
    const sync = () => {
      Promise.all([getMyBookings(), getMyWaivers(), getRooms().catch(() => []), getActivePlans().catch(() => [])])
        .then(([b, w, , p]) => { if (on) { setBookings(b.filter((x) => x.status !== 'canceled')); setWaivers(w); setPlans(p) } })
        .catch(() => {})
    }
    sync()
    window.addEventListener(SESSION_EVENT, sync)
    return () => { on = false; window.removeEventListener(SESSION_EVENT, sync) }
  }, [])

  const switchPlan = async (planId: string) => {
    if (busy) return
    setBusy(true)
    const ok = await changePlanBilled(planId)
    if (!ok) await choosePlan(planId) // no Stripe on this deployment yet
    setBusy(false)
    setChangingPlan(false)
    emit(SESSION_EVENT)
  }

  const doCancel = async () => {
    if (busy || !window.confirm('Cancel your fitness membership? It stays active through the end of the paid period, then stops billing.')) return
    setBusy(true)
    const ok = await cancelBilled(false)
    if (!ok) await cancelMembership()
    setBusy(false)
    emit(SESSION_EVENT)
  }

  const doResume = async () => {
    if (busy) return
    setBusy(true)
    const ok = await cancelBilled(true)
    if (!ok) await resumeMembership()
    setBusy(false)
    emit(SESSION_EVENT)
  }

  const updateCard = async () => {
    if (busy) return
    setBusy(true)
    const opened = await openBillingPortal()
    setBusy(false)
    if (!opened) window.location.assign('/account/billing') // local card page until Stripe is live
  }

  return (
    <AccountShell>
      {(profile) => {
        const plan = profile.planId ? getPlan(profile.planId) : null
        return (
          <div>
            {/* Membership status */}
            <div className="sq-grid-2" style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 16, marginBottom: 24 }}>
              <div className="sq-card" style={{ ...card, padding: '20px 24px' }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: FAINT, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 8px' }}>Fitness membership</p>
                {plan ? (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                      <p style={{ fontSize: 20, fontWeight: 800, color: INK, margin: 0 }}>{plan.name}</p>
                      {profile.status === 'active'
                        ? <span style={{ fontSize: 10.5, fontWeight: 700, color: GREEN, background: '#e5f2ea', padding: '2px 10px', borderRadius: 999 }}>Active</span>
                        : <span style={{ fontSize: 10.5, fontWeight: 700, color: '#7a5a14', background: '#faf0dc', padding: '2px 10px', borderRadius: 999 }}>Ends {profile.renewsOn}</span>}
                    </div>
                    <p style={{ fontSize: 13, color: SUB, margin: '0 0 14px', fontVariantNumeric: 'tabular-nums' }}>
                      {formatCents(plan.priceCents)}/{plan.period}
                      {profile.status === 'active' ? ` · renews ${profile.renewsOn}` : ' · will not renew'}
                    </p>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <Link href="/account/card" className="sq-btn sq-btn-primary" style={{ padding: '8px 16px' }}>Show my card</Link>
                      <button className="sq-btn sq-btn-ghost" style={{ padding: '8px 16px' }} disabled={busy} onClick={updateCard}>Update payment method</button>
                      <button className="sq-btn sq-btn-ghost" style={{ padding: '8px 16px' }} disabled={busy} onClick={() => setChangingPlan((v) => !v)}>
                        {changingPlan ? 'Close' : 'Change plan'}
                      </button>
                      {profile.status === 'active'
                        ? <button className="sq-btn sq-btn-danger" style={{ padding: '8px 16px' }} disabled={busy} onClick={doCancel}>Cancel membership</button>
                        : <button className="sq-btn sq-btn-primary" style={{ padding: '8px 16px' }} disabled={busy} onClick={doResume}>Resume membership</button>}
                    </div>
                    {changingPlan && (
                      <div style={{ marginTop: 14, borderTop: `1px solid ${LINE}`, paddingTop: 12 }}>
                        {plans.map((p) => {
                          const current = p.id === profile.planId
                          const upgrade = plan && p.priceCents > plan.priceCents
                          return (
                            <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', flexWrap: 'wrap' }}>
                              <div style={{ flex: 1, minWidth: 140 }}>
                                <p style={{ fontSize: 13, fontWeight: 700, color: INK, margin: 0 }}>{p.name}</p>
                                <p style={{ fontSize: 12, color: SUB, margin: 0, fontVariantNumeric: 'tabular-nums' }}>{formatCents(p.priceCents)}/{p.period} · {p.tagline}</p>
                              </div>
                              {current
                                ? <span style={{ fontSize: 10.5, fontWeight: 700, color: GREEN, background: '#e5f2ea', padding: '2px 10px', borderRadius: 999 }}>Current plan</span>
                                : <button className="sq-btn sq-btn-ghost" style={{ padding: '6px 13px', fontSize: 12 }} disabled={busy} onClick={() => switchPlan(p.id)}>
                                    {upgrade ? 'Upgrade' : 'Switch'} to {p.name}
                                  </button>}
                            </div>
                          )
                        })}
                        <p style={{ fontSize: 11, color: FAINT, margin: '6px 0 0', lineHeight: 1.5 }}>
                          Plan changes take effect right away — card billing adjusts automatically with a prorated charge or credit.
                        </p>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <p style={{ fontSize: 15, fontWeight: 700, color: INK, margin: '0 0 6px' }}>No fitness membership yet</p>
                    <p style={{ fontSize: 13, color: SUB, margin: '0 0 14px' }}>Join to unlock door access, member pricing, and unlimited open play.</p>
                    <Link href="/memberships" className="sq-btn sq-btn-primary" style={{ padding: '8px 16px' }}>See plans</Link>
                  </>
                )}
              </div>

              <div className="sq-card" style={{ ...card, padding: '20px 24px' }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: FAINT, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 10px' }}>Quick actions</p>
                {[
                  ['Rent a room', '/facilities'],
                  ['Book a party', '/facilities/party'],
                  ['Shop gear', '/shop'],
                  ['Update payment method', '/account/billing'],
                ].map(([label, href]) => (
                  <Link key={href} href={href} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13, fontWeight: 600, color: BLUE, textDecoration: 'none', padding: '8px 0', borderBottom: `1px solid ${LINE}` }}>
                    {label} <span aria-hidden>→</span>
                  </Link>
                ))}
              </div>
            </div>

            {/* Upcoming bookings */}
            <div className="sq-card" style={{ ...card, marginBottom: 24 }}>
              <div style={{ padding: '14px 20px', borderBottom: `1px solid ${LINE}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 13.5, fontWeight: 700, color: INK }}>My bookings</span>
                <Link href="/facilities" style={{ fontSize: 12.5, color: BLUE, fontWeight: 600, textDecoration: 'none' }}>Book a room →</Link>
              </div>
              {bookings.length === 0 ? (
                <p style={{ fontSize: 13, color: SUB, padding: '16px 20px', margin: 0 }}>Nothing booked yet — grab a room for your next get-together.</p>
              ) : (
                bookings.slice(0, 3).map((b, i) => {
                  const zone = roomLabel(b.roomId)
                  return (
                    <div key={b.code} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 20px', borderBottom: i < Math.min(bookings.length, 3) - 1 ? `1px solid ${LINE}` : 'none' }}>
                      <span style={{ width: 9, height: 9, borderRadius: 2, background: zone.color, flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 13, fontWeight: 700, color: INK, margin: 0 }}>{zone.name}</p>
                        <p style={{ fontSize: 12, color: SUB, margin: 0, fontVariantNumeric: 'tabular-nums' }}>{b.date} · {formatHour(b.startH)}–{formatHour(b.startH + b.hours)}</p>
                      </div>
                      {b.status === 'hold'
                        ? <span style={{ fontSize: 10.5, fontWeight: 700, color: GOLD, background: '#faf0dc', padding: '2px 10px', borderRadius: 999 }}>Hold — pay deposit</span>
                        : <span style={{ fontSize: 10.5, fontWeight: 700, color: GREEN, background: '#e5f2ea', padding: '2px 10px', borderRadius: 999 }}>Confirmed</span>}
                      <span style={{ fontSize: 13, fontWeight: 700, color: INK, fontVariantNumeric: 'tabular-nums' }}>{formatCents(b.priceCents)}</span>
                    </div>
                  )
                })
              )}
            </div>

            {/* Waivers — one for the fitness center, one for rentals */}
            <div className="sq-card" style={card}>
              <div style={{ padding: '14px 20px', borderBottom: `1px solid ${LINE}` }}>
                <span style={{ fontSize: 13.5, fontWeight: 700, color: INK }}>Waivers</span>
                <span style={{ fontSize: 11.5, color: FAINT, marginLeft: 10 }}>signed as part of joining or booking</span>
              </div>
              {WAIVERS.map((def, i) => {
                const signed = waivers.find((w) => w.formId === def.id)
                const fitnessNeeded = def.id === FITNESS_WAIVER.id && !signed && !!profile.planId
                return (
                  <div key={def.id} style={{ borderBottom: i < WAIVERS.length - 1 ? `1px solid ${LINE}` : 'none' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 20px' }}>
                      <svg width="15" height="15" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0, color: signed ? GREEN : '#c3cede' }}><rect x="1.5" y="1.5" width="13" height="13" rx="4" fill={signed ? '#e5f2ea' : '#eef2f8'}/><path d="M4.8 8.3l2.2 2.2 4.2-4.8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 13, fontWeight: 700, color: INK, margin: 0 }}>{def.name}</p>
                        <p style={{ fontSize: 12, color: SUB, margin: 0 }}>{def.context}</p>
                      </div>
                      {signed ? (
                        <span style={{ fontSize: 12, color: FAINT }}>{signed.signedOn}</span>
                      ) : fitnessNeeded ? (
                        <button className="sq-btn sq-btn-primary" style={{ padding: '6px 13px', fontSize: 12 }} onClick={() => setSigningFitness((v) => !v)}>
                          {signingFitness ? 'Hide' : 'Sign now'}
                        </button>
                      ) : (
                        <span style={{ fontSize: 10.5, fontWeight: 700, color: SUB, background: '#eef2f8', padding: '2px 10px', borderRadius: 999 }}>
                          {def.id === FITNESS_WAIVER.id ? 'signed at signup' : 'signed when booking'}
                        </span>
                      )}
                    </div>
                    {fitnessNeeded && signingFitness && (
                      <div style={{ padding: '0 20px 16px' }}>
                        <WaiverPanel def={FITNESS_WAIVER} compact defaultName={profile.name} onSigned={() => setSigningFitness(false)} />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )
      }}
    </AccountShell>
  )
}
