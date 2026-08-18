// Every transactional email the store sends, in one place: one shared
// shell so they all look like SquareOne, and one function per event so
// the wording lives next to the thing that triggers it.

const NAVY = '#182740'
const BLUE = '#2f6db8'
const INK = '#1c2b3f'
const SUB = '#5b6b82'
const LINE = '#dbe4f0'

function money(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}

function siteLink(path = ''): string {
  const base = (process.env.NEXT_PUBLIC_SITE_URL || '').replace(/\/$/, '')
  return `${base}${path}`
}

// Shared shell: header bar, body, sign-off. Plain tables and inline
// styles because that is what email clients actually render.
function shell(heading: string, body: string, cta?: { label: string; href: string }): string {
  return `<!doctype html><html><body style="margin:0;padding:0;background:#f4f7fb;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f7fb;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid ${LINE};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
        <tr><td style="background:${NAVY};padding:18px 26px;">
          <span style="color:#ffffff;font-size:16px;font-weight:800;letter-spacing:-0.02em;">SquareOne Interactive</span>
        </td></tr>
        <tr><td style="padding:26px 26px 8px;">
          <h1 style="margin:0 0 12px;font-size:19px;line-height:1.35;color:${INK};font-weight:800;letter-spacing:-0.02em;">${heading}</h1>
          <div style="font-size:14px;line-height:1.6;color:${SUB};">${body}</div>
        </td></tr>
        ${cta ? `<tr><td style="padding:6px 26px 22px;">
          <a href="${cta.href}" style="display:inline-block;background:${BLUE};color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;padding:11px 22px;border-radius:9px;">${cta.label}</a>
        </td></tr>` : '<tr><td style="height:14px"></td></tr>'}
        <tr><td style="padding:16px 26px 22px;border-top:1px solid ${LINE};">
          <p style="margin:0;font-size:12px;line-height:1.6;color:#8a98ab;">
            SquareOne Interactive · part of SquareOne Compassion, a 501(c)(3) nonprofit · Tulsa, OK<br>
            Questions? Just reply to this email and a person will read it.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`
}

function detailRows(rows: [string, string][]): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:14px 0;width:100%;border-collapse:collapse;">
    ${rows.map(([k, v]) => `<tr>
      <td style="padding:6px 0;font-size:13px;color:#8a98ab;width:42%;">${k}</td>
      <td style="padding:6px 0;font-size:13.5px;color:${INK};font-weight:600;">${v}</td>
    </tr>`).join('')}
  </table>`
}

export interface EmailBody { subject: string; html: string }

export interface BookingFacts {
  code: string
  room: string
  what: string
  date: string // "Saturday, August 23"
  time: string // "2 PM – 5 PM"
  priceCents: number
  paidCents: number
  depositCents?: number | null
  name: string
  addons?: string
  // Direct link that pays this one booking, no sign-in needed. Undefined
  // until migration 0037 has run.
  payUrl?: string
  // How it ended (0038): who the customer hears it from matters.
  canceledVia?: 'staff' | 'member' | 'hold_expired'
  canceledByName?: string
}

// The button on any email about a booking with money still owed. Sends
// them straight to paying that booking rather than to the front door of
// the site to go looking for it. Falls back to the account page when the
// pay-link migration hasn't run, and for anyone who owes nothing.
function bookingCta(b: BookingFacts, paidLabel = 'View my booking'): { label: string; href: string } {
  const owed = Math.max(b.priceCents - b.paidCents, 0)
  if (owed <= 0 || !b.payUrl) return { label: paidLabel, href: siteLink('/account') }
  const depositDue = b.depositCents && b.depositCents > 0 ? Math.max(b.depositCents - b.paidCents, 0) : 0
  const due = depositDue > 0 && depositDue < owed ? depositDue : owed
  return { label: `Pay ${money(due)} now`, href: b.payUrl }
}

export function bookingHeld(b: BookingFacts): EmailBody {
  const due = b.depositCents && b.depositCents > 0 ? b.depositCents : b.priceCents
  return {
    subject: `We're holding ${b.room} for you — ${b.date}`,
    html: shell(
      `Your spot is on hold, ${b.name.split(' ')[0]}`,
      `<p style="margin:0 0 6px;">Thanks for booking with us. Here's what we're holding:</p>
       ${detailRows([
         ['Confirmation', b.code],
         ['Room', b.room],
         ['What', b.what],
         ['When', `${b.date}, ${b.time}`],
         ...(b.addons ? [['Extras', b.addons] as [string, string]] : []),
         ['Total', money(b.priceCents)],
         ...(b.paidCents > 0 ? [['Paid so far', money(b.paidCents)] as [string, string]] : []),
       ])}
       <p style="margin:0 0 6px;"><strong style="color:${INK};">This is a hold, not a confirmed booking yet.</strong>
       It locks in once we have ${money(due)}${b.depositCents && b.depositCents > 0 ? ' as a deposit' : ''}.
       Holds expire after 24 hours so the room doesn't sit empty.</p>
       <p style="margin:10px 0 0;">Need to change something? Reply here or call the front desk — we're happy to move things around.</p>`,
      bookingCta(b),
    ),
  }
}

