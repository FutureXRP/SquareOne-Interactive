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
  recent: { account: string; plan: string; when: string; status: string }[]
}

interface Row {
  status: string
  created_at: string
  membership_plans: { name: string; price_cents: number } | null
  client_accounts: { name: string } | null
}

export async function getMembershipStats(): Promise<MembershipStats> {
  const { data, error } = await supabase()
    .from('member_subscriptions')
    .select('status, created_at, membership_plans(name, price_cents), client_accounts(name)')
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
      plan: r.membership_plans?.name ?? '—',
      when: new Date(r.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      status: r.status,
    })),
  }
}
