'use client'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { PageHero } from '@/components/admin/PageHero'
import { AdminOnly } from '@/components/admin/AdminOnly'
import { card, INK, SUB, FAINT, LINE, BLUE, GREEN } from '@/lib/theme'
import { formatCents } from '@/lib/format'
import { getAddons, saveAddon, addAddon, deleteAddon, addonSlug, type AddonConfig } from '@/lib/addons-store'
import { getRooms, type RoomConfig } from '@/lib/facilities-store'
import { useDebouncedSave } from '@/lib/use-debounced-save'
import { isSupabaseConfigured } from '@/lib/supabase'

function dollarsToCents(v: string): number {
  const n = Number.parseFloat(v.replace(/[$,\s]/g, ''))
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : 0
}

export default function AddonsAdminPage() {
  const [addons, setAddons] = useState<AddonConfig[]>([])
  const [rooms, setRooms] = useState<RoomConfig[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [savedNote, setSavedNote] = useState(false)

  const debouncedSave = useDebouncedSave(async (a: AddonConfig) => {
    await saveAddon(a)
    setSavedNote(true)
    window.setTimeout(() => setSavedNote(false), 1800)
  })

  useEffect(() => {
    if (!isSupabaseConfigured()) return
    getAddons().then(setAddons).catch(() => {})
    getRooms().then(setRooms).catch(() => {})
  }, [])

  const editing = addons.find((a) => a.id === editingId) ?? null
  const roomsOffering = (id: string) => rooms.filter((r) => r.addonIds?.includes(id)).map((r) => r.name)

  const patch = (id: string, p: Partial<AddonConfig>) => {
    setAddons((cur) => {
      const next = cur.map((a) => (a.id === id ? { ...a, ...p } : a))
      const addon = next.find((a) => a.id === id)
      if (addon) debouncedSave(addon)
      return next
    })
  }

  const removeAddon = async (id: string, name: string) => {
    if (!window.confirm(`Delete ${name}? It disappears from every room that offers it.`)) return
    const ok = await deleteAddon(id)
    if (ok) {
      setAddons(await getAddons())
      if (editingId === id) setEditingId(null)
    }
  }

  const createAddon = async () => {
    const id = addonSlug('New Add-On', new Set(addons.map((a) => a.id)))
    const ok = await addAddon({ id, name: 'New Add-On', blurb: '', priceCents: 5000, active: false })
    if (ok) {
      setAddons(await getAddons())
      setEditingId(id)
    }
  }

  return (
    <AdminOnly>
    <div className="sq-page" style={{ padding: '34px 40px 20px', maxWidth: 1180, margin: '0 auto' }}>
      <PageHero title="Add Ons" sub="One-off extras for rentals — inflatables, photo booths, party hosts. Build the list here, then pick which rooms offer each one in Rooms & Pricing." chip={`${addons.filter((a) => a.active).length} available`}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {savedNote && <span style={{ fontSize: 12, fontWeight: 700 }}>Saved ✓</span>}
          <button className="sq-btn" style={{ background: '#fff', color: '#182740' }} onClick={createAddon}>+ New add-on</button>
        </div>
      </PageHero>

      <div className="sq-grid-2" style={{ display: 'grid', gridTemplateColumns: 'minmax(260px, 1fr) minmax(320px, 1.5fr)', gap: 16 }}>
        {/* Add-on list */}
        <div className="sq-card" style={{ ...card, alignSelf: 'start' }}>
          {addons.map((a, i) => (
            <button key={a.id} onClick={() => setEditingId(a.id)} style={{
              font: 'inherit', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left',
              background: editingId === a.id ? '#eef4fb' : 'transparent', border: 'none',
              padding: '13px 18px', borderBottom: i < addons.length - 1 ? `1px solid ${LINE}` : 'none',
            }}>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 13.5, fontWeight: 700, color: editingId === a.id ? BLUE : INK }}>{a.name}</span>
                <span style={{ display: 'block', fontSize: 11.5, color: SUB, fontVariantNumeric: 'tabular-nums' }}>
                  {formatCents(a.priceCents)} · {roomsOffering(a.id).length || 'no'} room{roomsOffering(a.id).length === 1 ? '' : 's'}
                </span>
              </span>
              {a.active
                ? <span style={{ fontSize: 10, fontWeight: 700, color: GREEN, background: '#e5f2ea', padding: '1px 8px', borderRadius: 999 }}>available</span>
                : <span style={{ fontSize: 10, fontWeight: 700, color: SUB, background: '#eef2f8', padding: '1px 8px', borderRadius: 999 }}>hidden</span>}
            </button>
          ))}
          {addons.length === 0 && (
            <p style={{ fontSize: 13, color: SUB, padding: '16px 18px', margin: 0 }}>
              {isSupabaseConfigured()
                ? 'No add-ons yet — create your first one (run 0016_addons.sql in Supabase if saving fails).'
                : 'Connect Supabase to manage add-ons.'}
            </p>
          )}
        </div>

        {/* Editor */}
        {editing ? (
          <div className="sq-card" style={{ ...card, padding: '20px 24px', alignSelf: 'start' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginBottom: 14 }}>
              <div>
                <label className="sq-label" htmlFor="a-name">Add-on name</label>
                <input id="a-name" className="sq-input" value={editing.name} onChange={(e) => patch(editing.id, { name: e.target.value })} />
              </div>
              <div>
                <label className="sq-label" htmlFor="a-price">Price ($, one-off)</label>
                <input id="a-price" className="sq-input" inputMode="decimal" defaultValue={(editing.priceCents / 100).toFixed(2)} key={`price-${editing.id}`}
                  onBlur={(e) => patch(editing.id, { priceCents: dollarsToCents(e.target.value) })} />
              </div>
            </div>

            <div style={{ marginBottom: 14 }}>
              <label className="sq-label" htmlFor="a-blurb">Description (shown to shoppers)</label>
              <textarea id="a-blurb" className="sq-textarea" rows={2} value={editing.blurb} placeholder="Bounce house with attendant for the full rental."
                onChange={(e) => patch(editing.id, { blurb: e.target.value })} />
            </div>

            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, fontWeight: 600, color: SUB, cursor: 'pointer', marginBottom: 12 }}>
              <input type="checkbox" checked={editing.active} onChange={(e) => patch(editing.id, { active: e.target.checked })} style={{ accentColor: BLUE }} />
              Available (rooms can offer it, shoppers can pick it)
            </label>

            <p style={{ fontSize: 11.5, color: SUB, margin: '0 0 4px', lineHeight: 1.5 }}>
              Offered by:{' '}
              {roomsOffering(editing.id).length > 0
                ? roomsOffering(editing.id).join(', ')
                : 'no rooms yet'}
              {' — '}pick rooms in <Link href="/admin/rooms" style={{ color: BLUE, fontWeight: 600 }}>Rooms &amp; Pricing</Link>.
            </p>

            <div style={{ borderTop: `1px solid ${LINE}`, marginTop: 14, paddingTop: 14, display: 'flex', justifyContent: 'flex-end' }}>
              <button className="sq-btn sq-btn-danger" style={{ padding: '6px 13px', fontSize: 11.5 }} onClick={() => removeAddon(editing.id, editing.name)}>Delete add-on</button>
            </div>
            <p style={{ fontSize: 11, color: FAINT, margin: '10px 0 0' }}>Saves automatically as you type — live for every visitor.</p>
          </div>
        ) : (
          <div className="sq-card" style={{ ...card, padding: '30px 32px', alignSelf: 'start', textAlign: 'center' }}>
            <p style={{ fontSize: 13.5, color: SUB, margin: 0 }}>Select an add-on to edit it, or create a new one.</p>
          </div>
        )}
      </div>
    </div>
    </AdminOnly>
  )
}
