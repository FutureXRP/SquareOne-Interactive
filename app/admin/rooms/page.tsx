'use client'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { PageHero } from '@/components/admin/PageHero'
import { AdminOnly } from '@/components/admin/AdminOnly'
import { card, INK, SUB, FAINT, LINE, BLUE, GREEN } from '@/lib/theme'
import { formatCents, formatHour } from '@/lib/format'
import { getRooms, saveRoom, addRoom, deleteRoom, uploadRoomPhoto, slugify, ROOM_COLORS, DAY_NAMES, type RoomConfig } from '@/lib/facilities-store'
import { getAddons, ADDONS_EVENT, type AddonConfig } from '@/lib/addons-store'
import { getFormLinks, setRoomWaiver, roomRequires, FORM_LINKS_EVENT, type FormLink } from '@/lib/form-links-store'
import { useDebouncedSave } from '@/lib/use-debounced-save'
import { isSupabaseConfigured } from '@/lib/supabase'

function dollarsToCents(v: string): number {
  const n = Number.parseFloat(v.replace(/[$,\s]/g, ''))
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : 0
}

// Half-hour steps from 5:00 AM to 11:00 PM for the schedule pickers.
const HOUR_OPTIONS = Array.from({ length: 37 }, (_, i) => 5 + i * 0.5)

