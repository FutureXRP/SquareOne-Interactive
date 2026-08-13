'use client'
import { useEffect, useState } from 'react'
import { PageHero } from '@/components/admin/PageHero'
import { AdminOnly } from '@/components/admin/AdminOnly'
import { card, INK, SUB, FAINT, LINE, BLUE, GREEN, GOLD, RED } from '@/lib/theme'
import { formatCents } from '@/lib/format'
import {
  getCoupons, upsertCoupon, deleteCoupon, getRedemptions, couponLabel,
  defaultExpiry, expiryLabel, isExpired,
  COUPONS_EVENT, type Coupon, type CouponContext, type Redemption,
} from '@/lib/coupons-store'
import { getPlans, type EditablePlan } from '@/lib/plans-store'
import { useDebouncedSave } from '@/lib/use-debounced-save'
import { isSupabaseConfigured } from '@/lib/supabase'

function dollarsToCents(v: string): number {
  const n = Number.parseFloat(v.replace(/[$,\s]/g, ''))
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : 0
}

const CONTEXTS: { key: CouponContext; label: string; hint: string }[] = [
  { key: 'all', label: 'Anywhere', hint: 'memberships, rentals, and the shop' },
  { key: 'memberships', label: 'Memberships only', hint: 'applied when someone joins' },
  { key: 'rentals', label: 'Room rentals only', hint: 'applied when booking a space' },
  { key: 'shop', label: 'Shop only', hint: 'applied in the cart' },
]

