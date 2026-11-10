import { NextResponse } from 'next/server'
import { serviceDb } from '@/lib/server/billing'
import { bookingForToken } from '@/lib/server/pay-links'
import { bookingDoc } from '@/lib/server/booking-card'
import { PHOTO_OPTIONS, type AgreementAnswers } from '@/lib/rental-agreement'
import { fileAgreementRequest, sendChangeRequestsReceived } from '@/lib/server/change-requests'

// Signs the Event Rental Agreement for one booking. Same authorization as
// the pay page: holding the booking's link is the permission, so guests
// booked at the desk can sign without an account. Everything is checked
// here — a form that skipped an initial in the browser is refused. The
// event details and totals are frozen into the record as they stand now,
// so a later change can't rewrite what the renter agreed to. Signing
// again replaces the earlier signature and clears any countersignature.

function text(v: unknown, max = 200): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : ''
}

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const found = await bookingForToken(token)
  if (!found) return NextResponse.json({ message: 'This link isn’t valid.' }, { status: 404 })
  if (found.row.status === 'canceled') return NextResponse.json({ message: 'That booking has been canceled.' }, { status: 409 })

  const doc = await bookingDoc(found.row.id)
  if (!doc) return NextResponse.json({ message: 'Booking not found.' }, { status: 404 })

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const initialsIn = (body.initials ?? {}) as Record<string, unknown>
  const answers: AgreementAnswers = {
    address: text(body.address, 300),
    guestCount: Math.max(0, Math.min(5000, Math.round(Number(body.guestCount) || 0))),
    spaces: (Array.isArray(body.spaces) ? body.spaces : []).map((s) => text(s, 80)).filter((s) => doc.rooms.includes(s) || doc.bookedRooms.includes(s)),
    addons: (Array.isArray(body.addons) ? body.addons : []).map((s) => text(s, 80)).filter((s) => doc.addons.includes(s) || doc.bookedAddons.includes(s)),
    initials: {
      guidelines: text(initialsIn.guidelines, 8),
      expectations: text(initialsIn.expectations, 8),
      fees: text(initialsIn.fees, 8),
    },
    photoPermission: PHOTO_OPTIONS.some((o) => o.id === body.photoPermission)
      ? body.photoPermission as AgreementAnswers['photoPermission']
      : ('' as AgreementAnswers['photoPermission']),
  }
  const signature = text(body.signature, 120)
  const phone = text(body.phone, 40)

  const missing: string[] = []
  if (!answers.address) missing.push('your address')
  if (!phone && !doc.snapshot.phone) missing.push('a phone number')
  if (answers.guestCount < 1) missing.push('an estimated guest count')
  if (answers.spaces.length === 0) missing.push('at least one space')
  if (!answers.initials.guidelines) missing.push('your initials on Guidelines')
  if (!answers.initials.expectations) missing.push('your initials on Renter Expectations')
  if (!answers.initials.fees) missing.push('your initials on Fees & Payment')
  if (!answers.photoPermission) missing.push('a photo permission choice')
  if (signature.length < 2) missing.push('your signature (type your full name)')
  if (body.agree !== true) missing.push('the box confirming you agree')
  if (missing.length > 0) {
    return NextResponse.json({ message: `Still needed: ${missing.join(', ')}.` }, { status: 400 })
  }

  const snapshot = { ...doc.snapshot, phone: phone || doc.snapshot.phone, bookedRooms: doc.bookedRooms }

  // Spaces or extras other than what's booked are a REQUEST — the booking
  // doesn't change until the desk confirms. Staff hear about it now, once
  // per new request (re-signing the same ask doesn't re-send it).
  const same = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x))
  const roomsDiffer = !same(answers.spaces, doc.bookedRooms)
  const addonsAdded = answers.addons.filter((x) => !doc.bookedAddons.includes(x))
  const addonsDropped = doc.bookedAddons.filter((x) => !answers.addons.includes(x))
  const asks = roomsDiffer || addonsAdded.length > 0 || addonsDropped.length > 0
  const prev = doc.agreement?.answers
  const sameAsBefore = !!prev && same(prev.spaces ?? [], answers.spaces) && same(prev.addons ?? [], answers.addons)
  const { error } = await serviceDb().from('rental_agreements').upsert({
    org_id: doc.orgId,
    booking_id: doc.id,
    answers,
    snapshot,
    signature,
    signed_at: new Date().toISOString(),
    rep_staff_id: null,
    rep_name: null,
    rep_signed_at: null,
  }, { onConflict: 'booking_id' })
  if (error) {
    console.error('[pay/agreement]', error.message)
    return NextResponse.json({
      message: error.code === '42P01'
        ? 'Online agreements aren’t switched on yet — please sign the paper copy at the front desk.'
        : 'Could not save your agreement — please try again.',
    }, { status: 500 })
  }
  // A phone given here fills a booking that had none.
  if (phone && !doc.snapshot.phone) {
    await serviceDb().from('bookings').update({ contact_phone: phone }).eq('id', doc.id)
  }
  // A different set of rooms or extras is a change request (0057): it
  // waits for an admin, and the renter is told it's under review.
  if (asks && !sameAsBefore) {
    const db = serviceDb()
    const [fac, add] = await Promise.all([db.from('facilities').select('id, name'), db.from('addons').select('id, name')])
    const roomId = new Map(((fac.data ?? []) as { id: string; name: string }[]).map((r) => [r.name, r.id]))
    const addonId = new Map(((add.data ?? []) as { id: string; name: string }[]).map((r) => [r.name, r.id]))
    const filed = await fileAgreementRequest(doc.id, {
      ...(roomsDiffer && answers.spaces.length > 0
        ? { roomIds: answers.spaces.map((n) => roomId.get(n)).filter((x): x is string => !!x) }
        : {}),
      ...(addonsAdded.length || addonsDropped.length
        ? { addonIds: answers.addons.map((n) => addonId.get(n)).filter((x): x is string => !!x) }
        : {}),
    })
    if (filed) await sendChangeRequestsReceived(doc.id).catch((e) => console.error('[pay/agreement] request emails', e))
  }
  return NextResponse.json({ ok: true, changeRequested: asks })
}
