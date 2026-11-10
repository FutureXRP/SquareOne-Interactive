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
          <!--sq:top-->
          <div style="font-size:14px;line-height:1.6;color:${SUB};">${body}</div>
          <!--sq:bottom-->
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
  // Free-text riding on the booking — staff instructions, requests,
  // adjustment paper trail. Shown to the person running the event.
  note?: string
  // False when the booking floats free of any member account — customer
  // emails then invite them to sign up so it lands in My bookings.
  hasAccount?: boolean
  // The customer's phone — staff emails show it so whoever runs the
  // event can call about details.
  phone?: string
  // Rental agreement and card on file (0053) — undefined before it runs,
  // so the nudge stays silent rather than nagging about a step that
  // doesn't exist yet.
  agreementSigned?: boolean
  cardOnFile?: boolean
  // A customer request no one has approved yet (0033); undefined before.
  inReview?: boolean
  // Direct link that pays this one booking, no sign-in needed. Undefined
  // until migration 0037 has run.
  payUrl?: string
  // How it ended (0038): who the customer hears it from matters.
  canceledVia?: 'staff' | 'member' | 'hold_expired'
  canceledByName?: string
  // The unbilled setup/cleanup window (0039) — staff running the event
  // arrive before it and stay after it.
  setupMin?: number
  cleanupMin?: number
  arriveBy?: string // "1 PM"
  stayUntil?: string // "5:30 PM"
  // An unpaid hold's deadline (0054) — "Wednesday, November 11 at 3 PM".
  // Set only while the booking is still an unpaid hold that has been
  // given its 24 hours; past it, the hold is removed.
  holdDeadline?: string
  // Waivers this booking's room still needs signed (0054). Signed on the
  // booking's own page, before payment — nobody signs at the door.
  waiversDue?: number
}

// The button on any email about a booking with money still owed. Sends
// them straight to paying that booking rather than to the front door of
// the site to go looking for it. Falls back to the account page when the
// pay-link migration hasn't run, and for anyone who owes nothing.
function bookingCta(b: BookingFacts, paidLabel = 'View my booking'): { label: string; href: string } {
  const owed = Math.max(b.priceCents - b.paidCents, 0)
  if (!b.payUrl) return { label: paidLabel, href: siteLink('/account') }
  if (owed <= 0) return { label: paidLabel, href: b.payUrl }
  const depositDue = b.depositCents && b.depositCents > 0 ? Math.max(b.depositCents - b.paidCents, 0) : 0
  const due = depositDue > 0 && depositDue < owed ? depositDue : owed
  return { label: b.waiversDue ? `Sign the waiver & pay ${money(due)}` : `Pay ${money(due)} now`, href: b.payUrl }
}

// Where the booking lives online — its own page works with or without an
// account (desk guests have none), so every "view" link points there.
function bookingLink(b: BookingFacts): string {
  return b.payUrl ?? siteLink('/account')
}

// What's owed, when, and how — the Event Rental Agreement's terms: the
// deposit at least 14 days out, the balance no later than 10 minutes
// before the start, by card online (any amount), Cash App, or cash.
function paymentTerms(b: BookingFacts): string {
  const owed = Math.max(b.priceCents - b.paidCents, 0)
  if (owed <= 0) return `<p style="margin:0 0 6px;">You're paid in full — nothing more is owed.</p>`
  const depositDue = b.depositCents && b.depositCents > 0 ? Math.max(b.depositCents - b.paidCents, 0) : 0
  // An unpaid hold's own deadline (holdTerms) is what governs the deposit
  // until the first payment lands — not the 14-day rule.
  const onHoldClock = !!b.holdDeadline && b.paidCents === 0
  const deposit = depositDue > 0 && depositDue < owed && !onHoldClock
    ? `Your ${money(depositDue)} deposit is due at least 14 days before your event (right away if it's sooner) — if it isn't in by then, the date may be released. `
    : ''
  const choices = deposit ? 'the deposit, the full balance, or any amount in between' : 'the full balance or part of it now'
  return `<p style="margin:0 0 6px;">${deposit}The remaining balance is due no later than 10 minutes before your
    event starts. Pay online with the button below — ${choices} — or by Cash App, or in cash at the front desk.</p>`
}

