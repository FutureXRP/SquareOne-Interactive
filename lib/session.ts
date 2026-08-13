'use client'
// Live member session — Supabase Auth + the member RPCs. The 'sq-session'
// window event fires on any auth or profile change, same contract the UI
// already listens for. The shopping cart stays device-local (normal for
// carts); saved cards stay local until Stripe arrives.

import { supabase, emit, isSupabaseConfigured } from '@/lib/supabase'
import { notify } from '@/lib/notify-client'

export const SESSION_EVENT = 'sq-session'

export interface ProfileCard {
  brand: string
  last4: string
  exp: string
}

export interface Profile {
  accountId: string
  name: string
  email: string
  memberId: string
  planId: string | null
  status: 'active' | 'canceling' | 'none'
  since: string
  renewsOn: string
  balanceCents: number
  card: ProfileCard | null
}

let authHooked = false
function hookAuth() {
  if (authHooked || typeof window === 'undefined' || !isSupabaseConfigured()) return
  authHooked = true
  supabase().auth.onAuthStateChange(() => emit(SESSION_EVENT))
}

// ── Auth ─────────────────────────────────────────────────────
export async function signUpAuth(name: string, email: string, password: string):
  Promise<{ ok: boolean; needsConfirm: boolean; error?: string }> {
  hookAuth()
  const { data, error } = await supabase().auth.signUp({ email, password })
  if (error) return { ok: false, needsConfirm: false, error: error.message }
  if (!data.session) return { ok: true, needsConfirm: true } // email confirmation is on
  await supabase().rpc('ensure_my_account', { p_full_name: name })
  emit(SESSION_EVENT)
  return { ok: true, needsConfirm: false }
}

export async function signInAuth(email: string, password: string): Promise<{ ok: boolean; error?: string }> {
  hookAuth()
  const { error } = await supabase().auth.signInWithPassword({ email, password })
  if (error) return { ok: false, error: error.message }
  await supabase().rpc('ensure_my_account', { p_full_name: '' })
  emit(SESSION_EVENT)
  return { ok: true }
}

export async function signOut() {
  await supabase().auth.signOut()
  emit(SESSION_EVENT)
}

export async function isSignedIn(): Promise<boolean> {
  if (!isSupabaseConfigured()) return false
  hookAuth()
  const { data } = await supabase().auth.getSession()
  return !!data.session
}

// ── Profile ──────────────────────────────────────────────────
interface ProfileRpc {
  account_id: string
  full_name: string
  email: string
  member_code: string
  since: string
  plan_id: string | null
  status: string | null
  renews_on: string | null
  balance_cents: number
}

const CARD_KEY = 'sq-card-v1' // stays local until Stripe

export async function getProfile(): Promise<Profile | null> {
  if (!(await isSignedIn())) return null
  const { data, error } = await supabase().rpc('my_profile')
  if (error) {
    console.error('[session]', error.message)
    return null
  }
  const p = data as ProfileRpc | null
  if (!p) return null
  let card: ProfileCard | null = null
  try {
    const raw = window.localStorage.getItem(CARD_KEY)
    card = raw ? JSON.parse(raw) : null
  } catch { /* ignore */ }
  const live = p.status === 'active' || p.status === 'past_due'
  return {
    accountId: p.account_id,
    name: p.full_name,
    email: p.email,
    memberId: p.member_code,
    planId: p.plan_id && (live || p.status === 'canceling') ? p.plan_id : null,
    status: live ? 'active' : p.status === 'canceling' ? 'canceling' : 'none',
    since: p.since,
    renewsOn: p.renews_on ?? '—',
    balanceCents: p.balance_cents,
    card,
  }
}

export async function updateProfileName(name: string): Promise<boolean> {
  const { error } = await supabase().rpc('ensure_my_account', { p_full_name: name })
  if (error) return false
  emit(SESSION_EVENT)
  return true
}

export async function choosePlan(planId: string): Promise<boolean> {
  const { error } = await supabase().rpc('set_my_plan', { p_plan_id: planId })
  if (error) {
    console.error('[session]', error.message)
    return false
  }
  emit(SESSION_EVENT)
  return true
}

export async function cancelMembership() {
  await supabase().rpc('cancel_my_membership')
  emit(SESSION_EVENT)
  notify('membership.canceled', 'me') // only reached when Stripe isn't live
}

export async function resumeMembership() {
  await supabase().rpc('resume_my_membership')
  emit(SESSION_EVENT)
  notify('membership.resumed', 'me')
}

export function setCard(card: ProfileCard) {
  window.localStorage.setItem(CARD_KEY, JSON.stringify(card))
  emit(SESSION_EVENT)
}

