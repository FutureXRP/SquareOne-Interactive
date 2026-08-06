'use client'
import { useEffect, useState } from 'react'
import { PageHero, HeroStat } from '@/components/admin/PageHero'
import { card, INK, SUB, FAINT, LINE, BLUE, GREEN, RED } from '@/lib/theme'
import { formatCents } from '@/lib/format'
import { getClients, saveClients, resetClients, balanceCents, CLIENTS_EVENT, type ClientAccount } from '@/lib/clients-store'

function dollarsToCents(v: string): number {
  const n = Number.parseFloat(v.replace(/[$,\s]/g, ''))
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : 0
}

export default function ClientsPage() {
  const [clients, setClients] = useState<ClientAccount[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [adjAmount, setAdjAmount] = useState('')
  const [adjReason, setAdjReason] = useState('')

  useEffect(() => {
    const sync = () => setClients(getClients())
    sync()
    window.addEventListener(CLIENTS_EVENT, sync)
    return () => window.removeEventListener(CLIENTS_EVENT, sync)
  }, [])

  const persist = (next: ClientAccount[]) => { setClients(next); saveClients(next) }
  const patch = (id: string, p: Partial<ClientAccount>) => persist(clients.map((c) => (c.id === id ? { ...c, ...p } : c)))

  const addClient = () => {
    const id = `cl-${Date.now().toString(36)}`
    persist([{ id, account: 'New account', members: 1, plan: 'None', lastSeen: 'never', ledger: [] }, ...clients])
    setEditingId(id)
  }

  const recordAdjustment = (id: string, sign: 1 | -1) => {
    const cents = dollarsToCents(adjAmount)
    if (cents === 0 || !adjReason.trim()) return
    const when = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    persist(clients.map((c) => (c.id === id ? { ...c, ledger: [...c.ledger, { cents: cents * sign, reason: adjReason.trim(), when }] } : c)))
    setAdjAmount(''); setAdjReason('')
  }

  const owingCents = clients.reduce((n, c) => n + Math.max(balanceCents(c), 0), 0)

  return (
    <div className="sq-page" style={{ padding: '34px 40px 20px', maxWidth: 1180, margin: '0 auto' }}>
      <PageHero title="Clients" sub="Family accounts and members — balances are the sum of ledger entries, adjusted only by recorded charges and credits." chip={`${clients.length} accounts`}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <HeroStat label="Outstanding" value={formatCents(owingCents)} sub="across accounts owing" />
          <button className="sq-btn" style={{ background: '#fff', color: '#182740' }} onClick={addClient}>+ Add account</button>
        </div>
      </PageHero>

      <div className="sq-card" style={{ ...card, overflow: 'hidden' }}>
        {clients.map((c, i) => {
          const bal = balanceCents(c)
          const isEditing = editingId === c.id
          return (
            <div key={c.id} style={{ borderBottom: i < clients.length - 1 ? `1px solid ${LINE}` : 'none' }}>
              <div className="sq-row" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 20px', flexWrap: 'wrap' }}>
                <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#eef4fb', color: BLUE, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12.5, fontWeight: 800, flexShrink: 0, textTransform: 'uppercase' }}>{c.account.charAt(0)}</div>
                <div style={{ flex: 1, minWidth: 160 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <p style={{ fontSize: 13, fontWeight: 700, color: INK, margin: 0 }}>{c.account}</p>
                    {c.flag && <span style={{ fontSize: 10, fontWeight: 700, color: RED, background: '#fae7e4', padding: '1px 8px', borderRadius: 999 }}>{c.flag}</span>}
                  </div>
                  <p style={{ fontSize: 12, color: SUB, margin: 0 }}>{c.members} member{c.members > 1 ? 's' : ''} · {c.plan === 'None' ? 'no membership' : `${c.plan} plan`} · last seen {c.lastSeen}</p>
                </div>
                <span style={{ fontSize: 13.5, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: bal > 0 ? RED : bal < 0 ? GREEN : FAINT, minWidth: 74, textAlign: 'right' }}>
                  {bal === 0 ? '—' : bal < 0 ? `+${formatCents(-bal)}` : formatCents(bal)}
                </span>
                <button className="sq-btn sq-btn-ghost" style={{ padding: '5px 12px', fontSize: 11.5 }} onClick={() => setEditingId(isEditing ? null : c.id)}>{isEditing ? 'Close' : 'Edit'}</button>
              </div>

              {isEditing && (
                <div style={{ padding: '4px 20px 18px 64px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 14, maxWidth: 700 }}>
                    <div>
                      <label className="sq-label">Account name</label>
                      <input className="sq-input" value={c.account} onChange={(e) => patch(c.id, { account: e.target.value })} />
                    </div>
                    <div>
                      <label className="sq-label">Members</label>
                      <input className="sq-input" type="number" min={1} value={c.members} onChange={(e) => patch(c.id, { members: Math.max(1, Number(e.target.value) || 1) })} />
                    </div>
                    <div>
                      <label className="sq-label">Plan</label>
                      <select className="sq-select" value={c.plan} onChange={(e) => patch(c.id, { plan: e.target.value as ClientAccount['plan'] })}>
                        {['Family', 'Individual', 'None'].map((p) => <option key={p} value={p}>{p}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="sq-label">Flag (optional)</label>
                      <input className="sq-input" value={c.flag ?? ''} placeholder="past due" onChange={(e) => patch(c.id, { flag: e.target.value || undefined })} />
                    </div>
                  </div>

                  <span className="sq-label">Record a balance change</span>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
                    <input className="sq-input" style={{ width: 110 }} inputMode="decimal" placeholder="$ amount" value={adjAmount} onChange={(e) => setAdjAmount(e.target.value)} />
                    <input className="sq-input" style={{ flex: 1, minWidth: 160 }} placeholder="reason (party balance, refund…)" value={adjReason} onChange={(e) => setAdjReason(e.target.value)} />
                    <button className="sq-btn sq-btn-ghost" style={{ padding: '7px 13px', fontSize: 11.5 }} onClick={() => recordAdjustment(c.id, 1)}>Charge</button>
                    <button className="sq-btn sq-btn-primary" style={{ padding: '7px 13px', fontSize: 11.5 }} onClick={() => recordAdjustment(c.id, -1)}>Credit / payment</button>
                  </div>
                  {c.ledger.length > 0 && (
                    <div style={{ fontSize: 11.5, color: SUB }}>
                      {c.ledger.slice(-4).reverse().map((e, j) => (
                        <p key={j} style={{ margin: '2px 0', fontVariantNumeric: 'tabular-nums' }}>
                          <span style={{ color: e.cents > 0 ? RED : GREEN, fontWeight: 700 }}>{e.cents > 0 ? '+' : '−'}{formatCents(Math.abs(e.cents))}</span> · {e.reason} · {e.when}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
        <p style={{ fontSize: 11.5, color: FAINT, margin: 0 }}>Credit shows green. Amilia import lands in the migration phase; edits here are demo records.</p>
        <button onClick={() => { resetClients(); setClients(getClients()) }} style={{ font: 'inherit', cursor: 'pointer', border: 'none', background: 'transparent', fontSize: 11.5, color: FAINT, padding: 0 }}>Reset to defaults</button>
      </div>
    </div>
  )
}
