import { serviceDb, sendAndLog } from '@/lib/server/billing'
import { bookingFactsAny } from '@/lib/server/booking-facts'
import { adminRecipients } from '@/lib/server/unpaid-holds'
import { rangePhrase, alertRequestDecision } from '@/lib/server/customer-changes'
import {
  changeRequestReceived, changeRequestAlert, changeRequestDecided,
  type ChangeRequestFacts,
} from '@/lib/server/emails'

// Change requests (0057): a customer's move, room change, or extras
// change waits for an owner/admin/manager. This sends the two emails
// around it — "received" (customer + staff) when it's filed, and the
// answer when it's decided. Each email is claimed by stamping its column
// before sending, so the immediate send and the hourly sweep never both
// send it.

interface RequestRow {
  id: string
  booking_id: string
  status: 'pending' | 'approved' | 'declined' | 'withdrawn'
  old_during: string | null
  new_during: string | null
  old_room_ids: string[] | null
  new_room_ids: string[] | null
  old_addon_ids: string[] | null
  new_addon_ids: string[] | null
  decision_note: string | null
}

const COLS = 'id, booking_id, status, old_during, new_during, old_room_ids, new_room_ids, old_addon_ids, new_addon_ids, decision_note'

async function names(): Promise<{ rooms: Map<string, string>; addons: Map<string, string> }> {
  const db = serviceDb()
  const [r, a] = await Promise.all([db.from('facilities').select('id, name'), db.from('addons').select('id, name')])
  return {
    rooms: new Map(((r.data ?? []) as { id: string; name: string }[]).map((x) => [x.id, x.name])),
    addons: new Map(((a.data ?? []) as { id: string; name: string }[]).map((x) => [x.id, x.name])),
  }
}

function factsOf(r: RequestRow, n: { rooms: Map<string, string>; addons: Map<string, string> }): ChangeRequestFacts {
  const room = (id: string) => n.rooms.get(id) ?? id
  const addon = (id: string) => n.addons.get(id) ?? id
  return {
    ...(r.new_during ? { oldWhen: rangePhrase(r.old_during), newWhen: rangePhrase(r.new_during) } : {}),
    ...(r.new_room_ids ? { oldRooms: (r.old_room_ids ?? []).map(room), newRooms: r.new_room_ids.map(room) } : {}),
    ...(r.new_addon_ids ? { oldExtras: (r.old_addon_ids ?? []).map(addon), newExtras: r.new_addon_ids.map(addon) } : {}),
    ...(r.decision_note ? { decisionNote: r.decision_note } : {}),
  }
}

// Rooms that are already taken at the time asked for — what the staff
// email warns about before anyone tries to approve.
async function conflictsFor(r: RequestRow, n: { rooms: Map<string, string> }): Promise<string[]> {
  const during = r.new_during ?? r.old_during
  const rooms = r.new_room_ids ?? r.old_room_ids
  if (!during || !rooms || rooms.length === 0) return []
  const { data, error } = await serviceDb().rpc('booking_group_conflicts', { p_booking: r.booking_id, p_during: during, p_rooms: rooms })
  if (error) return []
  return ((data as string[] | null) ?? []).map((id) => n.rooms.get(id) ?? id)
}

// "We got your request" to the customer and "a request is waiting" to
// staff — for one booking's new requests, or (no id) any not yet sent.
export async function sendChangeRequestsReceived(bookingId?: string): Promise<number> {
  const db = serviceDb()
  let q = db.from('booking_change_requests').select('id').eq('status', 'pending').is('alerted_at', null)
  if (bookingId) q = q.eq('booking_id', bookingId)
  const { data: pending, error } = await q.limit(100)
  if (error || !pending || pending.length === 0) return 0
  const { data: claimed } = await db.from('booking_change_requests')
    .update({ alerted_at: new Date().toISOString() })
    .in('id', (pending as { id: string }[]).map((p) => p.id))
    .is('alerted_at', null)
    .select(COLS)
  const rows = (claimed ?? []) as RequestRow[]
  if (rows.length === 0) return 0
  const n = await names()
  for (const r of rows) {
    const resolved = await bookingFactsAny(r.booking_id)
    if (!resolved) continue
    const facts = factsOf(r, n)
    if (resolved.to) {
      await sendAndLog('booking.change_requested', resolved.to.email, changeRequestReceived(resolved.facts, facts),
        { accountId: resolved.b.account_id, bookingId: r.booking_id })
    }
    const conflicts = await conflictsFor(r, n)
    const alert = changeRequestAlert(resolved.facts, facts, { conflicts })
    for (const addr of await adminRecipients(resolved.to?.email)) {
      await sendAndLog('booking.change_request_alert', addr, alert, { bookingId: r.booking_id })
    }
  }
  return rows.length
}

