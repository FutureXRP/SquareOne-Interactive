'use client'
import { useEffect, useMemo, useState } from 'react'
import { PageHero, HeroStat } from '@/components/admin/PageHero'
import { card, INK, SUB, FAINT, LINE, BLUE, GREEN, RED, GOLD } from '@/lib/theme'
import { formatCents } from '@/lib/format'
import {
  getPayments, getStaffBookings, setBookingRunBy, setBookingPayout, markPayoutPaid, undoPayoutPaid,
  BOOKINGS_EVENT, PAY_LABEL, type PaymentRow, type StaffBooking,
} from '@/lib/staff-bookings-store'
import { getRooms, type RoomConfig } from '@/lib/facilities-store'
import { getPackages, type EventPackage } from '@/lib/packages-store'
import { getStaff, getMyStaff, isAdminRole, type StaffMember } from '@/lib/staff-store'
import { getDrawer, addDrawerEntry, DRAWER_EVENT, type DrawerState } from '@/lib/cash-drawer-store'
import { isSupabaseConfigured } from '@/lib/supabase'

function dollarsToCents(v: string): number {
  const n = Number.parseFloat(v.replace(/[$,\s]/g, ''))
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : 0
}

// What a booking owes its runner: explicit override, else the package's
// rule (when the booking sells one), else the room's rule.
function defaultPayoutCents(b: StaffBooking, room: RoomConfig | undefined, pkg: EventPackage | undefined): number {
  if (b.payoutCents != null) return b.payoutCents
  const rule: { payoutKind?: string; payoutValue?: number } | undefined =
    pkg && pkg.payoutKind !== undefined && pkg.payoutKind !== 'none' ? pkg : room
  if (!rule || rule.payoutKind === undefined || rule.payoutKind === 'none') return 0
  if (rule.payoutKind === 'flat') return rule.payoutValue ?? 0
  return Math.round((b.priceCents * (rule.payoutValue ?? 0)) / 100)
}