export function bookingConfirmed(b: BookingFacts): EmailBody {
  return {
    subject: `Confirmed — ${b.room} on ${b.date}`,
    html: shell(
      `You're all set, ${b.name.split(' ')[0]}`,
      `<p style="margin:0 0 6px;">Your booking is confirmed and the room is yours.</p>
       ${detailRows([
         ['Confirmation', b.code],
         ['Room', b.room],
         ['What', b.what],
         ['When', `${b.date}, ${b.time}`],
         ...(b.addons ? [['Extras', b.addons] as [string, string]] : []),
         ['Total', money(b.priceCents)],
         ['Paid', money(b.paidCents)],
         ...(b.priceCents > b.paidCents ? [['Balance due', money(b.priceCents - b.paidCents)] as [string, string]] : []),
       ])}
       <p style="margin:0;">Come a few minutes early so we can get you settled. If anyone in your party hasn't
       signed a waiver yet, they can do it at the door.</p>`,
      bookingCta(b),
    ),
  }
}

// Staff signed off on a reservation that was sitting in review. This is
// the email the customer has actually been waiting for — a person looked
// at their request and said yes.
export function bookingApproved(b: BookingFacts): EmailBody {
  const owed = Math.max(b.priceCents - b.paidCents, 0)
  const due = b.depositCents && b.depositCents > 0 ? Math.max(b.depositCents - b.paidCents, 0) : owed
  return {
    subject: `Approved — ${b.room} on ${b.date}`,
    html: shell(
      `Your reservation is approved, ${b.name.split(' ')[0]}`,
      `<p style="margin:0 0 6px;">One of our team looked over your request and the room is yours.</p>
       ${detailRows([
         ['Confirmation', b.code],
         ['Room', b.room],
         ['What', b.what],
         ['When', `${b.date}, ${b.time}`],
         ...(b.addons ? [['Extras', b.addons] as [string, string]] : []),
         ['Total', money(b.priceCents)],
         ['Paid so far', money(b.paidCents)],
         ...(owed > 0 ? [['Balance due', money(owed)] as [string, string]] : []),
       ])}
       ${owed > 0
         ? `<p style="margin:0 0 6px;">You can pay ${due > 0 && due < owed ? `the ${money(due)} deposit` : 'the balance'}
            with the button below — no account, no phone call, no waiting until you get here.</p>`
         : `<p style="margin:0 0 6px;">You're paid in full, so there's nothing left to do but show up.</p>`}
       <p style="margin:10px 0 0;">Come a few minutes early so we can get you settled. Anyone in your party
       without a signed waiver can take care of it at the door.</p>`,
      bookingCta(b),
    ),
  }
}

// A staff member has been put on a booking to run it. Their shift, not
// the customer's confirmation — so it carries what they need to show up
// prepared, and what they'll be paid if a payout is set.
export function bookingStaffAssigned(b: BookingFacts, s: { staffName: string; payoutCents?: number | null }): EmailBody {
  return {
    subject: `You're running ${b.what} — ${b.date}`,
    html: shell(
      `You're on for this one, ${s.staffName.split(' ')[0]}`,
      `<p style="margin:0 0 6px;">You've been assigned to run a booking.</p>
       ${detailRows([
         ['What', b.what],
         ['Room', b.room],
         ['When', `${b.date}, ${b.time}`],
         ['Booked for', b.name],
         ['Confirmation', b.code],
         ...(b.addons ? [['Extras to set up', b.addons] as [string, string]] : []),
         ...(s.payoutCents && s.payoutCents > 0 ? [['You earn', money(s.payoutCents)] as [string, string]] : []),
       ])}
       <p style="margin:0;">If you can't make it, tell a manager so it can be handed to someone else.</p>`,
      { label: 'Open the schedule', href: siteLink('/admin/bookings') },
    ),
  }
}