// When the renter may arrive and must be out — this booking's own setup
// and cleanup window, the same times printed on their agreement.
function arrivalTerms(b: BookingFacts): string {
  if (b.arriveBy && b.stayUntil) {
    return `<p style="margin:0 0 6px;">You can arrive as early as <strong style="color:${INK};">${b.arriveBy}</strong> to set up,
      and need to be cleaned up and out by <strong style="color:${INK};">${b.stayUntil}</strong>.</p>`
  }
  return `<p style="margin:0 0 6px;">Your setup and cleanup times are on your Event Rental Agreement — please
    arrive and leave within them, since another party may be booked right after you.</p>`
}

// The card on file, when there is one — what it is and isn't for.
function cardTerms(b: BookingFacts): string {
  if (b.cardOnFile !== true) return ''
  return `<p style="margin:0 0 6px;">We have a card on file for this booking. It's only charged for damages,
    cleaning, storage, a late exit, or an unpaid balance — and we'll contact you before any charge.</p>`
}

// The 24-hour rule for an unpaid hold: pay something by the deadline or
// the booking comes off the calendar. Silent once anything is paid.
function holdTerms(b: BookingFacts): string {
  if (!b.holdDeadline || b.paidCents > 0) return ''
  const depositDue = b.depositCents && b.depositCents > 0 ? b.depositCents : 0
  const ask = depositDue > 0 && depositDue < b.priceCents ? `pay at least the ${money(depositDue)} deposit` : 'make a payment'
  return `<p style="margin:0 0 6px;padding:10px 14px;background:#fdecea;border-radius:10px;color:${INK};">
    <strong>This booking is unpaid.</strong> Please ${ask} by <strong>${b.holdDeadline}</strong> —
    unpaid holds are removed after 24 hours so the time can go to someone else.</p>`
}

// Waivers are part of booking: signed on the booking's page before paying.
function waiverTerms(b: BookingFacts): string {
  if (!b.waiversDue || !b.payUrl) return ''
  return `<p style="margin:0 0 6px;">This room has ${b.waiversDue === 1 ? 'a waiver' : `${b.waiversDue} waivers`} to sign first —
    it's the first step on <a href="${b.payUrl}" style="color:#2f6db8;font-weight:600;">your booking's page</a>, right
    before payment. Guests don't sign anything at the door.</p>`
}

export function bookingHeld(b: BookingFacts): EmailBody {
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
       <p style="margin:0 0 6px;"><strong style="color:${INK};">${b.inReview
         ? 'This is a request — our team reviews every one, and you\'ll get an email the moment it\'s approved.'
         : 'The room is held for you.'}</strong> Nobody else can book this time while it's on hold.</p>
       ${holdTerms(b)}
       ${waiverTerms(b)}
       ${paymentTerms(b)}
       ${arrivalTerms(b)}
       ${cardTerms(b)}
       <p style="margin:10px 0 0;">Need to change something? Reply here or call the front desk — we're happy to move things around.</p>
       ${agreementNudge(b)}
       ${signupNudge(b)}`,
      bookingCta(b),
    ),
  }
}

// The invitation that turns a desk booking into a customer relationship:
// sign up with this same email and the booking attaches to your account
// automatically — view it, pay it, cancel it, all without calling us.
// Every event needs a signed rental agreement and a card on file. Until
// both are done, the booking emails say so and link straight to the page
// that does them (the booking's pay link — no account needed).
function agreementNudge(b: BookingFacts): string {
  if (!b.payUrl) return ''
  const todo = [
    ...(b.agreementSigned === false ? ['sign your Event Rental Agreement'] : []),
    ...(b.cardOnFile === false ? ['add a card on file for damages (nothing is charged — and paying online saves your card automatically)'] : []),
  ]
  if (todo.length === 0) return ''
  return `<p style="margin:10px 0 0;padding:10px 14px;background:#fdf3dc;border-radius:10px;">
    <strong style="color:${INK};">Before your event:</strong> please ${todo.join(' and ')} —
    <a href="${b.payUrl}" style="color:#2f6db8;font-weight:600;">it takes about three minutes here</a>.</p>`
}

function signupNudge(b: BookingFacts): string {
  if (b.hasAccount !== false) return ''
  return `<p style="margin:10px 0 0;padding:10px 14px;background:#f4f7fb;border-radius:10px;">
    <strong style="color:${INK};">Manage this booking online:</strong> create a free account at
    <a href="${siteLink('/signup')}" style="color:#2f6db8;font-weight:600;">${siteLink('/signup').replace('https://', '')}</a>
    using this same email address, and this booking appears under <strong style="color:${INK};">My bookings</strong>
    automatically — see the details, pay your balance, or make changes anytime.</p>`
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
       ${waiverTerms(b)}
       ${paymentTerms(b)}
       ${arrivalTerms(b)}
       ${cardTerms(b)}
       ${agreementNudge(b)}
       ${signupNudge(b)}`,
      bookingCta(b),
    ),
  }
}

