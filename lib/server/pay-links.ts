import { serviceDb } from '@/lib/server/billing'

// Resolving a booking's pay link. Kept out of the route file because a
// Next.js route handler may only export HTTP verbs, and both the route and
// the page it serves need this.

export interface PayTarget {
  code: string
  title: string
  room: string
  date: string
  time: string
  priceCents: number
  paidCents: number
  depositDueCents: number
  balanceCents: number
  status: string
  inReview: boolean
}

interface Row {
  id: string; code: string; title: string; during: string
  price_cents: number; status: string; account_id: string | null
  deposit_cents?: number | null
  approved_at?: string | null
  facilities: { name: string } | null
  payments: { amount_cents: number; status: string }[]
}

const COL_SETS = [
  'id, code, title, during, price_cents, status, account_id, deposit_cents, approved_at, facilities:facility_id(name), payments(amount_cents, status)',
  'id, code, title, during, price_cents, status, account_id, deposit_cents, facilities:facility_id(name), payments(amount_cents, status)',
  'id, code, title, during, price_cents, status, account_id, facilities:facility_id(name), payments(amount_cents, status)',
]

function fmt(d: Date, opts: Intl.DateTimeFormatOptions): string {
  return d.toLocaleString('en-US', { ...opts, timeZone: 'America/Chicago' })
}

// Everything the pay page shows, resolved from the token. Exported so the
// page itself can render server-side without a second round trip.
export async function bookingForToken(token: string): Promise<{ row: Row; target: PayTarget } | null> {
  // A malformed token should never reach the database as a uuid comparison.
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token)) return null
  let row: Row | null = null
  try {
    for (const cols of COL_SETS) {
      const { data, error } = await serviceDb().from('bookings').select(cols).eq('pay_token', token).maybeSingle()
      if (!error) { row = data as unknown as Row | null; break }
      // 42703 = pay_token column missing, i.e. 0037 hasn't run.
      if (error.code === '42703') return null
    }
  } catch (e) {
    // A misconfigured deployment must not throw a stack trace at a
    // customer who just wanted to pay — the page says "link isn't valid"
    // and tells them to call us.
    console.error('[pay-links]', e)
    return null
  }
  if (!row) return null

  const paid = (row.payments ?? []).filter((p) => p.status === 'paid').reduce((n, p) => n + p.amount_cents, 0)
  const balance = Math.max(0, row.price_cents - paid)
  const depositDue = row.deposit_cents && row.deposit_cents > 0 ? Math.max(0, row.deposit_cents - paid) : 0
  const m = /^[[(]"?([^",]+)"?\s*,\s*"?([^")\]]+)"?[)\]]$/.exec(row.during)
  const from = m ? new Date(m[1]) : null
  const to = m ? new Date(m[2]) : null

  return {
    row,
    target: {
      code: row.code,
      title: row.title,
      room: row.facilities?.name ?? 'Your room',
      date: from ? fmt(from, { weekday: 'long', month: 'long', day: 'numeric' }) : '—',
      time: from && to
        ? `${fmt(from, { hour: 'numeric', minute: from.getMinutes() ? '2-digit' : undefined })} – ${fmt(to, { hour: 'numeric', minute: to.getMinutes() ? '2-digit' : undefined })}`
        : '—',
      priceCents: row.price_cents,
      paidCents: paid,
      depositDueCents: depositDue,
      balanceCents: balance,
      status: row.status,
      inReview: 'approved_at' in row && row.approved_at === null,
    },
  }
}