// The answer, to the customer — for one request, or (no id) any decided
// request whose answer hasn't gone out yet.
export async function sendChangeDecisions(requestId?: string): Promise<number> {
  const db = serviceDb()
  let q = db.from('booking_change_requests').select('id').in('status', ['approved', 'declined']).is('decision_emailed_at', null)
  if (requestId) q = q.eq('id', requestId)
  const { data: pending, error } = await q.limit(100)
  if (error || !pending || pending.length === 0) return 0
  const { data: claimed } = await db.from('booking_change_requests')
    .update({ decision_emailed_at: new Date().toISOString() })
    .in('id', (pending as { id: string }[]).map((p) => p.id))
    .is('decision_emailed_at', null)
    .select(`${COLS}, decided_at, decided_by`)
  const rows = (claimed ?? []) as (RequestRow & { decided_at: string | null; decided_by: string | null })[]
  if (rows.length === 0) return 0
  const n = await names()
  for (const r of rows) {
    const approved = r.status === 'approved'
    const f = factsOf(r, n)
    // The admins hear the answer too, with who gave it. An approval's own
    // moves are logged in the same transaction (same timestamp) — claim
    // them here so the same change isn't announced twice.
    if (approved && r.decided_at) {
      await db.from('booking_changes').update({ alerted_at: new Date().toISOString() })
        .eq('booking_id', r.booking_id).eq('changed_at', r.decided_at).is('alerted_at', null)
    }
    let by = 'staff'
    if (r.decided_by) {
      const { data: st } = await db.from('staff').select('name').eq('id', r.decided_by).maybeSingle()
      const nm = (st as { name?: string } | null)?.name?.trim()
      if (nm) by = `${nm} (staff)`
    }
    await alertRequestDecision(r.booking_id, {
      kind: approved ? 'request_approved' : 'request_declined',
      by,
      oldWhen: f.oldWhen, newWhen: f.newWhen,
      oldRoom: f.oldRooms?.join(', '), newRoom: f.newRooms?.join(', '),
      oldExtras: f.oldExtras, newExtras: f.newExtras,
      note: f.decisionNote,
    }).catch((e) => console.error('[change-requests] admin decision alert', e))

    const resolved = await bookingFactsAny(r.booking_id)
    if (!resolved?.to) continue
    await sendAndLog(approved ? 'booking.change_approved' : 'booking.change_declined', resolved.to.email,
      changeRequestDecided(resolved.facts, f, approved),
      { accountId: resolved.b.account_id, bookingId: r.booking_id })
  }
  return rows.length
}

// The rental agreement asking for different rooms or extras. Replaces any
// earlier agreement request still waiting. Returns whether one was filed.
export async function fileAgreementRequest(bookingId: string, ask: { roomIds?: string[]; addonIds?: string[] }): Promise<boolean> {
  const db = serviceDb()
  const { data: cur } = await db.from('bookings').select('during, addon_ids').eq('id', bookingId).maybeSingle()
  const { data: rooms } = await db.rpc('booking_room_ids', { p_booking: bookingId })
  const row = cur as { during: string; addon_ids?: string[] | null } | null
  if (!row) return false
  await db.from('booking_change_requests').update({ status: 'withdrawn', decided_at: new Date().toISOString() })
    .eq('booking_id', bookingId).eq('status', 'pending').eq('source', 'agreement')
  const { error } = await db.from('booking_change_requests').insert({
    booking_id: bookingId,
    source: 'agreement',
    old_during: row.during,
    old_room_ids: (rooms as string[] | null) ?? [],
    old_addon_ids: row.addon_ids ?? [],
    ...(ask.roomIds ? { new_room_ids: ask.roomIds } : {}),
    ...(ask.addonIds ? { new_addon_ids: ask.addonIds } : {}),
  })
  if (error) { console.error('[change-requests]', error.message); return false }
  return true
}