export function bookingCanceled(b: BookingFacts): EmailBody {
  // Say plainly who ended it. "You asked us to cancel" reads very
  // differently from "we had to cancel" — and an email that doesn't say
  // which one leaves the customer guessing at the worst moment.
  const opening =
    b.canceledVia === 'member'
      ? `<p style="margin:0 0 6px;">As you requested, this booking is canceled:</p>`
    : b.canceledVia === 'hold_expired'
      ? `<p style="margin:0 0 6px;">The 24-hour hold on this booking ran out before payment arrived, so the room has been released:</p>`
    : b.canceledVia === 'staff'
      ? `<p style="margin:0 0 6px;">${b.canceledByName ? `${b.canceledByName} at SquareOne` : 'Our team'} canceled this booking:</p>`
      : `<p style="margin:0 0 6px;">We've canceled this booking:</p>`
  return {
    subject: `Canceled — ${b.room} on ${b.date}`,
    html: shell(
      'Your booking is canceled',
      opening + `
       ${detailRows([
         ['Confirmation', b.code],
         ['Room', b.room],
         ['When', `${b.date}, ${b.time}`],
         ...(b.paidCents > 0 ? [['Paid', money(b.paidCents)] as [string, string]] : []),
       ])}
       ${b.paidCents > 0
         ? `<p style="margin:0 0 6px;">You paid ${money(b.paidCents)} on this booking. If a refund is owed,
            we'll send it back to how you paid and you'll get a separate email confirming it.</p>`
         : ''}
       <p style="margin:0;">If this was a mistake, reply and we'll get you rebooked.</p>`,
      { label: 'Book another time', href: siteLink('/facilities') },
    ),
  }
}

// One email covers both halves of paying for a booking: a deposit that
// locks the slot in, and the payment that settles it. The wording flips
// on whether anything is still owed.
export function bookingPayment(b: BookingFacts, pay: { amountCents: number; method: string; code: string }): EmailBody {
  const owed = Math.max(b.priceCents - b.paidCents, 0)
  const settled = owed === 0
  return {
    subject: settled
      ? `Paid in full — ${b.room} on ${b.date}`
      : `Deposit received — ${b.room} on ${b.date}`,
    html: shell(
      settled ? `You're all set, ${b.name.split(' ')[0]}` : `Deposit received — you're locked in`,
      `<p style="margin:0 0 6px;">${settled
        ? 'Your booking is paid in full and the room is yours.'
        : `Thanks — your deposit is in and the room is held for you. The rest is due before your event.`}</p>
       ${detailRows([
         ['Receipt', pay.code],
         ['Paid now', `${money(pay.amountCents)} by ${pay.method}`],
         ['Confirmation', b.code],
         ['Room', b.room],
         ['When', `${b.date}, ${b.time}`],
         ...(b.addons ? [['Extras', b.addons] as [string, string]] : []),
         ['Booking total', money(b.priceCents)],
         ['Paid so far', money(b.paidCents)],
         ...(settled ? [] : [['Still due', money(owed)] as [string, string]]),
       ])}
       <p style="margin:0;">${settled
         ? 'Come a few minutes early so we can get you settled. Anyone in your party without a signed waiver can do it at the door.'
         : 'You can pay the balance any time before your event — online or at the front desk.'}</p>`,
      { label: 'View my booking', href: siteLink('/account') },
    ),
  }
}

// A staff correction: a payment recorded by mistake was struck from the
// books. The customer may already hold a receipt email for it, so the
// correction names that receipt and shows where the booking truly stands
// now — the facts are read after the void, so the totals are current.
export function paymentVoided(b: BookingFacts, pay: { amountCents: number; method: string; code: string }): EmailBody {
  const owed = Math.max(b.priceCents - b.paidCents, 0)
  return {
    subject: `Correction — a payment record was removed on ${b.code}`,
    html: shell(
      'A payment record was corrected',
      `<p style="margin:0 0 6px;">A ${money(pay.amountCents)} ${pay.method} payment (receipt ${pay.code})
        was recorded on your booking by mistake, and our team has removed it. If you received a
        receipt email for it, please disregard that one.</p>
       ${detailRows([
         ['Confirmation', b.code],
         ['Room', b.room],
         ['When', `${b.date}, ${b.time}`],
         ['Booking total', money(b.priceCents)],
         ['Paid so far', money(b.paidCents)],
         ...(owed > 0 ? [['Still due', money(owed)] as [string, string]] : []),
       ])}
       <p style="margin:0;">${owed > 0
         ? 'If you actually did send this payment, call the front desk and we’ll match it up right away.'
         : 'Your booking remains paid in full — nothing further to do.'}</p>`,
      bookingCta(b),
    ),
  }
}

