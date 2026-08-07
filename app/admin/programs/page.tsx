'use client'
import { useEffect, useState } from 'react'
import { PageHero, HeroStat } from '@/components/admin/PageHero'
import { AdminOnly } from '@/components/admin/AdminOnly'
import { card, INK, SUB, FAINT, LINE, BLUE, GREEN, RED } from '@/lib/theme'
import { formatCents } from '@/lib/format'
import { getPrograms, saveProgram, addProgram as addProgramLive, deleteProgram, type EditableProgram } from '@/lib/programs-store'
import { useDebouncedSave } from '@/lib/use-debounced-save'
import { isSupabaseConfigured } from '@/lib/supabase'

function dollarsToCents(v: string): number {
  const n = Number.parseFloat(v.replace(/[$,\s]/g, ''))
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : 0
}

export default function ProgramsPage() {
  const [programs, setPrograms] = useState<EditableProgram[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)

  const debouncedSave = useDebouncedSave(async (program: EditableProgram) => {
    await saveProgram(program)
  })

  useEffect(() => {
    if (!isSupabaseConfigured()) return
    getPrograms().then(setPrograms).catch(() => {})
  }, [])

  const patch = (id: string, p: Partial<EditableProgram>) => {
    setPrograms((cur) => {
      const next = cur.map((x) => (x.id === id ? { ...x, ...p } : x))
      const program = next.find((x) => x.id === id)
      if (program) debouncedSave(program)
      return next
    })
  }

  const removeProgram = async (id: string, name: string) => {
    if (!window.confirm(`Delete "${name}"? Its registrations are deleted with it.`)) return
    const ok = await deleteProgram(id)
    if (ok) {
      setPrograms((cur) => cur.filter((x) => x.id !== id))
      if (editingId === id) setEditingId(null)
    }
  }

  const addProgram = async () => {
    const id = `pg-${Date.now().toString(36)}`
    const ok = await addProgramLive(id, 'New Program')
    if (ok) {
      setPrograms(await getPrograms())
      setEditingId(id)
    }
  }

  const enrolled = programs.filter((p) => p.active).reduce((n, p) => n + p.enrolled, 0)
  const waiversMissing = programs.filter((p) => p.active).reduce((n, p) => n + p.waiversMissing, 0)

  return (
    <AdminOnly>
    <div className="sq-page" style={{ padding: '34px 40px 20px', maxWidth: 1180, margin: '0 auto' }}>
      <PageHero title="Programs" sub="Recurring activities with rosters, capacity, waitlists, and waiver tracking — every field editable." chip={`${waiversMissing} waivers missing`}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <HeroStat label="Enrolled" value={String(enrolled)} sub={`across ${programs.filter((p) => p.active).length} active programs`} />
          <button className="sq-btn" style={{ background: '#fff', color: '#182740' }} onClick={addProgram}>+ New program</button>
        </div>
      </PageHero>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))', gap: 16 }}>
        {programs.map((p) => {
          const fillPct = p.capacity > 0 ? Math.round((p.enrolled / p.capacity) * 100) : 0
          const isEditing = editingId === p.id
          return (
            <div key={p.id} className="sq-card" style={{ ...card, padding: '18px 22px', opacity: p.active || isEditing ? 1 : 0.65 }}>
              {isEditing ? (
                <div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                    <div style={{ gridColumn: '1 / -1' }}>
                      <label className="sq-label">Program name</label>
                      <input className="sq-input" value={p.name} onChange={(e) => patch(p.id, { name: e.target.value })} />
                    </div>
                    <div>
                      <label className="sq-label">Schedule</label>
                      <input className="sq-input" value={p.schedule} onChange={(e) => patch(p.id, { schedule: e.target.value })} />
                    </div>
                    <div>
                      <label className="sq-label">Coach</label>
                      <input className="sq-input" value={p.coach} onChange={(e) => patch(p.id, { coach: e.target.value })} />
                    </div>
                    <div>
                      <label className="sq-label">Capacity</label>
                      <input className="sq-input" type="number" min={1} value={p.capacity} onChange={(e) => patch(p.id, { capacity: Math.max(1, Number(e.target.value) || 1) })} />
                    </div>
                    <div>
                      <label className="sq-label">Fee ($)</label>
                      <input className="sq-input" inputMode="decimal" defaultValue={(p.feeCents / 100).toFixed(2)} key={`fee-${p.id}`}
                        onBlur={(e) => patch(p.id, { feeCents: dollarsToCents(e.target.value) })} />
                    </div>
                    <div>
                      <label className="sq-label">Fee period</label>
                      <select className="sq-select" value={p.fee} onChange={(e) => patch(p.id, { fee: e.target.value })}>
                        {['per month', 'per session', 'drop-in'].map((f) => <option key={f} value={f}>{f}</option>)}
                      </select>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, fontWeight: 600, color: SUB, cursor: 'pointer' }}>
                      <input type="checkbox" checked={p.active} onChange={(e) => patch(p.id, { active: e.target.checked })} style={{ accentColor: BLUE }} />
                      Active
                    </label>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button className="sq-btn sq-btn-danger" style={{ padding: '6px 14px', fontSize: 12 }} onClick={() => removeProgram(p.id, p.name)}>Delete</button>
                      <button className="sq-btn sq-btn-primary" style={{ padding: '6px 14px', fontSize: 12 }} onClick={() => setEditingId(null)}>Done</button>
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 4 }}>
                    <p style={{ fontSize: 15, fontWeight: 800, color: INK, margin: 0 }}>{p.name}</p>
                    <span style={{ fontSize: 12.5, fontWeight: 700, color: BLUE, fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>{formatCents(p.feeCents)} <span style={{ fontWeight: 500, color: FAINT }}>{p.fee}</span></span>
                  </div>
                  <p style={{ fontSize: 12.5, color: SUB, margin: '0 0 14px' }}>{p.schedule} · {p.coach}{p.active ? '' : ' · hidden'}</p>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                    <span style={{ fontSize: 11.5, color: SUB, fontVariantNumeric: 'tabular-nums' }}>{p.enrolled}/{p.capacity} enrolled{p.waitlist > 0 ? ` · ${p.waitlist} waitlisted` : ''}</span>
                    <span style={{ fontSize: 11.5, fontWeight: 700, color: fillPct >= 100 ? '#b07818' : GREEN, fontVariantNumeric: 'tabular-nums' }}>{fillPct}%</span>
                  </div>
                  <div style={{ height: 8, borderRadius: 99, background: '#eef2f8', overflow: 'hidden', marginBottom: 12 }}>
                    <div style={{ width: `${Math.min(fillPct, 100)}%`, height: '100%', borderRadius: 99, background: fillPct >= 100 ? '#e8a13a' : `linear-gradient(90deg, #5b93d6, ${BLUE})` }} />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingTop: 10, borderTop: `1px solid ${LINE}` }}>
                    <p style={{ fontSize: 12, margin: 0, color: p.waiversMissing > 0 ? RED : SUB, fontWeight: p.waiversMissing > 0 ? 600 : 400 }}>
                      {p.waiversMissing > 0 ? `${p.waiversMissing} waiver${p.waiversMissing > 1 ? 's' : ''} missing` : 'All waivers on file ✓'}
                    </p>
                    <button className="sq-btn sq-btn-ghost" style={{ padding: '5px 12px', fontSize: 11.5 }} onClick={() => setEditingId(p.id)}>Edit</button>
                  </div>
                </>
              )}
            </div>
          )
        })}
      </div>
      <p style={{ fontSize: 11.5, color: FAINT, marginTop: 16 }}>Enrollment counts come from registrations; online registration arrives in Phase 3. Edits save live.</p>
    </div>
    </AdminOnly>
  )
}
