// The SquareOne Event Rental Agreement — the paper form, word for word,
// as structured data. One source for the online form renters sign and
// the copy staff view and print, so the two can never drift apart.

export interface AgreementSection {
  id: 'guidelines' | 'expectations' | 'fees'
  title: string
  groups: { heading?: string; intro?: string; bullets: string[]; footnote?: string }[]
}

export const AGREEMENT_ADDRESS = '5323 S 65th W Ave, Tulsa, OK 74063'

// The three initialed pages of the paper form.
export const AGREEMENT_SECTIONS: AgreementSection[] = [
  {
    id: 'guidelines',
    title: 'Guidelines',
    groups: [
      {
        heading: 'Facility',
        bullets: [
          'No smoking or vaping OF ANY KIND in the facility or on grounds',
          'Children must be supervised at ALL times',
          'Stay in reserved rooms ONLY',
          'All reservations will require a credit card on file in case of damages or unpaid balances',
        ],
      },
      {
        heading: 'Food, drink & decorations',
        bullets: [
          'Outside food is allowed',
          'Outside vendors must be approved in advance',
          'All food and drinks must remain in the rented space (not allowed in Gaming Zone)',
          'No balloons filled with confetti or sequins',
          'No loose glitter, confetti, or open flames (except birthday candles)',
          'Remove all food, drinks, and decorations after event',
        ],
      },
      {
        heading: 'Inflatables',
        bullets: [
          'Small inflatable: 75 lb weight limit',
          'No flips, rough housing, or overcrowding',
          'No climbing outside of surfaces',
          'No shoes, food, drinks, gum, or sharp objects inside',
          'Do not move or unplug equipment',
        ],
        footnote: 'SquareOne staff reserves the right to stop use of equipment if safety rules are not followed.',
      },
    ],
  },
  {
    id: 'expectations',
    title: 'Renter expectations',
    groups: [
      {
        heading: 'Set up & decor',
        bullets: [
          'Renter is responsible for the setup of tables and chairs. Tables and chairs will be made available for use, but SquareOne is not responsible for setting these up or arranging.',
          'Decor may be placed on the walls, but not harmful to the paint or wall surface.',
          'Renter may arrive 1 hour before the scheduled start time of event. If additional setup time is needed, that time will need to be added to the total paid event time.',
        ],
      },
      {
        heading: 'Clean-up & restoration',
        bullets: [
          'Renter must return the facility in the same condition received.',
          'Renter must complete cleanup and exit within 30 minutes after the scheduled end time. Failure to vacate on time may result in additional charges of $25 per every 30mins.',
          'Renter is responsible for removing ALL personal items and placing trash/food items in the trash cans provided.',
          'Any visibly dirty tables/chairs should be wiped down during clean up. Cleaner and paper towels will be provided.',
          'Tables should be folded up and placed against the wall during clean up. (gym)',
          'Chairs should be placed back on the chair rack during clean up. (gym)',
          'Floor should be spot-swept of any visible debris or trash.',
        ],
      },
      {
        heading: 'Liability & damages',
        intro: 'Renter assumes responsibility for:',
        bullets: [
          'Any damage to facility, equipment, or property',
          'Injuries resulting from misuse of equipment or failure to supervise guests',
          'SquareOne is not liable for lost or stolen items',
          'SquareOne is NOT responsible for accidents/injuries occurred while on SquareOne property',
        ],
      },
      {
        heading: 'Termination',
        intro: 'SquareOne may terminate the event without refund if:',
        bullets: [
          'Full payment is not made',
          'Rules are repeatedly violated',
          'Facility is disrespected',
          'Unauthorized areas continue to be used',
        ],
      },
    ],
  },
  {
    id: 'fees',
    title: 'Fees & payment',
    groups: [
      {
        bullets: [
          '$50 deposit: for events booked within 14 days of the event date, the deposit MUST be paid within 24 hours of booking. For events booked further out, the deposit MUST be paid within 24 hours of the event becoming 14 days away. If the deposit is not paid on time, event date/time will be released. You may pay in full at any time.',
          'Remaining Balance: Due NO LATER than 10 minutes before event starts. Accepted payments: Cash, CashApp or online payment.',
          'Pricing hours: 9:00 AM – 10:00 PM',
          'After-hours 10:00 PM – 1:00 AM (additional fee)',
        ],
      },
      {
        intro: 'If a malfunction or closure occurs during the event, a partial or full refund MAY be issued. SquareOne provides:',
        bullets: [
          'Accessibility to tables and chairs',
          'Staff member on site',
          'Access to restrooms',
        ],
      },
      {
        heading: 'Additional fees',
        bullets: [
          'Cleaning fee (if needed): $50',
          'Damage/repair fee: $100+ depending on damage',
          'Storage (night before if available): $50',
        ],
        footnote: 'Any extra fees will be charged to the card on file. Renter will be notified before the card is charged.',
      },
    ],
  },
]

export const PHOTO_OPTIONS = [
  { id: 'setup_and_guests', label: 'I give permission for photos of the event setup AND guests to be posted on SquareOne’s Facebook page.' },
  { id: 'setup_only', label: 'I give permission for photos of the event setup ONLY to be posted on SquareOne’s Facebook page.' },
  { id: 'none', label: 'I DO NOT give permission for any photos to be posted on SquareOne’s Facebook page.' },
] as const

export type PhotoPermission = (typeof PHOTO_OPTIONS)[number]['id']

export const SIGNATURE_STATEMENT =
  'By signing below, the renter acknowledges they have read, understood, and agree to all terms listed in this Event Rental Agreement.'

// The extra fees the agreement lets staff charge to the card on file —
// quick picks for the staff charge drawer.
export const FEE_PRESETS: { label: string; cents: number; reason: string }[] = [
  { label: 'Cleaning $50', cents: 5000, reason: 'Cleaning fee' },
  { label: 'Damage $100', cents: 10000, reason: 'Damage/repair fee' },
  { label: 'Storage $50', cents: 5000, reason: 'Storage (night before)' },
  { label: 'Overtime $25', cents: 2500, reason: 'Late exit — $25 per 30 minutes' },
]

// What the renter filled in.
export interface AgreementAnswers {
  address: string
  guestCount: number
  spaces: string[] // room names checked
  addons: string[] // add-on names checked
  initials: { guidelines: string; expectations: string; fees: string }
  photoPermission: PhotoPermission
}

// What the renter was shown when they signed — frozen so a later price
// or time change can't rewrite what they agreed to.
export interface AgreementSnapshot {
  renterName: string
  phone: string
  eventType: string
  eventDate: string
  timeFrom: string
  timeTo: string
  setupTime: string
  leaveTime: string
  totalCents: number
  depositCents: number
  balanceCents: number
  code: string
  // The rooms the booking actually held when it was signed (0055+).
  bookedRooms?: string[]
}
