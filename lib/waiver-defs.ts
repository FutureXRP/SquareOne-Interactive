// The two waivers, kept separate on purpose: one covers fitness-center use
// (signed during membership signup), the other covers facility rentals
// (signed inside the booking flow).

export interface WaiverDef {
  id: string
  name: string
  context: string
  terms: string[]
}

export const FITNESS_WAIVER: WaiverDef = {
  id: 'fitness-v1',
  name: 'Fitness Center Waiver',
  context: 'Required with a gym membership',
  terms: [
    'I understand that use of the SquareOne fitness center — including the gym floor, equipment, courts, and fitness programs — carries inherent risk of injury.',
    'I voluntarily assume all risks of participation for myself and any household members on my plan, and release SquareOne Compassion, its staff, and volunteers from liability to the fullest extent permitted by law.',
    'I confirm the members on my plan are in adequate physical condition to participate, and I agree to follow all posted rules, equipment guidelines, and staff instructions.',
    'I grant permission for emergency medical treatment if needed, and I understand SquareOne is not responsible for lost or stolen property.',
  ],
}

export const RENTAL_WAIVER: WaiverDef = {
  id: 'rental-v1',
  name: 'Facility Rental Waiver',
  context: 'Required with a room or facility rental',
  terms: [
    'I understand that use of rented SquareOne spaces — including the gym, gaming zone, party rooms, climbing and adventure areas, multiball, multisport court, dining hall, and billiards — carries inherent risk of injury for me and my guests.',
    'As the renter, I accept responsibility for my group: I will supervise minors in my party, keep my group to the rented space and time, and follow all posted rules and staff instructions.',
    'I assume all risks of participation for myself and my guests, release SquareOne Compassion, its staff, and volunteers from liability to the fullest extent permitted by law, and accept responsibility for damage caused by my group beyond normal use.',
    'I grant permission for emergency medical treatment if needed, and I understand SquareOne is not responsible for lost or stolen property.',
  ],
}

export const WAIVERS = [FITNESS_WAIVER, RENTAL_WAIVER]