// Staff signed off on a reservation that was sitting in review. This is
// the email the customer has actually been waiting for — a person looked
// at their request and said yes.
export function bookingApproved(b: BookingFacts): EmailBody {
  const owed = Math.max(b.priceCents - b.paidCents, 0)
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
       ${holdTerms(b)}
       ${waiverTerms(b)}
       ${paymentTerms(b)}
       ${arrivalTerms(b)}
       ${cardTerms(b)}
       ${agreementNudge(b)}
       ${signupNudge(b)}`,
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
         ['Event hours', `${b.date}, ${b.time}`],
         // Setup and cleanup are the staff member's hours, not the
         // customer's — say exactly when to show up and when they're done.
         ...(b.arriveBy ? [['Arrive by', `${b.arriveBy} — ${b.setupMin} min of setup before the event`] as [string, string]] : []),
         ...(b.stayUntil ? [['Stay until', `${b.stayUntil} — ${b.cleanupMin} min of cleanup after`] as [string, string]] : []),
         ['Booked for', b.name],
         ...(b.phone ? [['Their phone', b.phone] as [string, string]] : []),
         ['Confirmation', b.code],
         ...(b.addons ? [['Extras to set up', b.addons] as [string, string]] : []),
         ...(b.note ? [['Notes', b.note] as [string, string]] : []),
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
      : `Payment received — ${b.room} on ${b.date}`,
    html: shell(
      settled ? `You're all set, ${b.name.split(' ')[0]}` : `Payment received — you're locked in`,
      `<p style="margin:0 0 6px;">${settled
        ? 'Your booking is paid in full and the room is yours.'
        : `Thanks — your payment is in and the room is held for you.`}</p>
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
       ${settled ? '' : paymentTerms(b)}
       ${arrivalTerms(b)}
       ${cardTerms(b)}
       ${agreementNudge(b)}`,
      bookingCta(b),
    ),
  }
}

// A staff correction: a payment recorded by mistake was struck from the
// books. The customer may already hold a receipt email for it, so the
// correction names that receipt and shows where the booking truly stands
// now — the facts are read after the void, so the totals are current.
// An extra fee charged to the card on file — cleaning, damage, storage,
// or overtime — as the rental agreement allows. The agreement promises
// the renter is told; staff contact them first, and this is the record.
export function bookingFeeCharged(b: BookingFacts, f: { amountCents: number; reason: string; card: string }): EmailBody {
  return {
    subject: `A ${money(f.amountCents)} charge for ${b.code} — ${f.reason}`,
    html: shell(
      'A charge to your card on file',
      `<p style="margin:0 0 6px;">As covered in your Event Rental Agreement, we've charged the card on
        file for your event. Here are the details:</p>
       ${detailRows([
         ['Charge', money(f.amountCents)],
         ['Reason', f.reason],
         ['Card', f.card],
         ['Event', `${b.what} — ${b.room}`],
         ['When', `${b.date}, ${b.time}`],
         ['Confirmation', b.code],
       ])}
       <p style="margin:0;">Questions about this charge? Reply to this email or call the front desk —
        we're glad to walk through it.</p>`,
      { label: 'View my booking', href: b.payUrl ?? siteLink('/account') },
    ),
  }
}

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

