import { NextResponse } from 'next/server'
import { getStaffCaller, serviceDb } from '@/lib/server/billing'
import { bookingDoc } from '@/lib/server/booking-card'
import { AGREEMENT_BUCKET } from '@/lib/server/agreement-file'

// Staff attach a rental agreement that was signed OUTSIDE the system — a
// PDF e-signed elsewhere or a scan of the paper form (0059). From then on
// the booking counts as signed everywhere: the booking page, the board,
// the emails. Uploading again replaces it. A companion room's agreement
// lives on its lead booking, so an upload against a companion lands there.

const MAX_BYTES = 10 * 1024 * 1024

export async function POST(req: Request) {
  const caller = await getStaffCaller(req)
  if (!caller) return NextResponse.json({ message: 'Staff only.' }, { status: 401 })

  const form = await req.formData().catch(() => null)
  if (!form) return NextResponse.json({ message: 'Send the file as a form upload.' }, { status: 400 })
  let bookingId = String(form.get('booking') ?? '')
  const signer = String(form.get('signer') ?? '').trim().slice(0, 120)
  const signedOn = String(form.get('signedOn') ?? '').trim()
  const file = form.get('file')
  if (!/^[0-9a-f-]{36}$/i.test(bookingId)) return NextResponse.json({ message: 'Missing booking.' }, { status: 400 })
  if (signer.length < 2) return NextResponse.json({ message: 'Type the name of the person who signed it.' }, { status: 400 })
  if (!(file instanceof File) || file.size === 0) return NextResponse.json({ message: 'Choose the signed PDF to upload.' }, { status: 400 })
  if (file.size > MAX_BYTES) return NextResponse.json({ message: 'That file is over 10 MB — save a smaller PDF and try again.' }, { status: 400 })
  const bytes = new Uint8Array(await file.arrayBuffer())
  // A real PDF starts "%PDF" — refuse anything else, whatever it's named.
  if (!(bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46)) {
    return NextResponse.json({ message: 'That isn’t a PDF. Upload the signed agreement as a PDF file.' }, { status: 400 })
  }

  const db = serviceDb()
  const { data: lead } = await db.from('bookings').select('lead_booking_id').eq('id', bookingId).maybeSingle()
  const leadId = (lead as { lead_booking_id?: string | null } | null)?.lead_booking_id
  if (leadId) bookingId = leadId

  const doc = await bookingDoc(bookingId)
  if (!doc) return NextResponse.json({ message: 'Booking not found.' }, { status: 404 })

  const path = `${bookingId}/${Date.now()}.pdf`
  const up = await db.storage.from(AGREEMENT_BUCKET).upload(path, bytes, { contentType: 'application/pdf', upsert: false })
  if (up.error) {
    console.error('[agreement-upload]', up.error.message)
    return NextResponse.json({
      message: /bucket/i.test(up.error.message)
        ? 'Agreement uploads aren’t switched on yet — run migration 0059 first.'
        : 'Could not store the file — please try again.',
    }, { status: 500 })
  }

  // Noon Central on the day it was signed (or now), so the date never
  // slips a day in either timezone.
  const signedAt = /^\d{4}-\d{2}-\d{2}$/.test(signedOn) ? new Date(`${signedOn}T12:00:00-06:00`) : new Date()
  const { error } = await db.from('rental_agreements').upsert({
    org_id: doc.orgId,
    booking_id: bookingId,
    source: 'uploaded',
    file_path: path,
    file_name: file.name.slice(0, 200),
    uploaded_by: caller.id,
    signature: signer,
    signed_at: signedAt.toISOString(),
    answers: {
      address: '', guestCount: 0, spaces: doc.bookedRooms, addons: doc.bookedAddons,
      initials: { guidelines: '', expectations: '', fees: '' }, photoPermission: '',
    },
    snapshot: { ...doc.snapshot, bookedRooms: doc.bookedRooms },
    rep_staff_id: null, rep_name: null, rep_signed_at: null,
  }, { onConflict: 'booking_id' })
  if (error) {
    console.error('[agreement-upload]', error.message)
    await db.storage.from(AGREEMENT_BUCKET).remove([path])
    return NextResponse.json({
      message: error.code === '42703' || error.code === 'PGRST204'
        ? 'Agreement uploads aren’t switched on yet — run migration 0059 first.'
        : 'Could not attach the agreement — please try again.',
    }, { status: 500 })
  }
  return NextResponse.json({ ok: true, bookingId })
}