export function bookingRescheduled(b: BookingFacts): EmailBody {
  return {
    subject: `Moved — ${b.room} is now ${b.date}`,
    html: shell(
      'Your booking has moved',
      `<p style="margin:0 0 6px;">Here's where it stands now:</p>
       ${detailRows([
         ['Confirmation', b.code],
         ['Room', b.room],
         ['New date', b.date],
         ['New time', b.time],
         ['Total', money(b.priceCents)],
         ...(b.paidCents > 0 ? [['Paid so far', money(b.paidCents)] as [string, string]] : []),
       ])}
       <p style="margin:0;">Anything you've already paid moves with it. If this isn't what you expected,
       reply to this email or call the front desk and we'll sort it out.</p>`,
      { label: 'View my booking', href: siteLink('/account') },
    ),
  }
}

export function bookingUpdated(b: BookingFacts): EmailBody {
  const owed = Math.max(b.priceCents - b.paidCents, 0)
  return {
    subject: `Updated — ${b.room} on ${b.date}`,
    html: shell(
      'Your booking was updated',
      `<p style="margin:0 0 6px;">We changed something on your booking. Here it is as it stands now:</p>
       ${detailRows([
         ['Confirmation', b.code],
         ['Room', b.room],
         ['When', `${b.date}, ${b.time}`],
         ['Total', money(b.priceCents)],
         ...(b.paidCents > 0 ? [['Paid so far', money(b.paidCents)] as [string, string]] : []),
         ...(owed > 0 ? [['Still due', money(owed)] as [string, string]] : []),
       ])}
       <p style="margin:0;">If any of that looks wrong, reply and we'll fix it.</p>`,
      { label: 'View my booking', href: siteLink('/account') },
    ),
  }
}

export function bookingRemoved(b: BookingFacts): EmailBody {
  return {
    subject: `Removed — ${b.room} on ${b.date}`,
    html: shell(
      'Your booking has been removed',
      `<p style="margin:0 0 6px;">This booking is no longer on our calendar:</p>
       ${detailRows([
         ['Confirmation', b.code],
         ['Room', b.room],
         ['When', `${b.date}, ${b.time}`],
         ...(b.paidCents > 0 ? [['Paid', money(b.paidCents)] as [string, string]] : []),
       ])}
       ${b.paidCents > 0
         ? `<p style="margin:0 0 6px;">You paid ${money(b.paidCents)}. If a refund is owed we'll send it back
            to how you paid, and you'll get a separate email confirming it.</p>`
         : ''}
       <p style="margin:0;">If this was a mistake, reply right away and we'll get you back on the calendar.</p>`,
      { label: 'Book another time', href: siteLink('/facilities') },
    ),
  }
}

export function paymentReceipt(o: {
  name: string; amountCents: number; method: string; what: string; code: string
  balanceCents?: number
}): EmailBody {
  return {
    subject: `Receipt — ${money(o.amountCents)} to SquareOne Interactive`,
    html: shell(
      `Thanks, ${o.name.split(' ')[0]} — payment received`,
      `${detailRows([
        ['Receipt', o.code],
        ['For', o.what],
        ['Amount', money(o.amountCents)],
        ['Paid by', o.method],
        ...(o.balanceCents && o.balanceCents > 0
          ? [['Balance remaining', money(o.balanceCents)] as [string, string]]
          : []),
      ])}
      <p style="margin:0;">Keep this for your records. ${o.balanceCents && o.balanceCents > 0
        ? 'The balance can be paid any time before your event, online or at the desk.'
        : 'You\'re paid in full.'}</p>`,
      { label: 'View my account', href: siteLink('/account') },
    ),
  }
}

export function refundIssued(o: {
  name: string; amountCents: number; method: string; what: string; reason: string
}): EmailBody {
  const card = o.method === 'stripe'
  return {
    subject: `Refund sent — ${money(o.amountCents)}`,
    html: shell(
      'Your refund is on the way',
      `${detailRows([
        ['Refunded', money(o.amountCents)],
        ['For', o.what],
        ['Back via', card ? 'The card you paid with' : o.method],
        ...(o.reason ? [['Reason', o.reason] as [string, string]] : []),
      ])}
      <p style="margin:0;">${card
        ? 'Card refunds usually appear on your statement within 5–10 business days, depending on your bank.'
        : 'This was returned to you directly.'}</p>`,
    ),
  }
}

