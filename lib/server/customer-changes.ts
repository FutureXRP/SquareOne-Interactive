import { serviceDb, sendAndLog } from '@/lib/server/billing'
import { bookingFactsAny } from '@/lib/server/booking-facts'
import { adminRecipients } from '@/lib/server/unpaid-holds'
import { customerChangedAlert, type CustomerChange } from '@/lib/server/emails'

// Telling the admins whenever a booking is canceled, moved, or changed —
// whoever did it: the customer, a staff member, or the system (0056 log).
// The database logs every move, room change, and cancel in booking_changes;
// this sends the ones the admins haven't heard about yet, one email per
// booking, naming who made each change. Called right after the change and
// again by the hourly job, which catches anything that slipped through.
// Each change is claimed before it's sent, so the two can never both send
// it. Edits the log doesn't cover (price, title, deposit) and deletes are
// announced by alertBookingEdit.

interface ChangeRow {
  id: string
  booking_id: string
  changed_at: string
  actor: 'customer' | 'staff' | 'system'
  changed_by: string | null
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

// Staff and system changes are alerted only while fresh: the log has held
// them unannounced since 0056, and that backlog must not arrive as a flood.
// The hourly job runs well inside this window.
const FRESH_MS = 3 * 60 * 60 * 1000

// A tour or event's synthetic $0 room hold (0046) — calendar plumbing, not
// a customer's booking.
async function isEventRoomHold(bookingId: string): Promise<boolean> {
  const { data, error } = await serviceDb().from('staff_events').select('id').eq('hold_booking_id', bookingId).limit(1)
  return !error && (data ?? []).length > 0
}

// "Alexis Henson (staff)" for a login, "the customer", or "the system".
export async function actorLabel(actor: 'customer' | 'staff' | 'system', userId?: string | null): Promise<string> {
  if (actor === 'customer') return 'the customer'
  if (actor === 'system') return 'the system'
  if (userId) {
    const { data } = await serviceDb().from('staff').select('name').eq('user_id', userId).limit(1).maybeSingle()
    const name = (data as { name?: string } | null)?.name?.trim()
    if (name) return `${name} (staff)`
  }
  return 'staff'
}

// Who a signed-in caller is, for an alert: a staff member's name, else
// "the customer".
export async function callerLabel(userId: string): Promise<string> {
  const { data } = await serviceDb().from('staff').select('name, active').eq('user_id', userId).limit(1).maybeSingle()
  const s = data as { name?: string; active?: boolean } | null
  if (s?.active) return s.name?.trim() ? `${s.name.trim()} (staff)` : 'staff'
  return 'the customer'
}

function upperOf(range: string | null): number | null {
  if (!range) return null
  const m = /,\s*"?([^")\]]+)"?[)\]]$/.exec(range)
  return m ? new Date(m[1]).getTime() : null
}

// Send the admins every booking change they haven't been told about — for
// one booking, or (no id) for all of them. Returns how many emails went out.
export async function alertBookingChanges(bookingId?: string): Promise<number> {
  const db = serviceDb()
  const freshSince = new Date(Date.now() - FRESH_MS).toISOString()
  let q = db.from('booking_changes').select('id')
    .is('alerted_at', null)
    .or(`actor.eq.customer,changed_at.gte.${freshSince}`)
  if (bookingId) q = q.eq('booking_id', bookingId)
  const { data: pending, error } = await q.limit(200)
  if (error || !pending || pending.length === 0) return 0 // pre-0056, or nothing new

  // Claim them first: whoever stamps a change is the one who sends it.
  const { data: claimed } = await db.from('booking_changes')
    .update({ alerted_at: new Date().toISOString() })
    .in('id', (pending as { id: string }[]).map((p) => p.id))
    .is('alerted_at', null)
    .select('id, booking_id, changed_at, actor, changed_by, kind, old_during, new_during, old_facility_id, new_facility_id, detail')
  const rows = ((claimed ?? []) as ChangeRow[])
    // Closing out an event that already happened without ever being paid
    // is bookkeeping, not a cancellation anyone needs to act on.
    .filter((r) => !(r.actor === 'system' && r.kind === 'canceled' && (upperOf(r.old_during) ?? Infinity) <= new Date(r.changed_at).getTime()))
    .sort((a, b) => a.changed_at.localeCompare(b.changed_at))
  if (rows.length === 0) return 0

  const names = await roomNames()
  const byBooking = new Map<string, ChangeRow[]>()
  for (const r of rows) byBooking.set(r.booking_id, [...(byBooking.get(r.booking_id) ?? []), r])

  const labels = new Map<string, string>()
  const labelFor = async (r: ChangeRow) => {
    const key = `${r.actor}:${r.changed_by ?? ''}`
    if (!labels.has(key)) labels.set(key, await actorLabel(r.actor, r.changed_by))
    return labels.get(key) as string
  }

  let sent = 0
  for (const [id, list] of byBooking) {
    if (await isEventRoomHold(id)) continue
    const resolved = await bookingFactsAny(id)
    if (!resolved) continue
    const changes: CustomerChange[] = []
    for (const r of list) {
      changes.push({
        kind: r.kind,
        by: await labelFor(r),
        at: stamp(r.changed_at),
        oldWhen: rangePhrase(r.old_during),
        newWhen: rangePhrase(r.new_during),
        oldRoom: r.old_facility_id ? names.get(r.old_facility_id) ?? r.old_facility_id : undefined,
        newRoom: r.new_facility_id ? names.get(r.new_facility_id) ?? r.new_facility_id : undefined,
        ...(r.detail ?? {}),
      })
    }
    const body = customerChangedAlert(resolved.facts, changes, { agreementSigned: resolved.facts.agreementSigned })
    const to = await adminRecipients(resolved.to?.email)
    for (const addr of to) await sendAndLog('booking.customer_changed', addr, body, { bookingId: id })
    sent += 1
  }
  return sent
}

// Changes the log doesn't record — a price, title, or deposit edit, or a
// booking deleted outright — told to the admins straight away. A delete
// must be announced before the row is gone.
export async function alertBookingEdit(bookingId: string, kind: 'details' | 'deleted', by: string): Promise<boolean> {
  if (await isEventRoomHold(bookingId)) return false
  const resolved = await bookingFactsAny(bookingId)
  if (!resolved) return false
  const body = customerChangedAlert(resolved.facts, [{ kind, by, at: stamp(new Date().toISOString()) }])
  const to = await adminRecipients(resolved.to?.email)
  for (const addr of to) await sendAndLog('booking.customer_changed', addr, body, { bookingId })
  return to.length > 0
}

// An answered change request, told to the admins: approved (with what it
// changed) or declined. Fed by sendChangeDecisions.
export async function alertRequestDecision(bookingId: string, c: Omit<CustomerChange, 'at'> & { at?: string }): Promise<void> {
  const resolved = await bookingFactsAny(bookingId)
  if (!resolved) return
  const body = customerChangedAlert(resolved.facts, [{ ...c, at: c.at ?? stamp(new Date().toISOString()) }], { agreementSigned: resolved.facts.agreementSigned })
  for (const addr of await adminRecipients(resolved.to?.email)) {
    await sendAndLog('booking.customer_changed', addr, body, { bookingId })
  }
}
