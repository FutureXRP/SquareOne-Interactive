'use client'
import { useEffect, useState } from 'react'
import { PageHero, HeroStat } from '@/components/admin/PageHero'
import { card, INK, SUB, FAINT, LINE, BLUE, GREEN, RED } from '@/lib/theme'
import { formatCents } from '@/lib/format'
import { getClients, addClientAccount, patchClientAccount, recordLedgerEntry, deleteClientAccount, CLIENTS_EVENT, type ClientAccount } from '@/lib/clients-store'
import { useLive } from '@/lib/use-live'
import { useDebouncedSave } from '@/lib/use-debounced-save'
import { ResetPasswordButton } from '@/components/admin/ResetPasswordButton'
import { AccountWaivers } from '@/components/admin/AccountWaivers'
import { getMyStaff, isAdminRole, type StaffRole } from '@/lib/staff-store'

function dollarsToCents(v: string): number {
  const n = Number.parseFloat(v.replace(/[$,\s]/g, ''))
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : 0
}

export default function ClientsPage() {
  const { data: clients, reload, loading } = useLive<ClientAccount[]>(getClients, [CLIENTS_EVENT], [])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [drafts, setDrafts] = useState<Record<string, { name?: string; flag?: string }>>({})
  const [adjAmount, setAdjAmount] = useState('')
  const [adjReason, setAdjReason] = useState('')
  const [myRole, setMyRole] = useState<StaffRole | undefined>(undefined)

  useEffect(() => { getMyStaff().then((me) => setMyRole(me?.role)).catch(() => {}) }, [])

  const debouncedPatch = useDebouncedSave(async (p: { id: string; name?: string; flag?: string | null }) => {
    await patchClientAccount(p.id, { name: p.name, flag: p.flag })
  })

  const draftFor = (c: ClientAccount) => ({ name: drafts[c.id]?.name ?? c.account, flag: drafts[c.id]?.flag ?? (c.flag ?? '') })

  const edit = (c: ClientAccount, p: { name?: string; flag?: string }) => {
    const next = { ...draftFor(c), ...p }
    setDrafts((d) => ({ ...d, [c.id]: next }))
    debouncedPatch({ id: c.id, name: next.name, flag: next.flag || null })
  }

  const addClient = async () => {
    const ok = await addClientAccount('New account')
    if (ok) reload()
  }

  const recordAdjustment = async (id: string, sign: 1 | -1) => {
    const cents = dollarsToCents(adjAmount)
    if (cents === 0 || !adjReason.trim()) return
    const ok = await recordLedgerEntry(id, cents * sign, adjReason.trim())
    if (ok) { setAdjAmount(''); setAdjReason('') }
  }

  const removeAccount = async (id: string, name: string) => {
    if (!window.confirm(`Delete the ${name} account? Its members, ledger, and waivers are removed. This can't be undone.`)) return
    const ok = await deleteClientAccount(id)
    if (ok) setEditingId(null)
  }

  const owingCents = clients.reduce((n, c) => n + Math.max(c.balanceCents, 0), 0)

  return (
    <div className="sq-page" style={{ padding: '34px 40px 20px', maxWidth: 1180, margin: '0 auto' }}>
      <PageHero title="Clients" sub="Family accounts and members — balances are the sum of ledger entries, adjusted only by recorded charges and credits." chip={`${clients.length} accounts`}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <HeroStat label="Outstanding" value={formatCents(owingCents)} sub="across accounts owing" />
          <button className="sq-btn" style={{ background: '#fff', color: '#182740' }} onClick={addClient}>+ Add account</button>
        </div>
      </PageHero>

      <div className="sq-card" style={{ ...card, overflow: 'hidden' }}>
        {clients.length === 0 && (
          <p style={{ fontSize: 13, color: SUB, padding: '18px 20px', margin: 0 }}>
            {loading ? 'Loading accounts…' : 'No client accounts yet — they appear here when people sign up in the store, or add one for a walk-in.'}
          </p>
        )}
        {clients.map((c, i) => {
          const bal = c.balanceCents
          const isEditing = editingId === c.id
          const draft = draftFor(c)
          return (
            <div key={c.id} style={{ borderBottom: i < clients.length - 1 ? `1px solid ${LINE}` : 'none' }}>
              <div className="sq-row" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 20px', flexWrap: 'wrap' }}>
                <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#eef4fb', color: BLUE, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12.5, fontWeight: 800, flexShrink: 0, textTransform: 'uppercase' }}>{draft.name.charAt(0)}</div>
                <div style={{ flex: 1, minWidth: 160 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <p style={{ fontSize: 13, fontWeight: 700, color: INK, margin: 0 }}>{draft.name}</p>
                    {draft.flag && <span style={{ fontSize: 10, fontWeight: 700, color: RED, background: '#fae7e4', padding: '1px 8px', borderRadius: 999 }}>{draft.flag}</span>}
                  </div>
                  <p style={{ fontSize: 12, color: SUB, margin: 0 }}>
                    {c.people.length > 1 ? c.people.join(', ') : `${c.members} member${c.members > 1 ? 's' : ''}`} · {c.plan === 'None' ? 'no membership' : `${c.plan} plan`}
                  </p>
                </div>
                <span style={{ fontSize: 13.5, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: bal > 0 ? RED : bal < 0 ? GREEN : FAINT, minWidth: 74, textAlign: 'right' }}>
                  {bal === 0 ? '—' : bal < 0 ? `+${formatCents(-bal)}` : formatCents(bal)}
                </span>
                <button className="sq-btn sq-btn-ghost" style={{ padding: '5px 12px', fontSize: 11.5 }} onClick={() => setEditingId(isEditing ? null : c.id)}>{isEditing ? 'Close' : 'Edit'}</button>
              </div>

              {isEditing && (
                <div style={{ padding: '4px 20px 18px 64px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 14, maxWidth: 560 }}>
                    <div>
                      <label className="sq-label">Account name</label>
                      <input className="sq-input" value={draft.name} onChange={(e) => edit(c, { name: e.target.value })} />
                    </div>
                    <div>
                      <label className="sq-label">Flag (optional)</label>
                      <input className="sq-input" value={draft.flag} placeholder="past due" onChange={(e) => edit(c, { flag: e.target.value })} />
                    </div>
                  </div>

                  <span className="sq-label">Record a balance change</span>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
                    <input className="sq-input" style={{ width: 110 }} inputMode="decimal" placeholder="$ amount" value={adjAmount} onChange={(e) => setAdjAmount(e.target.value)} />
                    <input className="sq-input" style={{ flex: 1, minWidth: 160 }} placeholder="reason (party balance, refund…)" value={adjReason} onChange={(e) => setAdjReason(e.target.value)} />
                    <button className="sq-btn sq-btn-ghost" style={{ padding: '7px 13px', fontSize: 11.5 }} onClick={() => recordAdjustment(c.id, 1)}>Charge</button>
                    <button className="sq-btn sq-btn-primary" style={{ padding: '7px 13px', fontSize: 11.5 }} onClick={() => recordAdjustment(c.id, -1)}>Credit / payment</button>
                  </div>
                  {/* Every waiver this account has signed, kept until deleted */}
                  <AccountWaivers accountId={c.id} canDelete={isAdminRole(myRole)} />

                  {/* Locked out? Owners and admins can help them back in. */}
                  {isAdminRole(myRole) && (
                    <div style={{ marginBottom: 12 }}>
                      <span className="sq-label">Account access</span>
                      {c.loginClientId ? (
                        <ResetPasswordButton clientId={c.loginClientId} name={c.loginName ?? draft.name} />
                      ) : (
                        <p style={{ fontSize: 11.5, color: FAINT, margin: 0, lineHeight: 1.5 }}>
                          Nobody on this account has a login yet — they sign up in the store to create one.
                        </p>
                      )}
                    </div>
                  )}

                  <button className="sq-btn sq-btn-danger" style={{ padding: '6px 13px', fontSize: 11.5, marginBottom: 10 }} onClick={() => removeAccount(c.id, draft.name)}>Delete account</button>
                  {c.recent.length > 0 && (
                    <div style={{ fontSize: 11.5, color: SUB }}>
                      {c.recent.map((e, j) => (
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
      <p style={{ fontSize: 11.5, color: FAINT, marginTop: 14 }}>Live accounts — members who sign up in the store appear here automatically. Credit shows green.</p>
    </div>
  )
}
