'use client'
import { useEffect, useState } from 'react'
import { card, INK, SUB, FAINT, LINE, BLUE, GREEN } from '@/lib/theme'
import {
  getStaff, patchStaff, addStaff, removeStaff, linkStaffLogin,
  ROLE_LABEL, ROLE_ACCESS, STAFF_EVENT, type StaffMember, type StaffRole,
} from '@/lib/staff-store'
import { useDebouncedSave } from '@/lib/use-debounced-save'
import { isSupabaseConfigured } from '@/lib/supabase'

// Editable staff & roles card for Settings. Roles gate booking/payment
// writes — enforced by RLS, not just the UI. Linking a login by email lets
// that person sign in to the dashboard.
export function StaffManager() {
  const [staff, setStaff] = useState<StaffMember[]>([])
  const [linkingId, setLinkingId] = useState<string | null>(null)
  const [linkEmail, setLinkEmail] = useState('')
  const [linkResult, setLinkResult] = useState<'ok' | 'missing' | null>(null)

  const debouncedName = useDebouncedSave(async (p: { id: string; name: string }) => {
    await patchStaff(p.id, { name: p.name })
  })

  useEffect(() => {
    if (!isSupabaseConfigured()) return
    let on = true
    const sync = () => { getStaff().then((s) => { if (on) setStaff(s) }).catch(() => {}) }
    sync()
    window.addEventListener(STAFF_EVENT, sync)
    return () => { on = false; window.removeEventListener(STAFF_EVENT, sync) }
  }, [])

  const editName = (id: string, name: string) => {
    setStaff((cur) => cur.map((s) => (s.id === id ? { ...s, name } : s)))
    debouncedName({ id, name })
  }

  const doLink = async (id: string) => {
    if (!/.+@.+\..+/.test(linkEmail)) return
    const ok = await linkStaffLogin(id, linkEmail.trim())
    setLinkResult(ok ? 'ok' : 'missing')
    if (ok) { setLinkingId(null); setLinkEmail('') }
  }

  return (
    <div className="sq-card" style={card}>
      <div style={{ padding: '14px 20px', borderBottom: `1px solid ${LINE}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 13.5, fontWeight: 700, color: INK }}>Staff &amp; roles</span>
        <button className="sq-btn sq-btn-ghost" style={{ padding: '5px 12px', fontSize: 11.5 }} onClick={() => addStaff('New staff member', 'front_desk')}>+ Add staff</button>
      </div>
      {staff.map((s, i) => (
        <div key={s.id} style={{ padding: '11px 20px', borderBottom: i < staff.length - 1 ? `1px solid ${LINE}` : 'none' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ width: 30, height: 30, borderRadius: '50%', background: '#eef4fb', color: BLUE, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11.5, fontWeight: 800, flexShrink: 0, textTransform: 'uppercase' }}>{s.name.charAt(0)}</div>
            <input className="sq-input" style={{ flex: 1, minWidth: 120, padding: '7px 10px', fontSize: 12.5 }} value={s.name} onChange={(e) => editName(s.id, e.target.value)} />
            <select className="sq-select" style={{ width: 'auto', padding: '7px 10px', fontSize: 12.5 }} value={s.role} onChange={(e) => patchStaff(s.id, { role: e.target.value as StaffRole })}>
              {(Object.keys(ROLE_LABEL) as StaffRole[]).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
            </select>
            {s.linked
              ? <span style={{ fontSize: 10, fontWeight: 700, color: GREEN, background: '#e5f2ea', padding: '2px 9px', borderRadius: 999 }}>login linked</span>
              : <button className="sq-btn sq-btn-ghost" style={{ padding: '4px 10px', fontSize: 10.5 }} onClick={() => { setLinkingId(linkingId === s.id ? null : s.id); setLinkResult(null) }}>Link login</button>}
            <button aria-label={`Remove ${s.name}`} onClick={() => removeStaff(s.id)} style={{ font: 'inherit', cursor: 'pointer', border: 'none', background: 'transparent', color: FAINT, fontSize: 15, lineHeight: 1, marginLeft: 'auto' }}>×</button>
          </div>
          <span style={{ fontSize: 11, color: FAINT, display: 'block', paddingLeft: 40, marginTop: 3 }}>{ROLE_ACCESS[s.role]}</span>
          {linkingId === s.id && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', paddingLeft: 40, marginTop: 8, flexWrap: 'wrap' }}>
              <input className="sq-input" style={{ width: 220, padding: '7px 10px', fontSize: 12 }} type="email" placeholder="their-login@email.com" value={linkEmail} onChange={(e) => { setLinkEmail(e.target.value); setLinkResult(null) }} />
              <button className="sq-btn sq-btn-primary" style={{ padding: '6px 13px', fontSize: 11.5 }} onClick={() => doLink(s.id)}>Link</button>
              {linkResult === 'missing' && <span style={{ fontSize: 11.5, fontWeight: 600, color: '#cf4436' }}>No account with that email — have them sign up in the store first.</span>}
            </div>
          )}
        </div>
      ))}
      {staff.length === 0 && <p style={{ fontSize: 13, color: SUB, padding: '16px 20px', margin: 0 }}>Loading staff…</p>}
      <p style={{ fontSize: 11, color: FAINT, margin: 0, padding: '10px 20px' }}>
        Owners, managers &amp; front desk can create bookings and take payments — enforced by database rules.
        To give someone dashboard access: they sign up in the store, then link their email here.
      </p>
    </div>
  )
}