export default function CouponsAdminPage() {
  const [coupons, setCoupons] = useState<Coupon[]>([])
  const [plans, setPlans] = useState<EditablePlan[]>([])
  const [redemptions, setRedemptions] = useState<Redemption[] | null>(null)
  const [editingCode, setEditingCode] = useState<string | null>(null)
  const [savedNote, setSavedNote] = useState(false)

  const debouncedSave = useDebouncedSave(async (c: Coupon) => {
    await upsertCoupon(c)
    setSavedNote(true)
    window.setTimeout(() => setSavedNote(false), 1600)
  })

  const sync = () => {
    getCoupons().then(setCoupons).catch(() => {})
    getRedemptions().then(setRedemptions).catch(() => {})
  }

  useEffect(() => {
    if (!isSupabaseConfigured()) return
    sync()
    getPlans().then(setPlans).catch(() => {})
    window.addEventListener(COUPONS_EVENT, sync)
    return () => window.removeEventListener(COUPONS_EVENT, sync)
  }, [])

  const editing = coupons.find((c) => c.code === editingCode) ?? null
  const migrated = editing ? editing.appliesTo !== undefined : coupons.some((c) => c.appliesTo !== undefined)
  const expired = editing ? isExpired(editing) : false

  const patch = (code: string, p: Partial<Coupon>) => {
    setCoupons((cur) => {
      const next = cur.map((c) => (c.code === code ? { ...c, ...p } : c))
      const found = next.find((c) => c.code === (p.code ?? code))
      if (found) {
        if (p.code && p.code !== code) {
          upsertCoupon(found, code).then(() => { setEditingCode(found.code); sync() })
        } else {
          debouncedSave(found)
        }
      }
      return next
    })
  }

  const addCoupon = async (preset?: Partial<Coupon>) => {
    let n = coupons.length + 1
    let code = preset?.code ?? `SQUARE${n}`
    while (coupons.some((c) => c.code === code)) code = `SQUARE${++n}`
    const coupon: Coupon = {
      code,
      kind: 'percent',
      value: 10,
      note: 'Describe this coupon',
      active: false,
      appliesTo: 'all',
      freeMonths: 0,
      maxRedemptions: null,
      oncePerAccount: true,
      expiresOn: defaultExpiry(), // every code ends — 90 days unless changed
      planIds: [],
      ...preset,
    }
    const ok = await upsertCoupon(coupon)
    if (ok) { sync(); setEditingCode(coupon.code) }
  }

  const remove = async (code: string) => {
    if (!window.confirm(`Delete ${code}? Anyone who already used it keeps what they got.`)) return
    const ok = await deleteCoupon(code)
    if (ok) { setCoupons((cur) => cur.filter((c) => c.code !== code)); if (editingCode === code) setEditingCode(null) }
  }

  return (
    <AdminOnly>
    <div className="sq-page" style={{ padding: '34px 40px 20px', maxWidth: 1180, margin: '0 auto' }}>
      <PageHero
        title="Coupons"
        sub="Discount codes and special pricing — a percentage, a dollar amount, or free months of membership. Shoppers type the code; the database decides whether it's still good."
        chip={`${coupons.filter((c) => c.active).length} live`}
      >
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {savedNote && <span style={{ fontSize: 12, fontWeight: 700 }}>Saved ✓</span>}
          <button className="sq-btn" style={{ background: '#fff', color: '#182740' }} onClick={() => addCoupon()}>+ New coupon</button>
        </div>
      </PageHero>

      {/* The transition shortcut — the reason this tab exists today */}
      {migrated && !coupons.some((c) => (c.freeMonths ?? 0) > 0) && (
        <div className="sq-card" style={{ ...card, padding: '16px 20px', marginBottom: 18, borderLeft: `3px solid ${GOLD}` }}>
          <p style={{ fontSize: 13.5, fontWeight: 700, color: INK, margin: '0 0 4px' }}>Moving your current members over?</p>
          <p style={{ fontSize: 12.5, color: SUB, margin: '0 0 10px', lineHeight: 1.55 }}>
            This makes a <strong style={{ color: INK }}>LEGACY</strong> code good for one free month on any membership,
            once per household. Members put their card on file at signup, get 30 days free, and normal billing starts after.
          </p>
          <button className="sq-btn sq-btn-primary" style={{ padding: '8px 16px', fontSize: 12.5 }} onClick={() => addCoupon({
            code: 'LEGACY',
            kind: 'percent',
            value: 0,
            freeMonths: 1,
            appliesTo: 'memberships',
            oncePerAccount: true,
            expiresOn: defaultExpiry(90),
            note: 'One free month for members moving from the old system',
            active: true,
          })}>
            Create the LEGACY free-month code
          </button>
        </div>
      )}

      <div className="sq-grid-2" style={{ display: 'grid', gridTemplateColumns: 'minmax(250px, 1fr) minmax(320px, 1.5fr)', gap: 16, alignItems: 'start' }}>
        {/* Code list */}
        <div className="sq-card" style={{ ...card, alignSelf: 'start', overflow: 'hidden' }}>
          {coupons.map((c, i) => (
            <button key={c.code} onClick={() => setEditingCode(c.code)} style={{
              font: 'inherit', cursor: 'pointer', display: 'block', width: '100%', textAlign: 'left',
              background: editingCode === c.code ? '#eef4fb' : 'transparent', border: 'none',
              borderLeft: `3px solid ${editingCode === c.code ? BLUE : 'transparent'}`,
              padding: '12px 16px', borderBottom: i < coupons.length - 1 ? `1px solid ${LINE}` : 'none',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2, flexWrap: 'wrap' }}>
                <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 13, fontWeight: 700, color: editingCode === c.code ? BLUE : INK }}>{c.code}</span>
                {c.active
                  ? <span style={{ fontSize: 10, fontWeight: 700, color: GREEN, background: '#e5f2ea', padding: '1px 8px', borderRadius: 999 }}>live</span>
                  : <span style={{ fontSize: 10, fontWeight: 700, color: SUB, background: '#eef2f8', padding: '1px 8px', borderRadius: 999 }}>off</span>}
                {(c.freeMonths ?? 0) > 0 && (
                  <span style={{ fontSize: 10, fontWeight: 700, color: '#7a5a14', background: '#faf0dc', padding: '1px 8px', borderRadius: 999 }}>free months</span>
                )}
                {isExpired(c) && (
                  <span style={{ fontSize: 10, fontWeight: 700, color: RED, background: '#fae7e4', padding: '1px 8px', borderRadius: 999 }}>expired</span>
                )}
              </div>
              <span style={{ display: 'block', fontSize: 11.5, color: SUB }}>
                {couponLabel(c)}
                {c.redeemed !== undefined && ` · used ${c.redeemed}${c.maxRedemptions ? ` of ${c.maxRedemptions}` : ''}`}
              </span>
              {c.expiresOn !== undefined && (
                <span style={{ display: 'block', fontSize: 11, color: isExpired(c) ? RED : FAINT, marginTop: 1 }}>{expiryLabel(c)}</span>
              )}
            </button>
          ))}
          {coupons.length === 0 && (
            <p style={{ fontSize: 13, color: SUB, padding: '16px 18px', margin: 0 }}>
              {isSupabaseConfigured() ? 'No coupons yet — create your first one.' : 'Connect Supabase to manage coupons.'}
            </p>
          )}
        </div>

        {/* Editor */}
        {editing ? (
          <div className="sq-card" style={{ ...card, padding: '20px 24px', alignSelf: 'start' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14, marginBottom: 14 }}>
              <div>
                <label className="sq-label" htmlFor="c-code">Code shoppers type</label>
                <input id="c-code" className="sq-input" style={{ fontFamily: 'DM Mono, monospace', textTransform: 'uppercase' }}
                  defaultValue={editing.code} key={`code-${editing.code}`}
                  onBlur={(e) => {
                    const next = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '')
                    if (next && next !== editing.code) patch(editing.code, { code: next })
                  }} />
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: 9 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, fontWeight: 600, color: SUB, cursor: 'pointer' }}>
                  <input type="checkbox" checked={editing.active} style={{ accentColor: BLUE }}
                    onChange={(e) => patch(editing.code, { active: e.target.checked })} />
                  Live — shoppers can use it
                </label>
              </div>
            </div>

            <div style={{ marginBottom: 14 }}>
              <label className="sq-label" htmlFor="c-note">What it&apos;s for (staff note)</label>
              <input id="c-note" className="sq-input" value={editing.note} onChange={(e) => patch(editing.code, { note: e.target.value })} />
            </div>

            {/* Discount */}
            <p className="sq-label">Discount</p>
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 6 }}>
              <div>
                <select className="sq-select" style={{ width: 150 }} value={editing.kind}
                  onChange={(e) => patch(editing.code, { kind: e.target.value as 'percent' | 'amount' })}>
                  <option value="percent">Percent off</option>
                  <option value="amount">Dollar amount off</option>
                </select>
              </div>
              <div>
                {editing.kind === 'percent' ? (
                  <input className="sq-input" style={{ width: 100 }} inputMode="numeric" placeholder="%"
                    defaultValue={String(editing.value)} key={`pct-${editing.code}`}
                    onBlur={(e) => {
                      const n = Number.parseInt(e.target.value, 10)
                      patch(editing.code, { value: Number.isFinite(n) ? Math.min(Math.max(n, 0), 100) : 0 })
                    }} />
                ) : (
                  <input className="sq-input" style={{ width: 110 }} inputMode="decimal" placeholder="$"
                    defaultValue={(editing.value / 100).toFixed(2)} key={`amt-${editing.code}`}
                    onBlur={(e) => patch(editing.code, { value: dollarsToCents(e.target.value) })} />
                )}
              </div>
              <span style={{ fontSize: 11.5, color: FAINT, paddingBottom: 10 }}>set to 0 for a free-months-only code</span>
            </div>

            {migrated && (
              <>
                {/* Free months */}
                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 6, marginTop: 10 }}>
                  <div>
                    <label className="sq-label" htmlFor="c-free">Free months of membership</label>
                    <select id="c-free" className="sq-select" style={{ width: 150 }} value={editing.freeMonths ?? 0}
                      onChange={(e) => patch(editing.code, { freeMonths: Number(e.target.value) })}>
                      {[0, 1, 2, 3, 6, 12].map((m) => (
                        <option key={m} value={m}>{m === 0 ? 'None' : `${m} month${m === 1 ? '' : 's'} free`}</option>
                      ))}
                    </select>
                  </div>
                  <span style={{ fontSize: 11.5, color: FAINT, paddingBottom: 10, flex: 1, minWidth: 200, lineHeight: 1.5 }}>
                    Card goes on file at signup, nothing is charged until the free months are up, then billing starts normally.
                  </span>
                </div>

                <div style={{ borderTop: `1px solid ${LINE}`, margin: '14px 0', paddingTop: 14 }}>
                  <p className="sq-label">Where it works</p>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                    {CONTEXTS.map((ctx) => {
                      const on = (editing.appliesTo ?? 'all') === ctx.key
                      return (
                        <button key={ctx.key} title={ctx.hint} onClick={() => patch(editing.code, { appliesTo: ctx.key })} style={{
                          font: 'inherit', cursor: 'pointer', fontSize: 12, fontWeight: 600,
                          color: on ? '#fff' : SUB, background: on ? BLUE : '#fff',
                          border: `1.5px solid ${on ? BLUE : LINE}`, borderRadius: 999, padding: '6px 14px',
                        }}>{ctx.label}</button>
                      )
                    })}
                  </div>
                  <p style={{ fontSize: 11, color: FAINT, margin: '4px 0 0' }}>
                    {CONTEXTS.find((c) => c.key === (editing.appliesTo ?? 'all'))?.hint}
                  </p>
                </div>

                {/* Which plans (memberships only) */}
                {(editing.appliesTo === 'memberships' || editing.appliesTo === 'all') && plans.length > 0 && (
                  <div style={{ marginBottom: 14 }}>
                    <p className="sq-label">Which membership plans</p>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {plans.map((p) => {
                        const list = editing.planIds ?? []
                        const on = list.length === 0 || list.includes(p.id)
                        return (
                          <button key={p.id} onClick={() => {
                            const cur = list.length === 0 ? plans.map((x) => x.id) : list
                            const next = cur.includes(p.id) ? cur.filter((x) => x !== p.id) : [...cur, p.id]
                            patch(editing.code, { planIds: next.length === plans.length ? [] : next })
                          }} style={{
                            font: 'inherit', cursor: 'pointer', fontSize: 12, fontWeight: 600,
                            color: on ? '#fff' : SUB, background: on ? BLUE : '#fff',
                            border: `1.5px solid ${on ? BLUE : LINE}`, borderRadius: 999, padding: '5px 13px',
                          }}>{p.name}</button>
                        )
                      })}
                    </div>
                    <p style={{ fontSize: 11, color: FAINT, margin: '5px 0 0' }}>
                      {(editing.planIds?.length ?? 0) === 0 ? 'Every plan' : `${editing.planIds!.length} of ${plans.length} plans`}
                    </p>
                  </div>
                )}

                {/* Limits */}
                <div style={{ borderTop: `1px solid ${LINE}`, paddingTop: 14, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 14 }}>
                  <div>
                    <label className="sq-label" htmlFor="c-max">Total uses allowed</label>
                    <input id="c-max" className="sq-input" inputMode="numeric" placeholder="unlimited"
                      defaultValue={editing.maxRedemptions == null ? '' : String(editing.maxRedemptions)} key={`max-${editing.code}`}
                      onBlur={(e) => {
                        const raw = e.target.value.trim()
                        const n = Number.parseInt(raw, 10)
                        patch(editing.code, { maxRedemptions: raw === '' || !Number.isFinite(n) || n <= 0 ? null : n })
                      }} />
                  </div>
                  <div>
                    <label className="sq-label" htmlFor="c-exp">
                      Expires on <span style={{ color: RED }}>*</span>
                    </label>
                    <input id="c-exp" type="date" className="sq-input" required
                      style={{ borderColor: !editing.expiresOn ? RED : undefined }}
                      value={editing.expiresOn ?? ''}
                      onChange={(e) => patch(editing.code, { expiresOn: e.target.value || defaultExpiry() })} />
                    <p style={{ fontSize: 10.5, color: expired ? RED : FAINT, margin: '4px 0 0', fontWeight: expired ? 700 : 400 }}>
                      {expiryLabel(editing)}
                    </p>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: 9 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, fontWeight: 600, color: SUB, cursor: 'pointer' }}>
                      <input type="checkbox" checked={editing.oncePerAccount ?? true} style={{ accentColor: BLUE }}
                        onChange={(e) => patch(editing.code, { oncePerAccount: e.target.checked })} />
                      One per household
                    </label>
                  </div>
                </div>
              </>
            )}

            {!migrated && (
              <p style={{ fontSize: 11.5, color: GOLD, fontWeight: 600, margin: '12px 0 0', lineHeight: 1.55 }}>
                Free months, expiry dates, usage caps, and where a code applies all need 0030_coupons.sql —
                run it in Supabase to unlock them. Percent and dollar-off codes work today.
              </p>
            )}

            {expired && editing.active && (
              <p style={{ fontSize: 12, color: RED, fontWeight: 700, margin: '12px 0 0' }}>
                This code is past its end date — shoppers get &quot;that code has expired&quot; even though it&apos;s switched on.
                Push the date out to bring it back.
              </p>
            )}

            <div style={{ borderTop: `1px solid ${LINE}`, marginTop: 16, paddingTop: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, color: SUB }}>
                Preview: <strong style={{ color: INK }}>{couponLabel(editing)}</strong>
                {editing.redeemed !== undefined && ` · claimed ${editing.redeemed} time${editing.redeemed === 1 ? '' : 's'}`}
              </span>
              <button className="sq-btn sq-btn-danger" style={{ padding: '6px 13px', fontSize: 11.5 }} onClick={() => remove(editing.code)}>Delete coupon</button>
            </div>
            <p style={{ fontSize: 11, color: FAINT, margin: '10px 0 0' }}>Saves automatically as you type.</p>
          </div>
        ) : (
          <div className="sq-card" style={{ ...card, padding: '30px 32px', alignSelf: 'start', textAlign: 'center' }}>
            <p style={{ fontSize: 13.5, color: SUB, margin: 0 }}>Select a coupon to edit it, or create a new one.</p>
          </div>
        )}
      </div>

      {/* Who used what */}
      <div className="sq-card" style={{ ...card, marginTop: 18, overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: `1px solid ${LINE}` }}>
          <span style={{ fontSize: 13.5, fontWeight: 700, color: INK }}>Recent redemptions</span>
          <span style={{ fontSize: 11.5, color: FAINT, marginLeft: 10 }}>every claim, so caps and one-per-household hold</span>
        </div>
        {redemptions === null ? (
          <p style={{ fontSize: 12.5, color: SUB, padding: '16px 20px', margin: 0 }}>Redemption tracking needs 0030_coupons.sql.</p>
        ) : redemptions.length === 0 ? (
          <p style={{ fontSize: 13, color: SUB, padding: '16px 20px', margin: 0 }}>No codes claimed yet.</p>
        ) : redemptions.map((r, i) => (
          <div key={`${r.code}-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 20px', borderBottom: i < redemptions.length - 1 ? `1px solid ${LINE}` : 'none' }}>
            <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 12, fontWeight: 700, color: BLUE, minWidth: 90 }}>{r.code}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 13, fontWeight: 600, color: INK, margin: 0 }}>{r.who}</p>
              <p style={{ fontSize: 11.5, color: SUB, margin: 0 }}>{r.note || '—'} · {r.when}</p>
            </div>
            <span style={{ fontSize: 12.5, fontWeight: 700, color: r.freeMonths > 0 ? GOLD : GREEN, fontVariantNumeric: 'tabular-nums' }}>
              {r.freeMonths > 0 ? `${r.freeMonths} mo free` : r.discountCents > 0 ? `−${formatCents(r.discountCents)}` : '—'}
            </span>
          </div>
        ))}
      </div>

      <p style={{ fontSize: 11.5, color: FAINT, marginTop: 14, lineHeight: 1.6 }}>
        Every code carries an end date — new ones start at 90 days out, and you can move it any time. Codes are never
        listed publicly: a shopper has to know the code, and the database re-checks it at checkout, so an expired or
        used-up code can&apos;t be forced through. <span style={{ color: RED }}>Deleting</span> a code stops future use
        but doesn&apos;t take back what people already claimed.
      </p>
    </div>
    </AdminOnly>
  )
}
