// The pure half of waivers: turning a Forms-tab row into what a signer
// sees, and deciding whether a signature on file still counts. No
// database client in here, so server code (the pay link) and browser
// code (the store, the admin board) share exactly the same rules.

export type WaiverFrequency = 'once' | 'annual' | 'every_time'

export interface WaiverChoice {
  label: string
  options: string[]
  required: boolean
  // true = pick exactly one (an either/or, like a photo release);
  // false = check any that apply.
  single: boolean
}

export interface RequiredWaiver {
  id: string
  name: string
  context: string
  terms: string[]
  choices: WaiverChoice[]
  // Standalone "Agreement checkbox" fields — each rendered as its own
  // checkbox; required ones must be ticked to sign.
  agreements: { label: string; required: boolean }[]
  frequency: WaiverFrequency
}

export const FREQUENCY_NOTE: Record<WaiverFrequency, string> = {
  once: 'signed once',
  annual: 're-signed every 12 months',
  every_time: 'signed with every booking',
}

interface FormField {
  type: string
  label?: string
  content?: string
  required?: boolean
  options?: string[]
}

export interface FormRow {
  id: string
  name: string
  fields: FormField[]
  assign_to?: string
  assign_room_ids: string[] | null
  assign_plan_ids?: string[] | null
  frequency: WaiverFrequency
}

// assign_plan_ids arrives with 0017 and frequency/assign_to with 0004 —
// each select falls back to the last shape that worked.
export const FORM_COL_SETS = [
  'id, name, fields, assign_to, assign_room_ids, assign_plan_ids, frequency',
  'id, name, fields, assign_to, assign_room_ids, frequency',
  'id, name, fields',
]

// A form row becomes exactly what the store shows — paragraphs in the
// order staff arranged them, multi-select questions with their options.
export function toWaiver(r: FormRow, where?: string): RequiredWaiver {
  const fields = Array.isArray(r.fields) ? r.fields : []
  const frequency = r.frequency ?? 'once'
  return {
    id: r.id,
    name: r.name,
    context: [where, FREQUENCY_NOTE[frequency]].filter(Boolean).join(' · '),
    terms: fields
      .filter((f) => f.type === 'paragraph' && f.content && f.content.trim())
      .map((f) => (f.content as string).trim()),
    choices: fields
      .filter((f) => (f.type === 'multi' || f.type === 'single') && Array.isArray(f.options) && f.options.length > 0)
      .map((f) => ({ label: f.label ?? '', options: f.options as string[], required: !!f.required, single: f.type === 'single' })),
    agreements: fields
      .filter((f) => f.type === 'checkbox' && (f.label ?? '').trim())
      .map((f) => ({ label: (f.label as string).trim(), required: !!f.required })),
    frequency,
  }
}

// A form is substantive when it puts anything in front of the signer to
// read or decide — paragraphs, choices, or agreement checkboxes. A photo
// release that is nothing but an either/or question counts.
export function hasSubstance(w: RequiredWaiver): boolean {
  return w.terms.length > 0 || w.choices.length > 0 || w.agreements.length > 0
}

// The rental waivers that apply to one room: active rental forms with no
// room list (every room) or a list naming this one.
export function rentalWaiversForRoom(rows: FormRow[], roomId: string): RequiredWaiver[] {
  return rows
    .filter((r) => r.assign_to === undefined || r.assign_to === 'rentals')
    .filter((r) => !r.assign_room_ids || r.assign_room_ids.length === 0 || r.assign_room_ids.includes(roomId))
    .map((r) => toWaiver(r, 'Required with this rental'))
    .filter(hasSubstance)
}

// Every waiver a booking spanning several rooms needs — each form once.
export function rentalWaiversForRooms(rows: FormRow[], roomIds: string[]): RequiredWaiver[] {
  const seen = new Set<string>()
  const out: RequiredWaiver[] = []
  for (const id of roomIds) {
    for (const w of rentalWaiversForRoom(rows, id)) {
      if (!seen.has(w.id)) { seen.add(w.id); out.push(w) }
    }
  }
  return out
}

export interface WaiverSignature {
  form_id: string
  account_id: string | null
  booking_id?: string | null
  signed_at: string
}

const YEAR_MS = 365 * 24 * 60 * 60 * 1000
// The store signs an every-booking waiver a moment before the booking row
// exists; a signature on the account from just before the booking was
// made is that same signing.
const BOOKING_LEAD_MS = 2 * 60 * 60 * 1000

// Is this waiver covered for this booking? A signature made on the
// booking's own page always counts; one on the account behind it counts by
// the form's frequency — once is forever, annual is 12 months, and every
// booking means it was signed for this one.
export function waiverCovered(
  w: RequiredWaiver,
  sigs: WaiverSignature[],
  booking: { id: string; accountId: string | null; createdAt?: string | null },
  now = Date.now(),
): boolean {
  const mine = sigs.filter((s) => s.form_id === w.id
    && (s.booking_id === booking.id || (!!booking.accountId && s.account_id === booking.accountId)))
  if (mine.some((s) => s.booking_id === booking.id)) return true
  if (mine.length === 0) return false
  if (w.frequency === 'once') return true
  if (w.frequency === 'annual') return mine.some((s) => now - new Date(s.signed_at).getTime() <= YEAR_MS)
  const created = booking.createdAt ? new Date(booking.createdAt).getTime() : NaN
  if (!Number.isFinite(created)) return false
  return mine.some((s) => new Date(s.signed_at).getTime() >= created - BOOKING_LEAD_MS)
}
