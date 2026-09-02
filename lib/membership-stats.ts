'use client'
// Live fitness-membership stats from real subscriptions — no invented
// numbers. MRR = sum of each active subscription's plan price (integer cents).

import { supabase } from '@/lib/supabase'

export interface MembershipStats {
  active: number
  canceling: number
  pastDue: number
  mrrCents: number
  byPlan: { name: string; count: number }[]
  recent: { account: string; accountId: string | null; hasStripe: boolean; plan: string; when: string; status: string }[]
}

interface Row {
  status: string
  created_at: string
  account_id: string | null
  stripe_subscription_id: string | null
  membership_plans: { name: string; price_cents: number } | null
  client_accounts: { name: string } | null
}

export async function getMembershipStats(): Promise<MembershipStats> {
  const { data, error } = await supabase()
    .from('member_subscriptions')
    .select('status, created_at, account_id, stripe_subscription_id, membership_plans(name, price_cents), client_accounts(name)')
    .order('created_at', { ascending: false })
  if (error) throw error
  const rows = data as unknown as Row[]

  const live = rows.filter((r) => r.status === 'active' || r.status === 'past_due' || r.status === 'canceling')
  const byPlanMap = new Map<string, number>()
  for (const r of live) {
    const name = r.membership_plans?.name ?? 'Unknown plan'
    byPlanMap.set(name, (byPlanMap.get(name) ?? 0) + 1)
  }

  return {
    active: rows.filter((r) => r.status === 'active' || r.status === 'past_due').length,
    canceling: rows.filter((r) => r.status === 'canceling').length,
    pastDue: rows.filter((r) => r.status === 'past_due').length,
    mrrCents: live.filter((r) => r.status !== 'canceling').reduce((n, r) => n + (r.membership_plans?.price_cents ?? 0), 0),
    byPlan: [...byPlanMap.entries()].map(([name, count]) => ({ name, count })),
    recent: rows.slice(0, 6).map((r) => ({
      account: r.client_accounts?.name ?? '—',
      accountId: r.account_id,
      hasStripe: !!r.stripe_subscription_id,
      plan: r.membership_plans?.name ?? '—',
      when: new Date(r.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      status: r.status,
    })),
  }
}

// Every current member, with everyone on the account — the roster the
// Fitness Memberships tab shows under the plans. Family plans list each
// household member; the email is the primary person's.
export interface MemberRosterRow {
  accountId: string
  account: string
  planId: string | null
  plan: string
  status: string
  people: string[]
  email: string | null
}

export async function getMemberRoster(): Promise<MemberRosterRow[]> {
  const { data, error } = await supabase()
    .from('member_subscriptions')
    .select('account_id, plan_id, status, created_at, membership_plans(name), client_accounts(name)')
    .in('status', ['active', 'canceling', 'past_due'])
    .order('created_at', { ascending: false })
  if (error) throw error
  interface SubRow {
    account_id: string; plan_id: string | null; status: string
    membership_plans: { name: string } | null
    client_accounts: { name: string } | null
  }
  const subs = data as unknown as SubRow[]
  const ids = [...new Set(subs.map((s) => s.account_id))]
  const people = new Map<string, { names: string[]; email: string | null }>()
  if (ids.length > 0) {
    const { data: cl } = await supabase()
      .from('clients')
      .select('account_id, full_name, email, is_primary')
      .in('account_id', ids)
      .order('is_primary', { ascending: false })
    for (const c of (cl ?? []) as { account_id: string; full_name: string; email: string | null }[]) {
      const cur = people.get(c.account_id) ?? { names: [], email: null }
      cur.names.push(c.full_name)
      if (!cur.email && c.email) cur.email = c.email
      people.set(c.account_id, cur)
    }
  }
  return subs.map((s) => ({
    accountId: s.account_id,
    account: s.client_accounts?.name ?? '—',
    planId: s.plan_id,
    plan: s.membership_plans?.name ?? '—',
    status: s.status,
    people: people.get(s.account_id)?.names ?? [],
    email: people.get(s.account_id)?.email ?? null,
  }))
}
