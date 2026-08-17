import { serviceDb } from '@/lib/server/billing'
import type { BookingFacts } from '@/lib/server/emails'

function site(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || '').replace(/\/$/, '')
}

// Everything an email needs to say about a booking, read straight from the
// database. Shared by /api/notify (browser-triggered confirmations) and the
// Stripe webhook (a member paying for their own booking), so both write the
// same words from the same rows.

export interface BookingRecord {
  id: string; code: string; title: string; client_name: string; during: string
  price_cents: number; status: string; account_id: string | null
  deposit_cents?: number | null
  contact_email?: string | null
  note?: string | null
  approved_at?: string | null
  pay_token?: string | null
  canceled_via?: string | null
  canceled_by_staff?: { name: string } | null
  facilities: { name: string } | null
  payments: { amount_cents: number; status: string }[]
}

const COL_SETS = [
  'id, code, title, client_name, during, price_cents, status, account_id, deposit_cents, contact_email, note, approved_at, pay_token, canceled_via, canceled_by_staff:canceled_by(name), facilities:facility_id(name), payments(amount_cents, status)',
  'id, code, title, client_name, during, price_cents, status, account_id, deposit_cents, contact_email, note, approved_at, pay_token, facilities:facility_id(name), payments(amount_cents, status)',
  'id, code, title, client_name, during, price_cents, status, account_id, deposit_cents, contact_email, note, approved_at, facilities:facility_id(name), payments(amount_cents, status)',
  'id, code, title, client_name, during, price_cents, status, account_id, deposit_cents, contact_email, note, facilities:facility_id(name), payments(amount_cents, status)',
  'id, code, title, client_name, during, price_cents, status, account_id, deposit_cents, note, facilities:facility_id(name), payments(amount_cents, status)',
  'id, code, title, client_name, during, price_cents, status, account_id, facilities:facility_id(name), payments(amount_cents, status)',
]

// The address we write to: the booking's own contact email first (walk-ins
// booked at the desk), otherwise the account holder's.
export async function recipientFor(accountId: string | null, contactEmail: string | null): Promise<{ email: string; name: string } | null> {
  if (contactEmail) return { email: contactEmail, name: '' }
  if (!accountId) return null
  const { data } = await serviceDb()
    .from('clients')
    .select('full_name, email, is_primary')
    .eq('account_id', accountId)
    .order('is_primary', { ascending: false })
    .limit(1)
  const row = (data as { full_name: string; email: string | null }[] | null)?.[0]
  return row?.email ? { email: row.email, name: row.full_name } : null
}

function parseRange(during: string): { from: Date; to: Date } | null {
  const m = /^[[(]"?([^",]+)"?\s*,\s*"?([^")\]]+)"?[)\]]$/.exec(during)
  if (!m) return null
  return { from: new Date(m[1]), to: new Date(m[2]) }
}

function hour(d: Date): string {
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: d.getMinutes() ? '2-digit' : undefined, timeZone: 'America/Chicago' })
}

export async function bookingFacts(bookingId: string):
  Promise<{ b: BookingRecord; facts: BookingFacts; to: { email: string; name: string } } | null> {
  let b: BookingRecord | null = null
  for (const cols of COL_SETS) {
    const { data, error } = await serviceDb().from('bookings').select(cols).eq('id', bookingId).maybeSingle()
    if (!error && data) { b = data as unknown as BookingRecord; break }
  }
  if (!b) return null
  const to = await recipientFor(b.account_id, b.contact_email ?? null)
  if (!to) return null
  const range = parseRange(b.during)
  const paid = b.payments.filter((p) => p.status === 'paid').reduce((n, p) => n + p.amount_cents, 0)
  const addons = b.note?.startsWith('Add-ons:') ? b.note.replace('Add-ons: ', '') : undefined
  return {
    b,
    to,
    facts: {
      code: b.code,
      room: b.facilities?.name ?? 'Your room',
      what: b.title,
      date: range ? range.from.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'America/Chicago' }) : '—',
      time: range ? `${hour(range.from)} – ${hour(range.to)}` : '—',
      priceCents: b.price_cents,
      paidCents: paid,
      depositCents: b.deposit_cents ?? null,
      name: to.name || b.client_name,
      addons,
      // The direct pay link, when 0037 has run and there's something owed.
      payUrl: b.pay_token ? `${site()}/pay/${b.pay_token}` : undefined,
      canceledVia: (b.canceled_via as BookingFacts['canceledVia']) ?? undefined,
      canceledByName: b.canceled_by_staff?.name ?? undefined,
    },
  }
}