// ── Member bookings ──────────────────────────────────────────
export interface MemberBooking {
  id: string
  code: string
  roomId: string
  title: string
  date: string
  startH: number
  hours: number
  priceCents: number
  paidCents: number
  depositCents: number | null
  status: string
  // null = still a reservation in review; undefined = 0033 not run yet
  approvedAt?: string | null
  note?: string | null
}

export async function getMyBookings(): Promise<MemberBooking[]> {
  // RLS scopes this to the member's own account.
  const sets = [
    'id, code, facility_id, title, during, price_cents, status, note, deposit_cents, approved_at, payments(amount_cents, status)',
    'id, code, facility_id, title, during, price_cents, status, note, deposit_cents, payments(amount_cents, status)',
    'id, code, facility_id, title, during, price_cents, status, payments(amount_cents, status)',
  ]
  interface Row {
    id: string; code: string; facility_id: string; title?: string; during: string
    price_cents: number; status: string; note?: string | null
    deposit_cents?: number | null; approved_at?: string | null
    payments: { amount_cents: number; status: string }[]
  }
  let rows: Row[] | null = null
  for (const cols of sets) {
    const res = await supabase().from('bookings').select(cols).order('during', { ascending: false }).limit(20)
    if (!res.error) { rows = res.data as unknown as Row[]; break }
  }
  if (!rows) throw new Error('bookings query failed')
  return rows.flatMap((r) => {
    const m = /^[\[(]"?([^",]+)"?\s*,\s*"?([^")\]]+)"?[)\]]$/.exec(r.during)
    if (!m) return []
    const from = new Date(m[1])
    const to = new Date(m[2])
    return [{
      id: r.id,
      code: r.code,
      roomId: r.facility_id,
      title: r.title ?? 'Room rental',
      date: `${from.getFullYear()}-${String(from.getMonth() + 1).padStart(2, '0')}-${String(from.getDate()).padStart(2, '0')}`,
      startH: from.getHours() + from.getMinutes() / 60,
      hours: (to.getTime() - from.getTime()) / 3600_000,
      priceCents: r.price_cents,
      paidCents: (r.payments ?? []).filter((p) => p.status === 'paid').reduce((n, p) => n + p.amount_cents, 0),
      depositCents: r.deposit_cents ?? null,
      status: r.status,
      approvedAt: 'approved_at' in r ? (r.approved_at ?? null) : undefined,
      note: r.note ?? null,
    }]
  })
}

export async function requestMemberHold(roomId: string, title: string, date: string, startH: number, hours: number, priceCents: number, depositCents?: number | null, note?: string, addonIds?: string[]):
  Promise<{ ok: true; code: string; id: string } | { ok: false; conflict: boolean; addonConflict?: boolean }> {
  const profile = await getProfile()
  if (!profile) return { ok: false, conflict: false }
  const sb = supabase()
  const { data: org } = await sb.from('organizations').select('id').limit(1).single()
  const [y, mo, d] = date.split('-').map(Number)
  const from = new Date(y, mo - 1, d, Math.floor(startH), Math.round((startH % 1) * 60))
  const to = new Date(from.getTime() + hours * 3600_000)
  const base = {
    org_id: (org as { id: string }).id,
    facility_id: roomId,
    account_id: profile.accountId,
    title,
    client_name: profile.name,
    during: `[${from.toISOString()},${to.toISOString()})`,
    status: 'hold',
    price_cents: priceCents,
    hold_expires_at: new Date(Date.now() + 24 * 3600_000).toISOString(),
    ...(depositCents !== undefined ? { deposit_cents: depositCents } : {}),
    ...(note ? { note } : {}),
  }
  const withAddons = addonIds && addonIds.length > 0
  const payload = (withAddons ? { ...base, addon_ids: addonIds } : base) as typeof base
  let res = await sb.from('bookings').insert(payload).select('id, code').single()
  // addon_ids arrives with 0022 — before it runs, retry the plain insert.
  if (res.error && withAddons && (res.error.code === '42703' || res.error.code === 'PGRST204')) {
    res = await sb.from('bookings').insert(base).select('id, code').single()
  }
  if (res.error) {
    const conflict = res.error.code === '23P01'
    if (!conflict) console.error('[session]', res.error.message)
    return { ok: false, conflict, addonConflict: conflict && res.error.message.includes('addon_conflict') }
  }
  emit(SESSION_EVENT)
  const row = res.data as { id: string; code: string }
  notify('booking.hold', row.id) // confirmation email, never blocks the booking
  return { ok: true, code: row.code, id: row.id }
}

// ── My bookings: cancel and move ─────────────────────────────

