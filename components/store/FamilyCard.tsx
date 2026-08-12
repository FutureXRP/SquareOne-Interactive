'use client'
import { useEffect, useState } from 'react'
import { card, INK, SUB, FAINT, LINE, BLUE } from '@/lib/theme'
import {
  getFamilyMembers, addFamilyMember, removeFamilyMember, renameFamilyMember,
  FAMILY_EVENT, type FamilyMember,
} from '@/lib/family-store'

// "Who's on this account" — the whole family shares one login, and each
// person listed here gets their own check-in button so the front desk
// knows exactly who is in the building.
export function FamilyCard({ accountId }: { accountId: string }) {
  const [people, setPeople] = useState<FamilyMember[]>([])
  const [adding, setAdding] = useState('')
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false) // add rejected → migration 0020 not run
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null)

  const sync = () => { getFamilyMembers(accountId).then(setPeople).catch(() => {}) }

  useEffect(() => {
    sync()
    window.addEventListener(FAMILY_EVENT, sync)
    return () => window.removeEventListener(FAMILY_EVENT, sync)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId])

  const add = async () => {
    const name = adding.trim()
    if (!name || busy) return
    setBusy(true)
    const ok = await addFamilyMember(accountId, name)
    setFailed(!ok)
    if (ok) setAdding('')
    setBusy(false)
  }

  const remove = async (p: FamilyMember) => {
    if (busy || !window.confirm(`Remove ${p.name} from this account? Their past check-ins stay in the log.`)) return
    setBusy(true)
    await removeFamilyMember(p.id)
    setBusy(false)
  }

  const saveRename = async () => {
    if (!editing || busy) return
    setBusy(true)
    await renameFamilyMember(editing.id, editing.name)
    setEditing(null)
    setBusy(false)
  }

  return (
    <div className="sq-card" style={{ ...card, marginBottom: 24 }}>
      <div style={{ padding: '14px 20px', borderBottom: `1px solid ${LINE}` }}>
        <span style={{ fontSize: 13.5, fontWeight: 700, color: INK }}>Family on this account</span>
        <span style={{ fontSize: 11.5, color: FAINT, marginLeft: 10 }}>everyone shares this login · each person checks in by name</span>
      </div>
      {people.map((p) => (
        <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 20px', borderBottom: `1px solid ${LINE}` }}>
          <span style={{ width: 30, height: 30, borderRadius: 999, background: '#eef4fb', color: BLUE, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12.5, fontWeight: 800, flexShrink: 0 }}>
            {p.name.trim().charAt(0).toUpperCase() || '?'}
          </span>
          {editing?.id === p.id ? (
            <>
              <input
                className="sq-input"
                value={editing.name}
                autoFocus
                onChange={(e) => setEditing({ id: p.id, name: e.target.value })}
                onKeyDown={(e) => { if (e.key === 'Enter') saveRename() }}
                style={{ flex: 1, minWidth: 120, padding: '7px 10px', fontSize: 13, border: `1px solid ${LINE}`, borderRadius: 8 }}
              />
              <button className="sq-btn sq-btn-primary" style={{ padding: '6px 13px', fontSize: 12 }} disabled={busy} onClick={saveRename}>Save</button>
              <button className="sq-btn sq-btn-ghost" style={{ padding: '6px 13px', fontSize: 12 }} onClick={() => setEditing(null)}>Cancel</button>
            </>
          ) : (
            <>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 13, fontWeight: 700, color: INK, margin: 0 }}>{p.name}</p>
                <p style={{ fontSize: 11.5, color: SUB, margin: 0 }}>{p.isPrimary ? 'Account holder — signs in with the email on file' : 'Family member — checks in under their own name'}</p>
              </div>
              {!p.isPrimary && (
                <>
                  <button className="sq-btn sq-btn-ghost" style={{ padding: '6px 13px', fontSize: 12 }} disabled={busy} onClick={() => setEditing({ id: p.id, name: p.name })}>Rename</button>
                  <button className="sq-btn sq-btn-danger" style={{ padding: '6px 13px', fontSize: 12 }} disabled={busy} onClick={() => remove(p)}>Remove</button>
                </>
              )}
            </>
          )}
        </div>
      ))}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '13px 20px', flexWrap: 'wrap' }}>
        <input
          className="sq-input"
          placeholder="Add a family member — full name"
          value={adding}
          onChange={(e) => setAdding(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') add() }}
          style={{ flex: 1, minWidth: 200, padding: '9px 12px', fontSize: 13, border: `1px solid ${LINE}`, borderRadius: 8 }}
        />
        <button className="sq-btn sq-btn-primary" style={{ padding: '9px 18px', fontSize: 13 }} disabled={busy || !adding.trim()} onClick={add}>
          {busy ? '…' : 'Add'}
        </button>
        {failed && (
          <p style={{ fontSize: 11.5, color: '#b23f33', margin: 0, width: '100%' }}>
            Couldn&apos;t add them — the family update (0020_family_members.sql) hasn&apos;t been run on the database yet.
          </p>
        )}
      </div>
    </div>
  )
}
