'use client'
// Tours and scheduled events — the calendar entries that aren't room
// rentals. A tour is someone coming to look around before they book;
// events and meetings work the same way. Needs migration 0032.

import { supabase, emit } from '@/lib/supabase'
import { BOOKINGS_EVENT } from '@/lib/staff-bookings-store'
import { notify } from '@/lib/notify-client'

export const EVENTS_EVENT = 'sq-staff-events'

export type EventKind = 'tour' | 'event' | 'meeting' | 'maintenance' | 'other'
export type EventStatus = 'scheduled' | 'completed' | 'canceled' | 'no_show'

export const KIND_LABEL: Record<EventKind, string> = {
  tour: 'Facility tour',
  event: 'Event',
  meeting: 'Meeting',
  maintenance: 'Maintenance',
  other: 'Other',
}

export const KIND_COLOR: Record<EventKind, string> = {
  tour: '#1d9a8f',
  event: '#8a4bbf',
  meeting: '#5b93d6',
  maintenance: '#e07020',
  other: '#64748c',
}

export const STATUS_LABEL: Record<EventStatus, string> = {
  scheduled: 'Scheduled',
  completed: 'Done',
  canceled: 'Canceled',
  no_show: 'No show',
}

export interface StaffEvent {
  id: string
  kind: EventKind
  title: string
  guestName: string
  guestEmail: string | null
  guestPhone: string | null
  partySize: number | null
  facilityId: string | null
  startsAtIso: string
  endsAtIso: string
  dateIso: string // YYYY-MM-DD local
  startH: number
  hours: number
  timeLabel: string // "2 PM – 3 PM"
  assignedStaffId: string | null
  assignedStaffName: string | null
  notes: string
  status: EventStatus
  staffReminderSent: boolean
}

interface Row {
  id: string; kind: EventKind; title: string
  guest_name: string; guest_email: string | null; guest_phone: string | null
  party_size: number | null; facility_id: string | null
  starts_at: string; ends_at: string
  assigned_staff_id: string | null; notes: string; status: EventStatus
  staff_reminder_sent_at: string | null
  staff: { name: string } | null
}

function hour(d: Date): string {
  return d.toLocaleTimeString('en-US', { hour: 'numeric', ...(d.getMinutes() ? { minute: '2-digit' } : {}) })
}

function fromRow(r: Row): StaffEvent {
  const from = new Date(r.starts_at)
  const to = new Date(r.ends_at)
  return {
    id: r.id,
    kind: r.kind,
    title: r.title,
    guestName: r.guest_name,
    guestEmail: r.guest_email,
    guestPhone: r.guest_phone,
    partySize: r.party_size,
    facilityId: r.facility_id,
    startsAtIso: r.starts_at,
    endsAtIso: r.ends_at,
    dateIso: `${from.getFullYear()}-${String(from.getMonth() + 1).padStart(2, '0')}-${String(from.getDate()).padStart(2, '0')}`,
    startH: from.getHours() + from.getMinutes() / 60,
    hours: (to.getTime() - from.getTime()) / 3600_000,
    timeLabel: `${hour(from)} – ${hour(to)}`,
    assignedStaffId: r.assigned_staff_id,
    assignedStaffName: r.staff?.name ?? null,
    notes: r.notes,
    status: r.status,
    staffReminderSent: !!r.staff_reminder_sent_at,
  }
}

const SELECT = 'id, kind, title, guest_name, guest_email, guest_phone, party_size, facility_id, starts_at, ends_at, assigned_staff_id, notes, status, staff_reminder_sent_at, staff:assigned_staff_id(name)'

// Events overlapping a local date window. Null until 0032 runs.
export async function getEvents(fromDateIso: string, toDateIso: string): Promise<StaffEvent[] | null> {
  const from = new Date(`${fromDateIso}T00:00:00`)
  const to = new Date(`${toDateIso}T00:00:00`)
  to.setDate(to.getDate() + 1)
  const { data, error } = await supabase()
    .from('staff_events')
    .select(SELECT)
    .gte('starts_at', from.toISOString())
    .lt('starts_at', to.toISOString())
    .order('starts_at')
    .limit(500)
  if (error) return null
  return (data as unknown as Row[]).map(fromRow)
}

export async function getUpcomingEvents(days = 14): Promise<StaffEvent[] | null> {
  const now = new Date()
  const to = new Date()
  to.setDate(to.getDate() + days)
  const { data, error } = await supabase()
    .from('staff_events')
    .select(SELECT)
    .gte('starts_at', now.toISOString())
    .lt('starts_at', to.toISOString())
    .neq('status', 'canceled')
    .order('starts_at')
    .limit(200)
  if (error) return null
  return (data as unknown as Row[]).map(fromRow)
}

