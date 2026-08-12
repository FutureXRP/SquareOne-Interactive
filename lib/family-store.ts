'use client'
// Family on one account — everyone shares the primary member's login,
// but each person is their own clients row so check-ins and the door
// log can tell them apart. Adding/removing people needs migration
// 0020_family_members.sql; reading works from day one.

import { supabase, tryWrite, emit } from '@/lib/supabase'

export const FAMILY_EVENT = 'sq-family'

export interface FamilyMember {
  id: string
  name: string
  isPrimary: boolean
}

// Everyone on the account, primary first.
export async function getFamilyMembers(accountId: string): Promise<FamilyMember[]> {
  const { data, error } = await supabase()
    .from('clients')
    .select('id, full_name, is_primary, created_at')
    .eq('account_id', accountId)
    .order('is_primary', { ascending: false })
    .order('created_at', { ascending: true })
  if (error) return []
  return (data as { id: string; full_name: string; is_primary: boolean }[]).map((r) => ({
    id: r.id,
    name: r.full_name,
    isPrimary: r.is_primary,
  }))
}

// False when RLS says no — i.e. 0020 hasn't been run yet.
export async function addFamilyMember(accountId: string, name: string): Promise<boolean> {
  const trimmed = name.trim()
  if (!trimmed) return false
  const ok = await tryWrite(() => supabase().from('clients').insert({
    account_id: accountId,
    full_name: trimmed,
    is_primary: false,
  }))
  if (ok) emit(FAMILY_EVENT)
  return ok
}

export async function renameFamilyMember(id: string, name: string): Promise<boolean> {
  const trimmed = name.trim()
  if (!trimmed) return false
  const ok = await tryWrite(() => supabase().from('clients').update({ full_name: trimmed }).eq('id', id))
  if (ok) emit(FAMILY_EVENT)
  return ok
}

export async function removeFamilyMember(id: string): Promise<boolean> {
  const ok = await tryWrite(() => supabase().from('clients').delete().eq('id', id))
  if (ok) emit(FAMILY_EVENT)
  return ok
}
