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
      { label: 'View my booking', href: siteLink('/account') },
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
      { label: 'View my booking', href: siteLink('/account') },
    ),
  }
}

export function bookingCanceled(b: BookingFacts): EmailBody {
  return {
    subject: `Canceled — ${b.room} on ${b.date}`,
    html: shell(
      'Your booking is canceled',
      `<p style="margin:0 0 6px;">We've canceled this booking:</p>
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
