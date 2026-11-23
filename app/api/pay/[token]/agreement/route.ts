import { NextResponse } from 'next/server'
import { serviceDb, sendAndLog } from '@/lib/server/billing'
import { bookingForToken } from '@/lib/server/pay-links'
import { bookingDoc } from '@/lib/server/booking-card'
import { PHOTO_OPTIONS, type AgreementAnswers } from '@/lib/rental-agreement'
import { fileAgreementRequest, sendChangeRequestsReceived } from '@/lib/server/change-requests'
import { agreementFile } from '@/lib/server/agreement-file'
import { bookingFacts } from '@/lib/server/booking-facts'
import { agreementSignedCopy, agreementResignedAlert } from '@/lib/server/emails'
import { adminRecipients } from '@/lib/server/unpaid-holds'

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

// Ticked rooms or extras, matched EXACTLY against the names on offer —
// never trimmed or shortened, or a long or oddly spaced name would look
// unticked and file a change nobody asked for. Duplicates collapse.
function picks(v: unknown, allowed: string[]): string[] {
  if (!Array.isArray(v)) return []
  return [...new Set(v.filter((s): s is string => typeof s === 'string' && allowed.includes(s)))]
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
    spaces: picks(body.spaces, [...doc.rooms, ...doc.bookedRooms]),
    addons: picks(body.addons, [...doc.addons, ...doc.bookedAddons]),
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
  // A change is only ever filed when the renter said, in so many words,
  // that they're asking for one. Boxes that merely differ — a stray click,
  // a page out of date — are sent back to be confirmed or reset, never
  // passed to our team as a request.
  if (asks && body.requestChange !== true) {
    return NextResponse.json({
      message: 'The rooms or add-ons you checked are different from your booking. To ask our team for that change, tick “Yes, I’m asking to change my rooms or add-ons”. Otherwise press “Reset to my booking”.',
      needsChangeConfirm: true,
    }, { status: 409 })
  }
  const prev = doc.agreement?.answers
  const sameAsBefore = !!prev && same(prev.spaces ?? [], answers.spaces) && same(prev.addons ?? [], answers.addons)
  const row = {
    org_id: doc.orgId,
    booking_id: doc.id,
    answers,
    snapshot,
    signature,
    signed_at: new Date().toISOString(),
    rep_staff_id: null,
    rep_name: null,
    rep_signed_at: null,
  }
  // Signing online replaces any uploaded copy (0059 columns); before 0059
  // those columns don't exist, so the plain row goes in instead.
  let { error } = await serviceDb().from('rental_agreements').upsert({
    ...row, source: 'online', file_path: null, file_name: null, uploaded_by: null,
  }, { onConflict: 'booking_id' })
  if (error && (error.code === '42703' || error.code === 'PGRST204')) {
    ({ error } = await serviceDb().from('rental_agreements').upsert(row, { onConflict: 'booking_id' }))
  }
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
    const [fac, add, cur, held] = await Promise.all([
      db.from('facilities').select('id, name, active'),
      db.from('addons').select('id, name, active'),
      db.from('bookings').select('addon_ids').eq('id', doc.id).maybeSingle(),
      db.rpc('booking_room_ids', { p_booking: doc.id }),
    ])
    type Named = { id: string; name: string; active?: boolean }
    // Names → ids, preferring what's on offer now when two share a name.
    const idFor = (rows: Named[]) => {
      const m = new Map<string, string>()
      for (const r of [...rows].sort((a, b) => Number(a.active !== false) - Number(b.active !== false))) m.set(r.name, r.id)
      return m
    }
    const facRows = (fac.data ?? []) as Named[]
    const addRows = (add.data ?? []) as Named[]
    const roomId = idFor(facRows)
    const addonId = idFor(addRows)
    const roomName = new Map(facRows.map((r) => [r.id, r.name]))
    const addonName = new Map(addRows.map((r) => [r.id, r.name]))
    // Keep the exact ids already booked for every name still ticked, and
    // only look up ids for what was added — so an add-on that was renamed,
    // retired, or shares a name never shows up as a change.
    const heldRooms = ((held.data as string[] | null) ?? [])
    const heldAddons = ((cur.data as { addon_ids?: string[] | null } | null)?.addon_ids ?? [])
    const keepRooms = heldRooms.filter((id) => answers.spaces.includes(roomName.get(id) ?? '\u0000'))
    const newRooms = answers.spaces.filter((n) => !keepRooms.some((id) => roomName.get(id) === n)).map((n) => roomId.get(n)).filter((x): x is string => !!x)
    const keepAddons = heldAddons.filter((id) => !addonName.has(id) || answers.addons.includes(addonName.get(id) as string))
    const newAddons = addonsAdded.map((n) => addonId.get(n)).filter((x): x is string => !!x)
    const filed = await fileAgreementRequest(doc.id, {
      ...(roomsDiffer && answers.spaces.length > 0 ? { roomIds: [...keepRooms, ...newRooms] } : {}),
      ...(addonsAdded.length || addonsDropped.length ? { addonIds: [...new Set([...keepAddons, ...newAddons])] } : {}),
    })
    if (filed) await sendChangeRequestsReceived(doc.id).catch((e) => console.error('[pay/agreement] request emails', e))
  }
  // Re-signing clears a countersignature staff already made — tell them.
  if (doc.agreement?.repName) {
    try {
      const r = await bookingFacts(doc.id)
      if (r) {
        const body = agreementResignedAlert(r.facts, { signer: signature, previousRep: doc.agreement.repName })
        for (const to of await adminRecipients(r.to.email)) await sendAndLog('booking.agreement_resigned', to, body, { bookingId: doc.id })
      }
    } catch (e) { console.error('[pay/agreement] resign alert', e) }
  }
  // Their signed copy, as a PDF, by email — best effort, never blocks.
  try {
    const [file, resolved] = await Promise.all([agreementFile(doc.id), bookingFacts(doc.id)])
    if (file && resolved) {
      await sendAndLog('booking.agreement_signed', resolved.to.email, agreementSignedCopy(resolved.facts), {
        accountId: resolved.b.account_id, bookingId: doc.id,
        attachments: [{ filename: file.filename, content: Buffer.from(file.bytes).toString('base64') }],
      })
    }
  } catch (e) {
    console.error('[pay/agreement] copy email', e)
  }
  return NextResponse.json({ ok: true, changeRequested: asks })
}
