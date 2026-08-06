// Deterministic placeholder data for the dashboard. Hand-authored (no
// randomness — where randomness is ever introduced, use a seeded RNG per the
// house rules). All money is integer cents. Every screen that renders this
// must label it as placeholder data until real bookings flow.

export type BookingStatus = 'confirmed' | 'hold'

export interface Booking {
  id: string
  zoneId: string
  title: string
  who: string
  start: number // decimal hour, 24h (e.g. 17.5 = 5:30 PM)
  end: number
  priceCents: number
  status: BookingStatus
  holdExpires?: string // e.g. '3:00 PM'
  missing?: string // what the hold is waiting on
}

export const BOARD_START = 6 // 6 AM
export const BOARD_END = 23 // 11 PM

export const bookings: Booking[] = [
  { id: 'BK-3101', zoneId: 'gym', title: 'Open gym', who: 'Members', start: 6, end: 9, priceCents: 0, status: 'confirmed' },
  { id: 'BK-3102', zoneId: 'gym', title: 'Speed & Agility', who: 'Coach Reyes · 14 kids', start: 16, end: 17.5, priceCents: 21000, status: 'confirmed' },
  { id: 'BK-3103', zoneId: 'gym', title: 'Church league', who: 'Southside Fellowship', start: 18, end: 21, priceCents: 18000, status: 'confirmed' },
  { id: 'BK-3104', zoneId: 'gaming', title: 'Open play', who: 'Members', start: 13, end: 16, priceCents: 0, status: 'confirmed' },
  { id: 'BK-3105', zoneId: 'gaming', title: 'Birthday party', who: 'Henderson family', start: 17, end: 19, priceCents: 24900, status: 'hold', holdExpires: '3:00 PM', missing: 'deposit' },
  { id: 'BK-3106', zoneId: 'dining', title: 'Lunch service', who: 'Kitchen', start: 11, end: 13.5, priceCents: 0, status: 'confirmed' },
  { id: 'BK-3107', zoneId: 'dining', title: 'Rotary dinner', who: 'Tulsa SW Rotary', start: 18, end: 20, priceCents: 32500, status: 'confirmed' },
  { id: 'BK-3108', zoneId: 'multiball', title: 'PE group', who: 'Clark Elementary', start: 9, end: 11, priceCents: 15000, status: 'confirmed' },
  { id: 'BK-3109', zoneId: 'multiball', title: '2-hr rental', who: 'Nguyen party', start: 15, end: 17, priceCents: 12000, status: 'confirmed' },
  { id: 'BK-3110', zoneId: 'adventure', title: 'Field trip', who: 'Discovery Homeschool', start: 10, end: 12, priceCents: 18000, status: 'confirmed' },
  { id: 'BK-3111', zoneId: 'adventure', title: 'Open climb', who: 'Members', start: 15, end: 18, priceCents: 0, status: 'confirmed' },
  { id: 'BK-3112', zoneId: 'multisport', title: 'Pickleball', who: 'Morning group', start: 8, end: 10, priceCents: 0, status: 'confirmed' },
  { id: 'BK-3113', zoneId: 'multisport', title: 'Soccer practice', who: 'FC Riverside U-10', start: 17, end: 18.5, priceCents: 9000, status: 'confirmed' },
  { id: 'BK-3114', zoneId: 'party', title: 'Birthday party', who: 'Castillo family · 12 kids', start: 12, end: 14, priceCents: 27900, status: 'confirmed' },
  { id: 'BK-3115', zoneId: 'party', title: 'Birthday party', who: 'Okafor family', start: 15.5, end: 17.5, priceCents: 27900, status: 'hold', holdExpires: '4:30 PM', missing: 'confirmation' },
  { id: 'BK-3116', zoneId: 'billiards', title: 'Seniors morning', who: 'Members 55+', start: 10, end: 12, priceCents: 0, status: 'confirmed' },
  { id: 'BK-3117', zoneId: 'billiards', title: 'League night', who: 'Tulsa 8-Ball League', start: 19, end: 22, priceCents: 14000, status: 'confirmed' },
]

export type Urgency = 'urgent' | 'soon' | 'idea'

export interface QueueItem {
  urgency: Urgency
  title: string
  detail: string
  action: string
  href: string
}

export const frontDeskQueue: QueueItem[] = [
  {
    urgency: 'urgent',
    title: 'Gaming Zone hold expires 3:00 PM',
    detail: 'Henderson birthday party (5–7 PM) — deposit not received. Hold releases automatically if unpaid.',
    action: 'Call the Hendersons',
    href: '/admin/bookings',
  },
  {
    urgency: 'urgent',
    title: 'Door denied at Main entrance',
    detail: 'Marcus T. scanned an expired fob at 2:33 PM and is waiting at the desk.',
    action: 'Reissue fob',
    href: '/admin/doors',
  },
  {
    urgency: 'soon',
    title: 'Waivers missing for Speed & Agility',
    detail: '2 of 14 kids in tonight’s 4 PM session have no signed waiver on file.',
    action: 'Send waiver link',
    href: '/admin/programs',
  },
  {
    urgency: 'soon',
    title: 'Past-due balance flagged at check-in',
    detail: 'Alvarez family admitted with $64.00 past due — front desk should collect or set a plan.',
    action: 'Open account',
    href: '/admin/clients',
  },
]

export type DoorOutcome = 'in' | 'denied' | 'flagged'

export interface DoorEntry {
  time: string
  who: string
  context: string
  point: string
  method: string
  outcome: DoorOutcome
  reason?: string
}

export const doorLog: DoorEntry[] = [
  { time: '2:41 PM', who: 'Dana W.', context: 'Family membership', point: 'Main', method: 'fob', outcome: 'in' },
  { time: '2:33 PM', who: 'Marcus T.', context: 'Lapsed 6/30', point: 'Main', method: 'fob', outcome: 'denied', reason: 'expired credential' },
  { time: '2:18 PM', who: 'Alvarez family (4)', context: 'Family membership', point: 'Main', method: 'QR', outcome: 'flagged', reason: '$64.00 past due' },
  { time: '2:04 PM', who: 'Priya K.', context: 'Individual membership', point: 'Main', method: 'QR', outcome: 'in' },
  { time: '1:47 PM', who: 'Open play roster (9)', context: 'Gaming Zone 1–4 PM', point: 'Kiosk', method: 'roster', outcome: 'in' },
  { time: '1:30 PM', who: 'J. Whitfield', context: 'Day pass', point: 'Main', method: 'POS', outcome: 'in' },
]

// KPIs — derived figures for the placeholder day (integer cents).
export const kpis = {
  playersInside: 47,
  bookingsToday: bookings.length,
  revenueTodayCents: 184500,
  activeMemberships: 312,
  pastDueCents: 41800,
  pastDueAccounts: 6,
  checkInsToday: 128,
  holdsOpen: bookings.filter((b) => b.status === 'hold').length,
}

// Week revenue, Mon–Sun (integer cents). Thursday is "today"; later days are
// projections and render dashed.
export const weekRevenue = [
  { label: 'Mon', cents: 148000 },
  { label: 'Tue', cents: 131500 },
  { label: 'Wed', cents: 162500 },
  { label: 'Thu', cents: 184500, today: true },
  { label: 'Fri', cents: 232000, projected: true },
  { label: 'Sat', cents: 298500, projected: true },
  { label: 'Sun', cents: 176000, projected: true },
]