export default function RoomsAdminPage() {
  const [rooms, setRooms] = useState<RoomConfig[]>([])
  const [addons, setAddons] = useState<AddonConfig[]>([])
  const [formLinks, setFormLinks] = useState<FormLink[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [savedNote, setSavedNote] = useState(false)
  const [uploading, setUploading] = useState(false)

  const debouncedSave = useDebouncedSave(async (room: RoomConfig) => {
    await saveRoom(room)
    setSavedNote(true)
    window.setTimeout(() => setSavedNote(false), 1800)
  })

  useEffect(() => {
    if (!isSupabaseConfigured()) return
    getRooms().then(setRooms).catch(() => {})
    const syncAddons = () => { getAddons().then(setAddons).catch(() => {}) }
    syncAddons()
    const syncLinks = () => { getFormLinks().then(setFormLinks).catch(() => {}) }
    syncLinks()
    window.addEventListener(ADDONS_EVENT, syncAddons)
    window.addEventListener(FORM_LINKS_EVENT, syncLinks)
    return () => { window.removeEventListener(ADDONS_EVENT, syncAddons); window.removeEventListener(FORM_LINKS_EVENT, syncLinks) }
  }, [])

  const toggleRoomWaiver = async (f: FormLink, roomId: string, on: boolean) => {
    await setRoomWaiver(f, roomId, on, rooms.map((r) => r.id))
    setFormLinks(await getFormLinks())
  }

  const editing = rooms.find((r) => r.id === editingId) ?? null

  const onPhotoPicked = async (room: RoomConfig, file: File | undefined) => {
    if (!file) return
    if (file.size > 5 * 1024 * 1024) { window.alert('That image is over 5 MB — please use a smaller one.'); return }
    setUploading(true)
    const url = await uploadRoomPhoto(room.id, file)
    setUploading(false)
    if (!url) {
      window.alert("Couldn't upload the photo. Make sure the 0005_room_photos.sql migration has been run in Supabase.")
      return
    }
    patch(room.id, { photoUrl: url })
  }

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
      // Split rates only exist once migration 0006 has run (visible on loaded rooms)
      ...(rooms.some((r) => r.firstHourCents !== undefined) ? { firstHourCents: 5000 } : {}),
    }
    const ok = await addRoom(room)
    if (ok) {
      setRooms(await getRooms())
      setEditingId(id)
    }
  }

  return (
    <AdminOnly>
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

            <div style={{ marginBottom: 14 }}>
              <span className="sq-label">Room photo (card &amp; page background)</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                {editing.photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={editing.photoUrl} alt={`${editing.name} photo`} style={{ width: 92, height: 60, objectFit: 'cover', borderRadius: 9, border: `1px solid ${LINE}` }} />
                ) : (
                  <div style={{ width: 92, height: 60, borderRadius: 9, background: `linear-gradient(135deg, ${editing.color}2e, ${editing.color}0d)`, border: `1px solid ${LINE}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: FAINT }}>no photo</div>
                )}
                <label className="sq-btn sq-btn-ghost" style={{ padding: '7px 13px', fontSize: 11.5, cursor: 'pointer' }}>
                  {uploading ? 'Uploading…' : editing.photoUrl ? 'Replace photo' : 'Upload photo'}
                  <input type="file" accept="image/*" style={{ display: 'none' }} disabled={uploading}
                    onChange={(e) => { onPhotoPicked(editing, e.target.files?.[0]); e.target.value = '' }} />
                </label>
                {editing.photoUrl && (
                  <button className="sq-btn sq-btn-ghost" style={{ padding: '7px 13px', fontSize: 11.5 }} onClick={() => patch(editing.id, { photoUrl: null })}>Remove</button>
                )}
              </div>
              <p style={{ fontSize: 11, color: FAINT, margin: '6px 0 0' }}>JPG or PNG up to 5 MB — shown behind the room&apos;s card in the store. Without one, the zone color is used.</p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14, marginBottom: 14 }}>
              {editing.firstHourCents !== undefined && (
                <div>
                  <label className="sq-label" htmlFor="r-first">First hour ($)</label>
                  <input id="r-first" className="sq-input" inputMode="decimal" defaultValue={(editing.firstHourCents / 100).toFixed(2)} key={`first-${editing.id}`}
                    onBlur={(e) => patch(editing.id, { firstHourCents: dollarsToCents(e.target.value) })} />
                </div>
              )}
              <div>
                <label className="sq-label" htmlFor="r-rate">{editing.firstHourCents !== undefined ? 'Each additional hour ($)' : 'Booking rate ($/hr)'}</label>
                <input id="r-rate" className="sq-input" inputMode="decimal" defaultValue={(editing.perHourCents / 100).toFixed(2)} key={`rate-${editing.id}`}
                  onBlur={(e) => patch(editing.id, { perHourCents: dollarsToCents(e.target.value) })} />
              </div>
              <div>
                <label className="sq-label" htmlFor="r-min">Minimum rental</label>
                <select id="r-min" className="sq-select" value={editing.minHours} onChange={(e) => patch(editing.id, { minHours: Number(e.target.value) })}>
                  {[1, 2, 3, 4].map((h) => <option key={h} value={h}>{h} hour{h > 1 ? 's' : ''}</option>)}
                </select>
              </div>
              {editing.minNoticeHours !== undefined && (
                <div>
                  <label className="sq-label" htmlFor="r-notice">Book at least … ahead</label>
                  <select id="r-notice" className="sq-select" value={editing.minNoticeHours} onChange={(e) => patch(editing.id, { minNoticeHours: Number(e.target.value) })}>
                    <option value={0}>No notice needed</option>
                    {[2, 6, 12, 24, 48, 72].map((h) => <option key={h} value={h}>{h >= 24 ? `${h / 24} day${h > 24 ? 's' : ''}` : `${h} hours`}</option>)}
                  </select>
                </div>
              )}
              {/* Unbilled time the calendar holds around every booking (0039) */}
              {editing.setupMin !== undefined && (
                <>
                  <div>
                    <label className="sq-label" htmlFor="r-setup">Setup time before</label>
                    <select id="r-setup" className="sq-select" value={editing.setupMin} onChange={(e) => patch(editing.id, { setupMin: Number(e.target.value) })}>
                      <option value={0}>None</option>
                      {[15, 30, 45, 60, 90, 120].map((m) => <option key={m} value={m}>{m >= 60 ? `${m / 60} hour${m > 60 ? 's' : ''}` : `${m} min`}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="sq-label" htmlFor="r-cleanup">Cleanup time after</label>
                    <select id="r-cleanup" className="sq-select" value={editing.cleanupMin ?? 0} onChange={(e) => patch(editing.id, { cleanupMin: Number(e.target.value) })}>
                      <option value={0}>None</option>
                      {[15, 30, 45, 60, 90, 120].map((m) => <option key={m} value={m}>{m >= 60 ? `${m / 60} hour${m > 60 ? 's' : ''}` : `${m} min`}</option>)}
                    </select>
                  </div>
                </>
              )}
              <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: 8 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, fontWeight: 600, color: SUB, cursor: 'pointer' }}>
                  <input type="checkbox" checked={editing.active} onChange={(e) => patch(editing.id, { active: e.target.checked })} style={{ accentColor: BLUE }} />
                  Visible in the store
                </label>
              </div>
            </div>

            {editing.setupMin !== undefined && (editing.setupMin > 0 || (editing.cleanupMin ?? 0) > 0) && (
              <p style={{ fontSize: 11, color: FAINT, margin: '-6px 0 14px', lineHeight: 1.5 }}>
                Setup and cleanup time is held on the calendar around every booking of this room — a 6 PM
                booking with an hour of setup blocks the room from 5 PM — but the customer is neither
                shown nor charged for it. Changing this affects new bookings only.
              </p>
            )}
            <p style={{ fontSize: 11, color: FAINT, margin: '-6px 0 14px', lineHeight: 1.5 }}>
              {editing.firstHourCents !== undefined
                ? 'The booking calculator charges the first-hour rate for hour one and the additional-hour rate for every hour after — set them equal for flat pricing. The advertised prices below are the chips shown on the room’s store card — keep them in sync.'
                : 'The booking rate is what the online booking calculator charges per hour. Run the 0006_room_rates.sql migration in Supabase to unlock separate first-hour and additional-hour rates. The advertised prices below are the chips shown on the room’s store card.'}
            </p>
            {/* Time & day pricing rules — override the base rates by window */}
            {editing.rateRules !== undefined && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                  <span className="sq-label" style={{ marginBottom: 0 }}>Time &amp; day pricing</span>
                  <button className="sq-btn sq-btn-ghost" style={{ padding: '5px 12px', fontSize: 11.5 }}
                    onClick={() => patch(editing.id, { rateRules: [...(editing.rateRules ?? []), { days: [1, 2, 3, 4, 5], fromH: 17, toH: 22, cents: editing.perHourCents, label: '' }] })}>
                    + Add rule
                  </button>
                </div>
                {(editing.rateRules ?? []).length === 0 && (
                  <p style={{ fontSize: 11.5, color: FAINT, margin: '6px 0 0', lineHeight: 1.5 }}>
                    No rules — every hour uses the base rates above. Add a rule to charge differently by
                    time of day or day of the week (evenings, weekends…).
                  </p>
                )}
                {(editing.rateRules ?? []).map((rule, i) => {
                  const patchRule = (p: Partial<typeof rule>) =>
                    patch(editing.id, { rateRules: editing.rateRules!.map((x, j) => (j === i ? { ...x, ...p } : x)) })
                  return (
                    <div key={i} style={{ border: `1px solid ${LINE}`, borderRadius: 10, padding: '10px 12px', marginTop: 8 }}>
                      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 8 }}>
                        {DAY_NAMES.map((name, dow) => (
                          <button key={dow} onClick={() => patchRule({ days: rule.days.includes(dow) ? rule.days.filter((d) => d !== dow) : [...rule.days, dow].sort() })} style={{
                            font: 'inherit', cursor: 'pointer', fontSize: 10.5, fontWeight: 700, padding: '3px 8px', borderRadius: 999,
                            color: rule.days.includes(dow) ? '#fff' : SUB,
                            background: rule.days.includes(dow) ? BLUE : '#fff',
                            border: `1.5px solid ${rule.days.includes(dow) ? BLUE : LINE}`,
                          }}>
                            {name.slice(0, 3)}
                          </button>
                        ))}
                      </div>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                        <select className="sq-select" style={{ width: 'auto', padding: '6px 9px', fontSize: 12 }} value={rule.fromH} onChange={(e) => patchRule({ fromH: Number(e.target.value) })}>
                          {HOUR_OPTIONS.filter((h) => h < rule.toH).map((h) => <option key={h} value={h}>{formatHour(h)}</option>)}
                        </select>
                        <span style={{ fontSize: 11.5, color: FAINT }}>to</span>
                        <select className="sq-select" style={{ width: 'auto', padding: '6px 9px', fontSize: 12 }} value={rule.toH} onChange={(e) => patchRule({ toH: Number(e.target.value) })}>
                          {HOUR_OPTIONS.filter((h) => h > rule.fromH).map((h) => <option key={h} value={h}>{formatHour(h)}</option>)}
                        </select>
                        <span style={{ fontSize: 11.5, color: FAINT }}>at $</span>
                        <input className="sq-input" style={{ width: 84 }} inputMode="decimal" defaultValue={(rule.cents / 100).toFixed(2)} key={`rr-${editing.id}-${i}`}
                          onBlur={(e) => patchRule({ cents: dollarsToCents(e.target.value) })} />
                        <span style={{ fontSize: 11.5, color: FAINT }}>/hr</span>
                        <input className="sq-input" style={{ flex: 1, minWidth: 110, fontSize: 12 }} placeholder="label (Evenings, Weekend…)" value={rule.label ?? ''}
                          onChange={(e) => patchRule({ label: e.target.value })} />
                        <button aria-label="Remove rule" onClick={() => patch(editing.id, { rateRules: editing.rateRules!.filter((_, j) => j !== i) })}
                          style={{ font: 'inherit', cursor: 'pointer', border: 'none', background: 'transparent', color: FAINT, fontSize: 15, lineHeight: 1 }}>×</button>
                      </div>
                    </div>
                  )
                })}
                {(editing.rateRules ?? []).length > 0 && (
                  <p style={{ fontSize: 11, color: FAINT, margin: '8px 0 0', lineHeight: 1.5 }}>
                    Each rented hour is priced by the first rule that matches its day and time — hours no rule
                    covers use the base rates above. The booking calculator applies this automatically.
                  </p>
                )}
              </div>
            )}

            {/* Deposit — locks a booking in; adjustable per booking when staff book */}
            {editing.depositCents !== undefined && (
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14, marginBottom: 16, flexWrap: 'wrap' }}>
                <div>
                  <label className="sq-label" htmlFor="r-dep">Default deposit ($)</label>
                  <input id="r-dep" className="sq-input" style={{ width: 120 }} inputMode="decimal" defaultValue={((editing.depositCents ?? 0) / 100).toFixed(2)} key={`dep-${editing.id}`}
                    onBlur={(e) => patch(editing.id, { depositCents: dollarsToCents(e.target.value) })} />
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, fontWeight: 600, color: SUB, cursor: 'pointer', paddingBottom: 9 }}>
                  <input type="checkbox" checked={!!editing.depositRequired} onChange={(e) => patch(editing.id, { depositRequired: e.target.checked })} style={{ accentColor: BLUE }} />
                  Deposit required to lock a booking
                </label>
                <p style={{ fontSize: 11, color: FAINT, margin: '0 0 9px', flexBasis: '100%', lineHeight: 1.5 }}>
                  New bookings start with this deposit — staff can adjust the amount on each booking.
                </p>
              </div>
            )}


            {/* Add-ons this room offers, from the Add Ons catalog */}
            {editing.addonIds !== undefined && (
              <div style={{ marginBottom: 16 }}>
                <span className="sq-label">Add-ons offered</span>
                {addons.filter((a) => a.active).length === 0 ? (
                  <p style={{ fontSize: 11.5, color: FAINT, margin: 0, lineHeight: 1.5 }}>
                    No add-ons in the catalog yet — build them on the <Link href="/admin/addons" style={{ color: BLUE, fontWeight: 600 }}>Add Ons</Link> tab first.
                  </p>
                ) : (
                  <>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {addons.filter((a) => a.active).map((a) => {
                        const on = editing.addonIds!.includes(a.id)
                        return (
                          <label key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: INK, cursor: 'pointer', background: on ? '#eef4fb' : '#fff', border: `1.5px solid ${on ? BLUE : LINE}`, borderRadius: 9, padding: '6px 11px' }}>
                            <input type="checkbox" checked={on} style={{ accentColor: BLUE }}
                              onChange={(e) => patch(editing.id, {
                                addonIds: e.target.checked
                                  ? [...editing.addonIds!, a.id]
                                  : editing.addonIds!.filter((id) => id !== a.id),
                              })} />
                            {a.name} · {formatCents(a.priceCents)}
                          </label>
                        )
                      })}
                    </div>
                    <p style={{ fontSize: 11, color: FAINT, margin: '6px 0 0' }}>
                      Checked add-ons appear as optional extras when someone books this room.
                    </p>
                  </>
                )}
              </div>
            )}

            {/* Waivers this room requires at booking (same data the Forms tab edits) */}
            {formLinks.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <span className="sq-label">Waivers required to book this room</span>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {formLinks.filter((fl) => fl.assignTo !== 'fitness').map((fl) => {
                    const on = roomRequires(fl, editing.id)
                    return (
                      <label key={fl.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: INK, cursor: 'pointer', background: on ? '#eef4fb' : '#fff', border: `1.5px solid ${on ? BLUE : LINE}`, borderRadius: 9, padding: '6px 11px' }}>
                        <input type="checkbox" checked={on} style={{ accentColor: BLUE }}
                          onChange={(e) => toggleRoomWaiver(fl, editing.id, e.target.checked)} />
                        {fl.name}{fl.status === 'draft' ? ' (draft)' : ''}
                      </label>
                    )
                  })}
                </div>
                <p style={{ fontSize: 11, color: FAINT, margin: '6px 0 0', lineHeight: 1.5 }}>
                  Checked waivers must be signed before this room can be booked online. Draft waivers
                  aren&apos;t collected until published on Forms &amp; Waivers.
                </p>
              </div>
            )}

            {/* Booking schedule — which days/hours this room takes bookings */}
            <div style={{ marginBottom: 16 }}>
              <span className="sq-label">Booking schedule</span>
              {editing.bookingHours === undefined ? (
                <p style={{ fontSize: 11.5, color: SUB, margin: 0, lineHeight: 1.5 }}>
                  Run the <strong>0008_room_schedules.sql</strong> migration in Supabase to set which days
                  and hours this room can be booked — until then it follows your business hours.
                </p>
              ) : (
                <>
                  <div style={{ display: 'flex', gap: 10, marginBottom: editing.bookingHours ? 10 : 0, flexWrap: 'wrap' }}>
                    <select className="sq-select" style={{ width: 'auto', minWidth: 210 }}
                      value={editing.bookingHours ? 'custom' : 'business'}
                      onChange={(e) => patch(editing.id, {
                        bookingHours: e.target.value === 'business'
                          ? null
                          : DAY_NAMES.map(() => ({ closed: false, openH: 8, closeH: 22 })),
                      })}>
                      <option value="business">Follows business hours</option>
                      <option value="custom">Custom schedule for this room</option>
                    </select>
                  </div>
                  {editing.bookingHours && (
                    <div style={{ display: 'grid', gap: 6 }}>
                      {editing.bookingHours.map((d, dow) => (
                        <div key={dow} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                          <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, fontWeight: 600, color: d.closed ? FAINT : INK, width: 110, cursor: 'pointer' }}>
                            <input type="checkbox" checked={!d.closed} style={{ accentColor: BLUE }}
                              onChange={(e) => patch(editing.id, { bookingHours: editing.bookingHours!.map((x, j) => (j === dow ? { ...x, closed: !e.target.checked } : x)) })} />
                            {DAY_NAMES[dow]}
                          </label>
                          {d.closed ? (
                            <span style={{ fontSize: 11.5, color: FAINT }}>no bookings</span>
                          ) : (
                            <>
                              <select className="sq-select" style={{ width: 'auto', padding: '6px 9px', fontSize: 12 }} value={d.openH}
                                onChange={(e) => patch(editing.id, { bookingHours: editing.bookingHours!.map((x, j) => (j === dow ? { ...x, openH: Number(e.target.value) } : x)) })}>
                                {HOUR_OPTIONS.filter((h) => h < d.closeH).map((h) => <option key={h} value={h}>{formatHour(h)}</option>)}
                              </select>
                              <span style={{ fontSize: 11.5, color: FAINT }}>to</span>
                              <select className="sq-select" style={{ width: 'auto', padding: '6px 9px', fontSize: 12 }} value={d.closeH}
                                onChange={(e) => patch(editing.id, { bookingHours: editing.bookingHours!.map((x, j) => (j === dow ? { ...x, closeH: Number(e.target.value) } : x)) })}>
                                {HOUR_OPTIONS.filter((h) => h > d.openH).map((h) => <option key={h} value={h}>{formatHour(h)}</option>)}
                              </select>
                            </>
                          )}
                        </div>
                      ))}
                      <p style={{ fontSize: 11, color: FAINT, margin: '4px 0 0', lineHeight: 1.5 }}>
                        Unchecked days show as unavailable in the store; open hours limit the start times shoppers can pick.
                      </p>
                    </div>
                  )}
                </>
              )}
            </div>

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
    </AdminOnly>
  )
}
