import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { serviceDb } from '@/lib/server/billing'
import { applyEmailOverrides } from '@/lib/server/email-overrides'
import {
  bookingHeld, bookingApproved, bookingConfirmed, bookingPayment, bookingRescheduled,
  bookingUpdated, bookingCanceled, bookingRemoved, bookingStaffAssigned,
  paymentReceipt, paymentVoided, refundIssued,
  membershipWelcome, membershipStaffAlert, membershipChanged, renewalReceipt, paymentFailed,
  membershipCanceled, membershipResumed, membershipEnded,
  eventAssigned, eventReminderStaff, eventGuestConfirmed, eventGuestReminder, eventMoved,
  type BookingFacts, type EventFacts, type EmailBody,
} from '@/lib/server/emails'

// What each email currently looks like: the real template, rendered with
// sample facts, with any staff wording from the Email health tab applied
// on top — exactly the assembly a live send goes through. The sample
// numbers are obviously samples; nothing here is sent anywhere.

async function callerStaff(req: Request): Promise<boolean> {
  const token = req.headers.get('authorization')?.replace(/^Bearer /, '')
  if (!token) return false
  const anon = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
    { global: { headers: { Authorization: `Bearer ${token}` } } },
  )
  const { data } = await anon.auth.getUser()
  const userId = data?.user?.id
  if (!userId) return false
  const { data: row } = await serviceDb().from('staff').select('id, active').eq('user_id', userId).maybeSingle()
  return !!(row as { active: boolean } | null)?.active
}

const SAMPLE_BOOKING: BookingFacts = {
  code: 'BK-1234',
  room: 'Gym/Multipurpose Room',
  what: 'Birthday party',
  date: 'Saturday, September 12',
  time: '2 PM – 5 PM',
  priceCents: 30000,
  paidCents: 10000,
  depositCents: 10000,
  name: 'Jordan Alvarez',
  addons: undefined,
  payUrl: undefined,
}

const SAMPLE_EVENT: EventFacts = {
  kind: 'Facility tour',
  title: 'Facility tour — the Rivera family',
  date: 'Saturday, September 12',
  time: '2 PM – 3 PM',
  guestName: 'Sam Rivera',
  partySize: 4,
  room: 'Front lobby',
  notes: 'Interested in birthday packages.',
  staffName: 'Alexis Henson',
}

function sampleFor(kind: string): EmailBody | null {
  const b = SAMPLE_BOOKING
  switch (kind) {
    case 'booking.hold': return bookingHeld(b)
    case 'booking.approved': return bookingApproved(b)
    case 'booking.confirmed': return bookingConfirmed(b)
    case 'booking.payment': return bookingPayment(b, { amountCents: 10000, method: 'Card', code: 'PM-1234' })
    case 'booking.rescheduled': return bookingRescheduled(b)
    case 'booking.updated': return bookingUpdated(b)
    case 'booking.canceled': return bookingCanceled({ ...b, canceledVia: 'member' })
    case 'booking.deleted': return bookingRemoved(b)
    case 'booking.staff_assigned': return bookingStaffAssigned(b, { staffName: 'Alexis Henson', payoutCents: 5000 })
    case 'payment.receipt': return paymentReceipt({ name: 'Jordan Alvarez', amountCents: 10000, method: 'Card', what: 'Birthday party · BK-1234', code: 'PM-1234', balanceCents: 20000 })
    case 'payment.voided': return paymentVoided(b, { amountCents: 10000, method: 'Cash App', code: 'PM-1234' })
    case 'refund.issued': return refundIssued({ name: 'Jordan Alvarez', amountCents: 5000, method: 'stripe', what: 'Birthday party · BK-1234', reason: 'Rained out' })
    case 'membership.welcome': return membershipWelcome({ name: 'Jordan Alvarez', plan: 'Family' })
    case 'membership.staff_alert': return membershipStaffAlert({ name: 'Jordan Alvarez', email: 'jordan@example.com', plan: 'Family' })
    case 'membership.changed': return membershipChanged({ name: 'Jordan Alvarez', plan: 'Individual', priceCents: 4500, period: 'month' })
    case 'membership.renewed': return renewalReceipt({ name: 'Jordan Alvarez', plan: 'Family', amountCents: 7500, nextOn: 'October 12' })
    case 'membership.payment_failed': return paymentFailed({ name: 'Jordan Alvarez', amountCents: 7500 })
    case 'membership.canceled': return membershipCanceled({ name: 'Jordan Alvarez', endsOn: 'October 12' })
    case 'membership.resumed': return membershipResumed({ name: 'Jordan Alvarez' })
    case 'membership.ended': return membershipEnded({ name: 'Jordan Alvarez' })
    case 'password.reset_by_staff': return {
      subject: 'Your SquareOne password was reset',
      html: `<p>Hi Jordan,</p>
             <p>Alexis Henson set a temporary password on your SquareOne Interactive account at your request.
             You'll be given it in person — please change it once you're signed in.</p>
             <p>If you didn't ask for this, reply to this email right away.</p>`,
    }
    case 'event.assigned': return eventAssigned(SAMPLE_EVENT)
    case 'event.reminder_staff': return eventReminderStaff(SAMPLE_EVENT, 'tomorrow')
    case 'event.guest_confirmed': return eventGuestConfirmed(SAMPLE_EVENT)
    case 'event.reminder_guest': return eventGuestReminder(SAMPLE_EVENT, 'tomorrow')
    case 'event.moved': return eventMoved(SAMPLE_EVENT, false)
    default: return null
  }
}

export async function POST(req: Request) {
  if (!(await callerStaff(req))) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { kind } = (await req.json().catch(() => ({}))) as { kind?: string }
  if (!kind) return NextResponse.json({ error: 'bad_request' }, { status: 400 })
  const body = sampleFor(kind)
  if (!body) return NextResponse.json({ error: 'unknown_kind' }, { status: 404 })
  // fresh: previews must reflect an edit saved a second ago, not the
  // 30-second send cache.
  const final = await applyEmailOverrides(kind, body, { fresh: true })
  return NextResponse.json({ subject: final.subject, html: final.html })
}
