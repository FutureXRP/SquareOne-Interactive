'use client'
import { useEffect, useState } from 'react'
import { card, INK, SUB, FAINT, LINE, BLUE, GREEN } from '@/lib/theme'
import {
  getMyOpenVisits, memberCheckIn, memberCheckOut, getMyVisitStats,
  CHECKINS_EVENT, type MyVisit, type MyVisitStats,
} from '@/lib/checkins-store'
import { getFamilyMembers, FAMILY_EVENT, type FamilyMember } from '@/lib/family-store'

function fmtMin(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

// Self check-in/out for everyone on the account: one tap says "I'm
// here", another says "I'm done" — the gap is workout time. A family
// shares the login, so each person checks in under their own name and
// the building count knows exactly who's inside.
export function VisitCard({ accountId, memberName }: { accountId: string; memberName: string }) {
  const [visits, setVisits] = useState<MyVisit[]>([])
  const [family, setFamily] = useState<FamilyMember[]>([])
  const [stats, setStats] = useState<MyVisitStats | null>(null)
  const [available, setAvailable] = useState(true)
  const [busy, setBusy] = useState(false)
  const [justOut, setJustOut] = useState<{ who: string; min: number } | null>(null)
  const [, tick] = useState(0)

  const sync = async () => {
    try {
      const [v, s, f] = await Promise.all([
        getMyOpenVisits(accountId),
        getMyVisitStats(accountId),
        getFamilyMembers(accountId),
      ])
      setVisits(v ?? [])
      setStats(s)
      setFamily(f)
      setAvailable(s !== null && v !== null)
    } catch {
      setAvailable(false)
    }
  }

  useEffect(() => {
    sync()
    window.addEventListener(CHECKINS_EVENT, sync)
    window.addEventListener(FAMILY_EVENT, sync)
    const timer = window.setInterval(() => tick((n) => n + 1), 30_000) // live timers
    return () => {
      window.removeEventListener(CHECKINS_EVENT, sync)
      window.removeEventListener(FAMILY_EVENT, sync)
      window.clearInterval(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId])

  if (!available) return null // visit columns not migrated yet

  // Everyone on the account (the signed-in member even if family rows
  // haven't loaded), minus whoever is already inside.
  const people: FamilyMember[] = family.length > 0 ? family : [{ id: '', name: memberName, isPrimary: true }]
  const insideNames = new Set(visits.map((v) => v.who))
  const canCheckIn = people.filter((p) => !insideNames.has(p.name))
  const anyoneIn = visits.length > 0

  const elapsed = (v: MyVisit) => Math.max(1, Math.round((Date.now() - new Date(v.atIso).getTime()) / 60_000))

  const checkIn = async (p: FamilyMember) => {
    if (busy) return
    setBusy(true)
    setJustOut(null)
    await memberCheckIn(accountId, p.name, p.id || undefined)
    await sync()
    setBusy(false)
  }

  const checkOut = async (v: MyVisit) => {
    if (busy) return
    setBusy(true)
    const minutes = elapsed(v)
    const ok = await memberCheckOut(v.id)
    if (ok) setJustOut({ who: v.who, min: minutes })
    await sync()
    setBusy(false)
  }

  const solo = people.length === 1
  const soloVisit = solo && visits.length === 1 ? visits[0] : null

  return (
    <div className="sq-card" style={{ ...card, padding: '20px 24px', marginBottom: 24, background: anyoneIn ? '#e5f2ea' : '#fff' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ width: 44, height: 44, borderRadius: 12, background: anyoneIn ? GREEN : '#eef4fb', color: anyoneIn ? '#fff' : BLUE, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <svg width="22" height="22" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="4.5" r="2.4" stroke="currentColor" strokeWidth="1.6"/><path d="M3.5 14c.4-3 2.2-4.7 4.5-4.7S12.1 11 12.5 14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>
        </div>
        <div style={{ flex: 1, minWidth: 180 }}>
          <p style={{ fontSize: 14.5, fontWeight: 800, color: INK, margin: 0 }}>
            {soloVisit
              ? `You're checked in — ${fmtMin(elapsed(soloVisit))} so far`
              : anyoneIn
                ? `${visits.length === 1 ? visits[0].who + ' is' : visits.length + ' of you are'} in the building`
                : 'Gym visit'}
          </p>
          <p style={{ fontSize: 12.5, color: SUB, margin: '2px 0 0', lineHeight: 1.5 }}>
            {soloVisit && `In since ${soloVisit.when}. Tap check out on your way to the door.`}
            {!soloVisit && anyoneIn && 'Tap check out next to each name on the way to the door.'}
            {!anyoneIn && justOut !== null && `Nice work${solo ? '' : `, ${justOut.who}`} — ${fmtMin(justOut.min)} in the building. See you next time!`}
            {!anyoneIn && justOut === null && (solo
              ? 'Check in when you arrive and out when you leave — your workout time adds up below.'
              : 'Everyone checks in under their own name, so we know exactly who is here.')}
          </p>
        </div>
        {solo && (soloVisit
          ? <button className="sq-btn sq-btn-navy" style={{ padding: '10px 22px', fontSize: 14 }} disabled={busy} onClick={() => checkOut(soloVisit)}>{busy ? '…' : 'Check out'}</button>
          : <button className="sq-btn sq-btn-primary" style={{ padding: '10px 22px', fontSize: 14 }} disabled={busy} onClick={() => checkIn(people[0])}>{busy ? '…' : "I'm here — check in"}</button>)}
      </div>

      {/* Family: who's inside, one row per person */}
      {!solo && anyoneIn && (
        <div style={{ marginTop: 12, borderTop: `1px solid #bfe0cc` }}>
          {visits.map((v) => (
            <div key={v.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderBottom: `1px solid #d3e8db` }}>
              <span style={{ width: 8, height: 8, borderRadius: 999, background: GREEN, flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 13, fontWeight: 700, color: INK, margin: 0 }}>{v.who}</p>
                <p style={{ fontSize: 11.5, color: SUB, margin: 0, fontVariantNumeric: 'tabular-nums' }}>in since {v.when} · {fmtMin(elapsed(v))}</p>
              </div>
              <button className="sq-btn sq-btn-navy" style={{ padding: '6px 14px', fontSize: 12 }} disabled={busy} onClick={() => checkOut(v)}>Check out</button>
            </div>
          ))}
        </div>
      )}

      {/* Family: check-in chips for whoever isn't inside yet */}
      {!solo && canCheckIn.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 12, paddingTop: anyoneIn ? 0 : 10, borderTop: anyoneIn ? 'none' : `1px solid ${LINE}` }}>
          <span style={{ fontSize: 11.5, fontWeight: 700, color: FAINT, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Check in</span>
          {canCheckIn.map((p) => (
            <button key={p.id || p.name} className="sq-btn sq-btn-primary" style={{ padding: '7px 15px', fontSize: 12.5 }} disabled={busy} onClick={() => checkIn(p)}>
              {busy ? '…' : p.name}
            </button>
          ))}
        </div>
      )}

      {stats && (stats.visits30 > 0 || anyoneIn) && (
        <div style={{ display: 'flex', gap: '6px 22px', flexWrap: 'wrap', marginTop: 12, paddingTop: 10, borderTop: `1px solid ${anyoneIn ? '#bfe0cc' : LINE}` }}>
          <span style={{ fontSize: 11.5, color: SUB }}>Last 30 days{solo ? '' : ' (whole family)'}:&nbsp;<strong style={{ color: INK, fontVariantNumeric: 'tabular-nums' }}>{stats.visits30} visit{stats.visits30 === 1 ? '' : 's'}</strong></span>
          {stats.totalMin30 > 0 && <span style={{ fontSize: 11.5, color: SUB }}>Time working out:&nbsp;<strong style={{ color: INK, fontVariantNumeric: 'tabular-nums' }}>{fmtMin(stats.totalMin30)}</strong></span>}
          {stats.lastVisit && !anyoneIn && <span style={{ fontSize: 11.5, color: FAINT }}>last visit {stats.lastVisit}</span>}
        </div>
      )}
    </div>
  )
}