// ── Tours & scheduled events ─────────────────────────────────

export interface EventFacts {
  kind: string // "Facility tour"
  title: string
  date: string // "Saturday, August 23"
  time: string // "2 PM – 3 PM"
  guestName: string
  partySize: number | null
  room: string | null
  notes: string
  staffName: string
}

function eventRows(e: EventFacts, forStaff: boolean): [string, string][] {
  return [
    ['What', e.title],
    ['When', `${e.date}, ${e.time}`],
    ...(e.room ? [['Where', e.room] as [string, string]] : []),
    ...(forStaff && e.guestName ? [['Who’s coming', e.guestName] as [string, string]] : []),
    ...(forStaff && e.partySize ? [['Party size', String(e.partySize)] as [string, string]] : []),
    ...(forStaff && e.notes ? [['Notes', e.notes] as [string, string]] : []),
  ]
}

// To the staff member: you're running this.
export function eventAssigned(e: EventFacts): EmailBody {
  return {
    subject: `You're running: ${e.title} — ${e.date}`,
    html: shell(
      `You're on for this one, ${e.staffName.split(' ')[0]}`,
      `<p style="margin:0 0 6px;">You've been assigned a ${e.kind.toLowerCase()}.</p>
       ${detailRows(eventRows(e, true))}
       <p style="margin:0;">We'll send you a reminder the day before. If you can't make it, tell a manager
       so it can be reassigned.</p>`,
      { label: 'Open the calendar', href: siteLink('/admin/calendar') },
    ),
  }
}

export function eventReminderStaff(e: EventFacts, whenPhrase: string): EmailBody {
  return {
    subject: `Reminder — ${e.title} ${whenPhrase}`,
    html: shell(
      `${e.title} is ${whenPhrase}`,
      `<p style="margin:0 0 6px;">A quick heads-up: you're running this ${whenPhrase}.</p>
       ${detailRows(eventRows(e, true))}
       <p style="margin:0;">Arrive a few minutes early so they aren't waiting at the door.</p>`,
      { label: 'Open the calendar', href: siteLink('/admin/calendar') },
    ),
  }
}

// To the visitor: your tour is booked.
export function eventGuestConfirmed(e: EventFacts): EmailBody {
  return {
    subject: `Your visit is booked — ${e.date}`,
    html: shell(
      `See you soon, ${e.guestName.split(' ')[0] || 'there'}`,
      `<p style="margin:0 0 6px;">Your ${e.kind.toLowerCase()} of SquareOne Interactive is on the calendar.</p>
       ${detailRows(eventRows(e, false))}
       <p style="margin:0 0 6px;">${e.staffName ? `${e.staffName} will meet you at the front desk.` : 'A member of our team will meet you at the front desk.'}
       Come as you are — there's nothing to bring and nothing to pay.</p>
       <p style="margin:0;">Need to move it or can't make it? Just reply to this email.</p>`,
      { label: 'See rooms & pricing', href: siteLink('/facilities') },
    ),
  }
}

export function eventGuestReminder(e: EventFacts, whenPhrase: string): EmailBody {
  return {
    subject: `Reminder — your visit is ${whenPhrase}`,
    html: shell(
      `Your visit is ${whenPhrase}`,
      `<p style="margin:0 0 6px;">Looking forward to showing you around.</p>
       ${detailRows(eventRows(e, false))}
       <p style="margin:0;">${e.staffName ? `${e.staffName} will meet you at the front desk.` : 'We’ll meet you at the front desk.'}
       If something's come up, reply and we'll find another time.</p>`,
    ),
  }
}

export function eventMoved(e: EventFacts, forStaff: boolean): EmailBody {
  return {
    subject: `Moved — ${e.title} is now ${e.date}`,
    html: shell(
      forStaff ? 'An assignment moved' : 'Your visit has moved',
      `<p style="margin:0 0 6px;">Here's where it stands now:</p>
       ${detailRows(eventRows(e, forStaff))}
       <p style="margin:0;">${forStaff
         ? 'Your reminder will follow the new time.'
         : "If that doesn't work for you, reply and we'll find another slot."}</p>`,
      forStaff ? { label: 'Open the calendar', href: siteLink('/admin/calendar') } : undefined,
    ),
  }
}