// The house's heads-up: a customer reservation just landed and is
// waiting on approval. Goes to the address chosen on Settings.
export function bookingApprovalAlert(b: BookingFacts): EmailBody {
  const owed = Math.max(b.priceCents - b.paidCents, 0)
  return {
    subject: `Approval needed — ${b.what}, ${b.date}`,
    html: shell(
      'A reservation is waiting on you',
      `<p style="margin:0 0 6px;">A customer just booked through the store. It holds the room now, but
        stays "in review" until someone confirms it.</p>
       ${detailRows([
         ['Who', b.name],
         ...(b.phone ? [['Their phone', b.phone] as [string, string]] : []),
         ['What', b.what],
         ['Room', b.room],
         ['When', `${b.date}, ${b.time}`],
         ['Confirmation', b.code],
         ['Total', money(b.priceCents)],
         ...(b.paidCents > 0 ? [['Paid so far', money(b.paidCents)] as [string, string]] : []),
         ...(owed > 0 ? [['Still owed', money(owed)] as [string, string]] : []),
         ...(b.addons ? [['Extras', b.addons] as [string, string]] : []),
         ...(b.holdDeadline && b.paidCents === 0 ? [['Payment', `<span style="color:#b3261e;">Unpaid — removed ${b.holdDeadline} unless paid</span>`] as [string, string]] : []),
       ])}
       <p style="margin:0;">${b.holdDeadline && b.paidCents === 0
         ? `Nothing has been paid yet. The customer has been told they have 24 hours to pay or the booking is removed —
            it comes off the calendar automatically on ${b.holdDeadline} unless a payment lands or someone confirms it.`
         : 'It holds the room until someone approves or cancels it — the customer is waiting on your answer.'}</p>`,
      { label: 'Review & approve', href: siteLink('/admin/bookings') },
    ),
  }
}

// The customer's 24-hour notice on an unpaid hold: pay by the deadline or
// the booking is removed. Sent once per hold, by the hourly job, to any
// unpaid hold that hasn't already had the deadline in its hold email.
export function holdPaymentWarning(b: BookingFacts): EmailBody {
  return {
    subject: `Action needed: pay within 24 hours to keep ${b.room} on ${b.date}`,
    html: shell(
      `Your booking is unpaid, ${b.name.split(' ')[0]}`,
      `<p style="margin:0 0 6px;">We're holding this for you, but nothing has been paid on it yet:</p>
       ${detailRows([
         ['Confirmation', b.code],
         ['Room', b.room],
         ['What', b.what],
         ['When', `${b.date}, ${b.time}`],
         ['Total', money(b.priceCents)],
         ...(b.holdDeadline ? [['Pay by', b.holdDeadline] as [string, string]] : []),
       ])}
       ${holdTerms(b) || `<p style="margin:0 0 6px;"><strong style="color:${INK};">You have 24 hours to pay or this booking will be removed.</strong></p>`}
       ${waiverTerms(b)}
       <p style="margin:0 0 6px;">Pay online with the button below, by Cash App, or in cash at the front desk. Once a
         payment is in, the booking is yours and the deadline goes away.</p>
       <p style="margin:10px 0 0;">Changed your plans? Just reply and let us know, and we'll release the time for someone else.</p>`,
      bookingCta(b),
    ),
  }
}

export interface HoldDigestItem {
  code: string
  name: string
  room: string
  when: string
  totalCents: number
  deadline?: string
  note?: string
}

