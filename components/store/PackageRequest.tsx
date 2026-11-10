'use client'
// "Request this package" on the packages page. Asks for a date, a start
// time, and a phone number, then places a member hold on the package's
// first room with the package attached — the same path a room rental
// takes, so the customer gets the hold email, the desk gets the approval
// alert (Settings → booking alert email), and it shows up under Bookings.
import { tulsaInstant } from '@/lib/tulsa-time'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { BLUE, INK, SUB, FAINT, GREEN, RED } from '@/lib/theme'
import { formatHour } from '@/lib/format'
import { getSiteConfig, siteDayHours, closureFor, type SiteConfig } from '@/lib/site-config-store'
import { isSignedIn, requestMemberHold, getMyPhone, SESSION_EVENT } from '@/lib/session'
import type { EventPackage } from '@/lib/packages-store'
import { WaiverPanel } from '@/components/store/WaiverPanel'
import { unsignedRequiredWaivers, type RequiredWaiver } from '@/lib/waivers-live'
import { facilityBusy } from '@/lib/staff-bookings-store'
import { depositRuleSentence, DEPOSIT_RULE_GENERAL } from '@/lib/payment-policy'
import { getActiveRooms } from '@/lib/facilities-store'

function isoToday(offsetDays = 0): string {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function PackageRequest({ pkg, primary }: { pkg: EventPackage; primary: boolean }) {
  const [open, setOpen] = useState(false)
  const [cfg, setCfg] = useState<SiteConfig | null>(null)
  const [date, setDate] = useState('')
  const [startH, setStartH] = useState<number | null>(null)
  const [phone, setPhone] = useState('')
  const [requests, setRequests] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<{ code: string } | null>(null)
  // The room's waivers, signed as part of the request — never at the door.
  const [pendingWaivers, setPendingWaivers] = useState<RequiredWaiver[]>([])

  // Requests ride the member-hold path, which needs a signed-in account —
  // show the sign-in door instead of a form that can only fail.
  const [signedIn, setSignedIn] = useState(false)
  useEffect(() => {
    const sync = () => { isSignedIn().then(setSignedIn).catch(() => setSignedIn(false)) }
    sync()
    window.addEventListener(SESSION_EVENT, sync)
    return () => window.removeEventListener(SESSION_EVENT, sync)
  }, [])

  useEffect(() => {
    if (!open) return
    getSiteConfig().then(setCfg).catch(() => {})
    getMyPhone().then((p) => { if (p) setPhone((cur) => cur || p) }).catch(() => {})
  }, [open])

  const roomId = pkg.roomIds[0]
  // The lead room's deposit, when it requires one — what "at least the
  // deposit" means for this package.
  const [depositCents, setDepositCents] = useState<number | null>(null)
  // Each package room's own setup/cleanup time, which the database adds
  // around the party — the start-time list has to allow for it too.
  const [pads, setPads] = useState<{ before: number; after: number }>({ before: 0, after: 0 })
  // The lead room's notice window (hours ahead a booking must be made).
  const [noticeH, setNoticeH] = useState(48)
  useEffect(() => {
    if (!open || !roomId) return
    getActiveRooms().then((rs) => {
      const r = rs.find((x) => x.id === roomId)
      setDepositCents(r?.depositRequired && (r.depositCents ?? 0) > 0 ? Math.min(r.depositCents as number, pkg.priceCents) : null)
      setNoticeH(Math.max(0, ...rs.filter((x) => pkg.roomIds.includes(x.id)).map((x) => x.minNoticeHours ?? 48)))
      const inPkg = rs.filter((x) => pkg.roomIds.includes(x.id))
      setPads({
        before: Math.max(0, ...inPkg.map((x) => x.setupMin ?? 0)) / 60,
        after: Math.max(0, ...inPkg.map((x) => x.cleanupMin ?? 0)) / 60,
      })
    }).catch(() => {})
  }, [open, roomId, pkg.priceCents, pkg.roomIds])

  // What's already on the calendar in ANY of the package's rooms that day —
  // a party that needs the gym can't start while the gym is taken, even
  // if the gaming room is free.
  const [taken, setTaken] = useState<{ fromH: number; toH: number }[] | null>(null)
  useEffect(() => {
    if (!date || pkg.roomIds.length === 0) { setTaken(null); return }
    let live = true
    setTaken(null)
    Promise.all(pkg.roomIds.map((id) => facilityBusy(id, date).catch(() => [])))
      .then((lists) => { if (live) setTaken(lists.flat()) })
    return () => { live = false }
  }, [date, pkg.roomIds])
  const phoneOk = phone.replace(/\D/g, '').length >= 7

  // Start times that fit the package inside that day's opening hours.
  const day = useMemo(() => {
    if (!date) return null
    const [y, m, d] = date.split('-').map(Number)
    const js = new Date(y, m - 1, d)
    const closure = cfg ? closureFor(cfg, date) : null
    const hours = cfg ? siteDayHours(cfg, js.getDay()) : { closed: false, openH: 9, closeH: 21 }
    const closed = Boolean(closure) || hours.closed
    const starts: number[] = []
    if (!closed) {
      for (let h = Math.ceil(hours.openH); h + pkg.hours <= hours.closeH; h++) {
        const clash = (taken ?? []).some((w) => h - pads.before < w.toH && h + pkg.hours + pads.after > w.fromH)
        const tooSoon = tulsaInstant(date, h).getTime() < Date.now() + noticeH * 3600_000
        if (!clash && !tooSoon) starts.push(h)
      }
    }
    return { closed, starts, label: js.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }) }
  }, [date, cfg, pkg.hours, taken, pads, noticeH])

  const submit = async () => {
    if (!roomId || !date || startH == null || !phoneOk || busy) return
    setBusy(true)
    setError(null)
    // Same rule as booking a room: the waivers come first.
    // Every room in the package — a gym waiver applies to a party that
    // uses the gym, whichever room leads the booking.
    const lists = await Promise.all(pkg.roomIds.map((id) => unsignedRequiredWaivers({ roomId: id }).catch(() => [] as RequiredWaiver[])))
    const due = lists.flat().filter((w, i, all) => all.findIndex((x) => x.id === w.id) === i)
    if (due.length > 0) {
      setPendingWaivers(due)
      setBusy(false)
      return
    }
    await place()
  }

  const onWaiverSigned = () => {
    const rest = pendingWaivers.slice(1)
    setPendingWaivers(rest)
    if (rest.length === 0) { setBusy(true); setError(null); place() }
  }

  const place = async () => {
    if (!roomId || !date || startH == null) { setBusy(false); return }
    const note = requests.trim() ? `Package request · Requests: ${requests.trim()}` : 'Package request'
    const res = await requestMemberHold(roomId, `${pkg.name} package`, date, startH, pkg.hours, pkg.priceCents, depositCents ?? undefined, note, undefined, undefined, phone.trim(), { packageId: pkg.id })
    setBusy(false)
    if (res.ok) setDone({ code: res.code })
    else if (res.conflict) setError('That time is already taken in one of the package rooms. Try another start time or date.')
    else if (!(await isSignedIn().catch(() => false))) setError('Your sign-in expired — sign in again and resend. Everything you typed is still here.')
    else setError('Something went wrong sending your request. Please call the front desk.')
  }

  const doneRule = date && startH != null
    ? depositRuleSentence({ start: tulsaInstant(date, startH), depositCents })
    : DEPOSIT_RULE_GENERAL

  if (done) {
    return (
      <div style={{ background: '#e5f2ea', border: '1px solid #bfe0cc', borderRadius: 10, padding: '10px 13px' }}>
        <p style={{ fontSize: 12.5, fontWeight: 700, color: GREEN, margin: '0 0 2px' }}>Request received! Confirmation {done.code}</p>
        <p style={{ fontSize: 12, color: SUB, margin: 0, lineHeight: 1.5 }}>
          {day?.label}{startH != null ? `, ${formatHour(startH)}` : ''}. Your confirmation and payment link are on their way to your email. {doneRule}
        </p>
      </div>
    )
  }

  if (!roomId) {
    return <p style={{ fontSize: 12.5, color: SUB, margin: 0 }}>Call the front desk to book this package.</p>
  }

  if (!signedIn) {
    return (
      <>
        <Link href="/login" className={`sq-btn ${primary ? 'sq-btn-primary' : 'sq-btn-ghost'}`} style={{ width: '100%', marginBottom: 8, textAlign: 'center' }}>
          Sign in to request
        </Link>
        <p style={{ fontSize: 11.5, color: FAINT, margin: 0, textAlign: 'center' }}>
          New here? <Link href="/signup" style={{ color: BLUE, fontWeight: 600 }}>Create a profile</Link> — it takes a minute.
        </p>
      </>
    )
  }

  if (!open) {
    return (
      <button className={`sq-btn ${primary ? 'sq-btn-primary' : 'sq-btn-ghost'}`} style={{ width: '100%' }} onClick={() => setOpen(true)}>
        Request this package
      </button>
    )
  }

  if (pendingWaivers.length > 0) {
    return (
      <div style={{ display: 'grid', gap: 10 }}>
        <p style={{ fontSize: 12.5, color: SUB, margin: 0, lineHeight: 1.5 }}>
          One more step — this package needs a signed{' '}
          <strong style={{ color: INK }}>{pendingWaivers[0].name.toLowerCase()}</strong>
          {pendingWaivers.length > 1 ? ` (${pendingWaivers.length} to sign)` : ''}. Waivers are part of booking —
          nobody signs at the door. Sign and your request goes right through.
        </p>
        <WaiverPanel key={pendingWaivers[0].id} def={pendingWaivers[0]} compact onSigned={onWaiverSigned} />
        <button className="sq-btn sq-btn-ghost" style={{ width: '100%' }} onClick={() => setPendingWaivers([])}>Back to the request</button>
      </div>
    )
  }

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <div>
        <label className="sq-label" htmlFor={`pr-date-${pkg.id}`}>Date</label>
        <input id={`pr-date-${pkg.id}`} className="sq-input" type="date" min={isoToday(Math.floor(noticeH / 24))} max={isoToday(365)} value={date}
          onChange={(e) => { setDate(e.target.value); setStartH(null) }} />
      </div>
      {day && (
        <div>
          <label className="sq-label" htmlFor={`pr-time-${pkg.id}`}>Start time</label>
          {taken === null && !day.closed ? (
            <p style={{ fontSize: 12.5, color: SUB, margin: 0 }}>Checking what&apos;s open in every room…</p>
          ) : day.closed ? (
            <p style={{ fontSize: 12.5, color: RED, margin: 0 }}>We&apos;re closed that day. Pick another date.</p>
          ) : day.starts.length === 0 ? (
            <p style={{ fontSize: 12.5, color: RED, margin: 0 }}>No {pkg.hours}-hour window is open in every room of this package that day. Pick another date.</p>
          ) : (
            <select id={`pr-time-${pkg.id}`} className="sq-select" value={startH ?? ''} onChange={(e) => setStartH(e.target.value === '' ? null : Number(e.target.value))}>
              <option value="">Choose a time</option>
              {day.starts.map((h) => (
                <option key={h} value={h}>{formatHour(h)} – {formatHour(h + pkg.hours)}</option>
              ))}
            </select>
          )}
        </div>
      )}
      <div>
        <label className="sq-label" htmlFor={`pr-phone-${pkg.id}`}>Phone we can call</label>
        <input id={`pr-phone-${pkg.id}`} className="sq-input" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(918) 555-0123" />
      </div>
      <div>
        <label className="sq-label" htmlFor={`pr-notes-${pkg.id}`}>Anything we should know? (optional)</label>
        <textarea id={`pr-notes-${pkg.id}`} className="sq-textarea" rows={2} value={requests} onChange={(e) => setRequests(e.target.value)} placeholder="Birthday name, guest count, decorations…" />
      </div>
      {error && <p style={{ fontSize: 12.5, color: RED, margin: 0 }}>{error}</p>}
      <button className="sq-btn sq-btn-primary" style={{ width: '100%' }} disabled={busy || !date || startH == null || !phoneOk} onClick={submit}>
        {busy ? 'Sending…' : 'Send request'}
      </button>
      <p style={{ fontSize: 11, color: FAINT, margin: 0, lineHeight: 1.5 }}>
        Any waiver for the room is signed as part of this request — nobody signs at the door. <span style={{ color: INK }}>{DEPOSIT_RULE_GENERAL}</span> Pay from the link in your confirmation email, then sign the rental agreement and add a card on file before the day.
      </p>
    </div>
  )
}
