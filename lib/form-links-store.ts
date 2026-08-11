'use client'
// Waiver requirements seen from the other side: the Rooms editor picks which
// waivers a room requires, the Memberships editor picks which waivers a plan
// requires. Both write the same forms.assign_* columns the Forms tab edits,
// so the two views always agree. Empty id-list = required everywhere for
// that flow; the toggle helpers materialize the list when narrowing.

import { supabase, tryWrite, emit } from '@/lib/supabase'

export const FORM_LINKS_EVENT = 'sq-form-links'

export interface FormLink {
  id: string
  name: string
  status: 'active' | 'draft'
  assignTo: 'none' | 'fitness' | 'rentals'
  roomIds: string[]
  planIds: string[]
}

interface Row {
  id: string
  name: string
  status: 'active' | 'draft'
  assign_to: FormLink['assignTo']
  assign_room_ids: string[] | null
  assign_plan_ids?: string[] | null
}

export async function getFormLinks(): Promise<FormLink[]> {
  let res: { data: unknown; error: unknown } = await supabase().from('forms').select('id, name, status, assign_to, assign_room_ids, assign_plan_ids').order('id')
  if (res.error) {
    res = await supabase().from('forms').select('id, name, status, assign_to, assign_room_ids').order('id')
  }
  if (res.error) return [] // assignment migration (0004) not run yet
  return (res.data as unknown as Row[]).map((r) => ({
    id: r.id,
    name: r.name,
    status: r.status,
    assignTo: r.assign_to ?? 'none',
    roomIds: r.assign_room_ids ?? [],
    planIds: r.assign_plan_ids ?? [],
  }))
}

export function roomRequires(f: FormLink, roomId: string): boolean {
  return f.assignTo === 'rentals' && (f.roomIds.length === 0 || f.roomIds.includes(roomId))
}

export function planRequires(f: FormLink, planId: string): boolean {
  return f.assignTo === 'fitness' && (f.planIds.length === 0 || f.planIds.includes(planId))
}

function label(assignTo: FormLink['assignTo'], ids: string[]): string {
  if (assignTo === 'fitness') return ids.length === 0 ? 'Fitness membership signup' : `Fitness signup · ${ids.length} plan${ids.length === 1 ? '' : 's'}`
  if (assignTo === 'rentals') return ids.length === 0 ? 'Room rentals · all rooms' : `Room rentals · ${ids.length} room${ids.length === 1 ? '' : 's'}`
  return 'Not required automatically'
}

async function save(formId: string, assignTo: FormLink['assignTo'], patch: Record<string, unknown>): Promise<boolean> {
  const ok = await tryWrite(() => supabase().from('forms').update({ assign_to: assignTo, ...patch }).eq('id', formId))
  if (ok) emit(FORM_LINKS_EVENT)
  return ok
}

// Toggle whether a room requires this waiver at booking.
export async function setRoomWaiver(f: FormLink, roomId: string, on: boolean, allRoomIds: string[]): Promise<boolean> {
  let ids: string[]
  if (on) {
    if (f.assignTo === 'rentals' && f.roomIds.length === 0) return true // already covers every room
    ids = f.assignTo === 'rentals' ? [...new Set([...f.roomIds, roomId])] : [roomId]
  } else {
    const from = f.assignTo === 'rentals' && f.roomIds.length === 0 ? allRoomIds : f.roomIds
    ids = from.filter((id) => id !== roomId)
    if (ids.length === 0) return save(f.id, 'none', { assign_room_ids: [], linked_to: label('none', []) })
  }
  return save(f.id, 'rentals', { assign_room_ids: ids, linked_to: label('rentals', ids) })
}

// Toggle whether a membership plan requires this waiver at signup.
export async function setPlanWaiver(f: FormLink, planId: string, on: boolean, allPlanIds: string[]): Promise<boolean> {
  let ids: string[]
  if (on) {
    if (f.assignTo === 'fitness' && f.planIds.length === 0) return true // already covers every plan
    ids = f.assignTo === 'fitness' ? [...new Set([...f.planIds, planId])] : [planId]
  } else {
    const from = f.assignTo === 'fitness' && f.planIds.length === 0 ? allPlanIds : f.planIds
    ids = from.filter((id) => id !== planId)
    if (ids.length === 0) return save(f.id, 'none', { assign_plan_ids: [], linked_to: label('none', []) })
  }
  return save(f.id, 'fitness', { assign_plan_ids: ids, linked_to: label('fitness', ids) })
}
