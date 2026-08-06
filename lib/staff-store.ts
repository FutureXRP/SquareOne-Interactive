'use client'
// Staff members and roles — editable in Settings, used across the admin for
// "who took this booking / payment". Demo persistence (localStorage) until
// real auth lands; roles then become enforced permissions.

export type StaffRole = 'owner' | 'manager' | 'front-desk' | 'coach'

export interface StaffMember {
  id: string
  name: string
  role: StaffRole
}

export const ROLE_LABEL: Record<StaffRole, string> = {
  owner: 'Owner',
  manager: 'Manager',
  'front-desk': 'Front desk',
  coach: 'Coach',
}

export const ROLE_ACCESS: Record<StaffRole, string> = {
  owner: 'Everything',
  manager: 'Bookings · payments · rooms · reports',
  'front-desk': 'Check-in · bookings · take payments · POS',
  coach: 'Programs · rosters',
}

// Which roles can create bookings and take payments (enforced for real once
// auth lands; shown as guidance in the demo).
export const CAN_BOOK: StaffRole[] = ['owner', 'manager', 'front-desk']

const KEY = 'sq-staff-v1'
const CURRENT_KEY = 'sq-staff-current-v1'

function seed(): StaffMember[] {
  return [
    { id: 'st-1', name: 'A. Blair', role: 'owner' },
    { id: 'st-2', name: 'M. Santos', role: 'manager' },
    { id: 'st-3', name: 'K. Reyes', role: 'coach' },
    { id: 'st-4', name: 'D. Fields', role: 'front-desk' },
  ]
}

export function getStaff(): StaffMember[] {
  if (typeof window === 'undefined') return seed()
  try {
    const raw = window.localStorage.getItem(KEY)
    if (!raw) return seed()
    const parsed = JSON.parse(raw) as StaffMember[]
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : seed()
  } catch {
    return seed()
  }
}

export function saveStaff(staff: StaffMember[]) {
  window.localStorage.setItem(KEY, JSON.stringify(staff))
  window.dispatchEvent(new Event('sq-staff'))
}

export function resetStaff() {
  window.localStorage.removeItem(KEY)
  window.localStorage.removeItem(CURRENT_KEY)
  window.dispatchEvent(new Event('sq-staff'))
}

// The staff member currently working the desk (demo stand-in for a login).
export function getCurrentStaff(): StaffMember {
  const staff = getStaff()
  if (typeof window === 'undefined') return staff[0]
  const id = window.localStorage.getItem(CURRENT_KEY)
  return staff.find((s) => s.id === id) ?? staff[0]
}

export function setCurrentStaff(id: string) {
  window.localStorage.setItem(CURRENT_KEY, id)
  window.dispatchEvent(new Event('sq-staff'))
}
