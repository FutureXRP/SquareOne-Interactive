'use client'
// "Request this package" on the packages page. Asks for a date, a start
// time, and a phone number, then places a member hold on the package's
// first room with the package attached — the same path a room rental
// takes, so the customer gets the hold email, the desk gets the approval
// alert (Settings → booking alert email), and it shows up under Bookings.
import { useEffect, useMemo, useState } from 'react'
import { INK, SUB, FAINT, GREEN, RED } from '@/lib/theme'
import { formatHour } from '@/lib/format'
import { getSiteConfig, siteDayHours, closureFor, type SiteConfig } from '@/lib/site-config-store'
import { requestMemberHold, getMyPhone } from '@/lib/session'
import type { EventPackage } from '@/lib/packages-store'

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

  useEffect(() => {
    if (!open) return
    getSiteConfig().then(setCfg).catch(() => {})
    getMyPhone().then((p) => { if (p) setPhone((cur) => cur || p) }).catch(() => {})
  }, [open])

  const roomId = pkg.roomIds[0]
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
    if (!closed) for (let h = Math.ceil(hours.openH); h + pkg.hours <= hours.closeH; h++) starts.push(h)
    return { closed, starts, label: js.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }) }
  }, [date, cfg, pkg.hours])

  const submit = async () => {
    if (!roomId || !date || startH == null || !phoneOk || busy) return
    setBusy(true)
    setError(null)
    const note = requests.trim() ? `Package request · Requests: ${requests.trim()}` : 'Package request'
    const res = await requestMemberHold(roomId, `${pkg.name} package`, date, startH, pkg.hours, pkg.priceCents, undefined, note, undefined, undefined, phone.trim(), { packageId: pkg.id })
    setBusy(false)
    if (res.ok) setDone({ code: res.code })
    else if (res.conflict) setError('That time is already taken in one of the package rooms. Try another start time or date.')
    else setError('Something went wrong sending your request. Please call the front desk.')
  }

  if (done) {
    return (
      <div style={{ background: '#e5f2ea', border: '1px solid #bfe0cc', borderRadius: 10, padding: '10px 13px' }}>
        <p style={{ fontSize: 12.5, fontWeight: 700, color: GREEN, margin: '0 0 2px' }}>Request received! Confirmation {done.code}</p>
        <p style={{ fontSize: 12, color: SUB, margin: 0, lineHeight: 1.5 }}>
          {day?.label}{startH != null ? `, ${formatHour(startH)}` : ''}. A confirmation is on its way to your email, and the front desk will call to lock in your date and take the deposit.
        </p>
      </div>
    )
  }

  if (!roomId) {
    return <p style={{ fontSize: 12.5, color: SUB, margin: 0 }}>Call the front desk to book this package.</p>
  }

  if (!open) {
    return (
      <button className={`sq-btn ${primary ? 'sq-btn-primary' : 'sq-btn-ghost'}`} style={{ width: '100%' }} onClick={() => setOpen(true)}>
        Request this package
      </button>
    )
  }

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <div>
        <label className="sq-label" htmlFor={`pr-date-${pkg.id}`}>Date</label>
        <input id={`pr-date-${pkg.id}`} className="sq-input" type="date" min={isoToday()} max={isoToday(365)} value={date}
          onChange={(e) => { setDate(e.target.value); setStartH(null) }} />
      </div>
      {day && (
        <div>
          <label className="sq-label" htmlFor={`pr-time-${pkg.id}`}>Start time</label>
          {day.closed ? (
            <p style={{ fontSize: 12.5, color: RED, margin: 0 }}>We&apos;re closed that day. Pick another date.</p>
          ) : day.starts.length === 0 ? (
            <p style={{ fontSize: 12.5, color: RED, margin: 0 }}>A {pkg.hours}-hour package doesn&apos;t fit that day&apos;s hours. Pick another date.</p>
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
        This places a 24-hour hold. The front desk confirms it with you by phone and takes the deposit. <span style={{ color: INK }}>Nothing is charged now.</span>
      </p>
    </div>
  )
}