export async function cancelMyBooking(id: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase().rpc('member_cancel_booking', { p_id: id })
  if (error) return { ok: false, error: error.message }
  emit(SESSION_EVENT)
  notify('booking.canceled', id)
  return { ok: true }
}

export async function rescheduleMyBooking(id: string, date: string, startH: number, hours: number):
  Promise<{ ok: boolean; conflict?: boolean; error?: string }> {
  const [y, mo, d] = date.split('-').map(Number)
  const from = new Date(y, mo - 1, d, Math.floor(startH), Math.round((startH % 1) * 60))
  const to = new Date(from.getTime() + hours * 3600_000)
  const { error } = await supabase().rpc('member_reschedule_booking', {
    p_id: id, p_from: from.toISOString(), p_to: to.toISOString(),
  })
  if (error) {
    // The exclusion constraint means somebody else holds that slot.
    if (error.code === '23P01' || error.message.includes('conflict')) return { ok: false, conflict: true }
    return { ok: false, error: error.message }
  }
  emit(SESSION_EVENT)
  notify('booking.rescheduled', id)
  return { ok: true }
}

// ── Waivers ──────────────────────────────────────────────────
export interface SignedWaiver {
  formId: string
  formName: string
  participant: string
  signedOn: string
}

export async function getMyWaivers(): Promise<SignedWaiver[]> {
  // form_name is the name we stored at signing (0034); the live form name
  // is the fallback for anything signed before that.
  const sets = [
    'form_id, participant, signed_at, form_name, forms(name)',
    'form_id, participant, signed_at, forms(name)',
  ]
  interface Row { form_id: string; participant: string; signed_at: string; form_name?: string | null; forms: { name: string } | null }
  let rows: Row[] | null = null
  for (const cols of sets) {
    const res = await supabase().from('form_submissions').select(cols).order('signed_at', { ascending: false })
    if (!res.error) { rows = res.data as unknown as Row[]; break }
  }
  if (!rows) throw new Error('waivers query failed')
  return rows.map((r) => ({
    formId: r.form_id,
    formName: r.form_name || r.forms?.name || r.form_id,
    participant: r.participant,
    signedOn: new Date(r.signed_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
  }))
}

export async function hasWaiver(formId: string): Promise<boolean> {
  const { data, error } = await supabase().from('form_submissions').select('id').eq('form_id', formId).limit(1)
  if (error) return false
  return (data as unknown[]).length > 0
}

// `snapshot` is the waiver exactly as it appeared on screen. Stored with
// the signature so the record survives later edits to the form — what they
// agreed to is what we keep.
export async function signWaiver(
  formId: string,
  signedBy: string,
  participant: string,
  responses?: Record<string, string[]>,
  snapshot?: { name: string; terms: string[] },
): Promise<boolean> {
  const profile = await getProfile()
  const base = {
    form_id: formId,
    account_id: profile?.accountId ?? null,
    signed_by: signedBy,
    participant,
    signature: signedBy,
  }
  const withResponses = responses && Object.keys(responses).length > 0
  // Each extra column arrives with its own migration (responses 0013,
  // the snapshot 0034); a missing one must never cost us a signature.
  const attempts = [
    {
      ...base,
      ...(withResponses ? { responses } : {}),
      ...(snapshot ? { form_name: snapshot.name, signed_terms: snapshot.terms } : {}),
    },
    { ...base, ...(withResponses ? { responses } : {}) },
    base,
  ]
  let error: { code?: string; message: string } | null = null
  for (const payload of attempts) {
    const res = await supabase().from('form_submissions').insert(payload as typeof base)
    error = res.error
    if (!error || (error.code !== 'PGRST204' && error.code !== '42703')) break
  }
  if (error) {
    console.error('[session]', error.message)
    return false
  }
  emit(SESSION_EVENT)
  return true
}

// ── Cart (device-local, as carts are) ────────────────────────
export interface CartItem {
  productId: string
  qty: number
}

const CART_KEY = 'sq-cart-v1'

export function getCart(): CartItem[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(CART_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function saveCart(cart: CartItem[]) {
  window.localStorage.setItem(CART_KEY, JSON.stringify(cart))
  emit(SESSION_EVENT)
}

export function addToCart(productId: string) {
  const cart = getCart()
  const hit = cart.find((c) => c.productId === productId)
  saveCart(hit
    ? cart.map((c) => (c.productId === productId ? { ...c, qty: c.qty + 1 } : c))
    : [...cart, { productId, qty: 1 }])
}

export function setCartQty(productId: string, qty: number) {
  const cart = getCart()
  saveCart(qty <= 0 ? cart.filter((c) => c.productId !== productId) : cart.map((c) => (c.productId === productId ? { ...c, qty } : c)))
}

export function clearCart() {
  saveCart([])
}
