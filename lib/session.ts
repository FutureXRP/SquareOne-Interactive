'use client'
// Live member session — Supabase Auth + the member RPCs. The 'sq-session'
// window event fires on any auth or profile change, same contract the UI
// already listens for. The shopping cart stays device-local (normal for
// carts); saved cards stay local until Stripe arrives.

import { supabase, emit, isSupabaseConfigured } from '@/lib/supabase'

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
}

export async function resumeMembership() {
  await supabase().rpc('resume_my_membership')
  emit(SESSION_EVENT)
}

export function setCard(card: ProfileCard) {
  window.localStorage.setItem(CARD_KEY, JSON.stringify(card))
  emit(SESSION_EVENT)
}

// ── Member bookings ──────────────────────────────────────────
export interface MemberBooking {
  code: string
  roomId: string
  date: string
  startH: number
  hours: number
  priceCents: number
  status: string
}

export async function getMyBookings(): Promise<MemberBooking[]> {
  // RLS scopes this to the member's own account.
  const { data, error } = await supabase()
    .from('bookings')
    .select('code, facility_id, during, price_cents, status')
    .order('during', { ascending: false })
    .limit(20)
  if (error) throw error
  interface Row { code: string; facility_id: string; during: string; price_cents: number; status: string }
  return (data as Row[]).flatMap((r) => {
    const m = /^[\[(]"?([^",]+)"?\s*,\s*"?([^")\]]+)"?[)\]]$/.exec(r.during)
    if (!m) return []
    const from = new Date(m[1])
    const to = new Date(m[2])
    return [{
      code: r.code,
      roomId: r.facility_id,
      date: `${from.getFullYear()}-${String(from.getMonth() + 1).padStart(2, '0')}-${String(from.getDate()).padStart(2, '0')}`,
      startH: from.getHours() + from.getMinutes() / 60,
      hours: (to.getTime() - from.getTime()) / 3600_000,
      priceCents: r.price_cents,
      status: r.status,
    }]
  })
}

export async function requestMemberHold(roomId: string, title: string, date: string, startH: number, hours: number, priceCents: number, depositCents?: number | null, note?: string):
  Promise<{ ok: true; code: string } | { ok: false; conflict: boolean }> {
  const profile = await getProfile()
  if (!profile) return { ok: false, conflict: false }
  const sb = supabase()
  const { data: org } = await sb.from('organizations').select('id').limit(1).single()
  const [y, mo, d] = date.split('-').map(Number)
  const from = new Date(y, mo - 1, d, Math.floor(startH), Math.round((startH % 1) * 60))
  const to = new Date(from.getTime() + hours * 3600_000)
  const { data, error } = await sb.from('bookings').insert({
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
  }).select('code').single()
  if (error) {
    const conflict = error.code === '23P01'
    if (!conflict) console.error('[session]', error.message)
    return { ok: false, conflict }
  }
  emit(SESSION_EVENT)
  return { ok: true, code: (data as { code: string }).code }
}

// ── Waivers ──────────────────────────────────────────────────
export interface SignedWaiver {
  formId: string
  formName: string
  participant: string
  signedOn: string
}

export async function getMyWaivers(): Promise<SignedWaiver[]> {
  const { data, error } = await supabase()
    .from('form_submissions')
    .select('form_id, participant, signed_at, forms(name)')
    .order('signed_at', { ascending: false })
  if (error) throw error
  interface Row { form_id: string; participant: string; signed_at: string; forms: { name: string } | null }
  return (data as unknown as Row[]).map((r) => ({
    formId: r.form_id,
    formName: r.forms?.name ?? r.form_id,
    participant: r.participant,
    signedOn: new Date(r.signed_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
  }))
}

export async function hasWaiver(formId: string): Promise<boolean> {
  const { data, error } = await supabase().from('form_submissions').select('id').eq('form_id', formId).limit(1)
  if (error) return false
  return (data as unknown[]).length > 0
}

export async function signWaiver(formId: string, signedBy: string, participant: string, responses?: Record<string, string[]>): Promise<boolean> {
  const profile = await getProfile()
  const base = {
    form_id: formId,
    account_id: profile?.accountId ?? null,
    signed_by: signedBy,
    participant,
    signature: signedBy,
  }
  const withResponses = responses && Object.keys(responses).length > 0
  const payload = (withResponses ? { ...base, responses } : base) as typeof base
  let { error } = await supabase().from('form_submissions').insert(payload)
  // responses column arrives with migration 0013 — never lose a signature over it
  if (error && withResponses && error.code === 'PGRST204') {
    ;({ error } = await supabase().from('form_submissions').insert(base))
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
