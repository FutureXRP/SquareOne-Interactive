// Turns a staff_events row into the facts an email needs, resolved
// entirely server-side. Shared by the notify route and the reminder run
// so both describe an event the same way.

import { serviceDb } from '@/lib/server/billing'
import type { EventFacts } from '@/lib/server/emails'

const KIND_LABEL: Record<string, string> = {
  tour: 'Facility tour',
  event: 'Event',
  meeting: 'Meeting',
  maintenance: 'Maintenance',
  other: 'Scheduled visit',
}

// The building is in Tulsa; every time in an email should read local.
const TZ = 'America/Chicago'

export interface EventRow {
  id: string
  kind: string
  title: string
  guest_name: string
  guest_email: string | null
  party_size: number | null
  starts_at: string
  ends_at: string
  notes: string
  status: string
  assigned_staff_id: string | null
  staff_reminder_sent_at: string | null
  guest_reminder_sent_at: string | null
  facilities: { name: string } | null
  staff: { name: string; user_id: string | null } | null
}

export const EVENT_SELECT =
  'id, kind, title, guest_name, guest_email, party_size, starts_at, ends_at, notes, status, assigned_staff_id, staff_reminder_sent_at, guest_reminder_sent_at, facilities:facility_id(name), staff:assigned_staff_id(name, user_id)'

function hour(d: Date): string {
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: TZ })
    .replace(':00', '')
}

export function factsFrom(r: EventRow): EventFacts {
  const from = new Date(r.starts_at)
  const to = new Date(r.ends_at)
  return {
    kind: KIND_LABEL[r.kind] ?? 'Visit',
    title: r.title,
    date: from.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: TZ }),
    time: `${hour(from)} – ${hour(to)}`,
    guestName: r.guest_name,
    partySize: r.party_size,
    room: r.facilities?.name ?? null,
    notes: r.notes,
    staffName: r.staff?.name ?? '',
  }
}

// The staff member's own login email, looked up through auth.
async function staffEmail(userId: string | null): Promise<string | null> {
  if (!userId) return null
  const { createClient } = await import('@supabase/supabase-js')
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
  const { data } = await admin.auth.admin.getUserById(userId)
  return data?.user?.email ?? null
}

export async function eventFacts(id: string): Promise<{
  e: EventRow
  facts: EventFacts
  staffEmail: string | null
  guestEmail: string | null
} | null> {
  const { data, error } = await serviceDb().from('staff_events').select(EVENT_SELECT).eq('id', id).maybeSingle()
  if (error || !data) return null
  const e = data as unknown as EventRow
  return {
    e,
    facts: factsFrom(e),
    staffEmail: await staffEmail(e.staff?.user_id ?? null),
    guestEmail: e.guest_email,
  }
}

export async function emailForStaffUser(userId: string | null): Promise<string | null> {
  return staffEmail(userId)
}
