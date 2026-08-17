'use client'
// Password resets. Anyone can ask for a reset link for their own address;
// owners and admins can send one for a member or staff member, or set a
// temporary password when someone can't get to their email at all.

import { supabase } from '@/lib/supabase'

// Sends the "set a new password" email. Supabase deliberately answers the
// same way whether or not the address exists, so this never reveals who
// has an account.
export async function sendResetEmail(email: string): Promise<{ ok: boolean; error?: string }> {
  const clean = email.trim()
  if (!/.+@.+\..+/.test(clean)) return { ok: false, error: 'That doesn\'t look like an email address.' }
  const redirectTo = `${window.location.origin}/reset`
  const { error } = await supabase().auth.resetPasswordForEmail(clean, { redirectTo })
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

// Used on the /reset page once the emailed link has signed the browser in
// with a recovery session.
export async function setMyPassword(password: string): Promise<{ ok: boolean; error?: string }> {
  if (password.length < 8) return { ok: false, error: 'Use at least 8 characters.' }
  const { error } = await supabase().auth.updateUser({ password })
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

// Changing your own password while signed in. The current one is required
// on purpose: these are household logins shared by a whole family, often
// left signed in on a phone or the front-desk iPad. Without this check,
// anyone who picked up an unlocked device could change the password and
// lock the actual family out of their own account.
//
// Supabase has no "verify my password" call, so we verify the only way
// available — by signing in with it. That returns a fresh session for the
// same user, so a correct current password leaves the member signed in
// exactly as they were.
export async function changeMyPassword(current: string, next: string): Promise<{ ok: boolean; error?: string }> {
  if (next.length < 8) return { ok: false, error: 'Use at least 8 characters.' }
  if (next === current) return { ok: false, error: 'That is the password you already have — pick a different one.' }

  const sb = supabase()
  const { data: session } = await sb.auth.getUser()
  const email = session.user?.email
  if (!email) return { ok: false, error: 'Sign in again — your session expired.' }

  const { error: wrong } = await sb.auth.signInWithPassword({ email, password: current })
  if (wrong) return { ok: false, error: 'That current password isn\'t right.' }

  const { error } = await sb.auth.updateUser({ password: next })
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

async function adminPost(body: Record<string, unknown>): Promise<{ ok: boolean; error?: string; tempPassword?: string }> {
  const { data } = await supabase().auth.getSession()
  const token = data.session?.access_token
  if (!token) return { ok: false, error: 'Sign in again — your session expired.' }
  const res = await fetch('/api/staff/reset-password', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  })
  const json = (await res.json().catch(() => ({}))) as { error?: string; message?: string; tempPassword?: string }
  if (!res.ok) return { ok: false, error: json.message ?? json.error ?? `Failed (${res.status}).` }
  return { ok: true, tempPassword: json.tempPassword }
}

// Owner/Admin: email a reset link to a member or staff member.
export async function adminSendReset(target: { clientId?: string; staffId?: string }): Promise<{ ok: boolean; error?: string }> {
  return adminPost({ ...target, mode: 'email' })
}

// Owner/Admin: set a temporary password and read it back once, for someone
// standing at the desk who can't reach their inbox.
export async function adminSetTempPassword(target: { clientId?: string; staffId?: string }): Promise<{ ok: boolean; error?: string; tempPassword?: string }> {
  return adminPost({ ...target, mode: 'temp' })
}
