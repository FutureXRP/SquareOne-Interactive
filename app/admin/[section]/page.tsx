import Link from 'next/link'
import { notFound } from 'next/navigation'
import { card, INK, SUB, FAINT, BLUE } from '@/lib/theme'

const SECTIONS: Record<string, { title: string; blurb: string; phase: string }> = {
  bookings: { title: 'Bookings', blurb: 'Rentals, holds with deposit deadlines, and buffer-aware conflict checks — hard double-booking prevention lives in the database.', phase: 'Phase 1' },
  clients: { title: 'Clients', blurb: 'Family accounts and people, with balances computed from the ledger — never a mutable column.', phase: 'Phase 1' },
  memberships: { title: 'Memberships', blurb: 'Family $75 and Individual $25 ongoing plans, mirrored from Stripe subscriptions.', phase: 'Phase 2' },
  programs: { title: 'Programs', blurb: 'Recurring activities like Speed & Agility — sessions, drop-ins, capacity, waitlists, and waivers.', phase: 'Phase 3' },
  payments: { title: 'Payments', blurb: 'Stripe and offline payments unified into double-entry ledger entries, with invoices for rentals.', phase: 'Phase 2' },
  doors: { title: 'Check-ins & Doors', blurb: 'Door scans with allow / deny / flag outcomes, roster check-ins, and the facility door-access sync.', phase: 'Phase 3' },
  queue: { title: 'Front Desk', blurb: 'Only items that need a human, each with one clear action — urgent, soon, or idea.', phase: 'Phase 1' },
  reports: { title: 'Reports', blurb: 'Live SQL views over the ledger and bookings — not canned exports.', phase: 'Phase 3' },
  messages: { title: 'Messages', blurb: 'Email and SMS sends with open tracking; Claude drafts the language, deterministic code fills every number.', phase: 'Phase 3' },
  settings: { title: 'Settings', blurb: 'Facilities, booking types, price schedules, staff roles, and flag thresholds.', phase: 'Phase 1' },
}

export function generateStaticParams() {
  return Object.keys(SECTIONS).map((section) => ({ section }))
}

export default async function SectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params
  const s = SECTIONS[section]
  if (!s) notFound()

  return (
    <div className="sq-page" style={{ padding: '34px 40px 48px', maxWidth: 1180, margin: '0 auto' }}>
      <h1 style={{ fontSize: 26, fontWeight: 800, color: INK, margin: '0 0 6px', letterSpacing: '-0.03em' }}>{s.title}</h1>
      <p style={{ fontSize: 13, color: FAINT, margin: '0 0 26px' }}>coming online in {s.phase}</p>

      <div className="sq-card" style={{ ...card, padding: '28px 30px', maxWidth: 620 }}>
        <div style={{ width: 34, height: 34, borderRadius: 9, background: '#eef4fb', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
          <div style={{ width: 12, height: 12, border: `2px solid ${BLUE}`, borderRadius: 3 }} />
        </div>
        <p style={{ fontSize: 14, color: SUB, margin: '0 0 16px', lineHeight: 1.6 }}>{s.blurb}</p>
        <Link href="/admin" style={{ fontSize: 12.5, color: BLUE, fontWeight: 600, textDecoration: 'none' }}>← Back to Today</Link>
      </div>

      <p style={{ fontSize: 11.5, color: FAINT, marginTop: 22 }}>Placeholder screen — this module ships in {s.phase} of the build plan.</p>
    </div>
  )
}
