import type Stripe from 'stripe'
import { stripe, serviceDb } from '@/lib/server/billing'
import type { AgreementAnswers, AgreementSnapshot } from '@/lib/rental-agreement'

// Everything about a booking's rental agreement and card on file, read
// server-side with the service role. Shared by the pay page, the
// agreement page, and the routes that write to them.

export interface BookingDoc {
  id: string
  orgId: string
  code: string
  accountId: string | null
  status: string
  snapshot: AgreementSnapshot
  bookedRoom: string | null
  // Every room the booking holds — its own plus linked companions (0055).
  bookedRooms: string[]
  bookedAddons: string[]
  // Signed, but the booking's date, time, or rooms have changed since —
  // the renter needs to sign the agreement as it stands now.
  agreementStale: boolean
  rooms: string[] // every active room, for the "spaces reserved" checklist
  addons: string[] // every active add-on
  contactEmail: string | null
  card: { brand: string | null; last4: string; customerId: string | null; pmId: string | null } | null
  agreement: {
    signedAt: string; signature: string; repName: string | null; repSignedAt: string | null
    answers: AgreementAnswers; snapshot: AgreementSnapshot
    // 'online' = signed on the booking page; 'uploaded' = a PDF signed
    // elsewhere that staff attached (0059), kept at filePath.
    source: 'online' | 'uploaded'; filePath: string | null; fileName: string | null
  } | null
}

interface Row {
  id: string; org_id: string; code: string; title: string; client_name: string; during: string
  price_cents: number; status: string; account_id: string | null
  deposit_cents?: number | null
  contact_email?: string | null
  contact_phone?: string | null
  setup_min?: number | null
  cleanup_min?: number | null
  addon_ids?: string[] | null
  card_customer_id?: string | null
  card_pm_id?: string | null
  card_brand?: string | null
  card_last4?: string | null
  facilities: { name: string } | null
  payments: { amount_cents: number; status: string }[]
}

const BASE = 'id, org_id, code, title, client_name, during, price_cents, status, account_id, facilities:facility_id(name), payments(amount_cents, status)'
const COL_SETS = [
  `deposit_cents, contact_email, contact_phone, setup_min, cleanup_min, addon_ids, card_customer_id, card_pm_id, card_brand, card_last4, ${BASE}`,
  `deposit_cents, contact_email, contact_phone, setup_min, cleanup_min, addon_ids, ${BASE}`,
  `deposit_cents, contact_email, ${BASE}`,
  BASE,
]

function hour(d: Date): string {
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: d.getMinutes() ? '2-digit' : undefined, timeZone: 'America/Chicago' })
}

