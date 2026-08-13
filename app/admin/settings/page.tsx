'use client'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { PageHero } from '@/components/admin/PageHero'
import { AdminOnly } from '@/components/admin/AdminOnly'
import { StaffManager } from '@/components/admin/StaffManager'
import { PermissionsMatrix } from '@/components/admin/PermissionsMatrix'
import { card, INK, SUB, FAINT, LINE, BLUE, GREEN } from '@/lib/theme'
import { formatCents, formatHour } from '@/lib/format'
import { getSiteConfig, saveSiteConfig, type SiteConfig, type Closure } from '@/lib/site-config-store'
import { DAY_NAMES } from '@/lib/facilities-store'
import { getCoupons, upsertCoupon, deleteCoupon, type Coupon } from '@/lib/coupons-store'
import { useDebouncedSave } from '@/lib/use-debounced-save'
import { isSupabaseConfigured } from '@/lib/supabase'

function dollarsToCents(v: string): number {
  const n = Number.parseFloat(v.replace(/[$,\s]/g, ''))
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : 0
}

const HOUR_OPTIONS = Array.from({ length: 37 }, (_, i) => 5 + i * 0.5) // 5:00 AM – 11:00 PM

const EDITORS = [
  ['Rooms & their pricing', '/admin/rooms'],
  ['Event packages', '/admin/packages'],
  ['Fitness membership plans', '/admin/memberships'],
  ['Programs', '/admin/programs'],
  ['Client accounts & balances', '/admin/clients'],
  ['Forms & waivers', '/admin/forms'],
  ['Bookings & desk payments', '/admin/bookings'],
]

