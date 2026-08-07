'use client'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Browser Supabase client (lazy singleton). The whole app is client-rendered
// for data, so one browser client with localStorage sessions is all we need;
// RLS is the security boundary.

let client: SupabaseClient | null = null

export function isSupabaseConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
}

export function supabase(): SupabaseClient {
  if (!client) {
    if (!isSupabaseConfigured()) {
      throw new Error('Supabase is not configured — set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.')
  }
    client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL as string,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
    )
  }
  return client
}

// Fire-and-log wrapper for UI writes: shows the real error in the console and
// returns false instead of throwing mid-render.
export async function tryWrite(op: () => PromiseLike<{ error: { message: string } | null }>): Promise<boolean> {
  try {
    const { error } = await op()
    if (error) {
      console.error('[supabase]', error.message)
      return false
    }
    return true
  } catch (e) {
    console.error('[supabase]', e)
    return false
  }
}

export function emit(event: string) {
  window.dispatchEvent(new Event(event))
}