export interface NewEvent {
  kind: EventKind
  title: string
  guestName?: string
  guestEmail?: string
  guestPhone?: string
  partySize?: number | null
  facilityId?: string | null
  date: string // YYYY-MM-DD
  startH: number
  hours: number
  assignedStaffId?: string | null
  notes?: string
  createdBy?: string | null
}

function rangeOf(date: string, startH: number, hours: number): { from: string; to: string } {
  const [y, m, d] = date.split('-').map(Number)
  const from = new Date(y, m - 1, d, Math.floor(startH), Math.round((startH % 1) * 60))
  const to = new Date(from.getTime() + hours * 3600_000)
  return { from: from.toISOString(), to: to.toISOString() }
}


// ── Room holds (0046) ────────────────────────────────────────
// A tour or event that names a room holds it with a real $0 confirmed
// booking, so the store's slot picker and the database's no-overlap
// constraint both defend the space — in both directions. The link lives
// in staff_events.hold_booking_id; before 0046 runs, events simply don't
// hold rooms, exactly as before.

async function holdBookingIdOf(eventId: string): Promise<string | null> {
  const { data, error } = await supabase().from('staff_events').select('hold_booking_id').eq('id', eventId).maybeSingle()
  if (error) return null // pre-0046
  return (data as { hold_booking_id?: string | null } | null)?.hold_booking_id ?? null
}

async function deleteHoldBooking(eventId: string): Promise<void> {
  const bid = await holdBookingIdOf(eventId)
  if (!bid) return
  // price guard: only ever delete the synthetic $0 hold, never real money.
  await supabase().from('bookings').delete().eq('id', bid).eq('price_cents', 0)
  emit(BOOKINGS_EVENT)
}

async function createHoldBooking(o: {
  eventId: string; kind: EventKind; guestName: string; facilityId: string
  fromIso: string; toIso: string; createdBy: string | null
}): Promise<'ok' | 'conflict' | 'error'> {
  const sb = supabase()
  const { data: org } = await sb.from('organizations').select('id').limit(1).single()
  if (!org) return 'error'
  const base = {
    org_id: (org as { id: string }).id,
    facility_id: o.facilityId,
    title: `${KIND_LABEL[o.kind]} (room held)`,
    client_name: o.guestName.trim() || 'SquareOne staff',
    during: `[${o.fromIso},${o.toIso})`,
    status: 'confirmed',
    price_cents: 0,
    created_by: o.createdBy,
    note: `Room held for a scheduled ${KIND_LABEL[o.kind].toLowerCase()} on the Calendar`,
  }
  let res = await sb.from('bookings')
    .insert({ ...base, approved_at: new Date().toISOString(), approved_by: o.createdBy })
    .select('id').single()
  if (res.error && res.error.code !== '23P01') {
    // pre-0033 columns — retry plain
    res = await sb.from('bookings').insert(base).select('id').single()
  }
  if (res.error) return res.error.code === '23P01' ? 'conflict' : 'error'
  const bookingId = (res.data as { id: string }).id
  const { error: linkErr } = await sb.from('staff_events').update({ hold_booking_id: bookingId }).eq('id', o.eventId)
  if (linkErr) {
    // pre-0046: no place to remember the hold — remove it rather than
    // leave an unmanageable orphan on the calendar.
    await sb.from('bookings').delete().eq('id', bookingId)
    return 'error'
  }
  emit(BOOKINGS_EVENT)
  return 'ok'
}

export async function addEvent(e: NewEvent): Promise<{ id: string } | 'conflict' | null> {
  const sb = supabase()
  const { data: org, error: orgErr } = await sb.from('organizations').select('id').limit(1).single()
  if (orgErr) return null
  const { from, to } = rangeOf(e.date, e.startH, e.hours)
  const { data, error } = await sb.from('staff_events').insert({
    org_id: (org as { id: string }).id,
    kind: e.kind,
    title: e.title.trim() || KIND_LABEL[e.kind],
    guest_name: e.guestName?.trim() ?? '',
    guest_email: e.guestEmail?.trim() || null,
    guest_phone: e.guestPhone?.trim() || null,
    party_size: e.partySize ?? null,
    facility_id: e.facilityId || null,
    starts_at: from,
    ends_at: to,
    assigned_staff_id: e.assignedStaffId || null,
    notes: e.notes?.trim() ?? '',
    created_by: e.createdBy ?? null,
  }).select('id').single()
  if (error) {
    console.error('[events]', error.message)
    return null
  }
  const id = (data as { id: string }).id
  // A named room is held with a real $0 booking — the calendar is the
  // gatekeeper here like everywhere else. A conflict unwinds the event.
  if (e.facilityId) {
    const held = await createHoldBooking({
      eventId: id, kind: e.kind, guestName: e.guestName ?? '', facilityId: e.facilityId,
      fromIso: from, toIso: to, createdBy: e.createdBy ?? null,
    })
    if (held === 'conflict') {
      await sb.from('staff_events').delete().eq('id', id)
      return 'conflict'
    }
  }
  emit(EVENTS_EVENT)
  // Tell the staff member they're on it, and the guest that it's booked.
  if (e.assignedStaffId) notify('event.assigned', id)
  if (e.guestEmail?.trim()) notify('event.guest_confirmed', id)
  return { id }
}

