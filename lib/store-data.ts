// Store catalog — placeholder pricing until real price schedules flow.
// All money is integer cents.

import { ZONES, type Zone } from '@/lib/theme'

export interface FacilityListing {
  zone: Zone
  blurb: string
  capacity: string
  pricing: { label: string; cents: number }[]
  perHourCents: number // used for slot math on the booking page
  minHours: number
}

const FACILITY_META: Record<string, Omit<FacilityListing, 'zone'>> = {
  gym: {
    blurb: 'Full-court gymnasium for basketball, volleyball, and leagues — plus parties, banquets, receptions, and meetings.',
    capacity: 'Up to 120',
    pricing: [
      { label: 'Per hour', cents: 6000 },
      { label: '3-hour block', cents: 15000 },
    ],
    perHourCents: 6000,
    minHours: 1,
  },
  gaming: {
    blurb: 'Console and VR gaming floor — tournaments, parties, and open play.',
    capacity: 'Up to 30',
    pricing: [
      { label: '2-hour block', cents: 8000 },
      { label: 'Per hour', cents: 4500 },
    ],
    perHourCents: 4500,
    minHours: 2,
  },
  dining: {
    blurb: 'Dining hall for parties, banquets, receptions, and meetings.',
    capacity: 'Up to 150',
    pricing: [
      { label: 'Per hour', cents: 7500 },
      { label: 'Evening (3 hr)', cents: 19500 },
    ],
    perHourCents: 7500,
    minHours: 2,
  },
  multiball: {
    blurb: 'Interactive multiball arena — dodgeball, PE groups, and team play.',
    capacity: 'Up to 40',
    pricing: [
      { label: 'Per hour', cents: 6000 },
      { label: '2-hour block', cents: 11000 },
    ],
    perHourCents: 6000,
    minHours: 1,
  },
  adventure: {
    blurb: 'Climbing and adventure zone with certified staff on every rental.',
    capacity: 'Up to 25',
    pricing: [
      { label: 'Per hour', cents: 7000 },
    ],
    perHourCents: 7000,
    minHours: 1,
  },
  multisport: {
    blurb: 'Turf multisport court — soccer, pickleball, agility training.',
    capacity: 'Up to 30',
    pricing: [
      { label: 'Per hour', cents: 5500 },
    ],
    perHourCents: 5500,
    minHours: 1,
  },
  party: {
    blurb: 'Party arcade rooms — birthday packages with a dedicated host.',
    capacity: 'Up to 20 kids',
    pricing: [
      { label: 'Party package (2 hr)', cents: 27900 },
      { label: 'Extra hour', cents: 9900 },
    ],
    perHourCents: 9900,
    minHours: 2,
  },
  billiards: {
    blurb: 'Billiards hall — per-table rentals and league nights.',
    capacity: '8 tables',
    pricing: [
      { label: 'Per table / hour', cents: 2500 },
    ],
    perHourCents: 2500,
    minHours: 1,
  },
}

export const FACILITIES: FacilityListing[] = ZONES.map((zone) => ({ zone, ...FACILITY_META[zone.id] }))

export const facilityById = Object.fromEntries(FACILITIES.map((f) => [f.zone.id, f])) as Record<string, FacilityListing>

export interface Plan {
  id: string
  name: string
  priceCents: number
  period: string
  tagline: string
  features: string[]
  featured?: boolean
}

export const PLANS: Plan[] = [
  {
    id: 'individual',
    name: 'Individual',
    priceCents: 2500,
    period: 'month',
    tagline: 'One member, full access',
    features: [
      'Unlimited gym & open-play access',
      'Door access with your member code',
      'Member pricing on rentals & programs',
      'Cancel anytime',
    ],
  },
  {
    id: 'family',
    name: 'Family',
    priceCents: 7500,
    period: 'month',
    tagline: 'Everyone in your household',
    features: [
      'Up to 6 household members',
      'Door access for every member',
      'Member pricing on rentals, parties & programs',
      'Cancel anytime',
    ],
    featured: true,
  },
]

export const planById = Object.fromEntries(PLANS.map((p) => [p.id, p])) as Record<string, Plan>

export interface Product {
  id: string
  name: string
  priceCents: number
  tag?: string
  colors: string[] // swatch hexes for the mock product art
}

export const PRODUCTS: Product[] = [
  { id: 'tee', name: 'SquareOne Tee', priceCents: 2200, tag: 'bestseller', colors: ['#182740', '#2f6db8'] },
  { id: 'hoodie', name: 'SquareOne Hoodie', priceCents: 4500, colors: ['#182740', '#64748c'] },
  { id: 'youth-tee', name: 'Youth Tee', priceCents: 1800, colors: ['#2f6db8', '#e8a13a'] },
  { id: 'cap', name: 'Logo Cap', priceCents: 1800, colors: ['#182740', '#e8a13a'] },
  { id: 'bottle', name: 'Water Bottle', priceCents: 1400, colors: ['#2f6db8', '#1d9a8f'] },
  { id: 'stickers', name: 'Sticker Pack', priceCents: 600, colors: ['#e8a13a', '#c2478f'] },
]

export const productById = Object.fromEntries(PRODUCTS.map((p) => [p.id, p])) as Record<string, Product>

export const HOURS = [
  { days: 'Mon – Sat', open: '5:30 AM', close: '10 PM', openH: 5.5, closeH: 22 },
  { days: 'Sunday', open: '1 PM', close: '10 PM', openH: 13, closeH: 22 },
]

export const ADDRESS = '5323 S 65th W Ave, Tulsa, OK 74107'
