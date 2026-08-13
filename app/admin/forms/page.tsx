'use client'
import { useEffect, useState } from 'react'
import { PageHero } from '@/components/admin/PageHero'
import { AdminOnly } from '@/components/admin/AdminOnly'
import { card, INK, SUB, FAINT, LINE, BLUE, GREEN } from '@/lib/theme'
import { supabase, tryWrite, isSupabaseConfigured } from '@/lib/supabase'
import { useDebouncedSave } from '@/lib/use-debounced-save'
import { getRooms, type RoomConfig } from '@/lib/facilities-store'
import type { WaiverFrequency } from '@/lib/waivers-live'

type FieldType = 'text' | 'email' | 'date' | 'signature' | 'checkbox' | 'paragraph' | 'multi'
type AssignTo = 'none' | 'fitness' | 'rentals'

interface FormField {
  label: string
  type: FieldType
  required: boolean
  content?: string // paragraph body text shown to the signer
  options?: string[] // choices for a multiple-checkbox field
}

interface FormDef {
  id: string
  name: string
  status: 'active' | 'draft'
  submissions: number
  linkedTo: string
  fields: FormField[]
  assignTo: AssignTo
  assignRoomIds: string[]
  frequency: WaiverFrequency
}

const FREQUENCIES: { value: WaiverFrequency; label: string }[] = [
  { value: 'once', label: 'Once per person' },
  { value: 'annual', label: 'Every 12 months' },
  { value: 'every_time', label: 'Every booking' },
]

function linkedLabel(assignTo: AssignTo, roomIds: string[], rooms: RoomConfig[]): string {
  if (assignTo === 'fitness') return 'Fitness membership signup'
  if (assignTo === 'rentals') {
    if (roomIds.length === 0) return 'Room rentals · all rooms'
    const names = roomIds.map((id) => rooms.find((r) => r.id === id)?.name ?? id)
    return `Room rentals · ${names.length <= 2 ? names.join(', ') : `${names.length} rooms`}`
  }
  return 'Not required automatically'
}

const FIELD_TYPES: { value: FieldType; label: string }[] = [
  { value: 'text', label: 'Text' },
  { value: 'email', label: 'Email' },
  { value: 'date', label: 'Date' },
  { value: 'checkbox', label: 'Agreement checkbox' },
  { value: 'signature', label: 'Signature' },
  { value: 'paragraph', label: 'Info paragraph' },
  { value: 'multi', label: 'Multiple checkboxes' },
]

interface Row {
  id: string
  name: string
  status: 'active' | 'draft'
  linked_to: string
  fields: FormField[]
  assign_to?: AssignTo
  assign_room_ids?: string[]
  frequency?: WaiverFrequency
  form_submissions: { count: number }[]
}

function fromRow(r: Row, hasAssign: boolean): FormDef {
  return {
    id: r.id,
    name: r.name,
    status: r.status,
    linkedTo: r.linked_to,
    fields: Array.isArray(r.fields) ? r.fields : [],
    submissions: r.form_submissions[0]?.count ?? 0,
    assignTo: hasAssign ? (r.assign_to ?? 'none') : 'none',
    assignRoomIds: hasAssign ? (r.assign_room_ids ?? []) : [],
    frequency: hasAssign ? (r.frequency ?? 'once') : 'once',
  }
}

// hasAssignmentColumns flips false when migration 0004 hasn't been run yet,
// so the page still works — assignment controls just explain what's missing.
async function fetchForms(): Promise<{ forms: FormDef[]; hasAssign: boolean }> {
  const withAssign = await supabase()
    .from('forms')
    .select('id, name, status, linked_to, fields, assign_to, assign_room_ids, frequency, form_submissions(count)')
    .order('id')
  if (!withAssign.error) {
    return { forms: (withAssign.data as unknown as Row[]).map((r) => fromRow(r, true)), hasAssign: true }
  }
  const { data, error } = await supabase()
    .from('forms')
    .select('id, name, status, linked_to, fields, form_submissions(count)')
    .order('id')
  if (error) throw error
  return { forms: (data as unknown as Row[]).map((r) => fromRow(r, false)), hasAssign: false }
}

