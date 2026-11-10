import { serviceDb, sendAndLog } from '@/lib/server/billing'
import { bookingFactsAny } from '@/lib/server/booking-facts'
import { adminRecipients } from '@/lib/server/unpaid-holds'
import { customerChangedAlert, type CustomerChange } from '@/lib/server/emails'

// Telling staff when a customer changes their own booking (0056). The
// database logs every move, room change, and cancel in booking_changes;
// this sends the ones a customer made that staff haven't heard about yet,
// one email per booking. Called right after the change and again by the
// hourly job, which catches anything that slipped through. Each change is
// claimed before it's sent, so the two can never both send it.

interface ChangeRow {
  id: string
  booking_id: string
  changed_at: string
  kind: CustomerChange['kind']
  old_during: string | null
  new_during: string | null
  old_facility_id: string | null
  new_facility_id: string | null
  detail: { booked?: string[]; requested?: string[]; addonsAdded?: string[]; addonsDropped?: string[] } | null
}

const TZ = 'America/Chicago'

function stamp(iso: string): string {
  return new Date(iso).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: TZ })
}

function hour(d: Date): string {
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: d.getMinutes() ? '2-digit' : undefined, timeZone: TZ })
}

// "Sat, Nov 21, 2 PM – 5 PM" from a Postgres range.
export function rangePhrase(range: string | null): string | undefined {
  if (!range) return undefined
  const m = /^[[(]"?([^",]+)"?\s*,\s*"?([^")\]]+)"?[)\]]$/.exec(range)
  if (!m) return undefined
  const from = new Date(m[1])
  const to = new Date(m[2])
  const day = from.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: TZ })
  return `${day}, ${hour(from)} – ${hour(to)}`
}

async function roomNames(): Promise<Map<string, string>> {
  const { data } = await serviceDb().from('facilities').select('id, name')
  return new Map(((data ?? []) as { id: string; name: string }[]).map((r) => [r.id, r.name]))
}

// A request typed into the rental agreement: spaces or extras other than
// what's booked. Logged as a customer change so it gets the same alert.
export async function recordSpacesRequest(bookingId: string, detail: NonNullable<ChangeRow['detail']>): Promise<boolean> {
  const { error } = await serviceDb().from('booking_changes').insert({
    booking_id: bookingId, kind: 'spaces_requested', actor: 'customer', detail,
  })
  if (error) console.error('[customer-changes]', error.message)
  return !error
}

// Send staff every customer change they haven't been told about — for one
// booking, or (no id) for all of them. Returns how many emails went out.
export async function alertCustomerChanges(bookingId?: string): Promise<number> {
  const db = serviceDb()
  let q = db.from('booking_changes').select('id').eq('actor', 'customer').is('alerted_at', null)
  if (bookingId) q = q.eq('booking_id', bookingId)
  const { data: pending, error } = await q.limit(200)
  if (error || !pending || pending.length === 0) return 0 // pre-0056, or nothing new

  // Claim them first: whoever stamps a change is the one who sends it.
  const { data: claimed } = await db.from('booking_changes')
    .update({ alerted_at: new Date().toISOString() })
    .in('id', (pending as { id: string }[]).map((p) => p.id))
    .is('alerted_at', null)
    .select('id, booking_id, changed_at, kind, old_during, new_during, old_facility_id, new_facility_id, detail')
  const rows = ((claimed ?? []) as ChangeRow[]).sort((a, b) => a.changed_at.localeCompare(b.changed_at))
  if (rows.length === 0) return 0

  const names = await roomNames()
  const byBooking = new Map<string, ChangeRow[]>()
  for (const r of rows) byBooking.set(r.booking_id, [...(byBooking.get(r.booking_id) ?? []), r])

  let sent = 0
  for (const [id, list] of byBooking) {
    const resolved = await bookingFactsAny(id)
    if (!resolved) continue
    const changes: CustomerChange[] = list.map((r) => ({
      kind: r.kind,
      at: stamp(r.changed_at),
      oldWhen: rangePhrase(r.old_during),
      newWhen: rangePhrase(r.new_during),
      oldRoom: r.old_facility_id ? names.get(r.old_facility_id) ?? r.old_facility_id : undefined,
      newRoom: r.new_facility_id ? names.get(r.new_facility_id) ?? r.new_facility_id : undefined,
      ...(r.detail ?? {}),
    }))
    const body = customerChangedAlert(resolved.facts, changes, { agreementSigned: resolved.facts.agreementSigned })
    const to = await adminRecipients(resolved.to?.email)
    for (const addr of to) await sendAndLog('booking.customer_changed', addr, body, { bookingId: id })
    sent += 1
  }
  return sent
}
