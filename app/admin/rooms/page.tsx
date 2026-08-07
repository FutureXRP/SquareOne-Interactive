'use client'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { PageHero } from '@/components/admin/PageHero'
import { card, INK, SUB, FAINT, LINE, BLUE, GREEN } from '@/lib/theme'
import { formatCents } from '@/lib/format'
import { getRooms, saveRoom, addRoom, deleteRoom, slugify, ROOM_COLORS, type RoomConfig } from '@/lib/facilities-store'
import { useDebouncedSave } from '@/lib/use-debounced-save'
import { isSupabaseConfigured } from '@/lib/supabase'

function dollarsToCents(v: string): number {
  const n = Number.parseFloat(v.replace(/[$,\s]/g, ''))
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : 0
}

export default function RoomsAdminPage() {
  const [rooms, setRooms] = useState<RoomConfig[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [savedNote, setSavedNote] = useState(false)

  const debouncedSave = useDebouncedSave(async (room: RoomConfig) => {
    await saveRoom(room)
    setSavedNote(true)
    window.setTimeout(() => setSavedNote(false), 1800)
  })

  useEffect(() => {
    if (!isSupabaseConfigured()) return
    getRooms().then(setRooms).catch(() => {})
  }, [])

  const editing = rooms.find((r) => r.id === editingId) ?? null

  const patch = (id: string, p: Partial<RoomConfig>) => {
    setRooms((cur) => {
      const next = cur.map((r) => (r.id === id ? { ...r, ...p } : r))
      const room = next.find((r) => r.id === id)
      if (room) debouncedSave(room)
      return next
    })
  }

  const removeRoom = async (id: string, name: string) => {
    if (!window.confirm(`Delete ${name}? If it has bookings it will be hidden from the store instead.`)) return
    const result = await deleteRoom(id)
    if (result !== 'failed') {
      setRooms(await getRooms())
      if (editingId === id) setEditingId(null)
      if (result === 'hidden') window.alert('This room has bookings, so it was hidden from the store instead of deleted.')
    }
  }

  const createRoom = async () => {
    const id = slugify('New Room', new Set(rooms.map((r) => r.id)))
    const room: Omit<RoomConfig, 'sort'> = {
      id,
      name: 'New Room',
      color: ROOM_COLORS[rooms.length % ROOM_COLORS.length],
      blurb: 'Describe this space — what it fits and what makes it great.',
      capacity: 'Up to 20',
      minHours: 1,
      perHourCents: 5000,
      pricing: [{ label: 'Per hour', cents: 5000 }],
      active: false,
    }
    const ok = await addRoom(room)
    if (ok) {
      setRooms(await getRooms())
      setEditingId(id)
    }
  }

  return (
    <div className="sq-page" style={{ padding: '34px 40px 20px', maxWidth: 1180, margin: '0 auto' }}>
      <PageHero title="Rooms & Pricing" sub="Everything the store shows about each room is edited here — changes go live for every visitor as soon as they save." chip={`${rooms.filter((r) => r.active).length} live in store`}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {savedNote && <span style={{ fontSize: 12, fontWeight: 700 }}>Saved ✓</span>}
          <button className="sq-btn" style={{ background: '#fff', color: '#182740' }} onClick={createRoom}>+ Add a room</button>
        </div>
      </PageHero>

      <div className="sq-grid-2" style={{ display: 'grid', gridTemplateColumns: 'minmax(260px, 1fr) minmax(320px, 1.6fr)', gap: 16 }}>
        {/* Room list */}
        <div className="sq-card" style={{ ...card, alignSelf: 'start' }}>
          {rooms.map((r, i) => (
            <button key={r.id} onClick={() => setEditingId(r.id)} style={{
              font: 'inherit', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left',
              background: editingId === r.id ? '#eef4fb' : 'transparent', border: 'none',
              padding: '13px 18px', borderBottom: i < rooms.length - 1 ? `1px solid ${LINE}` : 'none',
            }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: r.color, flexShrink: 0 }} />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 13.5, fontWeight: 700, color: editingId === r.id ? BLUE : INK }}>{r.name}</span>
                <span style={{ display: 'block', fontSize: 11.5, color: SUB }}>
                  {r.capacity}{r.pricing.length > 0 ? ` · from ${formatCents(Math.min(...r.pricing.map((p) => p.cents)))}` : ''}
                </span>
              </span>
              {r.active
                ? <span style={{ fontSize: 10, fontWeight: 700, color: GREEN, background: '#e5f2ea', padding: '1px 8px', borderRadius: 999 }}>live</span>
                : <span style={{ fontSize: 10, fontWeight: 700, color: SUB, background: '#eef2f8', padding: '1px 8px', borderRadius: 999 }}>hidden</span>}
            </button>
          ))}
          {rooms.length === 0 && <p style={{ fontSize: 13, color: SUB, padding: '16px 18px', margin: 0 }}>Loading rooms…</p>}
        </div>

        {/* Editor */}
        {editing ? (
          <div className="sq-card" style={{ ...card, padding: '20px 24px', alignSelf: 'start' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14, marginBottom: 14 }}>
              <div>
                <label className="sq-label" htmlFor="r-name">Room name</label>
                <input id="r-name" className="sq-input" value={editing.name} onChange={(e) => patch(editing.id, { name: e.target.value })} />
              </div>
              <div>
                <label className="sq-label" htmlFor="r-cap">Capacity label</label>
                <input id="r-cap" className="sq-input" value={editing.capacity} onChange={(e) => patch(editing.id, { capacity: e.target.value })} />
              </div>
            </div>

            <div style={{ marginBottom: 14 }}>
              <label className="sq-label" htmlFor="r-blurb">Store description</label>
              <textarea id="r-blurb" className="sq-textarea" rows={2} value={editing.blurb} onChange={(e) => patch(editing.id, { blurb: e.target.value })} />
            </div>

            <div style={{ marginBottom: 14 }}>
              <span className="sq-label">Zone color</span>
              <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                {ROOM_COLORS.map((c) => (
                  <button key={c} aria-label={`Color ${c}`} onClick={() => patch(editing.id, { color: c })} style={{
                    width: 26, height: 26, borderRadius: 7, background: c, cursor: 'pointer',
                    border: editing.color === c ? '2.5px solid #1f2c42' : '2.5px solid transparent',
                  }} />
                ))}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14, marginBottom: 14 }}>
              <div>
                <label className="sq-label" htmlFor="r-rate">Booking rate ($/hr)</label>
                <input id="r-rate" className="sq-input" inputMode="decimal" defaultValue={(editing.perHourCents / 100).toFixed(2)} key={`rate-${editing.id}`}
                  onBlur={(e) => patch(editing.id, { perHourCents: dollarsToCents(e.target.value) })} />
              </div>
              <div>
                <label className="sq-label" htmlFor="r-min">Minimum rental</label>
                <select id="r-min" className="sq-select" value={editing.minHours} onChange={(e) => patch(editing.id, { minHours: Number(e.target.value) })}>
                  {[1, 2, 3, 4].map((h) => <option key={h} value={h}>{h} hour{h > 1 ? 's' : ''}</option>)}
                </select>
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: 8 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, fontWeight: 600, color: SUB, cursor: 'pointer' }}>
                  <input type="checkbox" checked={editing.active} onChange={(e) => patch(editing.id, { active: e.target.checked })} style={{ accentColor: BLUE }} />
                  Visible in the store
                </label>
              </div>
            </div>

            <p style={{ fontSize: 11, color: FAINT, margin: '-6px 0 14px', lineHeight: 1.5 }}>
              The booking rate is what the online booking calculator charges per hour. The advertised
              prices below are the chips shown on the room&apos;s store card — keep them in sync.
            </p>
            <span className="sq-label">Advertised prices (shown as chips in the store)</span>
            {editing.pricing.map((p, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                <input className="sq-input" style={{ flex: 2 }} value={p.label} placeholder="Per hour"
                  onChange={(e) => patch(editing.id, { pricing: editing.pricing.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} />
                <input className="sq-input" style={{ flex: 1 }} inputMode="decimal" defaultValue={(p.cents / 100).toFixed(2)} key={`p-${editing.id}-${i}`}
                  onBlur={(e) => patch(editing.id, { pricing: editing.pricing.map((x, j) => (j === i ? { ...x, cents: dollarsToCents(e.target.value) } : x)) })} />
                <button aria-label="Remove price" onClick={() => patch(editing.id, { pricing: editing.pricing.filter((_, j) => j !== i) })} style={{ font: 'inherit', cursor: 'pointer', border: 'none', background: 'transparent', color: FAINT, fontSize: 15, lineHeight: 1 }}>×</button>
              </div>
            ))}
            <button className="sq-btn sq-btn-ghost" style={{ padding: '7px 13px', marginTop: 4 }} onClick={() => patch(editing.id, { pricing: [...editing.pricing, { label: 'New price', cents: 5000 }] })}>
              + Add price
            </button>

            <div style={{ borderTop: `1px solid ${LINE}`, marginTop: 18, paddingTop: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
              <Link href={`/facilities/${editing.id}`} style={{ fontSize: 12.5, color: BLUE, fontWeight: 600, textDecoration: 'none' }}>Preview in store →</Link>
              <button className="sq-btn sq-btn-danger" style={{ padding: '6px 13px', fontSize: 11.5 }} onClick={() => removeRoom(editing.id, editing.name)}>Delete room</button>
            </div>
            <p style={{ fontSize: 11, color: FAINT, margin: '10px 0 0' }}>Saves automatically as you type — live for every visitor.</p>
          </div>
        ) : (
          <div className="sq-card" style={{ ...card, padding: '30px 32px', alignSelf: 'start', textAlign: 'center' }}>
            <p style={{ fontSize: 13.5, color: SUB, margin: 0 }}>Select a room to edit everything about it, or add a new one.</p>
          </div>
        )}
      </div>
    </div>
  )
}