async function persistForm(f: FormDef, hasAssign: boolean): Promise<boolean> {
  return tryWrite(() => supabase().from('forms').update({
    name: f.name,
    status: f.status,
    linked_to: f.linkedTo,
    fields: f.fields,
    ...(hasAssign ? { assign_to: f.assignTo, assign_room_ids: f.assignRoomIds, frequency: f.frequency } : {}),
  }).eq('id', f.id))
}

export default function FormsPage() {
  const [forms, setForms] = useState<FormDef[]>([])
  const [rooms, setRooms] = useState<RoomConfig[]>([])
  const [hasAssign, setHasAssign] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)

  const debouncedSave = useDebouncedSave(async (payload: { form: FormDef; hasAssign: boolean }) => {
    await persistForm(payload.form, payload.hasAssign)
  })

  useEffect(() => {
    if (!isSupabaseConfigured()) return
    fetchForms().then(({ forms: fetched, hasAssign: assign }) => { setForms(fetched); setHasAssign(assign) }).catch(() => {})
    getRooms().then(setRooms).catch(() => {})
  }, [])

  const editing = forms.find((f) => f.id === editingId) ?? null

  const newForm = async () => {
    const id = `form-${Date.now().toString(36)}`
    const { data: org } = await supabase().from('organizations').select('id').limit(1).single()
    const ok = await tryWrite(() => supabase().from('forms').insert({
      id,
      org_id: (org as { id: string }).id,
      name: 'Untitled form',
      status: 'draft',
      linked_to: 'Not linked yet',
      fields: [{ label: 'Full name', type: 'text', required: true }],
    }))
    if (ok) {
      setForms((await fetchForms()).forms)
      setEditingId(id)
    }
  }

  const patchForm = (id: string, patch: Partial<FormDef>) => {
    setForms((cur) => {
      const next = cur.map((f) => {
        if (f.id !== id) return f
        const merged = { ...f, ...patch }
        // Assignment changes rewrite the "linked to" label so the list stays honest.
        if (patch.assignTo !== undefined || patch.assignRoomIds !== undefined) {
          merged.linkedTo = linkedLabel(merged.assignTo, merged.assignRoomIds, rooms)
        }
        return merged
      })
      const form = next.find((f) => f.id === id)
      if (form) debouncedSave({ form, hasAssign })
      return next
    })
  }

  const deleteForm = async (id: string, name: string) => {
    if (!window.confirm(`Delete "${name}"? Signed copies on member accounts are deleted with it.`)) return
    const ok = await tryWrite(() => supabase().from('forms').delete().eq('id', id))
    if (ok) {
      setForms((cur) => cur.filter((f) => f.id !== id))
      if (editingId === id) setEditingId(null)
    }
  }

  const patchField = (id: string, idx: number, patch: Partial<FormField>) => {
    setForms((cur) => {
      const next = cur.map((f) => f.id === id
        ? { ...f, fields: f.fields.map((fl, i) => (i === idx ? { ...fl, ...patch } : fl)) }
        : f)
      const form = next.find((f) => f.id === id)
      if (form) debouncedSave({ form, hasAssign })
      return next
    })
  }

  return (
    <AdminOnly>
    <div className="sq-page" style={{ padding: '34px 40px 48px', maxWidth: 1180, margin: '0 auto' }}>
      <PageHero title="Forms & Waivers" sub="Build the forms guests sign — waivers, agreements, releases — and link them to bookings and programs." chip={`${forms.filter((f) => f.status === 'active').length} active`}>
        <button className="sq-btn" style={{ background: '#fff', color: '#182740' }} onClick={newForm}>+ New form</button>
      </PageHero>

      <div className="sq-grid-2" style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 1fr) minmax(300px, 1.4fr)', gap: 16 }}>
        {/* Form list */}
        <div className="sq-card" style={{ ...card, alignSelf: 'start' }}>
          {forms.map((f, i) => (
            <button key={f.id} onClick={() => setEditingId(f.id)} style={{
              font: 'inherit', cursor: 'pointer', display: 'block', width: '100%', textAlign: 'left',
              background: editingId === f.id ? '#eef4fb' : 'transparent', border: 'none',
              padding: '14px 18px', borderBottom: i < forms.length - 1 ? `1px solid ${LINE}` : 'none',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                <span style={{ fontSize: 13.5, fontWeight: 700, color: editingId === f.id ? BLUE : INK }}>{f.name}</span>
                {f.status === 'active'
                  ? <span style={{ fontSize: 10, fontWeight: 700, color: GREEN, background: '#e5f2ea', padding: '1px 8px', borderRadius: 999 }}>active</span>
                  : <span style={{ fontSize: 10, fontWeight: 700, color: SUB, background: '#eef2f8', padding: '1px 8px', borderRadius: 999 }}>draft</span>}
              </div>
              <p style={{ fontSize: 11.5, color: SUB, margin: 0 }}>{f.linkedTo} · {f.submissions} signed</p>
              {/* The store shows exactly the paragraphs written here and nothing
                  else — an empty waiver collects nothing, so say so plainly. */}
              {f.status === 'active' && f.assignTo !== 'none'
                && !f.fields.some((fl) => fl.type === 'paragraph' && fl.content?.trim()) && (
                <p style={{ fontSize: 11, fontWeight: 600, color: '#b07818', margin: '5px 0 0', lineHeight: 1.45 }}>
                  No waiver text yet — add an info paragraph and nobody will be asked to sign this.
                </p>
              )}
            </button>
          ))}
        </div>

        {/* Builder */}
        {editing ? (
          <div className="sq-card" style={{ ...card, padding: '20px 24px', alignSelf: 'start' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
              <input className="sq-input" style={{ maxWidth: 300, fontWeight: 700 }} value={editing.name} onChange={(e) => patchForm(editing.id, { name: e.target.value })} />
              <div style={{ display: 'flex', gap: 8 }}>
                {editing.status === 'draft'
                  ? <button className="sq-btn sq-btn-primary" style={{ padding: '8px 14px' }} onClick={() => patchForm(editing.id, { status: 'active' })}>Publish</button>
                  : <button className="sq-btn sq-btn-ghost" style={{ padding: '8px 14px' }} onClick={() => patchForm(editing.id, { status: 'draft' })}>Unpublish</button>}
                <button className="sq-btn sq-btn-danger" style={{ padding: '8px 14px' }} onClick={() => deleteForm(editing.id, editing.name)}>Delete</button>
              </div>
            </div>

            {/* Where & when this form is required */}
            <div style={{ background: '#f6f9fd', border: `1px solid ${LINE}`, borderRadius: 12, padding: '14px 16px', marginBottom: 18 }}>
              <p className="sq-label" style={{ marginBottom: 8 }}>Where it&apos;s required</p>
              {!hasAssign ? (
                <p style={{ fontSize: 12, color: SUB, margin: 0, lineHeight: 1.5 }}>
                  Run the <strong>0004_form_assignments.sql</strong> migration in Supabase to choose where
                  this form is required — until then the built-in waiver rules apply.
                </p>
              ) : (
                <>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: editing.assignTo === 'none' ? 0 : 12 }}>
                    <select className="sq-select" style={{ width: 'auto', minWidth: 200 }} value={editing.assignTo}
                      onChange={(e) => patchForm(editing.id, { assignTo: e.target.value as AssignTo, assignRoomIds: [] })}>
                      <option value="none">Not required automatically</option>
                      <option value="fitness">Fitness membership signup</option>
                      <option value="rentals">Room rentals</option>
                    </select>
                    {editing.assignTo !== 'none' && (
                      <select className="sq-select" style={{ width: 'auto', minWidth: 160 }} value={editing.frequency}
                        onChange={(e) => patchForm(editing.id, { frequency: e.target.value as WaiverFrequency })}>
                        {FREQUENCIES.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                      </select>
                    )}
                  </div>
                  {editing.assignTo === 'rentals' && (
                    <div>
                      <p style={{ fontSize: 11.5, color: SUB, margin: '0 0 6px' }}>
                        Which rooms need it — leave all unchecked to require it for <strong>every</strong> room.
                      </p>
                      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                        {rooms.map((r) => (
                          <label key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: INK, cursor: 'pointer', background: '#fff', border: `1px solid ${LINE}`, borderRadius: 8, padding: '5px 10px' }}>
                            <input type="checkbox" style={{ accentColor: BLUE }}
                              checked={editing.assignRoomIds.includes(r.id)}
                              onChange={(e) => patchForm(editing.id, {
                                assignRoomIds: e.target.checked
                                  ? [...editing.assignRoomIds, r.id]
                                  : editing.assignRoomIds.filter((id) => id !== r.id),
                              })} />
                            {r.name}
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                  {editing.assignTo !== 'none' && editing.status === 'draft' && (
                    <p style={{ fontSize: 11.5, color: '#a15d0f', margin: '10px 0 0', fontWeight: 600 }}>
                      This form is still a draft — publish it or it won&apos;t be collected.
                    </p>
                  )}
                </>
              )}
            </div>

            <p className="sq-label">Fields</p>
            {editing.fields.map((fl, i) => (
              <div key={i} style={{ marginBottom: 10 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
                <span style={{ width: 8, height: 8, background: `${BLUE}30`, border: `1.5px solid ${BLUE}`, borderRadius: 2, transform: 'rotate(45deg)', flexShrink: 0 }} />
                <input className="sq-input" style={{ flex: 2, minWidth: 140 }} value={fl.label} onChange={(e) => patchField(editing.id, i, { label: e.target.value })} />
                <select className="sq-select" style={{ flex: 1, minWidth: 110, width: 'auto' }} value={fl.type} onChange={(e) => patchField(editing.id, i, { type: e.target.value as FieldType })}>
                  {FIELD_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
                <label style={{ fontSize: 11.5, color: SUB, display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer' }}>
                  <input type="checkbox" checked={fl.required} onChange={(e) => patchField(editing.id, i, { required: e.target.checked })} style={{ accentColor: BLUE }} /> req
                </label>
                <button aria-label="Remove field" onClick={() => patchForm(editing.id, { fields: editing.fields.filter((_, j) => j !== i) })} style={{ font: 'inherit', cursor: 'pointer', border: 'none', background: 'transparent', color: FAINT, fontSize: 15, lineHeight: 1 }}>×</button>
              </div>
              {fl.type === 'paragraph' && (
                <textarea className="sq-textarea" rows={4} placeholder="Write the paragraph text people read and agree to — the full waiver terms go here."
                  value={fl.content ?? ''} style={{ marginLeft: 16, width: 'calc(100% - 16px)' }}
                  onChange={(e) => patchField(editing.id, i, { content: e.target.value })} />
              )}
              {fl.type === 'multi' && (
                <div style={{ marginLeft: 16 }}>
                  <textarea className="sq-textarea" rows={3} placeholder={'One choice per line, e.g.\nGym\nDining Hall\nMultiball Zone'}
                    value={(fl.options ?? []).join('\n')}
                    onChange={(e) => patchField(editing.id, i, { options: e.target.value.split('\n') })}
                    onBlur={(e) => patchField(editing.id, i, { options: e.target.value.split('\n').map((o) => o.trim()).filter(Boolean) })} />
                  <p style={{ fontSize: 11, color: FAINT, margin: '4px 0 0' }}>
                    Signers can check any that apply — their choices are saved with the signature.
                  </p>
                </div>
              )}
              </div>
            ))}
            <button className="sq-btn sq-btn-ghost" style={{ padding: '7px 13px', marginTop: 6 }} onClick={() => patchForm(editing.id, { fields: [...editing.fields, { label: 'New field', type: 'text', required: false }] })}>
              + Add field
            </button>

            <div style={{ borderTop: `1px solid ${LINE}`, marginTop: 18, paddingTop: 14 }}>
              <p style={{ fontSize: 11.5, color: FAINT, margin: 0, lineHeight: 1.6 }}>
                Guests sign these inside the store flows wherever you assign them — membership signup, all
                room rentals, or specific rooms — as often as the frequency says. The paragraph fields hold
                the exact terms people read and agree to. Signatures are stored on members&apos; accounts. Edits save live.
              </p>
            </div>
          </div>
        ) : (
          <div className="sq-card" style={{ ...card, padding: '30px 32px', alignSelf: 'start', textAlign: 'center' }}>
            <p style={{ fontSize: 13.5, color: SUB, margin: 0 }}>Select a form to edit it, or create a new one.</p>
          </div>
        )}
      </div>

      <p style={{ fontSize: 11.5, color: FAINT, marginTop: 22 }}>Live — signed counts come from real submissions on members&apos; accounts.</p>
    </div>
    </AdminOnly>
  )
}
