'use client'
// Staff & roles — live from Supabase. "Current staff" is whoever is signed in
// (their linked staff row), fetched via the my_staff() RPC.

import { supabase, tryWrite, emit } from '@/lib/supabase'

export const STAFF_EVENT = 'sq-staff'

export type StaffRole = 'owner' | 'manager' | 'front_desk' | 'coach'

export interface StaffMember {
  id: string
  name: string
  role: StaffRole
  linked: boolean
}

export const ROLE_LABEL: Record<StaffRole, string> = {
  owner: 'Owner',
  manager: 'Manager',
  front_desk: 'Front desk',
  coach: 'Coach',
}

export const ROLE_ACCESS: Record<StaffRole, string> = {
  owner: 'Everything',
  manager: 'Bookings · payments · rooms · reports',
  front_desk: 'Check-in · bookings · take payments · POS',
  coach: 'Programs · rosters',
}

export const CAN_BOOK: StaffRole[] = ['owner', 'manager', 'front_desk']

export async function getStaff(): Promise<StaffMember[]> {
  const { data, error } = await supabase()
    .from('staff')
    .select('id, name, role, user_id, active')
    .eq('active', true)
    .order('name')
  if (error) throw error
  return (data as { id: string; name: string; role: StaffRole; user_id: string | null }[])
    .map((r) => ({ id: r.id, name: r.name, role: r.role, linked: !!r.user_id }))
}

// The signed-in user's own staff row — null when not staff.
export async function getMyStaff(): Promise<StaffMember | null> {
  const { data, error } = await supabase().rpc('my_staff')
  if (error) throw error
  const row = data as { id: string; name: string; role: StaffRole } | null
  return row ? { ...row, linked: true } : null
}

export async function patchStaff(id: string, patch: { name?: string; role?: StaffRole }): Promise<boolean> {
  const ok = await tryWrite(() => supabase().from('staff').update(patch).eq('id', id))
  if (ok) emit(STAFF_EVENT)
  return ok
}

export async function addStaff(name: string, role: StaffRole): Promise<boolean> {
  const { data: org } = await supabase().from('organizations').select('id').limit(1).single()
  const ok = await tryWrite(() => supabase().from('staff').insert({ org_id: (org as { id: string }).id, name, role }))
  if (ok) emit(STAFF_EVENT)
  return ok
}

export async function removeStaff(id: string): Promise<boolean> {
  const ok = await tryWrite(() => supabase().from('staff').update({ active: false }).eq('id', id))
  if (ok) emit(STAFF_EVENT)
  return ok
}

// Owners/managers link a staff row to a login by email.
export async function linkStaffLogin(staffId: string, email: string): Promise<boolean> {
  const { data, error } = await supabase().rpc('link_staff_login', { p_staff_id: staffId, p_email: email })
  if (error) {
    console.error('[staff]', error.message)
    return false
  }
  if (data === true) emit(STAFF_EVENT)
  return data === true
}
