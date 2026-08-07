'use client'
import { useEffect, useState } from 'react'
import { PageHero } from '@/components/admin/PageHero'
import { card, INK, SUB, FAINT, LINE, BLUE, GREEN } from '@/lib/theme'
import { supabase, tryWrite, isSupabaseConfigured } from '@/lib/supabase'
import { useDebouncedSave } from '@/lib/use-debounced-save'

type FieldType = 'text' | 'email' | 'date' | 'signature' | 'checkbox' | 'paragraph'

interface FormField {
  label: string
  type: FieldType
  required: boolean
  content?: string // paragraph body text shown to the signer
}

interface FormDef {
  id: string
  name: string
  status: 'active' | 'draft'
  submissions: number
  linkedTo: string
  fields: FormField[]
}

const FIELD_TYPES: { value: FieldType; label: string }[] = [
  { value: 'text', label: 'Text' },
  { value: 'email', label: 'Email' },
  { value: 'date', label: 'Date' },
  { value: 'checkbox', label: 'Agreement checkbox' },
  { value: 'signature', label: 'Signature' },
  { value: 'paragraph', label: 'Info paragraph' },
]

async function fetchForms(): Promise<FormDef[]> {
  const { data, error } = await supabase()
    .from('forms')
    .select('id, name, status, linked_to, fields, form_submissions(count)')
    .order('id')
  if (error) throw error
  interface Row {
    id: string
    name: string
    status: 'active' | 'draft'
    linked_to: string
    fields: FormField[]
    form_submissions: { count: number }[]
  }
  return (data as unknown as Row[]).map((r) => ({
    id: r.id,
    name: r.name,
    status: r.status,
    linkedTo: r.linked_to,
    fields: Array.isArray(r.fields) ? r.fields : [],
    submissions: r.form_submissions[0]?.count ?? 0,
  }))
}

async function persistForm(f: FormDef): Promise<boolean> {
  return tryWrite(() => supabase().from('forms').update({
    name: f.name,
    status: f.status,
    linked_to: f.linkedTo,
    fields: f.fields,
  }).eq('id', f.id))
}

export default function FormsPage() {
  const [forms, setForms] = useState<FormDef[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)

  const debouncedSave = useDebouncedSave(async (f: FormDef) => { await persistForm(f) })

  useEffect(() => {
    if (!isSupabaseConfigured()) return
    fetchForms().then(setForms).catch(() => {})
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
      setForms(await fetchForms())
      setEditingId(id)
    }
  }

  const patchForm = (id: string, patch: Partial<FormDef>) => {
    setForms((cur) => {
      const next = cur.map((f) => (f.id === id ? { ...f, ...patch } : f))
      const form = next.find((f) => f.id === id)
      if (form) debouncedSave(form)
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
      if (form) debouncedSave(form)
      return next
    })
  }

  return (
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
              </div>
            ))}
            <button className="sq-btn sq-btn-ghost" style={{ padding: '7px 13px', marginTop: 6 }} onClick={() => patchForm(editing.id, { fields: [...editing.fields, { label: 'New field', type: 'text', required: false }] })}>
              + Add field
            </button>

            <div style={{ borderTop: `1px solid ${LINE}`, marginTop: 18, paddingTop: 14 }}>
              <p style={{ fontSize: 11.5, color: FAINT, margin: 0, lineHeight: 1.6 }}>
                Guests sign these inside the store flows — the <strong>fitness waiver</strong> during membership
                signup, the <strong>rental waiver</strong> when booking a room. The paragraph fields hold the
                exact terms people read and agree to. Signatures are stored on members' accounts. Edits save live.
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
  )
}
