'use client'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { PageHero, HeroStat } from '@/components/admin/PageHero'
import { card, INK, SUB, FAINT, LINE, BLUE, GREEN, RED } from '@/lib/theme'
import { formatCents } from '@/lib/format'
import { membershipStats, recentSignups } from '@/lib/admin-data'
import { getPlans, savePlan, addPlan as addPlanLive, type EditablePlan } from '@/lib/plans-store'
import { slugify } from '@/lib/facilities-store'
import { useDebouncedSave } from '@/lib/use-debounced-save'
import { isSupabaseConfigured } from '@/lib/supabase'

function dollarsToCents(v: string): number {
  const n = Number.parseFloat(v.replace(/[$,\s]/g, ''))
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : 0
}

export default function AdminMembershipsPage() {
  const m = membershipStats
  const [plans, setPlans] = useState<EditablePlan[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [savedNote, setSavedNote] = useState(false)

  const debouncedSave = useDebouncedSave(async (plan: EditablePlan) => {
    await savePlan(plan)
    setSavedNote(true)
    window.setTimeout(() => setSavedNote(false), 1800)
  })

  useEffect(() => {
    if (!isSupabaseConfigured()) return
    getPlans().then(setPlans).catch(() => {})
  }, [])

  const editing = plans.find((p) => p.id === editingId) ?? null

  const patch = (id: string, p: Partial<EditablePlan>) => {
    setPlans((cur) => {
      const next = cur.map((x) => (x.id === id ? { ...x, ...p } : x))
      const plan = next.find((x) => x.id === id)
      if (plan) debouncedSave(plan)
      return next
    })
  }

  const addPlan = async () => {
    const id = slugify('New Plan', new Set(plans.map((p) => p.id)))
    const ok = await addPlanLive({ id, name: 'New Plan', priceCents: 3500, period: 'month', tagline: 'Describe who this plan is for', features: ['Unlimited gym access', 'Door access with your member code'], featured: false, active: false })
    if (ok) {
      setPlans(await getPlans())
      setEditingId(id)
    }
  }

  return (
    <div className="sq-page" style={{ padding: '34px 40px 20px', maxWidth: 1180, margin: '0 auto' }}>
      <PageHero title="Fitness Memberships" sub="Edit the plans the store sells — prices, names, features — and watch the subscriber base. Mirrored from Stripe when billing goes live." chip="plans live in store">
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <HeroStat label="Monthly recurring" value={formatCents(m.mrrCents)} sub="subscriber sync arrives with Stripe" />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {savedNote && <span style={{ fontSize: 12, fontWeight: 700 }}>Saved ✓</span>}
            <button className="sq-btn" style={{ background: '#fff', color: '#182740' }} onClick={addPlan}>+ New plan</button>
          </div>
        </div>
      </PageHero>

      {/* KPI strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 24 }}>
        {[
          { label: 'Family plans', value: String(m.family), sub: 'active subscriptions' },
          { label: 'Individual plans', value: String(m.individual), sub: 'active subscriptions' },
          { label: 'New this month', value: `+${m.newThisMonth}`, accent: GREEN, sub: 'signups' },
          { label: 'Canceling', value: String(m.canceling), accent: '#b07818', sub: 'end of period' },
          { label: 'Past due', value: formatCents(m.pastDueCents), accent: RED, sub: 'dunning via Stripe' },
        ].map((k) => (
          <div key={k.label} className="sq-card" style={{ ...card, padding: '15px 17px' }}>
            <p style={{ fontSize: 11, color: FAINT, margin: '0 0 6px', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>{k.label}</p>
            <p style={{ fontSize: 22, fontWeight: 700, color: k.accent ?? INK, margin: 0, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}>{k.value}</p>
            <p style={{ fontSize: 11.5, color: SUB, margin: '4px 0 0' }}>{k.sub}</p>
          </div>
        ))}
      </div>

      {/* Plans editor */}
      <div className="sq-grid-2" style={{ display: 'grid', gridTemplateColumns: 'minmax(260px, 1fr) minmax(320px, 1.5fr)', gap: 16, marginBottom: 24 }}>
        <div className="sq-card" style={{ ...card, alignSelf: 'start' }}>
          <div style={{ padding: '14px 18px', borderBottom: `1px solid ${LINE}` }}>
            <span style={{ fontSize: 13.5, fontWeight: 700, color: INK }}>Plans the store sells</span>
          </div>
          {plans.map((p, i) => (
            <button key={p.id} onClick={() => setEditingId(p.id)} style={{
              font: 'inherit', cursor: 'pointer', display: 'block', width: '100%', textAlign: 'left',
              background: editingId === p.id ? '#eef4fb' : 'transparent', border: 'none',
              padding: '13px 18px', borderBottom: i < plans.length - 1 ? `1px solid ${LINE}` : 'none',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                <span style={{ fontSize: 13.5, fontWeight: 700, color: editingId === p.id ? BLUE : INK }}>{p.name}</span>
                {p.featured && <span style={{ fontSize: 10, fontWeight: 700, color: BLUE, background: '#eef4fb', padding: '1px 8px', borderRadius: 999 }}>featured</span>}
                {p.active
                  ? <span style={{ fontSize: 10, fontWeight: 700, color: GREEN, background: '#e5f2ea', padding: '1px 8px', borderRadius: 999 }}>live</span>
                  : <span style={{ fontSize: 10, fontWeight: 700, color: SUB, background: '#eef2f8', padding: '1px 8px', borderRadius: 999 }}>hidden</span>}
              </div>
              <span style={{ fontSize: 11.5, color: SUB, fontVariantNumeric: 'tabular-nums' }}>{formatCents(p.priceCents)}/{p.period}</span>
            </button>
          ))}
        </div>

        {editing ? (
          <div className="sq-card" style={{ ...card, padding: '20px 24px', alignSelf: 'start' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14, marginBottom: 14 }}>
              <div>
                <label className="sq-label" htmlFor="pl-name">Plan name</label>
                <input id="pl-name" className="sq-input" value={editing.name} onChange={(e) => patch(editing.id, { name: e.target.value })} />
              </div>
              <div>
                <label className="sq-label" htmlFor="pl-price">Price ($ / {editing.period})</label>
                <input id="pl-price" className="sq-input" inputMode="decimal" defaultValue={(editing.priceCents / 100).toFixed(2)} key={`plp-${editing.id}`}
                  onBlur={(e) => patch(editing.id, { priceCents: dollarsToCents(e.target.value) })} />
              </div>
            </div>
            <div style={{ marginBottom: 14 }}>
              <label className="sq-label" htmlFor="pl-tag">Tagline</label>
              <input id="pl-tag" className="sq-input" value={editing.tagline} onChange={(e) => patch(editing.id, { tagline: e.target.value })} />
            </div>
            <div style={{ display: 'flex', gap: 18, marginBottom: 14, flexWrap: 'wrap' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, fontWeight: 600, color: SUB, cursor: 'pointer' }}>
                <input type="checkbox" checked={editing.active} onChange={(e) => patch(editing.id, { active: e.target.checked })} style={{ accentColor: BLUE }} />
                Visible in the store
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, fontWeight: 600, color: SUB, cursor: 'pointer' }}>
                <input type="checkbox" checked={editing.featured} onChange={(e) => patch(editing.id, { featured: e.target.checked })} style={{ accentColor: BLUE }} />
                Featured (&quot;Most popular&quot;)
              </label>
            </div>
            <span className="sq-label">Features shown on the plan card</span>
            {editing.features.map((feat, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                <input className="sq-input" value={feat} onChange={(e) => patch(editing.id, { features: editing.features.map((x, j) => (j === i ? e.target.value : x)) })} />
                <button aria-label="Remove feature" onClick={() => patch(editing.id, { features: editing.features.filter((_, j) => j !== i) })} style={{ font: 'inherit', cursor: 'pointer', border: 'none', background: 'transparent', color: FAINT, fontSize: 15, lineHeight: 1 }}>×</button>
              </div>
            ))}
            <button className="sq-btn sq-btn-ghost" style={{ padding: '7px 13px', marginTop: 4 }} onClick={() => patch(editing.id, { features: [...editing.features, 'New feature'] })}>+ Add feature</button>
            <div style={{ borderTop: `1px solid ${LINE}`, marginTop: 18, paddingTop: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
              <Link href="/memberships" style={{ fontSize: 12.5, color: BLUE, fontWeight: 600, textDecoration: 'none' }}>Preview in store →</Link>
              <p style={{ fontSize: 11, color: FAINT, margin: 0 }}>Price changes apply to new signups; existing members keep their rate until Stripe migration.</p>
            </div>
          </div>
        ) : (
          <div className="sq-card" style={{ ...card, padding: '30px 32px', alignSelf: 'start', textAlign: 'center' }}>
            <p style={{ fontSize: 13.5, color: SUB, margin: 0 }}>Select a plan to edit its price, features, and visibility — or create a new one.</p>
          </div>
        )}
      </div>

      {/* Recent signups */}
      <div className="sq-card" style={card}>
        <div style={{ padding: '14px 20px', borderBottom: `1px solid ${LINE}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 13.5, fontWeight: 700, color: INK }}>Recent signups</span>
          <span style={{ fontSize: 11.5, color: FAINT }}>example data — Stripe sync coming</span>
        </div>
        {recentSignups.map((s, i) => (
          <div key={s.name} className="sq-row" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 20px', borderBottom: i < recentSignups.length - 1 ? `1px solid ${LINE}` : 'none' }}>
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: INK, margin: 0 }}>{s.name}</p>
              <p style={{ fontSize: 12, color: SUB, margin: 0 }}>{s.plan} plan</p>
            </div>
            <span style={{ fontSize: 12, color: FAINT }}>{s.when}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
