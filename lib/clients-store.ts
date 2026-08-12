'use client'
// Client accounts — live from Supabase. Balances come from the
// account_balances view (sum of ledger entries); balance changes are
// recorded as ledger inserts, never edits.

import { supabase, tryWrite, emit } from '@/lib/supabase'

export const CLIENTS_EVENT = 'sq-clients'

export interface ClientAccount {
  id: string
  account: string
  members: number
  people: string[] // everyone on the account, primary first
  plan: string
  flag?: string
  balanceCents: number
  recent: { cents: number; reason: string; when: string }[]
}

export async function getClients(): Promise<ClientAccount[]> {
  const sb = supabase()
  const [accountsRes, balancesRes, ledgerRes] = await Promise.all([
    sb.from('client_accounts').select('id, name, flag, clients(id, full_name, is_primary), member_subscriptions(plan_id, status, membership_plans(name))').order('name'),
    sb.from('account_balances').select('account_id, balance_cents'),
    sb.from('ledger_entries').select('account_id, amount_cents, reason, created_at').order('created_at', { ascending: false }).limit(200),
  ])
  if (accountsRes.error) throw accountsRes.error
  const balances = new Map(((balancesRes.data ?? []) as { account_id: string; balance_cents: number }[]).map((b) => [b.account_id, b.balance_cents]))
  const ledger = (ledgerRes.data ?? []) as { account_id: string; amount_cents: number; reason: string; created_at: string }[]

  interface Row {
    id: string
    name: string
    flag: string | null
    clients: { id: string; full_name: string; is_primary: boolean }[]
    member_subscriptions: { plan_id: string; status: string; membership_plans: { name: string } | null }[]
  }
  return (accountsRes.data as unknown as Row[]).map((r) => {
    const sub = r.member_subscriptions[0]
    return {
      id: r.id,
      account: r.name,
      members: Math.max(r.clients.length, 1),
      people: [...r.clients].sort((a, b) => Number(b.is_primary) - Number(a.is_primary)).map((c) => c.full_name),
      plan: sub && (sub.status === 'active' || sub.status === 'canceling') ? (sub.membership_plans?.name ?? sub.plan_id) : 'None',
      flag: r.flag ?? undefined,
      balanceCents: balances.get(r.id) ?? 0,
      recent: ledger.filter((l) => l.account_id === r.id).slice(0, 4).map((l) => ({
        cents: l.amount_cents,
        reason: l.reason,
        when: new Date(l.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      })),
    }
  })
}

export async function addClientAccount(name: string): Promise<boolean> {
  const { data: org } = await supabase().from('organizations').select('id').limit(1).single()
  const ok = await tryWrite(() => supabase().from('client_accounts').insert({ org_id: (org as { id: string }).id, name }))
  if (ok) emit(CLIENTS_EVENT)
  return ok
}

export async function patchClientAccount(id: string, patch: { name?: string; flag?: string | null }): Promise<boolean> {
  const ok = await tryWrite(() => supabase().from('client_accounts').update(patch).eq('id', id))
  if (ok) emit(CLIENTS_EVENT)
  return ok
}

// Positive cents = charge (client owes), negative = credit/payment.
export async function recordLedgerEntry(accountId: string, cents: number, reason: string): Promise<boolean> {
  if (cents === 0 || !reason.trim()) return false
  const ok = await tryWrite(() => supabase().from('ledger_entries').insert({
    account_id: accountId,
    amount_cents: cents,
    reason: reason.trim(),
  }))
  if (ok) emit(CLIENTS_EVENT)
  return ok
}

// Deleting an account removes its members, ledger, and waiver links
// (bookings keep the name but unlink). Confirm before calling.
export async function deleteClientAccount(id: string): Promise<boolean> {
  const ok = await tryWrite(() => supabase().from('client_accounts').delete().eq('id', id))
  if (ok) emit(CLIENTS_EVENT)
  return ok
}