export async function bookingDoc(bookingId: string): Promise<BookingDoc | null> {
  const db = serviceDb()
  let row: Row | null = null
  for (const cols of COL_SETS) {
    const { data, error } = await db.from('bookings').select(cols).eq('id', bookingId).maybeSingle()
    if (!error) { row = data as unknown as Row | null; break }
  }
  if (!row) return null

  const m = /^[[(]"?([^",]+)"?\s*,\s*"?([^")\]]+)"?[)\]]$/.exec(row.during)
  const from = m ? new Date(m[1]) : null
  const to = m ? new Date(m[2]) : null
  const setupMin = row.setup_min ?? 60 // the agreement's default: arrive up to 1 hour early
  const cleanupMin = row.cleanup_min ?? 30 // and out within 30 minutes
  const paid = (row.payments ?? []).filter((p) => p.status === 'paid').reduce((n, p) => n + p.amount_cents, 0)

  // The renter's phone: the booking's own, else the account's primary.
  let phone = row.contact_phone?.trim() || ''
  let email = row.contact_email?.trim() || null
  if ((!phone || !email) && row.account_id) {
    for (const cols of ['full_name, email, phone, is_primary', 'full_name, email, is_primary']) {
      const { data, error } = await db.from('clients').select(cols).eq('account_id', row.account_id)
        .order('is_primary', { ascending: false }).limit(1)
      if (error) continue
      const c = (data as unknown as { email: string | null; phone?: string | null }[] | null)?.[0]
      if (c) { phone = phone || c.phone?.trim() || ''; email = email || c.email?.trim() || null }
      break
    }
  }

  const [roomsRes, addonsRes, agreementRes, compsRes] = await Promise.all([
    db.from('facilities').select('name, active, sort').order('sort'),
    db.from('addons').select('id, name, active'),
    // source/file_* arrive with 0059 (an agreement signed elsewhere, uploaded).
    db.from('rental_agreements').select('signed_at, signature, rep_name, rep_signed_at, answers, snapshot, source, file_path, file_name').eq('booking_id', row.id).maybeSingle()
      .then(async (r) => r.error
        ? db.from('rental_agreements').select('signed_at, signature, rep_name, rep_signed_at, answers, snapshot').eq('booking_id', row.id).maybeSingle()
        : r),
    db.from('bookings').select('status, facilities:facility_id(name)').eq('lead_booking_id', row.id),
  ])
  const companionRooms = compsRes.error ? [] : ((compsRes.data ?? []) as unknown as { status: string; facilities: { name: string } | null }[])
    .filter((c) => c.status === 'hold' || c.status === 'confirmed')
    .map((c) => c.facilities?.name)
    .filter((n): n is string => !!n)
  const bookedRooms = [...new Set([...(row.facilities?.name ? [row.facilities.name] : []), ...companionRooms])]
  const allAddons = (addonsRes.data ?? []) as { id: string; name: string; active?: boolean }[]
  const a = agreementRes.error ? null : agreementRes.data as {
    signed_at: string; signature: string; rep_name: string | null; rep_signed_at: string | null
    answers: AgreementAnswers; snapshot: AgreementSnapshot
    source?: 'online' | 'uploaded'; file_path?: string | null; file_name?: string | null
  } | null

  const snapshot: AgreementSnapshot = {
    renterName: row.client_name,
    phone,
    eventType: row.title,
    eventDate: from ? from.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'America/Chicago' }) : '—',
    timeFrom: from ? hour(from) : '—',
    timeTo: to ? hour(to) : '—',
    setupTime: from ? hour(new Date(from.getTime() - setupMin * 60_000)) : '—',
    leaveTime: to ? hour(new Date(to.getTime() + cleanupMin * 60_000)) : '—',
    totalCents: row.price_cents,
    depositCents: row.deposit_cents ?? 0,
    balanceCents: Math.max(0, row.price_cents - paid),
    code: row.code,
  }
  // The agreement is about a date, a time, and rooms. If any of those
  // moved after signing, what they signed no longer describes the event.
  // (The renter's own ticked spaces are a request, not the booking — the
  // rooms compared are the ones the booking held when they signed.)
  const signedRooms = a?.snapshot?.bookedRooms
  const sameRooms = !signedRooms
    || (signedRooms.length === bookedRooms.length && bookedRooms.every((r) => signedRooms.includes(r)))
  const agreementStale = !!a && (
    a.snapshot?.eventDate !== snapshot.eventDate
    || a.snapshot?.timeFrom !== snapshot.timeFrom
    || a.snapshot?.timeTo !== snapshot.timeTo
    || !sameRooms
  )

  return {
    id: row.id,
    orgId: row.org_id,
    code: row.code,
    accountId: row.account_id,
    status: row.status,
    snapshot,
    bookedRoom: row.facilities?.name ?? null,
    bookedRooms,
    agreementStale,
    bookedAddons: (row.addon_ids ?? []).map((id) => allAddons.find((x) => x.id === id)?.name).filter((n): n is string => !!n),
    rooms: ((roomsRes.data ?? []) as { name: string; active?: boolean }[]).filter((r) => r.active !== false).map((r) => r.name),
    addons: allAddons.filter((x) => x.active !== false).map((x) => x.name),
    contactEmail: email,
    card: row.card_last4
      ? { brand: row.card_brand ?? null, last4: row.card_last4, customerId: row.card_customer_id ?? null, pmId: row.card_pm_id ?? null }
      : null,
    agreement: a
      ? {
        signedAt: a.signed_at, signature: a.signature, repName: a.rep_name, repSignedAt: a.rep_signed_at,
        answers: a.answers, snapshot: a.snapshot,
        source: a.source ?? 'online', filePath: a.file_path ?? null, fileName: a.file_name ?? null,
      }
      : null,
  }
}

