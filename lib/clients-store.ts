'use client'
// Editable client accounts. Balance changes are recorded as explicit
// adjustments (mini-ledger), never edited in place — balance is the sum.

import { createLocalStore } from '@/lib/local-store'
import { clients as DEFAULT_CLIENTS } from '@/lib/admin-data'

export interface LedgerEntry {
  cents: number // positive = client owes more, negative = credit/payment
  reason: string
  when: string
}

export interface ClientAccount {
  id: string
  account: string
  members: number
  plan: 'Family' | 'Individual' | 'None'
  lastSeen: string
  flag?: string
  ledger: LedgerEntry[]
}

const store = createLocalStore<ClientAccount[]>('sq-clients-v1', () =>
  DEFAULT_CLIENTS.map((c, i) => ({
    id: `cl-${i + 1}`,
    account: c.account,
    members: c.members,
    plan: c.plan,
    lastSeen: c.lastSeen,
    flag: c.flag,
    ledger: c.balanceCents !== 0 ? [{ cents: c.balanceCents, reason: 'Opening balance', when: 'seed' }] : [],
  }))
)

export const CLIENTS_EVENT = store.event

export function getClients(): ClientAccount[] {
  return store.get()
}

export function balanceCents(c: ClientAccount): number {
  return c.ledger.reduce((n, e) => n + e.cents, 0)
}

export function saveClients(clients: ClientAccount[]) {
  store.save(clients)
}

export function resetClients() {
  store.reset()
}
