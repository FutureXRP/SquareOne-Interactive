'use client'
import Link from 'next/link'
import { useState } from 'react'
import { AccountShell } from '@/components/store/AccountShell'
import { card, INK, SUB, FAINT, LINE, RED, GREEN } from '@/lib/theme'
import { getPlan } from '@/lib/plans-store'
import { cancelMembership, resumeMembership, updateProfileName } from '@/lib/session'
import { ChangePassword } from '@/components/store/ChangePassword'

export default function SettingsPage() {
  const [name, setName] = useState<string | null>(null)
  const [savedNote, setSavedNote] = useState(false)
  const [confirmingCancel, setConfirmingCancel] = useState(false)

  return (
    <AccountShell>
      {(profile) => {
        const plan = profile.planId ? getPlan(profile.planId) : null
        const displayName = name ?? profile.name

        const saveName = async () => {
          if (!displayName.trim()) return
          const ok = await updateProfileName(displayName.trim())
          if (ok) {
            setSavedNote(true)
            window.setTimeout(() => setSavedNote(false), 2000)
          }
        }

        return (
          <div style={{ maxWidth: 640 }}>
            {/* Profile */}
            <div className="sq-card" style={{ ...card, padding: '20px 24px', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: FAINT, textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>Profile</p>
                {savedNote && <span style={{ fontSize: 11.5, fontWeight: 700, color: GREEN }}>Saved ✓</span>}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14, marginBottom: 14 }}>
                <div>
                  <label className="sq-label" htmlFor="pname">Name</label>
                  <input id="pname" className="sq-input" value={displayName} onChange={(e) => setName(e.target.value)} />
                </div>
                <div>
                  <label className="sq-label" htmlFor="pemail">Email</label>
                  <input id="pemail" className="sq-input" value={profile.email} disabled style={{ background: '#f3f6fb', color: SUB }} />
                </div>
              </div>
              <button className="sq-btn sq-btn-primary" style={{ padding: '8px 16px' }} onClick={saveName}>Save changes</button>
            </div>

            {/* Password — shared by everyone on the account */}
            <ChangePassword email={profile.email} />

            {/* Membership management */}
            <div className="sq-card" style={{ ...card, padding: '20px 24px' }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: FAINT, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 12px' }}>Fitness membership</p>

              {!plan && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <p style={{ fontSize: 13.5, color: SUB, margin: 0 }}>You don&apos;t have a fitness membership yet.</p>
                  <Link href="/memberships" className="sq-btn sq-btn-primary" style={{ padding: '8px 14px' }}>See plans</Link>
                </div>
              )}

              {plan && profile.status === 'active' && !confirmingCancel && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <div>
                    <p style={{ fontSize: 13.5, fontWeight: 700, color: INK, margin: '0 0 2px' }}>{plan.name} plan — active</p>
                    <p style={{ fontSize: 12.5, color: SUB, margin: 0 }}>Renews {profile.renewsOn}. Cancel anytime — access continues to the end of the paid period.</p>
                  </div>
                  <button className="sq-btn sq-btn-danger" style={{ padding: '8px 14px' }} onClick={() => setConfirmingCancel(true)}>Cancel fitness membership</button>
                </div>
              )}

              {plan && profile.status === 'active' && confirmingCancel && (
                <div style={{ background: '#fdf2f0', border: '1px solid #eed3cf', borderRadius: 12, padding: '16px 18px' }}>
                  <p style={{ fontSize: 13.5, fontWeight: 700, color: RED, margin: '0 0 4px' }}>Cancel your {plan.name} fitness membership?</p>
                  <p style={{ fontSize: 12.5, color: SUB, margin: '0 0 14px', lineHeight: 1.55 }}>
                    You&apos;ll keep full access through <strong style={{ color: INK }}>{profile.renewsOn}</strong>, then your
                    fitness membership and door access end. No further charges. You can rejoin anytime.
                  </p>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <button className="sq-btn sq-btn-danger" onClick={async () => { await cancelMembership(); setConfirmingCancel(false) }}>Yes, cancel at period end</button>
                    <button className="sq-btn sq-btn-ghost" onClick={() => setConfirmingCancel(false)}>Keep my fitness membership</button>
                  </div>
                </div>
              )}

              {plan && profile.status === 'canceling' && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <div>
                    <p style={{ fontSize: 13.5, fontWeight: 700, color: INK, margin: '0 0 2px' }}>{plan.name} plan — canceling</p>
                    <p style={{ fontSize: 12.5, color: SUB, margin: 0 }}>Access ends {profile.renewsOn}. Changed your mind?</p>
                  </div>
                  <button className="sq-btn sq-btn-primary" style={{ padding: '8px 14px' }} onClick={() => { resumeMembership() }}>Resume fitness membership</button>
                </div>
              )}
            </div>

            <div style={{ borderTop: `1px solid ${LINE}`, marginTop: 24, paddingTop: 14 }}>
              <p style={{ fontSize: 11.5, color: FAINT, margin: 0, lineHeight: 1.6 }}>
                Need help? Stop by the front desk or ask any staff member — we&apos;re glad you&apos;re here.
              </p>
            </div>
          </div>
        )
      }}
    </AccountShell>
  )
}