// The house's list from the hourly hold check: holds that just got their
// 24-hour notice, and holds that ran out and were removed.
export function unpaidHoldsAlert(o: { warned: HoldDigestItem[]; released: HoldDigestItem[] }): EmailBody {
  const rows = (items: HoldDigestItem[], tail: (i: HoldDigestItem) => string) => items.map((i) => `
    <tr>
      <td style="padding:8px 0;border-top:1px solid ${LINE};font-size:13px;color:${INK};">
        <strong>${i.code}</strong> · ${i.name}<br>
        <span style="color:${SUB};">${i.room} — ${i.when} · ${money(i.totalCents)}</span><br>
        <span style="color:${SUB};">${tail(i)}</span>
      </td>
    </tr>`).join('')
  const parts: string[] = []
  if (o.warned.length > 0) {
    parts.push(`<p style="margin:0 0 4px;"><strong style="color:${INK};">Unpaid — the customer was just told they have 24 hours to pay:</strong></p>
      <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin:0 0 14px;">
        ${rows(o.warned, (i) => i.note ?? (i.deadline ? `Removed ${i.deadline} unless paid` : 'Unpaid'))}
      </table>`)
  }
  if (o.released.length > 0) {
    parts.push(`<p style="margin:0 0 4px;"><strong style="color:${INK};">Removed — the 24 hours ran out with nothing paid:</strong></p>
      <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin:0 0 14px;">
        ${rows(o.released, (i) => i.note ?? 'Canceled and the customer emailed')}
      </table>`)
  }
  const n = o.warned.length
  const m = o.released.length
  const subject = [n > 0 ? `${n} unpaid hold${n === 1 ? '' : 's'}` : '', m > 0 ? `${m} removed` : ''].filter(Boolean).join(', ')
  return {
    subject: `Unpaid bookings — ${subject}`,
    html: shell(
      'Unpaid bookings',
      `${parts.join('')}
       <p style="margin:0;">Any payment — online, Cash App, cash, or check at the desk — confirms a booking and stops
         its clock. To give someone more time, confirm the booking on the Bookings page.</p>`,
      { label: 'Open bookings', href: siteLink('/admin/bookings') },
    ),
  }
}

export interface CustomerChange {
  kind: 'moved' | 'room' | 'canceled' | 'spaces_requested'
  at: string // "Mon, Nov 9, 3:12 PM"
  oldWhen?: string
  newWhen?: string
  oldRoom?: string
  newRoom?: string
  booked?: string[]
  requested?: string[]
  addonsAdded?: string[]
  addonsDropped?: string[]
}

// The house's heads-up when a customer changes their own booking — moved
// it, canceled it, or asked on their agreement for different rooms or
// extras. Says exactly what changed, from what to what, and what's needed.
export function customerChangedAlert(b: BookingFacts, changes: CustomerChange[], o: { agreementSigned?: boolean } = {}): EmailBody {
  const lines = changes.map((c) => {
    const when = `<span style="color:#8a98ab;">${c.at}</span>`
    if (c.kind === 'moved') {
      return `<li style="margin:0 0 8px;"><strong style="color:${INK};">Moved the time</strong> — ${when}<br>
        <span style="text-decoration:line-through;">${c.oldWhen ?? '—'}</span> → <strong style="color:${INK};">${c.newWhen ?? '—'}</strong>
        <br>It's back in review until someone approves the new time.</li>`
    }
    if (c.kind === 'room') {
      return `<li style="margin:0 0 8px;"><strong style="color:${INK};">Changed the room</strong> — ${when}<br>
        <span style="text-decoration:line-through;">${c.oldRoom ?? '—'}</span> → <strong style="color:${INK};">${c.newRoom ?? '—'}</strong></li>`
    }
    if (c.kind === 'canceled') {
      return `<li style="margin:0 0 8px;"><strong style="color:${INK};">Canceled the booking</strong> — ${when}<br>
        ${c.oldWhen ?? ''}${b.paidCents > 0 ? ` · ${money(b.paidCents)} was paid — decide on any refund.` : ''}</li>`
    }
    const parts = [
      c.requested ? `Booked: <strong style="color:${INK};">${(c.booked ?? []).join(', ') || '—'}</strong><br>Their agreement asks for: <strong style="color:${INK};">${c.requested.join(', ') || '—'}</strong>` : '',
      c.addonsAdded && c.addonsAdded.length ? `Extras they added: <strong style="color:${INK};">${c.addonsAdded.join(', ')}</strong>` : '',
      c.addonsDropped && c.addonsDropped.length ? `Extras they unchecked: <strong style="color:${INK};">${c.addonsDropped.join(', ')}</strong>` : '',
    ].filter(Boolean).join('<br>')
    return `<li style="margin:0 0 8px;"><strong style="color:${INK};">Asked for different spaces or extras</strong> on their rental agreement — ${when}<br>
      ${parts}<br>Nothing on the booking has changed — call them, then update the booking if it works.</li>`
  }).join('')
  const moved = changes.some((c) => c.kind === 'moved' || c.kind === 'room')
  const canceled = changes.some((c) => c.kind === 'canceled')
  const subject = canceled
    ? `Customer canceled ${b.code} — ${b.name}, ${b.date}`
    : `Customer changed ${b.code} — ${b.name}, ${b.date}`
  return {
    subject,
    html: shell(
      canceled ? 'A customer canceled their booking' : 'A customer changed their booking',
      `<p style="margin:0 0 6px;">${b.name} made ${changes.length === 1 ? 'a change' : 'changes'} to their booking online:</p>
       <ul style="margin:8px 0 12px;padding-left:18px;">${lines}</ul>
       ${detailRows([
         ['Confirmation', b.code],
         ['What', b.what],
         ['Room now', b.room],
         ['When now', `${b.date}, ${b.time}`],
         ...(b.phone ? [['Their phone', b.phone] as [string, string]] : []),
         ['Total', money(b.priceCents)],
         ['Paid so far', money(b.paidCents)],
       ])}
       ${moved && o.agreementSigned
         ? `<p style="margin:0 0 6px;">Their signed rental agreement still shows the old details — their booking page now asks them to sign the updated one.</p>`
         : ''}
       <p style="margin:0;">Check the staff and anything else scheduled around the old and new times.</p>`,
      { label: 'Open bookings', href: siteLink('/admin/bookings') },
    ),
  }
}

