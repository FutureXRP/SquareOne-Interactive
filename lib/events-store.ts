'use client'
// Tours and scheduled events — the calendar entries that aren't room
// rentals. A tour is someone coming to look around before they book;
// events and meetings work the same way. Needs migration 0032.

import { supabase, emit } from '@/lib/supabase'
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

export async function addEvent(e: NewEvent): Promise<string | null> {
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
  emit(EVENTS_EVENT)
  // Tell the staff member they're on it, and the guest that it's booked.
  if (e.assignedStaffId) notify('event.assigned', id)
  if (e.guestEmail?.trim()) notify('event.guest_confirmed', id)
  return id
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
