'use client'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { PageHero } from '@/components/admin/PageHero'
import { AdminOnly } from '@/components/admin/AdminOnly'
import { card, INK, SUB, FAINT, LINE, BLUE, GREEN } from '@/lib/theme'
import { formatCents } from '@/lib/format'
import { getAddons, saveAddon, addAddon, deleteAddon, uploadAddonPhoto, addonSlug, addonPriceLabel, type AddonConfig } from '@/lib/addons-store'
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
  const [uploading, setUploading] = useState(false)
  const [uploadFailed, setUploadFailed] = useState(false)

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
              {a.photoUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={a.photoUrl} alt="" style={{ width: 34, height: 34, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} />
              )}
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 13.5, fontWeight: 700, color: editingId === a.id ? BLUE : INK }}>{a.name}</span>
                <span style={{ display: 'block', fontSize: 11.5, color: SUB, fontVariantNumeric: 'tabular-nums' }}>
                  {addonPriceLabel(a)} · {roomsOffering(a.id).length || 'no'} room{roomsOffering(a.id).length === 1 ? '' : 's'}
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
            <div style={{ marginBottom: 14 }}>
              <label className="sq-label" htmlFor="a-name">Add-on name</label>
              <input id="a-name" className="sq-input" value={editing.name} onChange={(e) => patch(editing.id, { name: e.target.value })} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginBottom: 6 }}>
              <div>
                <label className="sq-label" htmlFor="a-price">First hour ($)</label>
                <input id="a-price" className="sq-input" inputMode="decimal" defaultValue={(editing.priceCents / 100).toFixed(2)} key={`price-${editing.id}`}
                  onBlur={(e) => patch(editing.id, { priceCents: dollarsToCents(e.target.value) })} />
              </div>
              <div>
                <label className="sq-label" htmlFor="a-extra">Each additional hour ($)</label>
                <input id="a-extra" className="sq-input" inputMode="decimal" placeholder="blank = charged once"
                  defaultValue={editing.extraHourCents === null ? '' : (editing.extraHourCents / 100).toFixed(2)} key={`extra-${editing.id}`}
                  onBlur={(e) => patch(editing.id, { extraHourCents: e.target.value.trim() === '' ? null : dollarsToCents(e.target.value) })} />
              </div>
            </div>
            <p style={{ fontSize: 11.5, color: FAINT, margin: '0 0 14px', lineHeight: 1.5 }}>
              {editing.extraHourCents === null
                ? 'Charged once per booking no matter how long the rental is. Set an additional-hour rate to price it like the inflatable — $100 the first hour, $25 each hour after.'
                : `A 3-hour rental pays ${formatCents(editing.priceCents + editing.extraHourCents * 2)} for this add-on. Clear the field to charge once per booking instead.`}
            </p>

            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14, flexWrap: 'wrap' }}>
              {editing.photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={editing.photoUrl} alt={editing.name} style={{ width: 84, height: 84, borderRadius: 12, objectFit: 'cover', border: `1px solid ${LINE}` }} />
              ) : (
                <div style={{ width: 84, height: 84, borderRadius: 12, background: '#eef2f8', border: `1px dashed #c3cede`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10.5, color: FAINT, textAlign: 'center', padding: 6 }}>no photo yet</div>
              )}
              <div>
                <label className="sq-label" style={{ display: 'block' }}>Photo (shown to shoppers)</label>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <label className="sq-btn sq-btn-ghost" style={{ padding: '7px 14px', fontSize: 12, cursor: 'pointer' }}>
                    {uploading ? 'Uploading…' : editing.photoUrl ? 'Replace photo' : 'Upload photo'}
                    <input type="file" accept="image/*" style={{ display: 'none' }} disabled={uploading} onChange={async (e) => {
                      const file = e.target.files?.[0]
                      e.target.value = ''
                      if (!file) return
                      setUploading(true)
                      setUploadFailed(false)
                      const url = await uploadAddonPhoto(editing.id, file)
                      setUploading(false)
                      if (url) patch(editing.id, { photoUrl: url })
                      else setUploadFailed(true)
                    }} />
                  </label>
                  {editing.photoUrl && (
                    <button className="sq-btn sq-btn-ghost" style={{ padding: '7px 14px', fontSize: 12 }} onClick={() => patch(editing.id, { photoUrl: null })}>Remove</button>
                  )}
                </div>
                <p style={{ fontSize: 11, color: uploadFailed ? '#b23f33' : FAINT, margin: '6px 0 0' }}>
                  {uploadFailed ? "Upload failed — photos need the room-photos bucket (0005) and a photo under 5 MB." : 'JPG or PNG up to 5 MB — appears on the booking page next to the name.'}
                </p>
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
