'use client'
import { useState } from 'react'
import { INK, SUB, FAINT, LINE, BLUE, GREEN, RED } from '@/lib/theme'
import { formatCents } from '@/lib/format'
import { updateDrawerEntry, deleteDrawerEntry, type DrawerEntry } from '@/lib/cash-drawer-store'

function dollarsToCents(v: string): number {
  const n = Number.parseFloat(v.replace(/[$,\s]/g, ''))
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : 0
}

// One cash bag entry, editable in place: type a new amount, retype what
// it was for, flip deposit/withdrawal, or delete it outright. No
// dropdowns anywhere — every field is free text.
export function DrawerEntryRow({ entry, onDone }: { entry: DrawerEntry; onDone?: () => void }) {
  const [editing, setEditing] = useState(false)
  const [amount, setAmount] = useState((Math.abs(entry.amountCents) / 100).toFixed(2))
  const [reason, setReason] = useState(entry.reason)
  const [out, setOut] = useState(entry.amountCents < 0)
  const [busy, setBusy] = useState(false)

  const open = () => {
    setAmount((Math.abs(entry.amountCents) / 100).toFixed(2))
    setReason(entry.reason)
    setOut(entry.amountCents < 0)
    setEditing(true)
  }

  const save = async () => {
    const cents = dollarsToCents(amount)
    if (busy || cents <= 0 || !reason.trim()) return
    setBusy(true)
    await updateDrawerEntry(entry.id, { amountCents: out ? -cents : cents, reason })
    setBusy(false)
    setEditing(false)
    onDone?.()
  }

  const remove = async () => {
    if (busy || !window.confirm(`Delete this entry (${entry.reason})? The balance adjusts to match.`)) return
    setBusy(true)
    await deleteDrawerEntry(entry.id)
    setBusy(false)
    setEditing(false)
    onDone?.()
  }

  if (!editing) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 20px', borderBottom: `1px solid ${LINE}` }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 12.5, fontWeight: 600, color: INK, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.reason}</p>
          <p style={{ fontSize: 11, color: FAINT, margin: 0 }}>{entry.when}{entry.staffName ? ` · ${entry.staffName}` : ''}</p>
        </div>
        <span style={{ fontSize: 12.5, fontWeight: 700, color: entry.amountCents < 0 ? RED : GREEN, fontVariantNumeric: 'tabular-nums' }}>
          {entry.amountCents < 0 ? '−' : '+'}{formatCents(Math.abs(entry.amountCents))}
        </span>
        <button className="sq-btn sq-btn-ghost" style={{ padding: '3px 10px', fontSize: 10.5 }} onClick={open}>Edit</button>
      </div>
    )
  }

  return (
    <div style={{ padding: '10px 20px', borderBottom: `1px solid ${LINE}`, background: '#fafbfd' }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
        <input className="sq-input" style={{ width: 96, padding: '7px 10px', fontSize: 12.5 }} inputMode="decimal" placeholder="$"
          value={amount} onChange={(e) => setAmount(e.target.value)} />
        <input className="sq-input" style={{ flex: 1, minWidth: 150, padding: '7px 10px', fontSize: 12.5 }} placeholder="what was it for?"
          value={reason} onChange={(e) => setReason(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') save() }} />
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {[[false, 'Into the bag'], [true, 'Out of the bag']].map(([isOut, label]) => (
          <button key={String(isOut)} onClick={() => setOut(isOut as boolean)} style={{
            font: 'inherit', cursor: 'pointer', fontSize: 11.5, fontWeight: 600,
            color: out === isOut ? '#fff' : SUB, background: out === isOut ? BLUE : '#fff',
            border: `1.5px solid ${out === isOut ? BLUE : LINE}`, borderRadius: 999, padding: '5px 13px',
          }}>
            {label as string}
          </button>
        ))}
        <button className="sq-btn sq-btn-primary" style={{ padding: '6px 13px', fontSize: 11.5 }} disabled={busy || !amount || !reason.trim()} onClick={save}>Save</button>
        <button className="sq-btn sq-btn-ghost" style={{ padding: '6px 13px', fontSize: 11.5 }} onClick={() => setEditing(false)}>Cancel</button>
        <button className="sq-btn sq-btn-danger" style={{ padding: '6px 13px', fontSize: 11.5, marginLeft: 'auto' }} disabled={busy} onClick={remove}>Delete</button>
      </div>
    </div>
  )
}