// A change a customer asked for (0057) — what it is now and what they
// asked for, ready to show either side.
export interface ChangeRequestFacts {
  oldWhen?: string
  newWhen?: string
  oldRooms?: string[]
  newRooms?: string[]
  oldExtras?: string[]
  newExtras?: string[]
  decisionNote?: string
}

function changeRows(c: ChangeRequestFacts): [string, string][] {
  const strike = (v: string) => `<span style="text-decoration:line-through;color:#8a98ab;font-weight:500;">${v}</span>`
  const rows: [string, string][] = []
  if (c.newWhen) rows.push(['Date & time', `${c.oldWhen ? strike(c.oldWhen) + '<br>' : ''}→ ${c.newWhen}`])
  if (c.newRooms) rows.push(['Rooms', `${c.oldRooms ? strike(c.oldRooms.join(', ') || '—') + '<br>' : ''}→ ${c.newRooms.join(', ') || '—'}`])
  if (c.newExtras) rows.push(['Extras', `${c.oldExtras ? strike(c.oldExtras.join(', ') || 'none') + '<br>' : ''}→ ${c.newExtras.join(', ') || 'none'}`])
  return rows
}

// To the customer, the moment they ask: nothing has changed yet.
export function changeRequestReceived(b: BookingFacts, c: ChangeRequestFacts): EmailBody {
  return {
    subject: `Change request received — ${b.room} on ${b.date}`,
    html: shell(
      `We got your change request, ${b.name.split(' ')[0]}`,
      `<p style="margin:0 0 6px;"><strong style="color:${INK};">Your request for change has been submitted and will be reviewed by our team.</strong>
         You'll get another email as soon as it's approved or declined.</p>
       <p style="margin:12px 0 0;font-weight:700;color:${INK};">What you asked for</p>
       ${detailRows(changeRows(c))}
       <p style="margin:0 0 6px;">Until then your booking stays exactly as it is:</p>
       ${detailRows([
         ['Confirmation', b.code],
         ['Room', b.room],
         ['When', `${b.date}, ${b.time}`],
         ['Total', money(b.priceCents)],
       ])}
       <p style="margin:0;">If a change affects your price, we'll tell you before anything is charged.</p>`,
      { label: 'View my booking', href: bookingLink(b) },
    ),
  }
}

