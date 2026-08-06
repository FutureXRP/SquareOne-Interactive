'use client'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { PageHero } from '@/components/admin/PageHero'
import { StaffManager } from '@/components/admin/StaffManager'
import { card, INK, SUB, FAINT, LINE, BLUE, GREEN } from '@/lib/theme'
import { formatCents, formatHour } from '@/lib/format'
import { getSiteConfig, saveSiteConfig, resetSiteConfig, SITE_CONFIG_EVENT, type SiteConfig } from '@/lib/site-config-store'
import { getCoupons, saveCoupons, resetCoupons, COUPONS_EVENT, type Coupon } from '@/lib/coupons-store'

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

  useEffect(() => {
    const sync = () => { setCfg(getSiteConfig()); setCoupons(getCoupons()) }
    sync()
    window.addEventListener(SITE_CONFIG_EVENT, sync)
    window.addEventListener(COUPONS_EVENT, sync)
    return () => { window.removeEventListener(SITE_CONFIG_EVENT, sync); window.removeEventListener(COUPONS_EVENT, sync) }
  }, [])

  const patchCfg = (p: Partial<SiteConfig>) => {
    if (!cfg) return
    const next = { ...cfg, ...p }
    setCfg(next)
    saveSiteConfig(next)
  }

  const persistCoupons = (next: Coupon[]) => { setCoupons(next); saveCoupons(next) }
  const patchCoupon = (code: string, p: Partial<Coupon>) => persistCoupons(coupons.map((c) => (c.code === code ? { ...c, ...p } : c)))

  const addCoupon = () => {
    let n = coupons.length + 1
    let code = `SQUARE${n}`
    while (coupons.some((c) => c.code === code)) code = `SQUARE${++n}`
    persistCoupons([...coupons, { code, kind: 'percent', value: 10, note: 'Describe this coupon', active: false }])
  }

  if (!cfg) return <div style={{ minHeight: '60vh' }} />

  return (
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
            <p style={{ fontSize: 11, color: FAINT, margin: '8px 0 0' }}>The store footer and the booking flow&apos;s available time slots follow these hours.</p>
          </div>

          {/* Coupons */}
          <div className="sq-card" style={card}>
            <div style={{ padding: '14px 20px', borderBottom: `1px solid ${LINE}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 13.5, fontWeight: 700, color: INK }}>Coupons</span>
              <button className="sq-btn sq-btn-ghost" style={{ padding: '5px 12px', fontSize: 11.5 }} onClick={addCoupon}>+ New coupon</button>
            </div>
            {coupons.map((c, i) => (
              <div key={c.code} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '11px 20px', borderBottom: i < coupons.length - 1 ? `1px solid ${LINE}` : 'none', flexWrap: 'wrap' }}>
                <input className="sq-input" style={{ width: 118, fontFamily: 'DM Mono, monospace', fontSize: 12, textTransform: 'uppercase' }} value={c.code}
                  onChange={(e) => patchCoupon(c.code, { code: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '') })} />
                <select className="sq-select" style={{ width: 'auto', padding: '7px 10px', fontSize: 12 }} value={c.kind} onChange={(e) => patchCoupon(c.code, { kind: e.target.value as Coupon['kind'] })}>
                  <option value="percent">% off</option>
                  <option value="amount">$ off</option>
                </select>
                {c.kind === 'percent' ? (
                  <input className="sq-input" style={{ width: 64 }} type="number" min={1} max={100} value={c.value} onChange={(e) => patchCoupon(c.code, { value: Math.min(100, Math.max(1, Number(e.target.value) || 1)) })} />
                ) : (
                  <input className="sq-input" style={{ width: 84 }} inputMode="decimal" defaultValue={(c.value / 100).toFixed(2)} key={`cv-${c.code}`}
                    onBlur={(e) => patchCoupon(c.code, { value: dollarsToCents(e.target.value) })} />
                )}
                <input className="sq-input" style={{ flex: 1, minWidth: 140, fontSize: 12 }} value={c.note} onChange={(e) => patchCoupon(c.code, { note: e.target.value })} />
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 600, color: c.active ? GREEN : SUB, cursor: 'pointer' }}>
                  <input type="checkbox" checked={c.active} onChange={(e) => patchCoupon(c.code, { active: e.target.checked })} style={{ accentColor: BLUE }} />
                  live
                </label>
                <button aria-label={`Remove ${c.code}`} onClick={() => persistCoupons(coupons.filter((x) => x.code !== c.code))} style={{ font: 'inherit', cursor: 'pointer', border: 'none', background: 'transparent', color: FAINT, fontSize: 15, lineHeight: 1 }}>×</button>
              </div>
            ))}
            <p style={{ fontSize: 11, color: FAINT, margin: 0, padding: '10px 20px' }}>
              Shoppers enter codes in the store cart — e.g. {coupons.filter((c) => c.active).map((c) => c.code).join(', ') || 'none live yet'}.
              Coupon support at membership signup and booking checkout arrives with Stripe. Example: {formatCents(2500)} off with a $-off coupon.
            </p>
          </div>

          {/* Staff */}
          <StaffManager />
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

          <div className="sq-card" style={{ ...card, padding: '16px 20px' }}>
            <p style={{ fontSize: 13.5, fontWeight: 700, color: INK, margin: '0 0 8px' }}>Reset demo data</p>
            <p style={{ fontSize: 12, color: SUB, margin: '0 0 10px', lineHeight: 1.55 }}>Put hours and coupons back to their defaults on this device.</p>
            <button className="sq-btn sq-btn-danger" style={{ padding: '7px 14px', fontSize: 12 }} onClick={() => { resetSiteConfig(); resetCoupons() }}>Reset hours &amp; coupons</button>
          </div>
        </div>
      </div>
      <p style={{ fontSize: 11.5, color: FAINT, marginTop: 16 }}>Edits save automatically on this device (demo) — shared config for all staff arrives with the backend.</p>
    </div>
  )
}
