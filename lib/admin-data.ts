// Hand-authored placeholder data for the admin modules — deterministic,
// integer cents, always labeled placeholder in the UI.

export interface AdminBookingRow {
  id: string
  zoneId: string
  title: string
  who: string
  date: string
  time: string
  priceCents: number
  status: 'confirmed' | 'hold' | 'completed'
  note?: string
}

export const adminBookings: AdminBookingRow[] = [
  { id: 'BK-3105', zoneId: 'gaming', title: 'Birthday party', who: 'Henderson family', date: 'Today', time: '5–7 PM', priceCents: 24900, status: 'hold', note: 'deposit due 3:00 PM' },
  { id: 'BK-3115', zoneId: 'party', title: 'Birthday party', who: 'Okafor family', date: 'Today', time: '3:30–5:30 PM', priceCents: 27900, status: 'hold', note: 'confirmation due 4:30 PM' },
  { id: 'BK-3103', zoneId: 'gym', title: 'Church league', who: 'Southside Fellowship', date: 'Today', time: '6–9 PM', priceCents: 18000, status: 'confirmed' },
  { id: 'BK-3107', zoneId: 'dining', title: 'Rotary dinner', who: 'Tulsa SW Rotary', date: 'Today', time: '6–8 PM', priceCents: 32500, status: 'confirmed' },
  { id: 'BK-3117', zoneId: 'billiards', title: 'League night', who: 'Tulsa 8-Ball League', date: 'Today', time: '7–10 PM', priceCents: 14000, status: 'confirmed' },
  { id: 'BK-3121', zoneId: 'gym', title: 'Homeschool PE', who: 'Discovery Homeschool', date: 'Tomorrow', time: '10 AM–12 PM', priceCents: 12000, status: 'confirmed' },
  { id: 'BK-3122', zoneId: 'multisport', title: 'Pickleball social', who: 'Morning group', date: 'Tomorrow', time: '8–10 AM', priceCents: 11000, status: 'confirmed' },
  { id: 'BK-3114', zoneId: 'party', title: 'Birthday party', who: 'Castillo family', date: 'Today', time: '12–2 PM', priceCents: 27900, status: 'completed' },
]

export interface ClientRow {
  account: string
  members: number
  plan: 'Family' | 'Individual' | 'None'
  balanceCents: number // negative = credit
  lastSeen: string
  flag?: string
}

export const clients: ClientRow[] = [
  { account: 'Alvarez family', members: 4, plan: 'Family', balanceCents: 6400, lastSeen: 'Today 2:18 PM', flag: 'past due' },
  { account: 'Henderson family', members: 5, plan: 'Family', balanceCents: 24900, lastSeen: 'Yesterday', flag: 'hold unpaid' },
  { account: 'Priya K.', members: 1, plan: 'Individual', balanceCents: 0, lastSeen: 'Today 2:04 PM' },
  { account: 'Dana W.', members: 3, plan: 'Family', balanceCents: 0, lastSeen: 'Today 2:41 PM' },
  { account: 'Okafor family', members: 4, plan: 'Family', balanceCents: 0, lastSeen: 'Aug 2' },
  { account: 'Marcus T.', members: 1, plan: 'None', balanceCents: 0, lastSeen: 'Today 2:33 PM', flag: 'lapsed 6/30' },
  { account: 'Nguyen family', members: 6, plan: 'Family', balanceCents: -3500, lastSeen: 'Aug 4' },
  { account: 'J. Whitfield', members: 1, plan: 'None', balanceCents: 0, lastSeen: 'Today 1:30 PM' },
]

export const membershipStats = {
  active: 312,
  family: 214,
  individual: 98,
  mrrCents: 1852500,
  newThisMonth: 18,
  canceling: 4,
  pastDueCents: 41800,
}

export const recentSignups = [
  { name: 'Nguyen family', plan: 'Family', when: 'Aug 4' },
  { name: 'Priya K.', plan: 'Individual', when: 'Aug 3' },
  { name: 'Ramos family', plan: 'Family', when: 'Aug 1' },
  { name: 'T. Osei', plan: 'Individual', when: 'Jul 30' },
]

export interface ProgramRow {
  name: string
  schedule: string
  coach: string
  enrolled: number
  capacity: number
  waitlist: number
  waiversMissing: number
  feeCents: number
  fee: string
}