// To the house: a request waiting on an owner, admin, or manager.
export function changeRequestAlert(b: BookingFacts, c: ChangeRequestFacts, o: { conflicts?: string[] } = {}): EmailBody {
  return {
    subject: `Change request — ${b.code}, ${b.name}`,
    html: shell(
      'A customer asked to change their booking',
      `<p style="margin:0 0 6px;">${b.name} asked for a change. <strong style="color:${INK};">Nothing has changed yet</strong> —
         it waits for an owner, admin, or manager to approve or decline it on the Bookings page.</p>
       ${detailRows(changeRows(c))}
       ${o.conflicts && o.conflicts.length > 0
         ? `<p style="margin:0 0 6px;padding:10px 14px;background:#fdecea;border-radius:10px;color:${INK};">
              <strong>Not available as asked:</strong> ${o.conflicts.join(', ')} ${o.conflicts.length === 1 ? 'is' : 'are'} already booked then.
              Approving will be refused unless that frees up — decline it with a note, or call them.</p>`
         : ''}
       ${detailRows([
         ['Confirmation', b.code],
         ['What', b.what],
         ['Room now', b.room],
         ['When now', `${b.date}, ${b.time}`],
         ...(b.phone ? [['Their phone', b.phone] as [string, string]] : []),
         ['Total', money(b.priceCents)],
         ['Paid so far', money(b.paidCents)],
       ])}
       <p style="margin:0;">Approving doesn't change the price — if the new time or rooms cost more or less, update the price after.</p>`,
      { label: 'Review the request', href: siteLink('/admin/bookings') },
    ),
  }
}

// To the customer: the answer.
export function changeRequestDecided(b: BookingFacts, c: ChangeRequestFacts, approved: boolean): EmailBody {
  const note = c.decisionNote
    ? `<p style="margin:0 0 6px;padding:10px 14px;background:#f4f7fb;border-radius:10px;"><strong style="color:${INK};">A note from our team:</strong> ${c.decisionNote.replace(/</g, '&lt;')}</p>`
    : ''
  return approved
    ? {
      subject: `Change approved — ${b.room} on ${b.date}`,
      html: shell(
        `Your change is approved, ${b.name.split(' ')[0]}`,
        `<p style="margin:0 0 6px;">Our team approved the change you asked for. Here's your booking now:</p>
         ${detailRows([
           ['Confirmation', b.code],
           ['Room', b.room],
           ['When', `${b.date}, ${b.time}`],
           ...(b.addons ? [['Extras', b.addons] as [string, string]] : []),
           ['Total', money(b.priceCents)],
           ['Paid so far', money(b.paidCents)],
         ])}
         ${note}
         ${agreementNudge(b)}
         <p style="margin:10px 0 0;">Anything you've already paid stays with the booking.</p>`,
        bookingCta(b, 'View my booking'),
      ),
    }
    : {
      subject: `Change request declined — ${b.room} on ${b.date}`,
      html: shell(
        `We couldn't make that change, ${b.name.split(' ')[0]}`,
        `<p style="margin:0 0 6px;">Our team reviewed your request and wasn't able to make this change:</p>
         ${detailRows(changeRows(c))}
         ${note}
         <p style="margin:0 0 6px;">Your booking stays as it was:</p>
         ${detailRows([
           ['Confirmation', b.code],
           ['Room', b.room],
           ['When', `${b.date}, ${b.time}`],
         ])}
         <p style="margin:0;">Want to try something else? Reply here or call the front desk and we'll help find what works.</p>`,
        { label: 'View my booking', href: bookingLink(b) },
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
      { label: 'View my booking', href: bookingLink(b) },
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
      { label: 'View my booking', href: bookingLink(b) },
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
         <li>Book rooms, parties, and programs right from your account</li>
       </ul>
       <p style="margin:0;">You can change your plan, update your card, or cancel any time from your account page.</p>`,
      { label: 'Open my account', href: siteLink('/account') },
    ),
  }
}

// The internal heads-up: someone joined. Goes to the address chosen on
// Settings, never to the member — their welcome email is separate.
export function membershipStaffAlert(o: { name: string; email: string; plan: string }): EmailBody {
  return {
    subject: `New fitness member — ${o.name} joined ${o.plan}`,
    html: shell(
      'A new member just joined',
      `<p style="margin:0 0 6px;">Fresh signup on the fitness membership:</p>
       ${detailRows([
         ['Member', o.name],
         ['Email', o.email],
         ['Plan', o.plan],
       ])}
       <p style="margin:0;">Their welcome email has gone out and their account is live — this is just
       your heads-up.</p>`,
      { label: 'Open the Memberships tab', href: siteLink('/admin/memberships') },
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
