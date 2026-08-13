'use client'
import { useEffect, useState } from 'react'
import { card, INK, SUB, FAINT, LINE, BLUE, GREEN } from '@/lib/theme'
import { getMyStaff, ROLE_LABEL, type StaffRole } from '@/lib/staff-store'
import { isSupabaseConfigured } from '@/lib/supabase'

// Who can do what, in plain language. Everyone with a staff login reaches
// the dashboard; the difference is whether they can change how the place
// is set up. This mirrors the database rules — it doesn't create them.
const ROWS: { what: string; everyone: boolean }[] = [
  { what: 'Sign in to the dashboard', everyone: true },
  { what: 'Book rooms, parties, and packages', everyone: true },
  { what: 'Take payments — card, cash, Cash App', everyone: true },
  { what: 'Check people in and run the front desk', everyone: true },
  { what: 'Add and edit client accounts', everyone: true },
  { what: 'Clock in and out', everyone: true },
  { what: 'See the Board, Calendar, and Reports', everyone: true },
  { what: 'Add or edit rooms, prices, and hours', everyone: false },
  { what: 'Create membership plans and packages', everyone: false },
  { what: 'Create coupons and discounts', everyone: false },
  { what: 'Change store wording and nav tabs', everyone: false },
  { what: 'Edit forms and waivers', everyone: false },
  { what: 'Send mass emails', everyone: false },
  { what: 'Add staff, set roles, reset passwords', everyone: false },
  { what: 'Company info and email settings', everyone: false },
]

const ROLES: StaffRole[] = ['owner', 'admin', 'manager', 'staff']

function Tick({ on }: { on: boolean }) {
  return on
    ? <span style={{ color: GREEN, fontWeight: 800, fontSize: 14 }} aria-label="yes">✓</span>
    : <span style={{ color: '#c3cede', fontSize: 14 }} aria-label="no">—</span>
}

export function PermissionsMatrix() {
  const [myRole, setMyRole] = useState<StaffRole | undefined>(undefined)

  useEffect(() => {
    if (!isSupabaseConfigured()) return
    getMyStaff().then((me) => setMyRole(me?.role)).catch(() => {})
  }, [])

  const canDo = (role: StaffRole, everyone: boolean) =>
    everyone || role === 'owner' || role === 'admin'

  return (
    <div className="sq-card" style={{ ...card, overflow: 'hidden' }}>
      <div style={{ padding: '14px 20px', borderBottom: `1px solid ${LINE}` }}>
        <span style={{ fontSize: 13.5, fontWeight: 700, color: INK }}>Who can do what</span>
        <span style={{ fontSize: 11.5, color: FAINT, marginLeft: 10 }}>
          all four roles get into the dashboard — this is what changes
        </span>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, minWidth: 520 }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${LINE}` }}>
              <th style={{ textAlign: 'left', padding: '9px 20px', fontSize: 10.5, fontWeight: 700, color: FAINT, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Can they…</th>
              {ROLES.map((r) => (
                <th key={r} style={{
                  padding: '9px 10px', fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em',
                  color: r === myRole ? BLUE : FAINT, width: 84,
                }}>
                  {ROLE_LABEL[r]}
                  {r === myRole && <span style={{ display: 'block', fontSize: 9, fontWeight: 600, color: BLUE }}>you</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row, i) => (
              <tr key={row.what} style={{ borderBottom: i < ROWS.length - 1 ? `1px solid ${LINE}` : 'none', background: row.everyone ? 'transparent' : '#fafbfd' }}>
                <td style={{ padding: '9px 20px', color: SUB }}>{row.what}</td>
                {ROLES.map((r) => (
                  <td key={r} style={{ padding: '9px 10px', textAlign: 'center', background: r === myRole ? '#f4f8fd' : undefined }}>
                    <Tick on={canDo(r, row.everyone)} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p style={{ fontSize: 11, color: FAINT, margin: 0, padding: '11px 20px', lineHeight: 1.6 }}>
        Managers and Staff can open every tab — the shaded rows show read-only for them, marked with a small lock in
        the sidebar. This is enforced by the database, not just hidden in the screen, so it holds even if someone
        goes looking.
      </p>
    </div>
  )
}
