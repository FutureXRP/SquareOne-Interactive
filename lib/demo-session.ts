'use client'
// Client-side demo session — stands in for Supabase Auth + Stripe until the
// real backend lands. Everything lives in localStorage, is clearly labeled
// placeholder in the UI, and never touches a server. Money is integer cents.
// Seeded RNG (mulberry32) anywhere randomness appears, per house rules.

export interface DemoCard {
  brand: string
  last4: string
  exp: string
}

export interface DemoProfile {
  name: string
  email: string
  memberId: string
  planId: 'individual' | 'family' | null
  status: 'active' | 'canceling' | 'none'
  since: string
  renewsOn: string
  card: DemoCard | null
}

export interface DemoBooking {
  id: string
  zoneId: string
  date: string // YYYY-MM-DD
  startH: number
  hours: number
  priceCents: number
  status: 'hold' | 'confirmed'
}

export interface DemoWaiver {
  formId: string
  formName: string
  signedBy: string
  participant: string
  signedOn: string
}

export interface CartItem {
  productId: string
  qty: number
}

const KEY = 'sq-demo-session-v1'

interface Store {
  profile: DemoProfile | null
  bookings: DemoBooking[]
  waivers: DemoWaiver[]
  cart: CartItem[]
}

const EMPTY: Store = { profile: null, bookings: [], waivers: [], cart: [] }

function read(): Store {
  if (typeof window === 'undefined') return EMPTY
  try {
    const raw = window.localStorage.getItem(KEY)
    return raw ? { ...EMPTY, ...JSON.parse(raw) } : EMPTY
  } catch {
    return EMPTY
  }
}

function write(s: Store) {
  window.localStorage.setItem(KEY, JSON.stringify(s))
  window.dispatchEvent(new Event('sq-session'))
}

// ── Seeded RNG (mulberry32) ───────────────────────────────────────
export function hashString(str: string): number {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

export function mulberry32(seed: number) {
  let a = seed >>> 0
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function memberIdFor(email: string): string {
  const rng = mulberry32(hashString(email.toLowerCase()))
  return `SQ-${String(Math.floor(rng() * 9000) + 1000)}-${String(Math.floor(rng() * 900) + 100)}`
}

// ── Session API ───────────────────────────────────────────────────
export function getSession(): Store {
  return read()
}

export function getProfile(): DemoProfile | null {
  return read().profile
}

export function signUp(name: string, email: string): DemoProfile {
  const today = new Date()
  const renew = new Date(today)
  renew.setMonth(renew.getMonth() + 1)
  const profile: DemoProfile = {
    name,
    email,
    memberId: memberIdFor(email),
    planId: null,
    status: 'none',
    since: today.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
    renewsOn: renew.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
    card: null,
  }
  const s = read()
  write({ ...s, profile })
  return profile
}

export function signIn(email: string): DemoProfile {
  // Demo mode: signing in recreates the profile if none is stored.
  const s = read()
  if (s.profile && s.profile.email.toLowerCase() === email.toLowerCase()) return s.profile
  return signUp(email.split('@')[0].replace(/[._]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()), email)
}

export function signOut() {
  const s = read()
  write({ ...s, profile: null })
}

export function updateProfile(patch: Partial<DemoProfile>) {
  const s = read()
  if (!s.profile) return
  write({ ...s, profile: { ...s.profile, ...patch } })
}

export function choosePlan(planId: 'individual' | 'family') {
  updateProfile({ planId, status: 'active' })
}

export function cancelMembership() {
  updateProfile({ status: 'canceling' })
}

export function resumeMembership() {
  updateProfile({ status: 'active' })
}

export function setCard(card: DemoCard) {
  updateProfile({ card })
}

// ── Bookings ──────────────────────────────────────────────────────
export function addBooking(b: Omit<DemoBooking, 'id'>): DemoBooking {
  const s = read()
  const rng = mulberry32(hashString(`${b.zoneId}-${b.date}-${b.startH}`))
  const booking: DemoBooking = { ...b, id: `BK-${Math.floor(rng() * 9000) + 1000}` }
  write({ ...s, bookings: [booking, ...s.bookings] })
  return booking
}

export function getBookings(): DemoBooking[] {
  return read().bookings
}

// ── Waivers ───────────────────────────────────────────────────────
export function addWaiver(w: DemoWaiver) {
  const s = read()
  write({ ...s, waivers: [w, ...s.waivers] })
}

export function getWaivers(): DemoWaiver[] {
  return read().waivers
}

// ── Cart ──────────────────────────────────────────────────────────
export function getCart(): CartItem[] {
  return read().cart
}

export function addToCart(productId: string) {
  const s = read()
  const existing = s.cart.find((c) => c.productId === productId)
  const cart = existing
    ? s.cart.map((c) => (c.productId === productId ? { ...c, qty: c.qty + 1 } : c))
    : [...s.cart, { productId, qty: 1 }]
  write({ ...s, cart })
}

export function setCartQty(productId: string, qty: number) {
  const s = read()
  const cart = qty <= 0
    ? s.cart.filter((c) => c.productId !== productId)
    : s.cart.map((c) => (c.productId === productId ? { ...c, qty } : c))
  write({ ...s, cart })
}

export function clearCart() {
  const s = read()
  write({ ...s, cart: [] })
}
