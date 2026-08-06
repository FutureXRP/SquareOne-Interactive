'use client'
import Link from 'next/link'
import { AccountShell } from '@/components/store/AccountShell'
import { Barcode } from '@/components/store/Barcode'
import { card, INK, SUB, FAINT, BLUE, HERO_GRADIENT } from '@/lib/theme'
import { getPlan } from '@/lib/plans-store'

export default function MembershipCardPage() {
  return (
    <AccountShell>
      {(profile) => {
        const plan = profile.planId ? getPlan(profile.planId) : null
        return (
          <div style={{ maxWidth: 460, margin: '0 auto' }}>
            {/* The card */}
            <div style={{ borderRadius: 20, overflow: 'hidden', boxShadow: '0 18px 44px rgba(24,39,64,.30)', marginBottom: 20 }}>
              <div style={{ background: HERO_GRADIENT, color: '#fff', padding: '22px 24px', position: 'relative', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', right: -30, top: -40, width: 150, height: 150, border: '2px solid rgba(255,255,255,0.10)', borderRadius: 24, transform: 'rotate(18deg)' }} />
                <div style={{ position: 'absolute', right: 20, top: -10, width: 80, height: 80, border: '2px solid rgba(255,255,255,0.14)', borderRadius: 14, transform: 'rotate(18deg)' }} />
                <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 22 }}>
                  <div style={{ width: 26, height: 26, borderRadius: 7, background: 'rgba(255,255,255,0.16)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ width: 12, height: 12, border: '2px solid #fff', borderRadius: 3 }} />
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 700 }}>SquareOne Interactive</span>
                  <span style={{ marginLeft: 'auto', fontSize: 10, fontWeight: 700, background: 'rgba(255,255,255,0.16)', padding: '2px 9px', borderRadius: 999, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Member</span>
                </div>
                <p style={{ fontSize: 19, fontWeight: 800, margin: '0 0 2px', letterSpacing: '-0.02em' }}>{profile.name}</p>
                <p style={{ fontSize: 12, opacity: 0.85, margin: 0 }}>
                  {plan ? `${plan.name} plan` : 'Profile'} · since {profile.since}
                </p>
              </div>
              <div style={{ background: '#fff', padding: '16px 24px 18px' }}>
                <Barcode value={profile.memberId} />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                  <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 13, fontWeight: 500, color: INK, letterSpacing: '0.12em' }}>{profile.memberId}</span>
                  <span style={{ fontSize: 10, fontWeight: 700, color: '#b07818', background: '#faf0dc', padding: '2px 9px', borderRadius: 999, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Demo — not yet active</span>
                </div>
              </div>
            </div>

            <div className="sq-card" style={{ ...card, padding: '18px 22px', marginBottom: 14 }}>
              <p style={{ fontSize: 13.5, fontWeight: 700, color: INK, margin: '0 0 8px' }}>How door access works</p>
              <p style={{ fontSize: 12.5, color: SUB, margin: 0, lineHeight: 1.65 }}>
                Scan this code at any entrance during open hours and the door unlocks for you.
                When the door system goes live, this becomes your real credential — until then
                it&apos;s a preview. Keep your phone bright and hold the code a few inches from the reader.
              </p>
            </div>

            <div className="sq-card" style={{ ...card, padding: '18px 22px' }}>
              <p style={{ fontSize: 13.5, fontWeight: 700, color: INK, margin: '0 0 8px' }}>Add it to your phone</p>
              <p style={{ fontSize: 12.5, color: SUB, margin: '0 0 10px', lineHeight: 1.65 }}>
                Install SquareOne as an app and your card is one tap away: open your browser menu
                and choose <strong style={{ color: INK }}>Add to Home Screen</strong>.
              </p>
              <p style={{ fontSize: 12, color: FAINT, margin: 0 }}>
                Not a member yet? <Link href="/memberships" style={{ color: BLUE, fontWeight: 600 }}>Join today →</Link>
              </p>
            </div>
          </div>
        )
      }}
    </AccountShell>
  )
}
