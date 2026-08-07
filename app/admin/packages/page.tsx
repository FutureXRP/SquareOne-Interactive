'use client'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { PageHero } from '@/components/admin/PageHero'
import { AdminOnly } from '@/components/admin/AdminOnly'
import { card, INK, SUB, FAINT, LINE, BLUE, GREEN } from '@/lib/theme'
import { formatCents } from '@/lib/format'
import { getPackages, savePackage, addPackage as addPackageLive, deletePackage, type EventPackage } from '@/lib/packages-store'
import { getRooms, slugify, type RoomConfig } from '@/lib/facilities-store'
import { useDebouncedSave } from '@/lib/use-debounced-save'
import { isSupabaseConfigured } from '@/lib/supabase'

function dollarsToCents(v: string): number {
  const n = Number.parseFloat(v.replace(/[$,\s]/g, ''))
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : 0
}

export default function PackagesAdminPage() {
  const [packages, setPackages] = useState<EventPackage[]>([])
  const [rooms, setRooms] = useState<RoomConfig[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [savedNote, setSavedNote] = useState(false)

  const debouncedSave = useDebouncedSave(async (pkg: EventPackage) => {
    await savePackage(pkg)
    setSavedNote(true)
    window.setTimeout(() => setSavedNote(false), 1800)
  })

  useEffect(() => {
    if (!isSupabaseConfigured()) return
    getPackages().then(setPackages).catch(() => {})
    getRooms().then(setRooms).catch(() => {})
  }, [])

  const editing = packages.find((p) => p.id === editingId) ?? null

  const patch = (id: string, p: Partial<EventPackage>) => {
    setPackages((cur) => {
      const next = cur.map((x) => (x.id === id ? { ...x, ...p } : x))
      const pkg = next.find((x) => x.id === id)
      if (pkg) debouncedSave(pkg)
      return next
    })
  }

  const removePackage = async (id: string, name: string) => {
    if (!window.confirm(`Delete "${name}"?`)) return
    const ok = await deletePackage(id)
    if (ok) {
      setPackages((cur) => cur.filter((x) => x.id !== id))
      if (editingId === id) setEditingId(null)
    }
  }

  const addPackage = async () => {
    const id = slugify('New Package', new Set(packages.map((p) => p.id)))
    const ok = await addPackageLive({
      id, name: 'New Package', priceCents: 29900, hours: 2, capacity: 'Up to 20',
      blurb: 'Describe the bundle — who it fits and what makes it easy.',
      roomIds: [], includes: ['Staff on site', 'Setup & cleanup'], featured: false, active: false,
    })
    if (ok) {
      setPackages(await getPackages())
      setEditingId(id)
    }
  }

  return (
    <AdminOnly>
    <div className="sq-page" style={{ padding: '34px 40px 20px', maxWidth: 1180, margin: '0 auto' }}>
      <PageHero title="Event Packages" sub="Bundle rooms, hours, and extras into one flat price. Published packages appear on the store's Event Packages page instantly." chip={`${packages.filter((p) => p.active).length} live in store`}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {savedNote && <span style={{ fontSize: 12, fontWeight: 700 }}>Saved ✓</span>}
          <button className="sq-btn" style={{ background: '#fff', color: '#182740' }} onClick={addPackage}>+ New package</button>
        </div>
      </PageHero>

      <div className="sq-grid-2" style={{ display: 'grid', gridTemplateColumns: 'minmax(260px, 1fr) minmax(320px, 1.6fr)', gap: 16 }}>
        {/* Package list */}
        <div className="sq-card" style={{ ...card, alignSelf: 'start' }}>
          {packages.map((p, i) => (
            <button key={p.id} onClick={() => setEditingId(p.id)} style={{
              font: 'inherit', cursor: 'pointer', display: 'block', width: '100%', textAlign: 'left',
              background: editingId === p.id ? '#eef4fb' : 'transparent', border: 'none',
              padding: '13px 18px', borderBottom: i < packages.length - 1 ? `1px solid ${LINE}` : 'none',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                <span style={{ fontSize: 13.5, fontWeight: 700, color: editingId === p.id ? BLUE : INK }}>{p.name}</span>
                {p.active
                  ? <span style={{ fontSize: 10, fontWeight: 700, color: GREEN, background: '#e5f2ea', padding: '1px 8px', borderRadius: 999 }}>live</span>
                  : <span style={{ fontSize: 10, fontWeight: 700, color: SUB, background: '#eef2f8', padding: '1px 8px', borderRadius: 999 }}>hidden</span>}
              </div>
              <span style={{ fontSize: 11.5, color: SUB, fontVariantNumeric: 'tabular-nums' }}>{formatCents(p.priceCents)} · {p.hours} hrs · {p.roomIds.length} rooms</span>
            </button>
          ))}
        </div>

        {/* Editor */}
        {editing ? (
          <div className="sq-card" style={{ ...card, padding: '20px 24px', alignSelf: 'start' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginBottom: 14 }}>
              <div>
                <label className="sq-label" htmlFor="p-name">Package name</label>
                <input id="p-name" className="sq-input" value={editing.name} onChange={(e) => patch(editing.id, { name: e.target.value })} />
              </div>
              <div>
                <label className="sq-label" htmlFor="p-price">Flat price ($)</label>
                <input id="p-price" className="sq-input" inputMode="decimal" defaultValue={(editing.priceCents / 100).toFixed(2)} key={`price-${editing.id}`}
                  onBlur={(e) => patch(editing.id, { priceCents: dollarsToCents(e.target.value) })} />
              </div>
            </div>

            <div style={{ marginBottom: 14 }}>
              <label className="sq-label" htmlFor="p-blurb">Store description</label>
              <textarea id="p-blurb" className="sq-textarea" rows={2} value={editing.blurb} onChange={(e) => patch(editing.id, { blurb: e.target.value })} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 14, marginBottom: 14 }}>
              <div>
                <label className="sq-label" htmlFor="p-hours">Length</label>
                <select id="p-hours" className="sq-select" value={editing.hours} onChange={(e) => patch(editing.id, { hours: Number(e.target.value) })}>
                  {[1, 2, 3, 4, 5, 6, 7, 8].map((h) => <option key={h} value={h}>{h} hour{h > 1 ? 's' : ''}</option>)}
                </select>
              </div>
              <div>
                <label className="sq-label" htmlFor="p-cap">Capacity label</label>
                <input id="p-cap" className="sq-input" value={editing.capacity} onChange={(e) => patch(editing.id, { capacity: e.target.value })} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', gap: 4, paddingBottom: 4 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, fontWeight: 600, color: SUB, cursor: 'pointer' }}>
                  <input type="checkbox" checked={editing.active} onChange={(e) => patch(editing.id, { active: e.target.checked })} style={{ accentColor: BLUE }} />
                  Visible in the store
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, fontWeight: 600, color: SUB, cursor: 'pointer' }}>
                  <input type="checkbox" checked={editing.featured} onChange={(e) => patch(editing.id, { featured: e.target.checked })} style={{ accentColor: BLUE }} />
                  Featured (&quot;Most popular&quot;)
                </label>
              </div>
            </div>

            <div style={{ marginBottom: 14 }}>
              <span className="sq-label">Rooms in this bundle</span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {rooms.map((r) => {
                  const on = editing.roomIds.includes(r.id)
                  return (
                    <button key={r.id} onClick={() => patch(editing.id, { roomIds: on ? editing.roomIds.filter((x) => x !== r.id) : [...editing.roomIds, r.id] })} style={{
                      font: 'inherit', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6,
                      fontSize: 12, fontWeight: 600, color: on ? '#fff' : SUB,
                      background: on ? r.color : '#fff', border: `1.5px solid ${on ? r.color : LINE}`,
                      borderRadius: 999, padding: '5px 13px',
                    }}>
                      {!on && <span style={{ width: 8, height: 8, borderRadius: 2, background: r.color }} />}
                      {r.name}
                    </button>
                  )
                })}
              </div>
            </div>

            <span className="sq-label">What&apos;s included</span>
            {editing.includes.map((inc, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                <input className="sq-input" value={inc}
                  onChange={(e) => patch(editing.id, { includes: editing.includes.map((x, j) => (j === i ? e.target.value : x)) })} />
                <button aria-label="Remove item" onClick={() => patch(editing.id, { includes: editing.includes.filter((_, j) => j !== i) })} style={{ font: 'inherit', cursor: 'pointer', border: 'none', background: 'transparent', color: FAINT, fontSize: 15, lineHeight: 1 }}>×</button>
              </div>
            ))}
            <button className="sq-btn sq-btn-ghost" style={{ padding: '7px 13px', marginTop: 4 }} onClick={() => patch(editing.id, { includes: [...editing.includes, 'New inclusion'] })}>
              + Add item
            </button>

            <div style={{ borderTop: `1px solid ${LINE}`, marginTop: 18, paddingTop: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
              <Link href="/packages" style={{ fontSize: 12.5, color: BLUE, fontWeight: 600, textDecoration: 'none' }}>Preview in store →</Link>
              <button className="sq-btn sq-btn-danger" style={{ padding: '6px 13px', fontSize: 11.5 }} onClick={() => removePackage(editing.id, editing.name)}>Delete package</button>
            </div>
            <p style={{ fontSize: 11, color: FAINT, margin: '10px 0 0' }}>Saves automatically — live in the store for every visitor.</p>
          </div>
        ) : (
          <div className="sq-card" style={{ ...card, padding: '30px 32px', alignSelf: 'start', textAlign: 'center' }}>
            <p style={{ fontSize: 13.5, color: SUB, margin: 0 }}>Select a package to edit it, or create a new bundle.</p>
          </div>
        )}
      </div>
    </div>
    </AdminOnly>
  )
}
