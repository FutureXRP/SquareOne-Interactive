'use client'
import { useEffect, useState } from 'react'
import { card, INK, SUB, FAINT, LINE, BLUE } from '@/lib/theme'
import { getStaff, saveStaff, resetStaff, ROLE_LABEL, ROLE_ACCESS, type StaffMember, type StaffRole } from '@/lib/staff-store'

// Editable staff & roles card for Settings. Roles drive who can create
// bookings and take payments at the desk (enforced for real once auth lands).
export function StaffManager() {
  const [staff, setStaff] = useState<StaffMember[]>([])

  useEffect(() => {
    const sync = () => setStaff(getStaff())
    sync()
    window.addEventListener('sq-staff', sync)
    return () => window.removeEventListener('sq-staff', sync)
  }, [])

  const patch = (id: string, p: Partial<StaffMember>) => {
    const next = staff.map((s) => (s.id === id ? { ...s, ...p } : s))
    setStaff(next)
    saveStaff(next)
  }

  const remove = (id: string) => {
    if (staff.length <= 1) return
    const next = staff.filter((s) => s.id !== id)
    setStaff(next)
    saveStaff(next)
  }

  const add = () => {
    const next = [...staff, { id: `st-${Date.now().toString(36)}`, name: 'New staff member', role: 'front-desk' as StaffRole }]
    setStaff(next)
    saveStaff(next)
  }

  return (
    <div className="sq-card" style={card}>
      <div style={{ padding: '14px 20px', borderBottom: `1px solid ${LINE}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 13.5, fontWeight: 700, color: INK }}>Staff &amp; roles</span>
        <button className="sq-btn sq-btn-ghost" style={{ padding: '5px 12px', fontSize: 11.5 }} onClick={add}>+ Add staff</button>
      </div>
      {staff.map((s, i) => (
        <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 20px', borderBottom: i < staff.length - 1 ? `1px solid ${LINE}` : 'none', flexWrap: 'wrap' }}>
          <div style={{ width: 30, height: 30, borderRadius: '50%', background: '#eef4fb', color: BLUE, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11.5, fontWeight: 800, flexShrink: 0, textTransform: 'uppercase' }}>{s.name.charAt(0)}</div>
          <input className="sq-input" style={{ flex: 1, minWidth: 120, padding: '7px 10px', fontSize: 12.5 }} value={s.name} onChange={(e) => patch(s.id, { name: e.target.value })} />
          <select className="sq-select" style={{ width: 'auto', padding: '7px 10px', fontSize: 12.5 }} value={s.role} onChange={(e) => patch(s.id, { role: e.target.value as StaffRole })}>
            {(Object.keys(ROLE_LABEL) as StaffRole[]).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
          </select>
          <span style={{ fontSize: 11, color: FAINT, flexBasis: '100%', paddingLeft: 40 }}>{ROLE_ACCESS[s.role]}</span>
          <button aria-label={`Remove ${s.name}`} onClick={() => remove(s.id)} style={{ font: 'inherit', cursor: 'pointer', border: 'none', background: 'transparent', color: FAINT, fontSize: 15, lineHeight: 1, marginLeft: 'auto' }}>×</button>
        </div>
      ))}
      <div style={{ padding: '10px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <p style={{ fontSize: 11, color: FAINT, margin: 0 }}>Owners, managers &amp; front desk can create bookings and take payments. Logins per staff member arrive with real auth.</p>
        <button onClick={() => { resetStaff(); setStaff(getStaff()) }} style={{ font: 'inherit', cursor: 'pointer', border: 'none', background: 'transparent', fontSize: 11.5, color: FAINT, padding: 0 }}>Reset</button>
      </div>
    </div>
  )
}
