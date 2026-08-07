'use client'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { PageHero } from '@/components/admin/PageHero'
import { AdminOnly } from '@/components/admin/AdminOnly'
import { card, INK, SUB, FAINT, LINE, BLUE } from '@/lib/theme'
import {
  getSiteContent, saveTextKey, saveNav, TEXT_FIELDS, NAV_DEFAULT,
  type SiteContent, type NavItem,
} from '@/lib/content-store'
import { useDebouncedSave } from '@/lib/use-debounced-save'
import { isSupabaseConfigured } from '@/lib/supabase'

const GROUPS = [...new Set(TEXT_FIELDS.map((f) => f.group))]

export default function SiteContentPage() {
  const [content, setContent] = useState<SiteContent | null>(null)
  const [savedNote, setSavedNote] = useState(false)

  const debouncedText = useDebouncedSave(async (p: { key: string; value: string }) => {
    await saveTextKey(p.key, p.value)
    setSavedNote(true)
    window.setTimeout(() => setSavedNote(false), 1800)
  })
  const debouncedNav = useDebouncedSave(async (nav: NavItem[]) => {
    await saveNav(nav)
    setSavedNote(true)
    window.setTimeout(() => setSavedNote(false), 1800)
  })

  useEffect(() => {
    if (!isSupabaseConfigured()) return
    getSiteContent().then(setContent).catch(() => {})
  }, [])

  const editText = (key: string, value: string) => {
    setContent((cur) => cur ? { ...cur, text: { ...cur.text, [key]: value } } : cur)
    debouncedText({ key, value })
  }

  const editNav = (nav: NavItem[]) => {
    setContent((cur) => (cur ? { ...cur, nav } : cur))
    debouncedNav(nav)
  }

  const addCustomLink = () => {
    if (!content) return
    editNav([...content.nav, { id: `custom-${content.nav.length}-${content.nav.map((n) => n.id).join('').length}`, href: '/', label: 'New link', visible: false, custom: true }])
  }

  if (!content) return <div style={{ minHeight: '60vh' }} />

  return (
    <AdminOnly>
    <div className="sq-page" style={{ padding: '34px 40px 20px', maxWidth: 1180, margin: '0 auto' }}>
      <PageHero title="Site Content" sub="Every headline, button, tile, and nav tab in the store — change the words here and they go live for every visitor." chip={savedNote ? 'Saved ✓' : 'live wording'} />

      {!content.available && (
        <div className="sq-card" style={{ ...card, padding: '16px 20px', marginBottom: 16 }}>
          <p style={{ fontSize: 12.5, color: '#7a5a14', margin: 0, lineHeight: 1.55 }}>
            Run the <strong>0011_site_content.sql</strong> migration in Supabase to make edits here stick —
            until then the store shows its built-in wording.
          </p>
        </div>
      )}

      <div className="sq-grid-2" style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 1fr) minmax(300px, 1.4fr)', gap: 16 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Nav tabs */}
          <div className="sq-card" style={{ ...card, padding: '18px 22px', alignSelf: 'stretch' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 4 }}>
              <p style={{ fontSize: 13.5, fontWeight: 700, color: INK, margin: 0 }}>Store nav tabs</p>
              <button className="sq-btn sq-btn-ghost" style={{ padding: '5px 12px', fontSize: 11.5 }} onClick={addCustomLink}>+ Add link</button>
            </div>
            <p style={{ fontSize: 11.5, color: SUB, margin: '0 0 12px' }}>Rename tabs, hide the ones you don&apos;t want, or add your own links — the header and footer follow.</p>
            {content.nav.map((n, i) => (
              <div key={n.id} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
                <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }} title={n.visible ? 'Shown in the store' : 'Hidden from the store'}>
                  <input type="checkbox" checked={n.visible} style={{ accentColor: BLUE }}
                    onChange={(e) => editNav(content.nav.map((x, j) => (j === i ? { ...x, visible: e.target.checked } : x)))} />
                </label>
                <input className="sq-input" style={{ flex: 1, minWidth: 120, fontSize: 12.5 }} value={n.label}
                  onChange={(e) => editNav(content.nav.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
                {n.custom ? (
                  <input className="sq-input" style={{ flex: 1, minWidth: 120, fontSize: 12, fontFamily: 'DM Mono, monospace' }} value={n.href} placeholder="/page or https://…"
                    onChange={(e) => editNav(content.nav.map((x, j) => (j === i ? { ...x, href: e.target.value } : x)))} />
                ) : (
                  <span style={{ fontSize: 11.5, color: FAINT, fontFamily: 'DM Mono, monospace' }}>{n.href}</span>
                )}
                {n.custom && (
                  <button aria-label={`Remove ${n.label}`} onClick={() => editNav(content.nav.filter((_, j) => j !== i))}
                    style={{ font: 'inherit', cursor: 'pointer', border: 'none', background: 'transparent', color: FAINT, fontSize: 15, lineHeight: 1 }}>×</button>
                )}
              </div>
            ))}
            <button className="sq-btn sq-btn-ghost" style={{ padding: '6px 12px', fontSize: 11.5, marginTop: 4 }} onClick={() => editNav(NAV_DEFAULT)}>Reset tabs to default</button>
          </div>

          <div className="sq-card" style={{ ...card, padding: '16px 20px' }}>
            <p style={{ fontSize: 12, color: SUB, margin: 0, lineHeight: 1.6 }}>
              Looking for other wording? Room names &amp; descriptions live in{' '}
              <Link href="/admin/rooms" style={{ color: BLUE, fontWeight: 600 }}>Rooms &amp; Pricing</Link>, plan copy in{' '}
              <Link href="/admin/memberships" style={{ color: BLUE, fontWeight: 600 }}>Fitness Memberships</Link>, waiver text in{' '}
              <Link href="/admin/forms" style={{ color: BLUE, fontWeight: 600 }}>Forms &amp; Waivers</Link>, products in{' '}
              <Link href="/admin/shop" style={{ color: BLUE, fontWeight: 600 }}>Shop</Link>, and hours &amp; contact info in{' '}
              <Link href="/admin/settings" style={{ color: BLUE, fontWeight: 600 }}>Settings</Link>.
            </p>
          </div>
        </div>

        {/* Text fields by group */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {GROUPS.map((group) => (
            <div key={group} className="sq-card" style={{ ...card, padding: '18px 22px' }}>
              <p style={{ fontSize: 13.5, fontWeight: 700, color: INK, margin: '0 0 12px' }}>{group}</p>
              {TEXT_FIELDS.filter((f) => f.group === group).map((f) => (
                <div key={f.key} style={{ marginBottom: 12 }}>
                  <label className="sq-label" htmlFor={`c-${f.key}`}>{f.label}</label>
                  {f.multiline ? (
                    <textarea id={`c-${f.key}`} className="sq-textarea" rows={2} value={content.text[f.key] ?? ''} placeholder={f.def}
                      onChange={(e) => editText(f.key, e.target.value)} />
                  ) : (
                    <input id={`c-${f.key}`} className="sq-input" value={content.text[f.key] ?? ''} placeholder={f.def}
                      onChange={(e) => editText(f.key, e.target.value)} />
                  )}
                </div>
              ))}
            </div>
          ))}
          <p style={{ fontSize: 11, color: FAINT, margin: 0 }}>Clear a field to go back to the built-in wording. Edits save automatically.</p>
        </div>
      </div>
    </div>
    </AdminOnly>
  )
}