export default function SettingsPage() {
  const [cfg, setCfg] = useState<SiteConfig | null>(null)
  const [coupons, setCoupons] = useState<Coupon[]>([])

  const debouncedCfgSave = useDebouncedSave(async (next: SiteConfig) => { await saveSiteConfig(next) })
  const debouncedCouponSave = useDebouncedSave(async (c: Coupon) => { await upsertCoupon(c) })

  useEffect(() => {
    if (!isSupabaseConfigured()) return
    getSiteConfig().then(setCfg).catch(() => {})
    getCoupons().then(setCoupons).catch(() => {})
  }, [])

  const patchCfg = (p: Partial<SiteConfig>) => {
    setCfg((cur) => {
      if (!cur) return cur
      const next = { ...cur, ...p }
      debouncedCfgSave(next)
      return next
    })
  }

  const patchCoupon = (code: string, p: Partial<Coupon>) => {
    setCoupons((cur) => {
      const next = cur.map((c) => (c.code === code ? { ...c, ...p } : c))
      const coupon = next.find((c) => c.code === (p.code ?? code))
      if (coupon) {
        if (p.code && p.code !== code) upsertCoupon(coupon, code)
        else debouncedCouponSave(coupon)
      }
      return next
    })
  }

  const addCoupon = async () => {
    let n = coupons.length + 1
    let code = `SQUARE${n}`
    while (coupons.some((c) => c.code === code)) code = `SQUARE${++n}`
    const coupon: Coupon = { code, kind: 'percent', value: 10, note: 'Describe this coupon', active: false }
    const ok = await upsertCoupon(coupon)
    if (ok) setCoupons(await getCoupons())
  }

  const removeCoupon = async (code: string) => {
    const ok = await deleteCoupon(code)
    if (ok) setCoupons((cur) => cur.filter((c) => c.code !== code))
  }

  if (!cfg) return <div style={{ minHeight: '60vh' }} />

  return (
    <AdminOnly>
    <div className="sq-page" style={{ padding: '34px 40px 20px', maxWidth: 1180, margin: '0 auto' }}>
      <PageHero title="Settings" sub="Hours, location, coupons, and staff — plus the doorway to every other editor. Staff with the right role can change everything the store shows." chip="everything editable" />

      <div className="sq-grid-2" style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 16 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Hours & location */}
          <div className="sq-card" style={{ ...card, padding: '20px 24px' }}>
            <p style={{ fontSize: 13.5, fontWeight: 700, color: INK, margin: '0 0 12px' }}>Hours &amp; location</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 12 }}>
              <div>
                <label className="sq-label" htmlFor="s-addr">Address</label>
                <input id="s-addr" className="sq-input" value={cfg.address} onChange={(e) => patchCfg({ address: e.target.value })} />
              </div>
              <div>
                <label className="sq-label" htmlFor="s-phone">Phone</label>
                <input id="s-phone" className="sq-input" value={cfg.phone} onChange={(e) => patchCfg({ phone: e.target.value })} />
              </div>
            </div>
            {cfg.hoursByDay === undefined ? (
              <>
                {[
                  { label: cfg.weekdayLabel, openKey: 'weekdayOpenH' as const, closeKey: 'weekdayCloseH' as const },
                  { label: cfg.sundayLabel, openKey: 'sundayOpenH' as const, closeKey: 'sundayCloseH' as const },
                ].map((row) => (
                  <div key={row.openKey} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 12.5, fontWeight: 600, color: SUB, minWidth: 74 }}>{row.label}</span>
                    <select className="sq-select" style={{ width: 'auto', padding: '7px 10px', fontSize: 12.5 }} value={cfg[row.openKey]} onChange={(e) => patchCfg({ [row.openKey]: Number(e.target.value) } as Partial<SiteConfig>)}>
                      {HOUR_OPTIONS.map((h) => <option key={h} value={h}>{formatHour(h)}</option>)}
                    </select>
                    <span style={{ fontSize: 12, color: FAINT }}>to</span>
                    <select className="sq-select" style={{ width: 'auto', padding: '7px 10px', fontSize: 12.5 }} value={cfg[row.closeKey]} onChange={(e) => patchCfg({ [row.closeKey]: Number(e.target.value) } as Partial<SiteConfig>)}>
                      {HOUR_OPTIONS.map((h) => <option key={h} value={h}>{formatHour(h)}</option>)}
                    </select>
                  </div>
                ))}
                <p style={{ fontSize: 11, color: FAINT, margin: '8px 0 0' }}>
                  Run the <strong>0010_site_hours.sql</strong> migration in Supabase to set each day&apos;s hours
                  separately and add holiday closures.
                </p>
              </>
            ) : (
              <>
                {[1, 2, 3, 4, 5, 6, 0].map((dow) => {
                  const d = cfg.hoursByDay![dow]
                  const patchDay = (p: Partial<typeof d>) =>
                    patchCfg({ hoursByDay: cfg.hoursByDay!.map((x, j) => (j === dow ? { ...x, ...p } : x)) })
                  return (
                    <div key={dow} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 7, flexWrap: 'wrap' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, fontWeight: 600, color: d.closed ? FAINT : INK, minWidth: 110, cursor: 'pointer' }}>
                        <input type="checkbox" checked={!d.closed} style={{ accentColor: BLUE }} onChange={(e) => patchDay({ closed: !e.target.checked })} />
                        {DAY_NAMES[dow]}
                      </label>
                      {d.closed ? (
                        <span style={{ fontSize: 11.5, color: FAINT }}>closed</span>
                      ) : (
                        <>
                          <select className="sq-select" style={{ width: 'auto', padding: '6px 9px', fontSize: 12 }} value={d.openH} onChange={(e) => patchDay({ openH: Number(e.target.value) })}>
                            {HOUR_OPTIONS.filter((h) => h < d.closeH).map((h) => <option key={h} value={h}>{formatHour(h)}</option>)}
                          </select>
                          <span style={{ fontSize: 12, color: FAINT }}>to</span>
                          <select className="sq-select" style={{ width: 'auto', padding: '6px 9px', fontSize: 12 }} value={d.closeH} onChange={(e) => patchDay({ closeH: Number(e.target.value) })}>
                            {HOUR_OPTIONS.filter((h) => h > d.openH).map((h) => <option key={h} value={h}>{formatHour(h)}</option>)}
                          </select>
                        </>
                      )}
                    </div>
                  )
                })}
                <p style={{ fontSize: 11, color: FAINT, margin: '8px 0 0' }}>The store footer and the booking flow&apos;s available time slots follow these hours. Rooms with a custom schedule override them.</p>
              </>
            )}
          </div>

          {/* Holiday closures */}
          {cfg.closures !== undefined && (
            <div className="sq-card" style={{ ...card, padding: '20px 24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <p style={{ fontSize: 13.5, fontWeight: 700, color: INK, margin: 0 }}>Holiday closures</p>
                <button className="sq-btn sq-btn-ghost" style={{ padding: '5px 12px', fontSize: 11.5 }}
                  onClick={() => patchCfg({ closures: [...(cfg.closures ?? []), { date: '', label: '' }] })}>+ Add closure</button>
              </div>
              {(cfg.closures ?? []).length === 0 && (
                <p style={{ fontSize: 12.5, color: SUB, margin: 0 }}>No closures scheduled — add one to close the whole building for a day.</p>
              )}
              {(cfg.closures ?? []).map((c: Closure, i: number) => (
                <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
                  <input className="sq-input" style={{ width: 150 }} type="date" value={c.date}
                    onChange={(e) => patchCfg({ closures: cfg.closures!.map((x, j) => (j === i ? { ...x, date: e.target.value } : x)) })} />
                  <input className="sq-input" style={{ flex: 1, minWidth: 150 }} placeholder="Christmas Day" value={c.label}
                    onChange={(e) => patchCfg({ closures: cfg.closures!.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} />
                  <button aria-label="Remove closure" onClick={() => patchCfg({ closures: cfg.closures!.filter((_, j) => j !== i) })}
                    style={{ font: 'inherit', cursor: 'pointer', border: 'none', background: 'transparent', color: FAINT, fontSize: 15, lineHeight: 1 }}>×</button>
                </div>
              ))}
              <p style={{ fontSize: 11, color: FAINT, margin: '4px 0 0' }}>
                On these dates nothing can be booked and the store shows the closure. Past dates can be removed any time.
              </p>
            </div>
          )}

          {/* Coupons now have their own tab */}
          <div className="sq-card" style={card}>
            <div style={{ padding: '14px 20px', borderBottom: `1px solid ${LINE}` }}>
              <span style={{ fontSize: 13.5, fontWeight: 700, color: INK }}>Coupons</span>
            </div>
            <div style={{ padding: '14px 20px' }}>
              <p style={{ fontSize: 12.5, color: SUB, margin: '0 0 10px', lineHeight: 1.55 }}>
                Discount codes, special pricing, and free months of membership moved to their own tab, where you can
                also set expiry dates, usage caps, and which plans a code applies to.
                {coupons.length > 0 && ` ${coupons.filter((c) => c.active).length} of ${coupons.length} live right now.`}
              </p>
              <Link href="/admin/coupons" className="sq-btn sq-btn-primary" style={{ padding: '8px 16px', fontSize: 12.5, textDecoration: 'none' }}>
                Open Coupons
              </Link>
            </div>
          </div>

          {/* Staff */}
          <StaffManager />

          <div style={{ marginTop: 16 }}>
            <PermissionsMatrix />
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Directory of editors */}
          <div className="sq-card" style={{ ...card, padding: '18px 22px' }}>
            <p style={{ fontSize: 13.5, fontWeight: 700, color: INK, margin: '0 0 4px' }}>Where everything is edited</p>
            <p style={{ fontSize: 12, color: SUB, margin: '0 0 10px' }}>Every tab is fully editable — this is the map.</p>
            {EDITORS.map(([label, href]) => (
              <Link key={href} href={href} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13, fontWeight: 600, color: BLUE, textDecoration: 'none', padding: '8px 0', borderBottom: `1px solid ${LINE}` }}>
                {label} <span aria-hidden>→</span>
              </Link>
            ))}
          </div>

        </div>
      </div>
      <p style={{ fontSize: 11.5, color: FAINT, marginTop: 16 }}>Edits save automatically and are shared with all staff and the store.</p>
    </div>
    </AdminOnly>
  )
}