// The Stripe customer a booking's card lives under: one already saved on
// the booking, else the member account's, else a fresh customer for a
// guest — remembered on the booking so a second visit reuses it.
export async function ensureBookingCustomer(doc: BookingDoc): Promise<string> {
  const db = serviceDb()
  const s = stripe()
  const usable = async (id: string | null | undefined) => {
    if (!id) return false
    try { const c = await s.customers.retrieve(id); return !c.deleted } catch { return false }
  }
  if (doc.card?.customerId && await usable(doc.card.customerId)) return doc.card.customerId
  if (doc.accountId) {
    const { data } = await db.from('client_accounts').select('stripe_customer_id').eq('id', doc.accountId).maybeSingle()
    const id = (data as { stripe_customer_id: string | null } | null)?.stripe_customer_id
    if (id && await usable(id)) {
      await db.from('bookings').update({ card_customer_id: id }).eq('id', doc.id)
      return id
    }
  }
  const c = await s.customers.create({
    name: doc.snapshot.renterName,
    ...(doc.contactEmail ? { email: doc.contactEmail } : {}),
    ...(doc.snapshot.phone ? { phone: doc.snapshot.phone } : {}),
    metadata: { booking_id: doc.id, booking_code: doc.code, ...(doc.accountId ? { account_id: doc.accountId } : {}) },
  })
  await db.from('bookings').update({ card_customer_id: c.id }).eq('id', doc.id)
  // A member account without a customer adopts this one, so their own
  // later checkouts land on the same customer.
  if (doc.accountId) {
    await db.from('client_accounts').update({ stripe_customer_id: c.id }).eq('id', doc.accountId).is('stripe_customer_id', null)
  }
  return c.id
}

async function storeCard(bookingId: string, customerId: string, pm: Stripe.PaymentMethod): Promise<void> {
  if (!pm.card) return
  await serviceDb().from('bookings').update({
    card_customer_id: customerId,
    card_pm_id: pm.id,
    card_brand: pm.card.brand,
    card_last4: pm.card.last4,
    card_saved_at: new Date().toISOString(),
  }).eq('id', bookingId)
}

// A finished "add a card" Checkout (setup mode). Idempotent — the pay
// page's return trip and the webhook may both call it.
export async function saveCardFromSetupSession(sessionId: string, expectBookingId?: string): Promise<boolean> {
  const s = stripe()
  const session = await s.checkout.sessions.retrieve(sessionId, { expand: ['setup_intent.payment_method'] })
  const bookingId = session.metadata?.booking_id
  if (!bookingId || session.metadata?.kind !== 'booking_card') return false
  if (expectBookingId && bookingId !== expectBookingId) return false
  const si = session.setup_intent
  if (!si || typeof si === 'string' || si.status !== 'succeeded') return false
  const pm = si.payment_method
  const customer = typeof session.customer === 'string' ? session.customer : session.customer?.id
  if (!pm || typeof pm === 'string' || !customer) return false
  await storeCard(bookingId, customer, pm)
  return true
}

// An online payment for a booking doubles as its card on file when no
// card is saved yet — the agreement asks for one, and the card they just
// paid with is the natural one. Only cards Stripe saved for later use
// (setup_future_usage) qualify; anything else can't be charged again.
export async function saveCardFromPaymentIntent(pi: Stripe.PaymentIntent, bookingId: string): Promise<void> {
  try {
    const { data } = await serviceDb().from('bookings').select('card_pm_id').eq('id', bookingId).maybeSingle()
    if (!data || (data as { card_pm_id: string | null }).card_pm_id) return
    if (!pi.setup_future_usage) return
    const customer = typeof pi.customer === 'string' ? pi.customer : pi.customer?.id
    const pmId = typeof pi.payment_method === 'string' ? pi.payment_method : pi.payment_method?.id
    if (!customer || !pmId) return
    const pm = await stripe().paymentMethods.retrieve(pmId)
    await storeCard(bookingId, customer, pm)
  } catch (e) {
    // Pre-0053 or a Stripe hiccup — the payment itself is already recorded.
    console.warn('[booking-card] save from payment skipped', e)
  }
}
