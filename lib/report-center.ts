'use client'
// The report library — every report runs against live rows for a date
// range you choose, and hands back plain columns + rows so the same
// result can be shown on screen, saved as CSV, or printed to PDF.

import { supabase } from '@/lib/supabase'
import { formatCents, formatHour } from '@/lib/format'

export type CellKind = 'text' | 'money' | 'number' | 'hours'

export interface ReportColumn {
  key: string
  label: string
  kind?: CellKind // default 'text'
}

export interface ReportResult {
  columns: ReportColumn[]
  rows: Record<string, string | number>[]
  summary: { label: string; value: string }[]
  note?: string // shown when a report needs a migration that hasn't run
}

export interface ReportDef {
  id: string
  name: string
  group: string
  blurb: string
  run: (fromIso: string, toIso: string) => Promise<ReportResult>
}

const EMPTY = (note: string): ReportResult => ({ columns: [], rows: [], summary: [], note })

function localDate(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function stamp(iso: string): string {
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

// tstzrange "[from,to)" → start/end dates
function parseRange(during: string): { from: Date; to: Date } | null {
  const m = /^[[(]"?([^",]+)"?\s*,\s*"?([^")\]]+)"?[)\]]$/.exec(during)
  if (!m) return null
  return { from: new Date(m[1]), to: new Date(m[2]) }
}

const DOW = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

// ── Money ────────────────────────────────────────────────────

interface PayRow {
  code: string; amount_cents: number; method: string; memo: string | null; created_at: string
  booking_id: string | null
  bookings: { facility_id: string; client_name: string; package_id?: string | null } | null
  client_accounts: { name: string } | null
  staff: { name: string } | null
}

const PAY_SELECT = 'code, amount_cents, method, memo, created_at, booking_id, bookings:booking_id(facility_id, client_name), client_accounts:account_id(name), staff:taken_by(name)'

async function payments(fromIso: string, toIso: string): Promise<PayRow[] | null> {
  const { data, error } = await supabase()
    .from('payments')
    .select(PAY_SELECT)
    .eq('status', 'paid')
    .gte('created_at', fromIso)
    .lt('created_at', toIso)
    .order('created_at', { ascending: true })
    .limit(10000)
  if (error) return null
  return data as unknown as PayRow[]
}

function payerName(p: PayRow): string {
  return p.bookings?.client_name ?? p.client_accounts?.name ?? (p.memo?.split(' · ')[0] ?? '—')
}

// Booking-linked money is facility revenue; card charges with no booking
// are the recurring memberships; anything else lands in Other.
function category(p: PayRow): string {
  if (p.booking_id) return 'Room rentals & parties'
  if (p.method === 'stripe') return 'Fitness memberships'
  return 'Other'
}

const revenueSummary: ReportDef = {
  id: 'revenue-summary',
  name: 'Revenue summary',
  group: 'Money',
  blurb: 'Total collected in the range, split by what earned it and how it was paid.',
  run: async (from, to) => {
    const rows = await payments(from, to)
    if (!rows) return EMPTY('Could not read payments.')
    const byCat = new Map<string, { cents: number; count: number }>()
    for (const p of rows) {
      const c = category(p)
      const cur = byCat.get(c) ?? { cents: 0, count: 0 }
      cur.cents += p.amount_cents
      cur.count += 1
      byCat.set(c, cur)
    }
    const total = rows.reduce((n, p) => n + p.amount_cents, 0)
    return {
      columns: [
        { key: 'category', label: 'Category' },
        { key: 'payments', label: 'Payments', kind: 'number' },
        { key: 'amount', label: 'Collected', kind: 'money' },
        { key: 'share', label: 'Share of total' },
      ],
      rows: [...byCat.entries()]
        .sort((a, b) => b[1].cents - a[1].cents)
        .map(([category, v]) => ({
          category,
          payments: v.count,
          amount: v.cents,
          share: total > 0 ? `${Math.round((v.cents / total) * 100)}%` : '0%',
        })),
      summary: [
        { label: 'Total collected', value: formatCents(total) },
        { label: 'Payments', value: String(rows.length) },
        { label: 'Average payment', value: formatCents(rows.length ? Math.round(total / rows.length) : 0) },
      ],
    }
  },
}

const transactionRegister: ReportDef = {
  id: 'transactions',
  name: 'Transaction register',
  group: 'Money',
  blurb: 'Every single payment with date, who paid, what for, method, and who took it. The bookkeeper’s workhorse.',
  run: async (from, to) => {
    const rows = await payments(from, to)
    if (!rows) return EMPTY('Could not read payments.')
    const total = rows.reduce((n, p) => n + p.amount_cents, 0)
    return {
      columns: [
        { key: 'date', label: 'Date' },
        { key: 'code', label: 'Receipt' },
        { key: 'client', label: 'Paid by' },
        { key: 'memo', label: 'For' },
        { key: 'category', label: 'Category' },
        { key: 'method', label: 'Method' },
        { key: 'staff', label: 'Taken by' },
        { key: 'amount', label: 'Amount', kind: 'money' },
      ],
      rows: rows.map((p) => ({
        date: stamp(p.created_at),
        code: p.code,
        client: payerName(p),
        memo: p.memo ?? '—',
        category: category(p),
        method: p.method,
        staff: p.staff?.name ?? 'online',
        amount: p.amount_cents,
      })),
      summary: [
        { label: 'Transactions', value: String(rows.length) },
        { label: 'Total', value: formatCents(total) },
      ],
    }
  },
}

const byMethod: ReportDef = {
  id: 'by-method',
  name: 'Payments by method',
  group: 'Money',
  blurb: 'Card vs cash vs Cash App — what you reconcile against the bank and the cash bag.',
  run: async (from, to) => {
    const rows = await payments(from, to)
    if (!rows) return EMPTY('Could not read payments.')
    const m = new Map<string, { cents: number; count: number }>()
    for (const p of rows) {
      const cur = m.get(p.method) ?? { cents: 0, count: 0 }
      cur.cents += p.amount_cents
      cur.count += 1
      m.set(p.method, cur)
    }
    const total = rows.reduce((n, p) => n + p.amount_cents, 0)
    return {
      columns: [
        { key: 'method', label: 'Method' },
        { key: 'payments', label: 'Payments', kind: 'number' },
        { key: 'amount', label: 'Total', kind: 'money' },
      ],
      rows: [...m.entries()].sort((a, b) => b[1].cents - a[1].cents)
        .map(([method, v]) => ({ method, payments: v.count, amount: v.cents })),
      summary: [{ label: 'Total collected', value: formatCents(total) }],
    }
  },
}

const dailyClose: ReportDef = {
  id: 'daily-close',
  name: 'Daily close',
  group: 'Money',
  blurb: 'Day-by-day totals with cash split out — the end-of-day sheet for the drawer count.',
  run: async (from, to) => {
    const rows = await payments(from, to)
    if (!rows) return EMPTY('Could not read payments.')
    const days = new Map<string, { card: number; cash: number; cashapp: number; other: number; count: number }>()
    for (const p of rows) {
      const d = localDate(p.created_at)
      const cur = days.get(d) ?? { card: 0, cash: 0, cashapp: 0, other: 0, count: 0 }
      if (p.method === 'stripe') cur.card += p.amount_cents
      else if (p.method === 'cash') cur.cash += p.amount_cents
      else if (p.method === 'cashapp') cur.cashapp += p.amount_cents
      else cur.other += p.amount_cents
      cur.count += 1
      days.set(d, cur)
    }
    const total = rows.reduce((n, p) => n + p.amount_cents, 0)
    const cashTotal = rows.filter((p) => p.method === 'cash').reduce((n, p) => n + p.amount_cents, 0)
    return {
      columns: [
        { key: 'day', label: 'Day' },
        { key: 'count', label: 'Payments', kind: 'number' },
        { key: 'card', label: 'Card', kind: 'money' },
        { key: 'cash', label: 'Cash', kind: 'money' },
        { key: 'cashapp', label: 'Cash App', kind: 'money' },
        { key: 'other', label: 'Other', kind: 'money' },
        { key: 'total', label: 'Day total', kind: 'money' },
      ],
      rows: [...days.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([day, v]) => ({
        day, count: v.count, card: v.card, cash: v.cash, cashapp: v.cashapp, other: v.other,
        total: v.card + v.cash + v.cashapp + v.other,
      })),
      summary: [
        { label: 'Days with activity', value: String(days.size) },
        { label: 'Total collected', value: formatCents(total) },
        { label: 'Cash collected', value: formatCents(cashTotal) },
      ],
    }
  },
}

interface BookRow {
  code: string; facility_id: string; client_name: string; title: string; during: string
  status: string; price_cents: number; created_at: string
  deposit_cents?: number | null
  package_id?: string | null
  addon_ids?: string[] | null
  run_by_staff_id?: string | null
  payout_cents?: number | null
  payout_paid_at?: string | null
  payout_method?: string | null
  facilities: { name: string } | null
  staff: { name: string } | null
  payments: { amount_cents: number; status: string }[]
}

const BOOK_BASE = 'code, facility_id, client_name, title, during, status, price_cents, created_at, facilities:facility_id(name), staff:created_by(name), payments(amount_cents, status)'
const BOOK_SETS = [
  `deposit_cents, package_id, addon_ids, run_by_staff_id, payout_cents, payout_paid_at, payout_method, ${BOOK_BASE}`,
  `deposit_cents, addon_ids, ${BOOK_BASE}`,
  `deposit_cents, ${BOOK_BASE}`,
  BOOK_BASE,
]

// Bookings whose event falls inside the range (not when they were made).
async function bookings(fromIso: string, toIso: string): Promise<BookRow[] | null> {
  for (const cols of BOOK_SETS) {
    const { data, error } = await supabase()
      .from('bookings')
      .select(cols)
      .overlaps('during', `[${fromIso},${toIso})`)
      .limit(5000)
    if (!error) return data as unknown as BookRow[]
  }
  return null
}

function paidCents(b: BookRow): number {
  return b.payments.filter((p) => p.status === 'paid').reduce((n, p) => n + p.amount_cents, 0)
}

const outstanding: ReportDef = {
  id: 'outstanding',
  name: 'Outstanding balances',
  group: 'Money',
  blurb: 'Bookings in the range that still owe money — unpaid holds and part-paid parties.',
  run: async (from, to) => {
    const rows = await bookings(from, to)
    if (!rows) return EMPTY('Could not read bookings.')
    const owing = rows
      .filter((b) => b.status !== 'canceled' && paidCents(b) < b.price_cents)
      .map((b) => {
        const r = parseRange(b.during)
        return {
          date: r ? localDate(r.from.toISOString()) : '—',
          code: b.code,
          client: b.client_name,
          what: `${b.title} · ${b.facilities?.name ?? b.facility_id}`,
          status: b.status,
          price: b.price_cents,
          paid: paidCents(b),
          due: b.price_cents - paidCents(b),
        }
      })
      .sort((a, b) => a.date.localeCompare(b.date))
    const dueTotal = owing.reduce((n, r) => n + r.due, 0)
    return {
      columns: [
        { key: 'date', label: 'Event date' },
        { key: 'code', label: 'Booking' },
        { key: 'client', label: 'Client' },
        { key: 'what', label: 'What' },
        { key: 'status', label: 'Status' },
        { key: 'price', label: 'Price', kind: 'money' },
        { key: 'paid', label: 'Paid', kind: 'money' },
        { key: 'due', label: 'Still due', kind: 'money' },
      ],
      rows: owing,
      summary: [
        { label: 'Bookings owing', value: String(owing.length) },
        { label: 'Total outstanding', value: formatCents(dueTotal) },
      ],
    }
  },
}

const cashBag: ReportDef = {
  id: 'cash-bag',
  name: 'Cash bag ledger',
  group: 'Money',
  blurb: 'Every movement of physical cash with who recorded it and a running balance.',
  run: async (from, to) => {
    const sb = supabase()
    const before = await sb.from('cash_drawer_entries').select('amount_cents').lt('created_at', from).limit(10000)
    if (before.error) return EMPTY('The cash bag needs 0024_cash_drawer.sql.')
    let running = (before.data as { amount_cents: number }[]).reduce((n, r) => n + r.amount_cents, 0)
    const opening = running
    const { data, error } = await sb.from('cash_drawer_entries')
      .select('amount_cents, reason, created_at, staff(name)')
      .gte('created_at', from).lt('created_at', to)
      .order('created_at', { ascending: true }).limit(5000)
    if (error) return EMPTY('The cash bag needs 0024_cash_drawer.sql.')
    const rows = data as unknown as { amount_cents: number; reason: string; created_at: string; staff: { name: string } | null }[]
    const inCents = rows.reduce((n, r) => n + Math.max(r.amount_cents, 0), 0)
    const outCents = -rows.reduce((n, r) => n + Math.min(r.amount_cents, 0), 0)
    return {
      columns: [
        { key: 'date', label: 'Date' },
        { key: 'reason', label: 'Entry' },
        { key: 'staff', label: 'Recorded by' },
        { key: 'in', label: 'In', kind: 'money' },
        { key: 'out', label: 'Out', kind: 'money' },
        { key: 'balance', label: 'Balance', kind: 'money' },
      ],
      rows: rows.map((r) => {
        running += r.amount_cents
        return {
          date: stamp(r.created_at),
          reason: r.reason,
          staff: r.staff?.name ?? '—',
          in: r.amount_cents > 0 ? r.amount_cents : 0,
          out: r.amount_cents < 0 ? -r.amount_cents : 0,
          balance: running,
        }
      }),
      summary: [
        { label: 'Opening balance', value: formatCents(opening) },
        { label: 'Cash in', value: formatCents(inCents) },
        { label: 'Cash out', value: formatCents(outCents) },
        { label: 'Closing balance', value: formatCents(running) },
      ],
    }
  },
}

// ── Bookings & facility ──────────────────────────────────────

const bookingsDetail: ReportDef = {
  id: 'bookings-detail',
  name: 'Bookings detail',
  group: 'Bookings & facility',
  blurb: 'Every booking in the range: room, client, times, value, and what’s been paid.',
  run: async (from, to) => {
    const rows = await bookings(from, to)
    if (!rows) return EMPTY('Could not read bookings.')
    const out = rows.map((b) => {
      const r = parseRange(b.during)
      const hours = r ? (r.to.getTime() - r.from.getTime()) / 3600_000 : 0
      return {
        date: r ? localDate(r.from.toISOString()) : '—',
        time: r ? `${formatHour(r.from.getHours())}–${formatHour(r.to.getHours())}` : '—',
        hours: Math.round(hours * 10) / 10,
        code: b.code,
        room: b.facilities?.name ?? b.facility_id,
        client: b.client_name,
        title: b.title,
        status: b.status,
        price: b.price_cents,
        paid: paidCents(b),
        booked_by: b.staff?.name ?? 'online (member)',
      }
    }).sort((a, b) => a.date.localeCompare(b.date))
    const live = rows.filter((b) => b.status !== 'canceled')
    return {
      columns: [
        { key: 'date', label: 'Date' },
        { key: 'time', label: 'Time' },
        { key: 'hours', label: 'Hours', kind: 'number' },
        { key: 'code', label: 'Booking' },
        { key: 'room', label: 'Room' },
        { key: 'client', label: 'Client' },
        { key: 'title', label: 'What' },
        { key: 'status', label: 'Status' },
        { key: 'price', label: 'Price', kind: 'money' },
        { key: 'paid', label: 'Paid', kind: 'money' },
        { key: 'booked_by', label: 'Booked by' },
      ],
      rows: out,
      summary: [
        { label: 'Bookings', value: String(live.length) },
        { label: 'Booked value', value: formatCents(live.reduce((n, b) => n + b.price_cents, 0)) },
        { label: 'Collected on them', value: formatCents(live.reduce((n, b) => n + paidCents(b), 0)) },
      ],
    }
  },
}

const roomUtilization: ReportDef = {
  id: 'room-utilization',
  name: 'Room utilization',
  group: 'Bookings & facility',
  blurb: 'Hours booked and revenue per room — which spaces earn their keep.',
  run: async (from, to) => {
    const rows = await bookings(from, to)
    if (!rows) return EMPTY('Could not read bookings.')
    const m = new Map<string, { name: string; hours: number; count: number; cents: number; paid: number }>()
    for (const b of rows) {
      if (b.status === 'canceled') continue
      const r = parseRange(b.during)
      const hours = r ? (r.to.getTime() - r.from.getTime()) / 3600_000 : 0
      const cur = m.get(b.facility_id) ?? { name: b.facilities?.name ?? b.facility_id, hours: 0, count: 0, cents: 0, paid: 0 }
      cur.hours += hours
      cur.count += 1
      cur.cents += b.price_cents
      cur.paid += paidCents(b)
      m.set(b.facility_id, cur)
    }
    const list = [...m.values()].sort((a, b) => b.cents - a.cents)
    return {
      columns: [
        { key: 'room', label: 'Room' },
        { key: 'bookings', label: 'Bookings', kind: 'number' },
        { key: 'hours', label: 'Hours booked', kind: 'hours' },
        { key: 'revenue', label: 'Booked value', kind: 'money' },
        { key: 'collected', label: 'Collected', kind: 'money' },
        { key: 'per_hour', label: 'Avg per hour', kind: 'money' },
      ],
      rows: list.map((r) => ({
        room: r.name,
        bookings: r.count,
        hours: Math.round(r.hours * 10) / 10,
        revenue: r.cents,
        collected: r.paid,
        per_hour: r.hours > 0 ? Math.round(r.cents / r.hours) : 0,
      })),
      summary: [
        { label: 'Rooms used', value: String(list.length) },
        { label: 'Total hours booked', value: `${Math.round(list.reduce((n, r) => n + r.hours, 0) * 10) / 10} h` },
      ],
    }
  },
}

const peakDemand: ReportDef = {
  id: 'peak-demand',
  name: 'Peak times',
  group: 'Bookings & facility',
  blurb: 'Bookings by day of week and start hour — where demand actually sits.',
  run: async (from, to) => {
    const rows = await bookings(from, to)
    if (!rows) return EMPTY('Could not read bookings.')
    const m = new Map<string, { dow: number; hour: number; count: number; cents: number }>()
    for (const b of rows) {
      if (b.status === 'canceled') continue
      const r = parseRange(b.during)
      if (!r) continue
      const dow = r.from.getDay()
      const hour = r.from.getHours()
      const key = `${dow}-${hour}`
      const cur = m.get(key) ?? { dow, hour, count: 0, cents: 0 }
      cur.count += 1
      cur.cents += b.price_cents
      m.set(key, cur)
    }
    const list = [...m.values()].sort((a, b) => b.count - a.count || b.cents - a.cents)
    return {
      columns: [
        { key: 'day', label: 'Day' },
        { key: 'hour', label: 'Start time' },
        { key: 'bookings', label: 'Bookings', kind: 'number' },
        { key: 'revenue', label: 'Booked value', kind: 'money' },
      ],
      rows: list.map((r) => ({ day: DOW[r.dow], hour: formatHour(r.hour), bookings: r.count, revenue: r.cents })),
      summary: list.length > 0
        ? [{ label: 'Busiest slot', value: `${DOW[list[0].dow]} ${formatHour(list[0].hour)} · ${list[0].count} bookings` }]
        : [],
    }
  },
}

const packageSales: ReportDef = {
  id: 'package-sales',
  name: 'Party package sales',
  group: 'Bookings & facility',
  blurb: 'Which packages sell, how often, and what they bring in.',
  run: async (from, to) => {
    const rows = await bookings(from, to)
    if (!rows) return EMPTY('Could not read bookings.')
    if (rows.length > 0 && rows[0].package_id === undefined) {
      return EMPTY('Package tracking needs 0026_package_payouts.sql.')
    }
    const sb = supabase()
    const { data: pkgs } = await sb.from('event_packages').select('id, name')
    const names = new Map((pkgs as { id: string; name: string }[] ?? []).map((p) => [p.id, p.name]))
    const m = new Map<string, { count: number; cents: number; paid: number }>()
    for (const b of rows) {
      if (b.status === 'canceled' || !b.package_id) continue
      const cur = m.get(b.package_id) ?? { count: 0, cents: 0, paid: 0 }
      cur.count += 1
      cur.cents += b.price_cents
      cur.paid += paidCents(b)
      m.set(b.package_id, cur)
    }
    const list = [...m.entries()].sort((a, b) => b[1].cents - a[1].cents)
    return {
      columns: [
        { key: 'package', label: 'Package' },
        { key: 'sold', label: 'Sold', kind: 'number' },
        { key: 'revenue', label: 'Booked value', kind: 'money' },
        { key: 'collected', label: 'Collected', kind: 'money' },
      ],
      rows: list.map(([id, v]) => ({ package: names.get(id) ?? id, sold: v.count, revenue: v.cents, collected: v.paid })),
      summary: [
        { label: 'Packages sold', value: String(list.reduce((n, [, v]) => n + v.count, 0)) },
        { label: 'Package revenue', value: formatCents(list.reduce((n, [, v]) => n + v.cents, 0)) },
      ],
    }
  },
}

const addonSales: ReportDef = {
  id: 'addon-sales',
  name: 'Add-on sales',
  group: 'Bookings & facility',
  blurb: 'How often the inflatable, photo booth, and friends get rented.',
  run: async (from, to) => {
    const rows = await bookings(from, to)
    if (!rows) return EMPTY('Could not read bookings.')
    if (rows.length > 0 && rows[0].addon_ids === undefined) {
      return EMPTY('Add-on tracking needs 0022_addon_conflicts.sql.')
    }
    const sb = supabase()
    const { data: addons } = await sb.from('addons').select('id, name')
    const names = new Map((addons as { id: string; name: string }[] ?? []).map((a) => [a.id, a.name]))
    const m = new Map<string, number>()
    let withAddons = 0
    let live = 0
    for (const b of rows) {
      if (b.status === 'canceled') continue
      live += 1
      const ids = b.addon_ids ?? []
      if (ids.length > 0) withAddons += 1
      for (const id of ids) m.set(id, (m.get(id) ?? 0) + 1)
    }
    const list = [...m.entries()].sort((a, b) => b[1] - a[1])
    return {
      columns: [
        { key: 'addon', label: 'Add-on' },
        { key: 'times', label: 'Times booked', kind: 'number' },
        { key: 'attach', label: 'On this share of bookings' },
      ],
      rows: list.map(([id, count]) => ({
        addon: names.get(id) ?? id,
        times: count,
        attach: live > 0 ? `${Math.round((count / live) * 100)}%` : '0%',
      })),
      summary: [
        { label: 'Bookings with an add-on', value: `${withAddons} of ${live}` },
        { label: 'Attach rate', value: live > 0 ? `${Math.round((withAddons / live) * 100)}%` : '0%' },
      ],
      note: 'Add-on money is folded into each booking’s price, so revenue shows in the bookings reports.',
    }
  },
}

const cancellations: ReportDef = {
  id: 'cancellations',
  name: 'Cancellations',
  group: 'Bookings & facility',
  blurb: 'What fell through in the range, and the value that went with it.',
  run: async (from, to) => {
    const rows = await bookings(from, to)
    if (!rows) return EMPTY('Could not read bookings.')
    const gone = rows.filter((b) => b.status === 'canceled').map((b) => {
      const r = parseRange(b.during)
      return {
        date: r ? localDate(r.from.toISOString()) : '—',
        code: b.code,
        room: b.facilities?.name ?? b.facility_id,
        client: b.client_name,
        title: b.title,
        price: b.price_cents,
        kept: paidCents(b),
      }
    }).sort((a, b) => a.date.localeCompare(b.date))
    const live = rows.filter((b) => b.status !== 'canceled').length
    return {
      columns: [
        { key: 'date', label: 'Was booked for' },
        { key: 'code', label: 'Booking' },
        { key: 'room', label: 'Room' },
        { key: 'client', label: 'Client' },
        { key: 'title', label: 'What' },
        { key: 'price', label: 'Would have been', kind: 'money' },
        { key: 'kept', label: 'Money kept', kind: 'money' },
      ],
      rows: gone,
      summary: [
        { label: 'Cancellations', value: String(gone.length) },
        { label: 'Cancellation rate', value: live + gone.length > 0 ? `${Math.round((gone.length / (live + gone.length)) * 100)}%` : '0%' },
        { label: 'Value lost', value: formatCents(gone.reduce((n, r) => n + r.price - r.kept, 0)) },
      ],
    }
  },
}

// ── Membership ───────────────────────────────────────────────

interface SubRow {
  plan_id: string; status: string; current_period_end: string | null; created_at: string; updated_at: string
  client_accounts: { name: string } | null
  membership_plans: { name: string; price_cents: number; period: string } | null
}

async function subs(): Promise<SubRow[] | null> {
  const { data, error } = await supabase()
    .from('member_subscriptions')
    .select('plan_id, status, current_period_end, created_at, updated_at, client_accounts:account_id(name), membership_plans:plan_id(name, price_cents, period)')
    .limit(5000)
  if (error) return null
  return data as unknown as SubRow[]
}

const memberRoster: ReportDef = {
  id: 'member-roster',
  name: 'Membership roster',
  group: 'Memberships',
  blurb: 'Everyone with a fitness membership right now, their plan, and when it renews.',
  run: async () => {
    const rows = await subs()
    if (!rows) return EMPTY('Could not read memberships.')
    const live = rows.filter((s) => s.status === 'active' || s.status === 'canceling')
    return {
      columns: [
        { key: 'member', label: 'Account' },
        { key: 'plan', label: 'Plan' },
        { key: 'status', label: 'Status' },
        { key: 'price', label: 'Price', kind: 'money' },
        { key: 'period', label: 'Billing' },
        { key: 'renews', label: 'Renews / ends' },
        { key: 'joined', label: 'Member since' },
      ],
      rows: live.map((s) => ({
        member: s.client_accounts?.name ?? '—',
        plan: s.membership_plans?.name ?? s.plan_id,
        status: s.status,
        price: s.membership_plans?.price_cents ?? 0,
        period: s.membership_plans?.period ?? '—',
        renews: s.current_period_end ?? '—',
        joined: localDate(s.created_at),
      })).sort((a, b) => a.member.localeCompare(b.member)),
      summary: [
        { label: 'Active members', value: String(rows.filter((s) => s.status === 'active').length) },
        { label: 'Ending (canceled, still in period)', value: String(rows.filter((s) => s.status === 'canceling').length) },
      ],
      note: 'A roster is a snapshot of today, so the date range doesn’t change it.',
    }
  },
}

const membershipChanges: ReportDef = {
  id: 'membership-changes',
  name: 'Signups & cancellations',
  group: 'Memberships',
  blurb: 'Who joined and who left inside the range — your growth number.',
  run: async (from, to) => {
    const rows = await subs()
    if (!rows) return EMPTY('Could not read memberships.')
    const joined = rows.filter((s) => s.created_at >= from && s.created_at < to)
    const left = rows.filter((s) => (s.status === 'canceled' || s.status === 'canceling') && s.updated_at >= from && s.updated_at < to)
    const out = [
      ...joined.map((s) => ({
        date: localDate(s.created_at),
        change: 'Joined',
        member: s.client_accounts?.name ?? '—',
        plan: s.membership_plans?.name ?? s.plan_id,
        value: s.membership_plans?.price_cents ?? 0,
      })),
      ...left.map((s) => ({
        date: localDate(s.updated_at),
        change: s.status === 'canceling' ? 'Canceled (runs to period end)' : 'Ended',
        member: s.client_accounts?.name ?? '—',
        plan: s.membership_plans?.name ?? s.plan_id,
        value: -(s.membership_plans?.price_cents ?? 0),
      })),
    ].sort((a, b) => a.date.localeCompare(b.date))
    return {
      columns: [
        { key: 'date', label: 'Date' },
        { key: 'change', label: 'Change' },
        { key: 'member', label: 'Account' },
        { key: 'plan', label: 'Plan' },
        { key: 'value', label: 'Recurring impact', kind: 'money' },
      ],
      rows: out,
      summary: [
        { label: 'Joined', value: String(joined.length) },
        { label: 'Canceled', value: String(left.length) },
        { label: 'Net', value: `${joined.length - left.length >= 0 ? '+' : ''}${joined.length - left.length}` },
      ],
    }
  },
}

const planMix: ReportDef = {
  id: 'plan-mix',
  name: 'Plan mix & recurring revenue',
  group: 'Memberships',
  blurb: 'Members per plan and the monthly recurring revenue they represent.',
  run: async () => {
    const rows = await subs()
    if (!rows) return EMPTY('Could not read memberships.')
    const live = rows.filter((s) => s.status === 'active' || s.status === 'canceling')
    const m = new Map<string, { name: string; count: number; price: number; period: string }>()
    for (const s of live) {
      const cur = m.get(s.plan_id) ?? {
        name: s.membership_plans?.name ?? s.plan_id,
        count: 0,
        price: s.membership_plans?.price_cents ?? 0,
        period: s.membership_plans?.period ?? 'month',
      }
      cur.count += 1
      m.set(s.plan_id, cur)
    }
    const monthly = (p: { price: number; period: string; count: number }) =>
      (p.period === 'year' ? Math.round(p.price / 12) : p.price) * p.count
    const list = [...m.values()].sort((a, b) => monthly(b) - monthly(a))
    return {
      columns: [
        { key: 'plan', label: 'Plan' },
        { key: 'members', label: 'Members', kind: 'number' },
        { key: 'price', label: 'Price', kind: 'money' },
        { key: 'period', label: 'Billed' },
        { key: 'mrr', label: 'Monthly value', kind: 'money' },
      ],
      rows: list.map((p) => ({ plan: p.name, members: p.count, price: p.price, period: p.period, mrr: monthly(p) })),
      summary: [
        { label: 'Members', value: String(live.length) },
        { label: 'Monthly recurring revenue', value: formatCents(list.reduce((n, p) => n + monthly(p), 0)) },
      ],
      note: 'Current standing memberships, so the date range doesn’t change it. Yearly plans are divided by 12.',
    }
  },
}

// ── Attendance ───────────────────────────────────────────────

interface CheckRow {
  who: string; context: string; entry_point: string; method: string; outcome: string; at: string
  account_id?: string | null
  checked_out_at?: string | null
}

async function checkIns(fromIso: string, toIso: string): Promise<CheckRow[] | null> {
  const sets = ['who, context, entry_point, method, outcome, at, account_id, checked_out_at', 'who, context, entry_point, method, outcome, at']
  for (const cols of sets) {
    const { data, error } = await supabase()
      .from('check_ins').select(cols)
      .gte('at', fromIso).lt('at', toIso)
      .order('at', { ascending: true }).limit(10000)
    if (!error) return data as unknown as CheckRow[]
  }
  return null
}

const attendanceDetail: ReportDef = {
  id: 'attendance',
  name: 'Attendance log',
  group: 'Attendance',
  blurb: 'Every check-in in the range — who, when, which door, and how they got in.',
  run: async (from, to) => {
    const rows = await checkIns(from, to)
    if (!rows) return EMPTY('Could not read check-ins.')
    return {
      columns: [
        { key: 'when', label: 'When' },
        { key: 'who', label: 'Who' },
        { key: 'context', label: 'Context' },
        { key: 'entry', label: 'Entry point' },
        { key: 'method', label: 'Method' },
        { key: 'outcome', label: 'Outcome' },
        { key: 'minutes', label: 'Minutes inside', kind: 'number' },
      ],
      rows: rows.map((c) => ({
        when: stamp(c.at),
        who: c.who,
        context: c.context,
        entry: c.entry_point,
        method: c.method,
        outcome: c.outcome,
        minutes: c.checked_out_at
          ? Math.max(1, Math.round((new Date(c.checked_out_at).getTime() - new Date(c.at).getTime()) / 60_000))
          : 0,
      })),
      summary: [
        { label: 'Check-ins', value: String(rows.length) },
        { label: 'Unique people', value: String(new Set(rows.map((c) => c.who)).size) },
        { label: 'Turned away', value: String(rows.filter((c) => c.outcome !== 'in').length) },
      ],
    }
  },
}

const attendanceDaily: ReportDef = {
  id: 'attendance-daily',
  name: 'Attendance by day',
  group: 'Attendance',
  blurb: 'Daily foot traffic — the number the board asks about.',
  run: async (from, to) => {
    const rows = await checkIns(from, to)
    if (!rows) return EMPTY('Could not read check-ins.')
    const days = new Map<string, { count: number; people: Set<string> }>()
    for (const c of rows) {
      const d = localDate(c.at)
      const cur = days.get(d) ?? { count: 0, people: new Set<string>() }
      cur.count += 1
      cur.people.add(c.who)
      days.set(d, cur)
    }
    const list = [...days.entries()].sort((a, b) => a[0].localeCompare(b[0]))
    const busiest = [...list].sort((a, b) => b[1].count - a[1].count)[0]
    return {
      columns: [
        { key: 'day', label: 'Day' },
        { key: 'weekday', label: 'Weekday' },
        { key: 'checkins', label: 'Check-ins', kind: 'number' },
        { key: 'people', label: 'Unique people', kind: 'number' },
      ],
      rows: list.map(([day, v]) => ({
        day,
        weekday: DOW[new Date(`${day}T12:00:00`).getDay()],
        checkins: v.count,
        people: v.people.size,
      })),
      summary: [
        { label: 'Total check-ins', value: String(rows.length) },
        { label: 'Average per open day', value: list.length ? String(Math.round(rows.length / list.length)) : '0' },
        ...(busiest ? [{ label: 'Busiest day', value: `${busiest[0]} · ${busiest[1].count}` }] : []),
      ],
    }
  },
}

const memberFrequency: ReportDef = {
  id: 'member-frequency',
  name: 'Member visit frequency',
  group: 'Attendance',
  blurb: 'How often each member actually shows up, and time spent — your retention early-warning.',
  run: async (from, to) => {
    const rows = await checkIns(from, to)
    if (!rows) return EMPTY('Could not read check-ins.')
    const memberish = rows.filter((c) => c.account_id != null || c.method === 'self' || c.method === 'app unlock')
    if (memberish.length === 0) {
      return EMPTY('No member check-ins in this range (member visits need 0019_member_visits.sql).')
    }
    const m = new Map<string, { visits: number; minutes: number; last: string }>()
    for (const c of memberish) {
      const cur = m.get(c.who) ?? { visits: 0, minutes: 0, last: c.at }
      cur.visits += 1
      if (c.checked_out_at) {
        cur.minutes += Math.max(1, Math.round((new Date(c.checked_out_at).getTime() - new Date(c.at).getTime()) / 60_000))
      }
      if (c.at > cur.last) cur.last = c.at
      m.set(c.who, cur)
    }
    const list = [...m.entries()].sort((a, b) => b[1].visits - a[1].visits)
    const days = Math.max(1, Math.round((new Date(to).getTime() - new Date(from).getTime()) / 86_400_000))
    return {
      columns: [
        { key: 'member', label: 'Member' },
        { key: 'visits', label: 'Visits', kind: 'number' },
        { key: 'per_week', label: 'Visits per week' },
        { key: 'minutes', label: 'Minutes inside', kind: 'number' },
        { key: 'avg', label: 'Average visit (min)', kind: 'number' },
        { key: 'last', label: 'Last visit' },
      ],
      rows: list.map(([who, v]) => ({
        member: who,
        visits: v.visits,
        per_week: (v.visits / (days / 7)).toFixed(1),
        minutes: v.minutes,
        avg: v.visits > 0 && v.minutes > 0 ? Math.round(v.minutes / v.visits) : 0,
        last: localDate(v.last),
      })),
      summary: [
        { label: 'Members who visited', value: String(list.length) },
        { label: 'Total member visits', value: String(memberish.length) },
        { label: 'Average visits each', value: list.length ? (memberish.length / list.length).toFixed(1) : '0' },
      ],
    }
  },
}

const doorAudit: ReportDef = {
  id: 'door-audit',
  name: 'Door access audit',
  group: 'Attendance',
  blurb: 'Every app door unlock — the security trail for the fitness entrance.',
  run: async (from, to) => {
    const rows = await checkIns(from, to)
    if (!rows) return EMPTY('Could not read check-ins.')
    const doors = rows.filter((c) => c.method === 'app unlock' || c.entry_point.toLowerCase().includes('door'))
    return {
      columns: [
        { key: 'when', label: 'When' },
        { key: 'who', label: 'Member' },
        { key: 'entry', label: 'Door' },
        { key: 'method', label: 'Method' },
        { key: 'outcome', label: 'Result' },
      ],
      rows: doors.map((c) => ({
        when: stamp(c.at), who: c.who, entry: c.entry_point, method: c.method, outcome: c.outcome,
      })),
      summary: [
        { label: 'Door unlocks', value: String(doors.length) },
        { label: 'Unique members', value: String(new Set(doors.map((d) => d.who)).size) },
        { label: 'Denied', value: String(doors.filter((d) => d.outcome !== 'in').length) },
      ],
    }
  },
}

// ── Staff ────────────────────────────────────────────────────

const staffPayouts: ReportDef = {
  id: 'staff-payouts',
  name: 'Staff event pay',
  group: 'Staff',
  blurb: 'What each staff member earned running events, paid and still owed.',
  run: async (from, to) => {
    const rows = await bookings(from, to)
    if (!rows) return EMPTY('Could not read bookings.')
    if (rows.length > 0 && rows[0].payout_paid_at === undefined) {
      return EMPTY('Staff pay needs 0023_staff_payouts.sql.')
    }
    const { data: staffRows } = await supabase().from('staff').select('id, name, role')
    const staff = new Map((staffRows as { id: string; name: string; role: string }[] ?? []).map((s) => [s.id, s]))
    const out = rows
      .filter((b) => b.run_by_staff_id && b.status !== 'canceled')
      .map((b) => {
        const r = parseRange(b.during)
        const person = b.run_by_staff_id ? staff.get(b.run_by_staff_id) : undefined
        return {
          date: r ? localDate(r.from.toISOString()) : '—',
          code: b.code,
          event: `${b.title} · ${b.facilities?.name ?? b.facility_id}`,
          staff: person?.name ?? '—',
          role: person?.role ?? '—',
          booking: b.price_cents,
          payout: b.payout_cents ?? 0,
          paid: b.payout_paid_at ? (b.payout_method === 'cashapp' ? 'Cash App' : 'Cash') : 'Not yet',
        }
      })
      .sort((a, b) => a.date.localeCompare(b.date))
    const owed = out.filter((r) => r.paid === 'Not yet').reduce((n, r) => n + r.payout, 0)
    return {
      columns: [
        { key: 'date', label: 'Event date' },
        { key: 'code', label: 'Booking' },
        { key: 'event', label: 'Event' },
        { key: 'staff', label: 'Run by' },
        { key: 'role', label: 'Role' },
        { key: 'booking', label: 'Booking value', kind: 'money' },
        { key: 'payout', label: 'Event pay', kind: 'money' },
        { key: 'paid', label: 'Settled' },
      ],
      rows: out,
      summary: [
        { label: 'Events with an assigned runner', value: String(out.length) },
        { label: 'Event pay total', value: formatCents(out.reduce((n, r) => n + r.payout, 0)) },
        { label: 'Still owed', value: formatCents(owed) },
      ],
    }
  },
}

const timesheets: ReportDef = {
  id: 'timesheets',
  name: 'Time sheets',
  group: 'Staff',
  blurb: 'Hours on the clock per person — the attendance record behind per-event pay.',
  run: async (from, to) => {
    const { data, error } = await supabase()
      .from('staff_shifts')
      .select('staff_id, clock_in, clock_out, note, staff(name)')
      .gte('clock_in', from).lt('clock_in', to)
      .order('clock_in', { ascending: true }).limit(5000)
    if (error) return EMPTY('The time clock needs 0025_time_clock.sql.')
    const rows = data as unknown as { staff_id: string; clock_in: string; clock_out: string | null; note: string; staff: { name: string } | null }[]
    const out = rows.map((s) => {
      const mins = s.clock_out
        ? Math.max(1, Math.round((new Date(s.clock_out).getTime() - new Date(s.clock_in).getTime()) / 60_000))
        : 0
      return {
        date: localDate(s.clock_in),
        staff: s.staff?.name ?? '—',
        in: new Date(s.clock_in).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
        out: s.clock_out ? new Date(s.clock_out).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : 'still on the clock',
        hours: Math.round((mins / 60) * 100) / 100,
        note: s.note,
      }
    })
    const totals = new Map<string, number>()
    for (const r of out) totals.set(r.staff, (totals.get(r.staff) ?? 0) + r.hours)
    return {
      columns: [
        { key: 'date', label: 'Date' },
        { key: 'staff', label: 'Staff' },
        { key: 'in', label: 'Clock in' },
        { key: 'out', label: 'Clock out' },
        { key: 'hours', label: 'Hours', kind: 'hours' },
        { key: 'note', label: 'Note' },
      ],
      rows: out,
      summary: [
        { label: 'Shifts', value: String(out.length) },
        { label: 'Total hours', value: `${Math.round(out.reduce((n, r) => n + r.hours, 0) * 10) / 10} h` },
        ...[...totals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3)
          .map(([name, h]) => ({ label: name, value: `${Math.round(h * 10) / 10} h` })),
      ],
    }
  },
}

const staffActivity: ReportDef = {
  id: 'staff-activity',
  name: 'Staff activity',
  group: 'Staff',
  blurb: 'Bookings written and money taken by each staff member.',
  run: async (from, to) => {
    const pays = await payments(from, to)
    if (!pays) return EMPTY('Could not read payments.')
    const { data: bookRows } = await supabase()
      .from('bookings').select('created_at, price_cents, staff:created_by(name)')
      .gte('created_at', from).lt('created_at', to).limit(5000)
    const books = (bookRows ?? []) as unknown as { price_cents: number; staff: { name: string } | null }[]
    const m = new Map<string, { books: number; booked: number; taken: number; payments: number }>()
    for (const b of books) {
      const name = b.staff?.name ?? 'online (member)'
      const cur = m.get(name) ?? { books: 0, booked: 0, taken: 0, payments: 0 }
      cur.books += 1
      cur.booked += b.price_cents
      m.set(name, cur)
    }
    for (const p of pays) {
      const name = p.staff?.name ?? 'online (member)'
      const cur = m.get(name) ?? { books: 0, booked: 0, taken: 0, payments: 0 }
      cur.taken += p.amount_cents
      cur.payments += 1
      m.set(name, cur)
    }
    return {
      columns: [
        { key: 'staff', label: 'Staff' },
        { key: 'bookings', label: 'Bookings written', kind: 'number' },
        { key: 'booked', label: 'Value booked', kind: 'money' },
        { key: 'payments', label: 'Payments taken', kind: 'number' },
        { key: 'taken', label: 'Money collected', kind: 'money' },
      ],
      rows: [...m.entries()].sort((a, b) => b[1].taken - a[1].taken).map(([staff, v]) => ({
        staff, bookings: v.books, booked: v.booked, payments: v.payments, taken: v.taken,
      })),
      summary: [{ label: 'Collected in range', value: formatCents(pays.reduce((n, p) => n + p.amount_cents, 0)) }],
    }
  },
}

// ── People ───────────────────────────────────────────────────

const clientRoster: ReportDef = {
  id: 'client-roster',
  name: 'Client roster',
  group: 'People',
  blurb: 'Every account with the people on it, contact email, and balance.',
  run: async () => {
    const { data, error } = await supabase()
      .from('client_accounts')
      .select('name, flag, created_at, clients(full_name, email, is_primary), ledger_entries(amount_cents)')
      .order('name').limit(5000)
    if (error) return EMPTY('Could not read client accounts.')
    const rows = data as unknown as {
      name: string; flag: string | null; created_at: string
      clients: { full_name: string; email: string | null; is_primary: boolean }[]
      ledger_entries: { amount_cents: number }[]
    }[]
    return {
      columns: [
        { key: 'account', label: 'Account' },
        { key: 'people', label: 'People on it' },
        { key: 'count', label: 'People', kind: 'number' },
        { key: 'email', label: 'Contact email' },
        { key: 'since', label: 'Created' },
        { key: 'flag', label: 'Flag' },
        { key: 'balance', label: 'Balance', kind: 'money' },
      ],
      rows: rows.map((a) => {
        const primary = a.clients.find((c) => c.is_primary) ?? a.clients[0]
        return {
          account: a.name,
          people: a.clients.map((c) => c.full_name).join(', ') || '—',
          count: a.clients.length,
          email: primary?.email ?? '—',
          since: localDate(a.created_at),
          flag: a.flag ?? '',
          balance: a.ledger_entries.reduce((n, l) => n + l.amount_cents, 0),
        }
      }),
      summary: [
        { label: 'Accounts', value: String(rows.length) },
        { label: 'People', value: String(rows.reduce((n, a) => n + a.clients.length, 0)) },
      ],
      note: 'A roster is a snapshot of today, so the date range doesn’t change it.',
    }
  },
}

const topCustomers: ReportDef = {
  id: 'top-customers',
  name: 'Top customers',
  group: 'People',
  blurb: 'Who spends the most with you in the range — your repeat-party families.',
  run: async (from, to) => {
    const rows = await payments(from, to)
    if (!rows) return EMPTY('Could not read payments.')
    const m = new Map<string, { cents: number; count: number; last: string }>()
    for (const p of rows) {
      const name = payerName(p)
      const cur = m.get(name) ?? { cents: 0, count: 0, last: p.created_at }
      cur.cents += p.amount_cents
      cur.count += 1
      if (p.created_at > cur.last) cur.last = p.created_at
      m.set(name, cur)
    }
    const list = [...m.entries()].sort((a, b) => b[1].cents - a[1].cents)
    return {
      columns: [
        { key: 'client', label: 'Customer' },
        { key: 'payments', label: 'Payments', kind: 'number' },
        { key: 'spent', label: 'Spent', kind: 'money' },
        { key: 'last', label: 'Last payment' },
      ],
      rows: list.map(([client, v]) => ({
        client, payments: v.count, spent: v.cents, last: localDate(v.last),
      })),
      summary: [
        { label: 'Paying customers', value: String(list.length) },
        { label: 'Average spend', value: formatCents(list.length ? Math.round(list.reduce((n, [, v]) => n + v.cents, 0) / list.length) : 0) },
      ],
    }
  },
}

const waiverCompliance: ReportDef = {
  id: 'waivers',
  name: 'Waivers signed',
  group: 'People',
  blurb: 'Signed waivers in the range with the participant name — your liability file.',
  run: async (from, to) => {
    const { data, error } = await supabase()
      .from('form_submissions')
      .select('participant, signed_by, signed_at, form_id, forms(name)')
      .gte('signed_at', from).lt('signed_at', to)
      .order('signed_at', { ascending: true }).limit(5000)
    if (error) return EMPTY('Could not read waivers.')
    const rows = data as unknown as { participant: string; signed_by: string; signed_at: string; form_id: string; forms: { name: string } | null }[]
    const byForm = new Map<string, number>()
    for (const r of rows) {
      const n = r.forms?.name ?? r.form_id
      byForm.set(n, (byForm.get(n) ?? 0) + 1)
    }
    return {
      columns: [
        { key: 'date', label: 'Signed' },
        { key: 'participant', label: 'Participant' },
        { key: 'signed_by', label: 'Signed by' },
        { key: 'form', label: 'Waiver' },
      ],
      rows: rows.map((r) => ({
        date: stamp(r.signed_at),
        participant: r.participant,
        signed_by: r.signed_by,
        form: r.forms?.name ?? r.form_id,
      })),
      summary: [
        { label: 'Waivers signed', value: String(rows.length) },
        ...[...byForm.entries()].map(([name, n]) => ({ label: name, value: String(n) })),
      ],
    }
  },
}

const messagesLog: ReportDef = {
  id: 'messages',
  name: 'Communications log',
  group: 'People',
  blurb: 'Mass emails sent, who they went to, and how many received them.',
  run: async (from, to) => {
    const { data, error } = await supabase()
      .from('messages')
      .select('subject, audience, recipient_count, created_at, sent_by')
      .gte('created_at', from).lt('created_at', to)
      .order('created_at', { ascending: false }).limit(2000)
    if (error) return EMPTY('The messages log needs 0018_messages.sql.')
    const rows = data as unknown as { subject: string; audience: string; recipient_count: number; created_at: string; sent_by: string }[]
    return {
      columns: [
        { key: 'date', label: 'Sent' },
        { key: 'subject', label: 'Subject' },
        { key: 'audience', label: 'Audience' },
        { key: 'recipients', label: 'Recipients', kind: 'number' },
        { key: 'staff', label: 'Sent by' },
      ],
      rows: rows.map((m) => ({
        date: stamp(m.created_at),
        subject: m.subject,
        audience: m.audience,
        recipients: m.recipient_count,
        staff: m.sent_by || '—',
      })),
      summary: [
        { label: 'Sends', value: String(rows.length) },
        { label: 'Total recipients', value: String(rows.reduce((n, m) => n + m.recipient_count, 0)) },
      ],
    }
  },
}

export const REPORTS: ReportDef[] = [
  revenueSummary, transactionRegister, byMethod, dailyClose, outstanding, cashBag,
  bookingsDetail, roomUtilization, peakDemand, packageSales, addonSales, cancellations,
  memberRoster, membershipChanges, planMix,
  attendanceDetail, attendanceDaily, memberFrequency, doorAudit,
  staffPayouts, timesheets, staffActivity,
  clientRoster, topCustomers, waiverCompliance, messagesLog,
]

export const REPORT_GROUPS = ['Money', 'Bookings & facility', 'Memberships', 'Attendance', 'Staff', 'People']

// ── Rendering & export ───────────────────────────────────────

export function cellText(value: string | number, kind: CellKind | undefined): string {
  if (kind === 'money') return formatCents(Number(value))
  if (kind === 'hours') return `${value} h`
  return String(value)
}

// CSV gets raw numbers (dollars for money) so spreadsheets can total them.
function csvValue(value: string | number, kind: CellKind | undefined): string {
  if (kind === 'money') return (Number(value) / 100).toFixed(2)
  return String(value)
}

function escapeCsv(s: string): string {
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function toCsv(result: ReportResult, title: string, rangeLabel: string): string {
  const lines: string[] = []
  lines.push(escapeCsv(title))
  lines.push(escapeCsv(rangeLabel))
  if (result.summary.length > 0) {
    lines.push('')
    for (const s of result.summary) lines.push(`${escapeCsv(s.label)},${escapeCsv(s.value)}`)
  }
  lines.push('')
  lines.push(result.columns.map((c) => escapeCsv(c.label)).join(','))
  for (const row of result.rows) {
    lines.push(result.columns.map((c) => escapeCsv(csvValue(row[c.key] ?? '', c.kind))).join(','))
  }
  return lines.join('\r\n')
}

export function downloadCsv(filename: string, csv: string): void {
  // BOM keeps Excel happy with the £/$ and any accented names.
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