export const programs: ProgramRow[] = [
  { name: 'Speed & Agility', schedule: 'Mon/Wed/Thu 4:00 PM', coach: 'Coach Reyes', enrolled: 14, capacity: 16, waitlist: 0, waiversMissing: 2, feeCents: 8500, fee: 'per month' },
  { name: 'Youth Basketball Skills', schedule: 'Tue 5:30 PM', coach: 'Coach Bell', enrolled: 12, capacity: 12, waitlist: 3, waiversMissing: 0, feeCents: 6500, fee: 'per month' },
  { name: 'Homeschool PE', schedule: 'Fri 10:00 AM', coach: 'Staff', enrolled: 22, capacity: 30, waitlist: 0, waiversMissing: 1, feeCents: 1000, fee: 'drop-in' },
  { name: 'Senior Fitness', schedule: 'Tue/Thu 9:00 AM', coach: 'Coach Ama', enrolled: 9, capacity: 15, waitlist: 0, waiversMissing: 0, feeCents: 4000, fee: 'per month' },
]

export interface PaymentRow {
  id: string
  who: string
  what: string
  method: 'card' | 'ach' | 'cash' | 'check'
  amountCents: number
  when: string
  status: 'paid' | 'pending' | 'failed'
}

export const payments: PaymentRow[] = [
  { id: 'PM-8841', who: 'Castillo family', what: 'Party Arcade Zone package', method: 'card', amountCents: 27900, when: 'Today 11:52 AM', status: 'paid' },
  { id: 'PM-8840', who: 'Tulsa SW Rotary', what: 'Dining Hall rental (invoice)', method: 'check', amountCents: 32500, when: 'Today 10:15 AM', status: 'paid' },
  { id: 'PM-8839', who: 'Ramos family', what: 'Family membership', method: 'card', amountCents: 7500, when: 'Today 6:01 AM', status: 'paid' },
  { id: 'PM-8838', who: 'T. Osei', what: 'Individual membership', method: 'ach', amountCents: 2500, when: 'Yesterday', status: 'pending' },
  { id: 'PM-8837', who: 'Clark Elementary', what: 'Multiball Zone PE group', method: 'check', amountCents: 15000, when: 'Yesterday', status: 'paid' },
  { id: 'PM-8836', who: 'Alvarez family', what: 'Family membership (retry 2 of 3)', method: 'card', amountCents: 7500, when: 'Yesterday', status: 'failed' },
  { id: 'PM-8835', who: 'Front desk', what: 'Day passes ×3 + gear', method: 'cash', amountCents: 8600, when: 'Yesterday', status: 'paid' },
]

export const doorDevices = [
  { name: 'Main entrance', state: 'online', last: '2:41 PM' },
  { name: 'Party wing door', state: 'online', last: '1:58 PM' },
  { name: 'Check-in kiosk', state: 'online', last: '1:47 PM' },
  { name: 'Loading dock', state: 'locked', last: '7:02 AM' },
]

export interface MessageRow {
  subject: string
  audience: string
  channel: 'email' | 'sms'
  when: string
  sent: number
  openRate: number | null // null for SMS
}

export const messages: MessageRow[] = [
  { subject: 'Reminder: Speed & Agility waivers', audience: '2 families', channel: 'email', when: 'Today 1:05 PM', sent: 2, openRate: 0.5 },
  { subject: 'Your hold expires at 3:00 PM', audience: 'Henderson family', channel: 'sms', when: 'Today 12:30 PM', sent: 1, openRate: null },
  { subject: 'August programs are open', audience: 'All members', channel: 'email', when: 'Aug 1', sent: 298, openRate: 0.64 },
  { subject: 'Party booking confirmed 🎉', audience: 'Castillo family', channel: 'email', when: 'Jul 29', sent: 1, openRate: 1 },
]

export const zoneRevenueWeekCents: { zoneId: string; cents: number }[] = [
  { zoneId: 'party', cents: 83700 },
  { zoneId: 'gym', cents: 63000 },
  { zoneId: 'dining', cents: 57500 },
  { zoneId: 'gaming', cents: 40800 },
  { zoneId: 'multiball', cents: 38000 },
  { zoneId: 'adventure', cents: 28000 },
  { zoneId: 'multisport', cents: 20500 },
  { zoneId: 'billiards', cents: 16500 },
]

export const utilization = [
  { label: 'Peak (5–9 PM)', pct: 78 },
  { label: 'Daytime (9 AM–5 PM)', pct: 41 },
  { label: 'Early (5:30–9 AM)', pct: 26 },
  { label: 'Weekend', pct: 84 },
]

export const staff = [
  { name: 'A. Blair', role: 'Owner', access: 'Everything' },
  { name: 'M. Santos', role: 'Manager', access: 'Bookings · payments · reports' },
  { name: 'K. Reyes', role: 'Coach', access: 'Programs · rosters' },
  { name: 'D. Fields', role: 'Front desk', access: 'Check-in · POS · queue' },
]