export default function PaymentsPage() {
  const [payments, setPayments] = useState<PaymentRow[]>([])
  const [bookings, setBookings] = useState<StaffBooking[]>([])
  const [rooms, setRooms] = useState<RoomConfig[]>([])
  const [packages, setPackages] = useState<EventPackage[]>([])
  const [staff, setStaffList] = useState<StaffMember[]>([])
  const [me, setMe] = useState<StaffMember | null>(null)
  const [drawer, setDrawer] = useState<DrawerState | null>(null)
  const [drawerChecked, setDrawerChecked] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  // Cash bag quick-entry form
  const [bagAmount, setBagAmount] = useState('')
  const [bagReason, setBagReason] = useState('')

  useEffect(() => {
    if (!isSupabaseConfigured()) return
    let on = true
    const sync = () => {
      Promise.all([
        getPayments(), getStaffBookings(), getRooms().catch(() => []), getStaff().catch(() => []), getMyStaff().catch(() => null), getDrawer(), getPackages().catch(() => []),
      ]).then(([p, b, r, s, m, d, pk]) => {
        if (on) {
          setPayments(p); setBookings(b); setRooms(r); setStaffList(s); setMe(m); setDrawer(d); setPackages(pk)
          setDrawerChecked(true); setLoading(false)
        }
      }).catch(() => {})
    }
    sync()
    window.addEventListener(BOOKINGS_EVENT, sync)
    window.addEventListener(DRAWER_EVENT, sync)
    return () => { on = false; window.removeEventListener(BOOKINGS_EVENT, sync); window.removeEventListener(DRAWER_EVENT, sync) }
  }, [])

  const collectedCents = payments.reduce((n, p) => n + p.amountCents, 0)
  const staffById = useMemo(() => new Map(staff.map((s) => [s.id, s])), [staff])
  const roomById = useMemo(() => new Map(rooms.map((r) => [r.id, r])), [rooms])
  const payoutsMigrated = bookings.some((b) => b.payoutPaidAt !== undefined) || (bookings.length === 0 && rooms.some((r) => r.payoutKind !== undefined))

  // Payouts owed: fully paid bookings with a runner (or a room rule waiting
  // for one), not yet settled. Admin-run events accrue nothing.
  const pkgById = useMemo(() => new Map(packages.map((p) => [p.id, p])), [packages])

  const due = useMemo(() => bookings
    .filter((b) => b.payoutPaidAt === null && b.status !== 'canceled' && b.priceCents > 0 && b.paidCents >= b.priceCents)
    .map((b) => {
      const room = roomById.get(b.roomId)
      const pkg = b.packageId ? pkgById.get(b.packageId) : undefined
      const runner = b.runByStaffId ? staffById.get(b.runByStaffId) : undefined
      const amount = defaultPayoutCents(b, room, pkg)
      return { b, runner, amount, pkg, exempt: !!runner && isAdminRole(runner.role) }
    })
    .filter((x) => x.amount > 0 || x.b.runByStaffId)
    .sort((x, y) => x.b.date.localeCompare(y.b.date)), [bookings, roomById, pkgById, staffById])

  const paidOut = useMemo(() => bookings
    .filter((b) => !!b.payoutPaidAt)
    .sort((x, y) => (y.payoutPaidAt ?? '').localeCompare(x.payoutPaidAt ?? ''))
    .slice(0, 8), [bookings])

  const settle = async (b: StaffBooking, method: 'cash' | 'cashapp', amount: number, runnerName: string) => {
    if (busy || amount <= 0) return
    if (method === 'cash' && !window.confirm(`Mark ${formatCents(amount)} paid in cash to ${runnerName}? It comes out of the cash bag.`)) return
    setBusy(true)
    await markPayoutPaid(b, method, amount, runnerName, me?.id ?? null)
    setBusy(false)
  }

  const bagMove = async (dir: 1 | -1) => {
    const cents = dollarsToCents(bagAmount)
    if (busy || cents <= 0 || !bagReason.trim()) return
    setBusy(true)
    const ok = await addDrawerEntry(cents * dir, bagReason, me?.id ?? null)
    if (ok) { setBagAmount(''); setBagReason('') }
    setBusy(false)
  }

  return (
    <div className="sq-page" style={{ padding: '34px 40px 20px', maxWidth: 1180, margin: '0 auto' }}>
      <PageHero title="Payments" sub="Every payment taken at the desk or online, the cash bag, and staff event payouts — one money page." chip="live">
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
          <HeroStat label="Collected" value={formatCents(collectedCents)} sub={`${payments.length} recent payments`} />
          {drawer && <HeroStat label="Cash bag" value={formatCents(drawer.balanceCents)} sub="on hand" />}
        </div>
      </PageHero>

      {/* Staff payouts — due once the customer has paid in full */}
      {payoutsMigrated && (
        <div className="sq-card" style={{ ...card, overflow: 'hidden', marginBottom: 20 }}>
          <div style={{ padding: '14px 20px', borderBottom: `1px solid ${LINE}`, display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 13.5, fontWeight: 700, color: INK }}>Staff payouts</span>
            <span style={{ fontSize: 11.5, color: FAINT }}>owed once the booking is paid in full · Owners &amp; Admins don&apos;t accrue event pay</span>
            {due.filter((d) => !d.exempt && d.runner).length > 0 && (
              <span style={{ marginLeft: 'auto', fontSize: 10.5, fontWeight: 700, color: '#b07818', background: '#faf0dc', padding: '2px 10px', borderRadius: 999 }}>
                {due.filter((d) => !d.exempt && d.runner).length} to pay
              </span>
            )}
          </div>
          {due.length === 0 ? (
            <p style={{ fontSize: 13, color: SUB, padding: '16px 20px', margin: 0 }}>
              Nothing owed right now — payouts appear here when a booking with staff pay is paid in full.
            </p>
          ) : due.map(({ b, runner, amount, pkg, exempt }, i) => (
            <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 20px', flexWrap: 'wrap', borderBottom: i < due.length - 1 ? `1px solid ${LINE}` : 'none' }}>
              <div style={{ flex: 1, minWidth: 190 }}>
                <p style={{ fontSize: 13, fontWeight: 700, color: INK, margin: 0 }}>
                  {b.title} · {b.code}
                  {pkg && <span style={{ fontSize: 10, fontWeight: 700, color: BLUE, background: '#eef4fb', padding: '1px 8px', borderRadius: 999, marginLeft: 8 }}>{pkg.name}</span>}
                </p>
                <p style={{ fontSize: 12, color: SUB, margin: 0 }}>{b.date} · {b.client} · booking {formatCents(b.priceCents)} paid in full</p>
              </div>
              <select className="sq-select" style={{ width: 170, padding: '7px 10px', fontSize: 12.5 }} value={b.runByStaffId ?? ''}
                onChange={(e) => setBookingRunBy(b.id, e.target.value || null)}>
                <option value="">— who ran it? —</option>
                {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              {exempt ? (
                <span style={{ fontSize: 10.5, fontWeight: 700, color: SUB, background: '#eef2f8', padding: '3px 11px', borderRadius: 999 }}>
                  Admin — no event pay
                </span>
              ) : runner ? (
                <>
                  <input className="sq-input" style={{ width: 92, padding: '7px 10px', fontSize: 12.5, textAlign: 'right' }} inputMode="decimal"
                    defaultValue={(amount / 100).toFixed(2)} key={`po-${b.id}-${amount}`}
                    onBlur={(e) => { const c = dollarsToCents(e.target.value); if (c !== amount) setBookingPayout(b.id, c) }} />
                  {runner.cashtag && amount > 0 && (
                    <a className="sq-btn sq-btn-ghost" style={{ padding: '6px 13px', fontSize: 11.5, textDecoration: 'none' }}
                      href={`https://cash.app/$${runner.cashtag}/${(amount / 100).toFixed(2)}`} target="_blank" rel="noreferrer">
                      Open Cash App →
                    </a>
                  )}
                  <button className="sq-btn sq-btn-primary" style={{ padding: '6px 13px', fontSize: 11.5 }} disabled={busy || amount <= 0}
                    onClick={() => settle(b, 'cashapp', amount, runner.name)}>Paid · Cash App</button>
                  <button className="sq-btn sq-btn-navy" style={{ padding: '6px 13px', fontSize: 11.5 }} disabled={busy || amount <= 0}
                    onClick={() => settle(b, 'cash', amount, runner.name)}>Paid in cash</button>
                </>
              ) : (
                <span style={{ fontSize: 11.5, fontWeight: 600, color: '#b07818' }}>{formatCents(amount)} — assign who ran it to pay</span>
              )}
            </div>
          ))}
          {paidOut.length > 0 && (
            <div style={{ borderTop: `1px solid ${LINE}`, background: '#fafbfd' }}>
              {paidOut.map((b) => {
                const runner = b.runByStaffId ? staffById.get(b.runByStaffId) : undefined
                return (
                  <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 20px', fontSize: 12 }}>
                    <span style={{ color: GREEN, fontWeight: 700 }}>✓</span>
                    <span style={{ color: SUB, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {runner?.name ?? 'Staff'} paid <strong style={{ color: INK }}>{formatCents(b.payoutCents ?? 0)}</strong>
                      {' '}for {b.title} {b.code} · {b.payoutMethod === 'cashapp' ? 'Cash App' : 'cash'}
                    </span>
                    <button className="sq-btn sq-btn-ghost" style={{ padding: '3px 10px', fontSize: 10.5 }} disabled={busy}
                      onClick={async () => { setBusy(true); await undoPayoutPaid(b, runner?.name ?? 'Staff', me?.id ?? null); setBusy(false) }}>Undo</button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      <div className="sq-grid-2" style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 16, alignItems: 'start' }}>
        {/* Recent payments */}
        <div className="sq-card" style={{ ...card, overflow: 'hidden' }}>
          <div style={{ padding: '14px 20px', borderBottom: `1px solid ${LINE}` }}>
            <span style={{ fontSize: 13.5, fontWeight: 700, color: INK }}>Recent activity</span>
          </div>
          {payments.length === 0 ? (
            <p style={{ fontSize: 13, color: SUB, padding: '18px 20px', margin: 0 }}>
              {loading ? 'Loading…' : 'No payments yet — they appear here the moment staff take one on a booking.'}
            </p>
          ) : (
            payments.map((p, i) => (
              <div key={p.code} className="sq-row" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 20px', borderBottom: i < payments.length - 1 ? `1px solid ${LINE}` : 'none' }}>
                <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 11.5, color: FAINT, minWidth: 58 }}>{p.code}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 13, fontWeight: 700, color: INK, margin: 0 }}>{p.client}</p>
                  <p style={{ fontSize: 12, color: SUB, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {p.memo} · {PAY_LABEL[p.method] ?? p.method} · {p.when} · by {p.takenBy}
                  </p>
                </div>
                <span style={{ fontSize: 13.5, fontWeight: 700, color: GREEN, minWidth: 70, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{formatCents(p.amountCents)}</span>
              </div>
            ))
          )}
        </div>

        {/* The cash bag */}
        <div className="sq-card" style={{ ...card, overflow: 'hidden' }}>
          <div style={{ padding: '14px 20px', borderBottom: `1px solid ${LINE}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <span style={{ fontSize: 13.5, fontWeight: 700, color: INK }}>Cash bag</span>
            {drawer && (
              <span style={{ fontSize: 15, fontWeight: 800, color: drawer.balanceCents < 0 ? RED : INK, fontVariantNumeric: 'tabular-nums' }}>
                {formatCents(drawer.balanceCents)}
              </span>
            )}
          </div>
          {!drawer ? (
            <p style={{ fontSize: 12.5, color: SUB, padding: '16px 20px', margin: 0, lineHeight: 1.6 }}>
              {drawerChecked
                ? 'The cash bag needs 0024_cash_drawer.sql — run it in Supabase and this becomes a live ledger of the cash on hand.'
                : 'Loading…'}
            </p>
          ) : (
            <>
              <div style={{ padding: '12px 20px', borderBottom: `1px solid ${LINE}` }}>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <input className="sq-input" style={{ width: 90, padding: '8px 10px', fontSize: 12.5 }} inputMode="decimal" placeholder="$"
                    value={bagAmount} onChange={(e) => setBagAmount(e.target.value)} />
                  <input className="sq-input" style={{ flex: 1, minWidth: 130, padding: '8px 10px', fontSize: 12.5 }} placeholder="reason — bank deposit, change, count fix"
                    value={bagReason} onChange={(e) => setBagReason(e.target.value)} />
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <button className="sq-btn sq-btn-primary" style={{ padding: '7px 14px', fontSize: 12 }} disabled={busy || !bagAmount || !bagReason.trim()} onClick={() => bagMove(1)}>+ Into the bag</button>
                  <button className="sq-btn sq-btn-navy" style={{ padding: '7px 14px', fontSize: 12 }} disabled={busy || !bagAmount || !bagReason.trim()} onClick={() => bagMove(-1)}>− Out of the bag</button>
                </div>
                <p style={{ fontSize: 10.5, color: FAINT, margin: '8px 0 0', lineHeight: 1.5 }}>
                  Cash payments land in the bag automatically; cash payouts come out automatically.
                </p>
              </div>
              {drawer.entries.length === 0 ? (
                <p style={{ fontSize: 12.5, color: SUB, padding: '14px 20px', margin: 0 }}>No entries yet.</p>
              ) : (
                drawer.entries.slice(0, 12).map((e, i) => (
                  <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 20px', borderBottom: i < Math.min(drawer.entries.length, 12) - 1 ? `1px solid ${LINE}` : 'none' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 12.5, fontWeight: 600, color: INK, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.reason}</p>
                      <p style={{ fontSize: 11, color: FAINT, margin: 0 }}>{e.when}{e.staffName ? ` · ${e.staffName}` : ''}</p>
                    </div>
                    <span style={{ fontSize: 12.5, fontWeight: 700, color: e.amountCents < 0 ? RED : GREEN, fontVariantNumeric: 'tabular-nums' }}>
                      {e.amountCents < 0 ? '−' : '+'}{formatCents(Math.abs(e.amountCents))}
                    </span>
                  </div>
                ))
              )}
            </>
          )}
        </div>
      </div>

      {!payoutsMigrated && !loading && (
        <p style={{ fontSize: 11.5, color: GOLD, marginTop: 14, fontWeight: 600 }}>
          Staff payouts need 0023_staff_payouts.sql — run it in Supabase to turn on event pay.
        </p>
      )}
      <p style={{ fontSize: 11.5, color: FAINT, marginTop: 10 }}>
        &quot;Open Cash App&quot; pre-fills the payment to the staff member&apos;s $cashtag (set in Settings → Staff) — confirm the send in
        Cash App, then mark it paid here. Cash payouts come straight out of the cash bag.
      </p>
    </div>
  )
}