export async function patchEvent(id: string, patch: Partial<{
  kind: EventKind; title: string; guestName: string; guestEmail: string | null; guestPhone: string | null
  partySize: number | null; facilityId: string | null; assignedStaffId: string | null
  notes: string; status: EventStatus
}>): Promise<boolean> {
  const fields: Record<string, unknown> = {}
  if (patch.kind !== undefined) fields.kind = patch.kind
  if (patch.title !== undefined) fields.title = patch.title
  if (patch.guestName !== undefined) fields.guest_name = patch.guestName
  if (patch.guestEmail !== undefined) fields.guest_email = patch.guestEmail || null
  if (patch.guestPhone !== undefined) fields.guest_phone = patch.guestPhone || null
  if (patch.partySize !== undefined) fields.party_size = patch.partySize
  if (patch.facilityId !== undefined) fields.facility_id = patch.facilityId || null
  if (patch.notes !== undefined) fields.notes = patch.notes
  if (patch.status !== undefined) fields.status = patch.status
  if (patch.assignedStaffId !== undefined) {
    fields.assigned_staff_id = patch.assignedStaffId || null
    fields.staff_reminder_sent_at = null // a new person needs their own reminder
  }
  if (Object.keys(fields).length === 0) return false
  // Canceling frees the held room; changing the room moves the hold.
  if (patch.status === 'canceled' || (patch.facilityId !== undefined && !patch.facilityId)) {
    await deleteHoldBooking(id)
  } else if (patch.facilityId) {
    const { data: ev } = await supabase().from('staff_events').select('kind, guest_name, starts_at, ends_at, created_by').eq('id', id).maybeSingle()
    const row = ev as { kind: EventKind; guest_name: string; starts_at: string; ends_at: string; created_by: string | null } | null
    if (row) {
      await deleteHoldBooking(id)
      const held = await createHoldBooking({
        eventId: id, kind: row.kind, guestName: row.guest_name, facilityId: patch.facilityId,
        fromIso: row.starts_at, toIso: row.ends_at, createdBy: row.created_by,
      })
      if (held === 'conflict') return false
    }
  }
  const { error } = await supabase().from('staff_events').update(fields).eq('id', id)
  if (error) {
    console.error('[events]', error.message)
    return false
  }
  emit(EVENTS_EVENT)
  if (patch.assignedStaffId) notify('event.assigned', id)
  return true
}

export async function rescheduleEvent(id: string, date: string, startH: number, hours: number): Promise<boolean> {
  const { from, to } = rangeOf(date, startH, hours)
  // Move the room hold first — if the new slot is taken, the database
  // refuses and the event stays put.
  const holdId = await holdBookingIdOf(id)
  if (holdId) {
    const { error: moveErr } = await supabase().from('bookings').update({ during: `[${from},${to})` }).eq('id', holdId)
    if (moveErr) return false
    emit(BOOKINGS_EVENT)
  }
  const { error } = await supabase().from('staff_events')
    .update({ starts_at: from, ends_at: to, staff_reminder_sent_at: null, guest_reminder_sent_at: null })
    .eq('id', id)
  if (error) {
    console.error('[events]', error.message)
    return false
  }
  emit(EVENTS_EVENT)
  notify('event.moved', id)
  return true
}

export async function deleteEvent(id: string): Promise<boolean> {
  await deleteHoldBooking(id)
  const { error } = await supabase().from('staff_events').delete().eq('id', id)
  if (error) {
    console.error('[events]', error.message)
    return false
  }
  emit(EVENTS_EVENT)
  return true
}

// What this staff member is responsible for today.
export async function getMyAssignments(staffId: string, days = 1): Promise<StaffEvent[]> {
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  const end = new Date(start)
  end.setDate(end.getDate() + days)
  const { data, error } = await supabase()
    .from('staff_events')
    .select(SELECT)
    .eq('assigned_staff_id', staffId)
    .gte('starts_at', start.toISOString())
    .lt('starts_at', end.toISOString())
    .neq('status', 'canceled')
    .order('starts_at')
  if (error) return []
  return (data as unknown as Row[]).map(fromRow)
}