export function membershipWelcome(o: { name: string; plan: string }): EmailBody {
  return {
    subject: 'Welcome to SquareOne Interactive — your membership is active',
    html: shell(
      `Welcome in, ${o.name.split(' ')[0]}`,
      `<p style="margin:0 0 6px;">Your <strong style="color:${INK};">${o.plan}</strong> membership is active. Here's what that gets you:</p>
       <ul style="margin:8px 0 12px;padding-left:20px;">
         <li style="margin-bottom:4px;">Unlock the fitness door from your phone — no card to carry</li>
         <li style="margin-bottom:4px;">Check yourself in and out so your workout time adds up</li>
         <li>Member pricing on room rentals and parties</li>
       </ul>
       <p style="margin:0;">You can change your plan, update your card, or cancel any time from your account page.</p>`,
      { label: 'Open my account', href: siteLink('/account') },
    ),
  }
}

export function membershipChanged(o: { name: string; plan: string; priceCents: number; period: string }): EmailBody {
  return {
    subject: `Your membership is now ${o.plan}`,
    html: shell(
      'Your plan has changed',
      `<p style="margin:0 0 6px;">You're now on the <strong style="color:${INK};">${o.plan}</strong> plan
       at ${money(o.priceCents)} per ${o.period}.</p>
       <p style="margin:0 0 6px;">The change is effective right away. Your next bill is adjusted automatically —
       if you upgraded mid-cycle you'll see a prorated charge, and if you downgraded you'll see a credit.</p>
       <p style="margin:0;">Didn't mean to do this? Reply and we'll put it back.</p>`,
      { label: 'View my membership', href: siteLink('/account') },
    ),
  }
}

export function membershipCanceled(o: { name: string; endsOn: string | null }): EmailBody {
  return {
    subject: 'Your membership is set to end',
    html: shell(
      "We're sorry to see you go",
      `<p style="margin:0 0 6px;">Your fitness membership is canceled and won't renew.
       ${o.endsOn ? `You keep full access through <strong style="color:${INK};">${o.endsOn}</strong> — you've already paid for it.` : ''}</p>
       <p style="margin:0 0 6px;">Your door access and check-in stay on until then, and nothing else gets charged.</p>
       <p style="margin:0;">Changed your mind? You can restart any time from your account page — same day, no gap.</p>`,
      { label: 'Resume my membership', href: siteLink('/account') },
    ),
  }
}

export function membershipResumed(o: { name: string }): EmailBody {
  return {
    subject: 'Your membership is back on',
    html: shell(
      'Good to have you back',
      `<p style="margin:0;">Your membership will keep renewing as normal — nothing lapsed, and your door
       access carries straight through.</p>`,
      { label: 'Open my account', href: siteLink('/account') },
    ),
  }
}

export function membershipEnded(o: { name: string }): EmailBody {
  return {
    subject: 'Your membership has ended',
    html: shell(
      'Your membership has ended',
      `<p style="margin:0 0 6px;">Today is the last day of your paid period, so your door access and member
       pricing have stopped. No further charges will be made.</p>
       <p style="margin:0;">You're welcome back whenever you want — rejoining takes about a minute.</p>`,
      { label: 'See membership plans', href: siteLink('/memberships') },
    ),
  }
}

export function renewalReceipt(o: { name: string; plan: string; amountCents: number; nextOn: string | null }): EmailBody {
  return {
    subject: `Receipt — ${money(o.amountCents)} membership renewal`,
    html: shell(
      'Your membership renewed',
      `${detailRows([
        ['Plan', o.plan],
        ['Amount', money(o.amountCents)],
        ...(o.nextOn ? [['Next renewal', o.nextOn] as [string, string]] : []),
      ])}
      <p style="margin:0;">Nothing to do — this is just your receipt. Manage or cancel any time from your account.</p>`,
      { label: 'View my account', href: siteLink('/account') },
    ),
  }
}

export function paymentFailed(o: { name: string; amountCents: number }): EmailBody {
  return {
    subject: 'We couldn\'t process your membership payment',
    html: shell(
      'Your card was declined',
      `<p style="margin:0 0 6px;">We tried to charge ${money(o.amountCents)} for your membership and the card
       didn't go through. This usually means it expired or the bank flagged it.</p>
       <p style="margin:0 0 6px;">Update your card and we'll retry automatically — your access stays on in
       the meantime.</p>
       <p style="margin:0;">Trouble with it? Reply here and we'll sort it out with you.</p>`,
      { label: 'Update my card', href: siteLink('/account') },
    ),
  }
}
