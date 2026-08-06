'use client'
import { useState } from 'react'
import { PageHero } from '@/components/admin/PageHero'
import { card, INK, SUB, FAINT, LINE, BLUE, GREEN } from '@/lib/theme'

type FieldType = 'text' | 'email' | 'date' | 'signature' | 'checkbox' | 'paragraph'

interface FormField {
  label: string
  type: FieldType
  required: boolean
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

const seedForms: FormDef[] = [
  {
    id: 'fitness-v1',
    name: 'Fitness Center Waiver',
    status: 'active',
    submissions: 214,
    linkedTo: 'Signed during fitness membership signup',
    fields: [
      { label: 'Waiver terms', type: 'paragraph', required: false },
      { label: 'Full legal name', type: 'text', required: true },
      { label: 'I agree to the terms', type: 'checkbox', required: true },
      { label: 'Signature', type: 'signature', required: true },
    ],
  },
  {
    id: 'rental-v1',
    name: 'Facility Rental Waiver',
    status: 'active',
    submissions: 96,
    linkedTo: 'Signed with room & facility rentals',
    fields: [
      { label: 'Waiver terms', type: 'paragraph', required: false },
      { label: 'Renter full legal name', type: 'text', required: true },
      { label: 'I agree to the terms', type: 'checkbox', required: true },
      { label: 'Signature', type: 'signature', required: true },
    ],
  },
  {
    id: 'party-agreement',
    name: 'Party Booking Agreement',
    status: 'active',
    submissions: 38,
    linkedTo: 'Attached to Party Arcade Zone bookings',
    fields: [
      { label: 'Host name', type: 'text', required: true },
      { label: 'Contact email', type: 'email', required: true },
      { label: 'Party date', type: 'date', required: true },
      { label: 'I agree to the house rules', type: 'checkbox', required: true },
      { label: 'Signature', type: 'signature', required: true },
    ],
  },
  {
    id: 'media-release',
    name: 'Photo & Media Release',
    status: 'draft',
    submissions: 0,
    linkedTo: 'Optional at registration',
    fields: [
      { label: 'Participant name', type: 'text', required: true },
      { label: 'I consent to photos', type: 'checkbox', required: true },
      { label: 'Signature', type: 'signature', required: true },
    ],
  },
]

export default function FormsPage() {
  const [forms, setForms] = useState<FormDef[]>(seedForms)
  const [editingId, setEditingId] = useState<string | null>(null)

  const editing = forms.find((f) => f.id === editingId) ?? null

  const newForm = () => {
    const id = `form-${forms.length + 1}`
    setForms([...forms, { id, name: 'Untitled form', status: 'draft', submissions: 0, linkedTo: 'Not linked yet', fields: [{ label: 'Full name', type: 'text', required: true }] }])
    setEditingId(id)
  }

  const patchForm = (id: string, patch: Partial<FormDef>) => {
    setForms((cur) => cur.map((f) => (f.id === id ? { ...f, ...patch } : f)))
  }

  const patchField = (id: string, idx: number, patch: Partial<FormField>) => {
    setForms((cur) => cur.map((f) => f.id === id
      ? { ...f, fields: f.fields.map((fl, i) => (i === idx ? { ...fl, ...patch } : fl)) }
      : f))
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
              </div>
            </div>

            <p className="sq-label">Fields</p>
            {editing.fields.map((fl, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
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
            ))}
            <button className="sq-btn sq-btn-ghost" style={{ padding: '7px 13px', marginTop: 6 }} onClick={() => patchForm(editing.id, { fields: [...editing.fields, { label: 'New field', type: 'text', required: false }] })}>
              + Add field
            </button>

            <div style={{ borderTop: `1px solid ${LINE}`, marginTop: 18, paddingTop: 14 }}>
              <p style={{ fontSize: 11.5, color: FAINT, margin: 0, lineHeight: 1.6 }}>
                Guests sign these inside the store flows — the <strong>fitness waiver</strong> during membership
                signup, the <strong>rental waiver</strong> when booking a room. Signed PDFs to secure storage and
                booking-linked requirements arrive with the forms engine (Phase 3). Edits here are a demo and reset on reload.
              </p>
            </div>
          </div>
        ) : (
          <div className="sq-card" style={{ ...card, padding: '30px 32px', alignSelf: 'start', textAlign: 'center' }}>
            <p style={{ fontSize: 13.5, color: SUB, margin: 0 }}>Select a form to edit it, or create a new one.</p>
          </div>
        )}
      </div>

      <p style={{ fontSize: 11.5, color: FAINT, marginTop: 22 }}>Placeholder data — submission counts are demo values until the forms engine flows.</p>
    </div>
  )
}
