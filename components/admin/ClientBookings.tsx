'use client'
import Link from 'next/link'
import { INK, SUB, FAINT, LINE, BLUE, GREEN, RED } from '@/lib/theme'
import { formatCents, formatHour } from '@/lib/format'
import { tulsaToday } from '@/lib/tulsa-time'
import type { StaffBooking } from '@/lib/staff-bookings-store'

// A client's bookings — past, present, and future — in one list, so the
// desk never has to scroll every booking looking for a name. Used two
// ways on the Clients tab: under an account (its own bookings plus desk
// bookings made with the same email or phone), and under the search box
// (every booking matching a name, email, phone, or confirmation code —
// guests with no account included).

const digitsOf = (s: string | null | undefined) => (s ?? '').replace(/\D/g, '').slice(-10)

// The bookings worth listing: no extra package rooms (they ride on their
// main booking) and no calendar room-holds for tours and events.
export function listable(all: StaffBooking[]): StaffBooking[] {
  return all.filter((b) => !b.leadBookingId && !(b.priceCents === 0 && (b.note ?? '').startsWith('Room held for a scheduled')))
}

export function bookingsForAccount(all: StaffBooking[], o: { accountId: string; emails: string[]; phones: string[] }): StaffBooking[] {
  const emails = new Set(o.emails.map((e) => e.trim().toLowerCase()).filter(Boolean))
  const phones = new Set(o.phones.map(digitsOf).filter((d) => d.length >= 7))
  return listable(all).filter((b) =>
    b.accountId === o.accountId
    || (!!b.contactEmail && emails.has(b.contactEmail.trim().toLowerCase()))
    || (phones.size > 0 && phones.has(digitsOf(b.contactPhone))))
}

export function bookingsMatching(all: StaffBooking[], query: string, accountIds: string[] = []): StaffBooking[] {
  const needle = query.trim().toLowerCase()
  if (needle.length < 2) return []
  const digits = needle.replace(/\D/g, '')
  const accounts = new Set(accountIds)
  return listable(all).filter((b) =>
    b.client.toLowerCase().includes(needle)
    || b.code.toLowerCase().includes(needle)
    || (b.contactEmail ?? '').toLowerCase().includes(needle)
    || (digits.length >= 3 && (b.contactPhone ?? '').replace(/\D/g, '').includes(digits))
    || (!!b.accountId && accounts.has(b.accountId)))
}

function whenLabel(b: StaffBooking): string {
  const d = new Date(`${b.date}T12:00:00`)
  const day = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
  return `${day} · ${formatHour(b.startH)}–${formatHour(b.startH + b.hours)}`
}

function statusChip(b: StaffBooking): { label: string; color: string; bg: string } {
  if (b.status === 'canceled') return { label: 'Canceled', color: SUB, bg: '#eef2f8' }
  if (b.status === 'completed') return { label: 'Completed', color: SUB, bg: '#eef2f8' }
  if (b.awaitingCardSince) return { label: 'Unfinished — no card', color: SUB, bg: '#eef2f8' }
  if (b.approvedAt === null) return { label: 'In review', color: '#5b4708', bg: '#fdf3dc' }
  if (b.depositOverdueAt) return { label: 'Deposit overdue', color: '#8c2f24', bg: '#fdecea' }
  if (b.status === 'hold') return { label: 'On hold', color: '#b07818', bg: '#faf0dc' }
  return { label: 'Confirmed', color: GREEN, bg: '#e5f2ea' }
}

export function ClientBookingsList({ bookings, all, rooms, showName, empty }: {
  bookings: StaffBooking[]
  all: StaffBooking[] // every booking, for a package's extra rooms
  rooms: Map<string, string>
  showName?: boolean
  empty: string
}) {
  const today = tulsaToday()
  const upcoming = bookings.filter((b) => b.status !== 'canceled' && b.status !== 'completed' && b.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date) || a.startH - b.startH)
  const past = bookings.filter((b) => b.status !== 'canceled' && (b.status === 'completed' || b.date < today))
    .sort((a, b) => b.date.localeCompare(a.date) || b.startH - a.startH)
  const canceled = bookings.filter((b) => b.status === 'canceled')
    .sort((a, b) => b.date.localeCompare(a.date) || b.startH - a.startH)

  if (bookings.length === 0) return <p style={{ fontSize: 12.5, color: FAINT, margin: '4px 0 0' }}>{empty}</p>

  const roomsOf = (b: StaffBooking) => {
    const extra = all.filter((x) => x.leadBookingId === b.id && x.status !== 'canceled').map((x) => rooms.get(x.roomId) ?? x.roomId)
    return [rooms.get(b.roomId) ?? b.roomId, ...extra].join(' + ')
  }

  const group = (title: string, list: StaffBooking[]) => list.length === 0 ? null : (
    <div style={{ marginBottom: 10 }}>
      <p style={{ fontSize: 10.5, fontWeight: 800, color: FAINT, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '6px 0 4px' }}>
        {title} · {list.length}
      </p>
      <div style={{ border: `1px solid ${LINE}`, borderRadius: 10, overflow: 'hidden', background: '#fff' }}>
        {list.map((b, i) => {
          const chip = statusChip(b)
          const balance = Math.max(0, b.priceCents - b.paidCents)
          return (
            <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 12px', flexWrap: 'wrap', borderTop: i > 0 ? `1px solid ${LINE}` : 'none' }}>
              <div style={{ flex: 1, minWidth: 220 }}>
                <p style={{ fontSize: 12.5, fontWeight: 700, color: INK, margin: 0 }}>
                  {whenLabel(b)}
                  {showName && <span style={{ color: SUB, fontWeight: 600 }}> · {b.client}</span>}
                </p>
                <p style={{ fontSize: 11.5, color: SUB, margin: 0 }}>
                  {roomsOf(b)} · {b.title} · {b.code}
                </p>
              </div>
              <span style={{ fontSize: 10.5, fontWeight: 700, color: chip.color, background: chip.bg, padding: '2px 9px', borderRadius: 999, whiteSpace: 'nowrap' }}>{chip.label}</span>
              <span style={{ fontSize: 11.5, color: SUB, minWidth: 150, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                {formatCents(b.priceCents)}
                {b.status !== 'canceled' && b.priceCents > 0 && (
                  balance > 0
                    ? <span style={{ color: RED, fontWeight: 700 }}> · {formatCents(balance)} due</span>
                    : <span style={{ color: GREEN, fontWeight: 700 }}> · paid</span>
                )}
                {b.status === 'canceled' && b.paidCents > 0 && <span style={{ color: RED, fontWeight: 700 }}> · {formatCents(b.paidCents)} paid</span>}
              </span>
              <Link href={`/admin/bookings?open=${b.id}`} style={{ fontSize: 11.5, fontWeight: 700, color: BLUE, textDecoration: 'none', whiteSpace: 'nowrap' }}>Open →</Link>
            </div>
          )
        })}
      </div>
    </div>
  )

  return (
    <div>
      {group('Upcoming', upcoming)}
      {group('Past', past)}
      {group('Canceled', canceled)}
    </div>
  )
}
