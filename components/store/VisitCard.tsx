'use client'
import { useEffect, useState } from 'react'
import { card, INK, SUB, FAINT, LINE, BLUE, GREEN } from '@/lib/theme'
import {
  getMyOpenVisit, memberCheckIn, memberCheckOut, getMyVisitStats,
  CHECKINS_EVENT, type MyVisit, type MyVisitStats,
} from '@/lib/checkins-store'

function fmtMin(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

// Member self check-in/out: one tap says "I'm here", another says "I'm
// done" — the gap is their workout time, shown back as simple stats.
export function VisitCard({ accountId, memberName }: { accountId: string; memberName: string }) {
  const [visit, setVisit] = useState<MyVisit | null>(null)
  const [stats, setStats] = useState<MyVisitStats | null>(null)
  const [available, setAvailable] = useState(true)
  const [busy, setBusy] = useState(false)
  const [justOut, setJustOut] = useState<number | null>(null) // minutes of the workout just finished
  const [, tick] = useState(0)

  const sync = async () => {
    try {
      const [v, s] = await Promise.all([getMyOpenVisit(accountId), getMyVisitStats(accountId)])
      setVisit(v)
      setStats(s)
      setAvailable(s !== null)
    } catch {
      setAvailable(false)
    }
  }

  useEffect(() => {
    sync()
    window.addEventListener(CHECKINS_EVENT, sync)
    const timer = window.setInterval(() => tick((n) => n + 1), 30_000) // live timer
    return () => { window.removeEventListener(CHECKINS_EVENT, sync); window.clearInterval(timer) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId])

  if (!available) return null // visit columns not migrated yet

  const elapsedMin = visit ? Math.max(1, Math.round((Date.now() - new Date(visit.atIso).getTime()) / 60_000)) : 0

  const checkIn = async () => {
    if (busy) return
    setBusy(true)
    setJustOut(null)
    await memberCheckIn(accountId, memberName)
    await sync()
    setBusy(false)
  }

  const checkOut = async () => {
    if (busy || !visit) return
    setBusy(true)
    const minutes = elapsedMin
    const ok = await memberCheckOut(visit.id)
    if (ok) setJustOut(minutes)
    await sync()
    setBusy(false)
  }

  return (
    <div className="sq-card" style={{ ...card, padding: '20px 24px', marginBottom: 24, background: visit ? '#e5f2ea' : '#fff' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ width: 44, height: 44, borderRadius: 12, background: visit ? GREEN : '#eef4fb', color: visit ? '#fff' : BLUE, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <svg width="22" height="22" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="4.5" r="2.4" stroke="currentColor" strokeWidth="1.6"/><path d="M3.5 14c.4-3 2.2-4.7 4.5-4.7S12.1 11 12.5 14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>
        </div>
        <div style={{ flex: 1, minWidth: 180 }}>
          <p style={{ fontSize: 14.5, fontWeight: 800, color: INK, margin: 0 }}>
            {visit ? `You're checked in — ${fmtMin(elapsedMin)} so far` : 'Gym visit'}
          </p>
          <p style={{ fontSize: 12.5, color: SUB, margin: '2px 0 0', lineHeight: 1.5 }}>
            {visit && `In since ${visit.when}. Tap check out on your way to the door.`}
            {!visit && justOut !== null && `Nice work — ${fmtMin(justOut)} in the building. See you next time!`}
            {!visit && justOut === null && 'Check in when you arrive and out when you leave — your workout time adds up below.'}
          </p>
        </div>
        {visit
          ? <button className="sq-btn sq-btn-navy" style={{ padding: '10px 22px', fontSize: 14 }} disabled={busy} onClick={checkOut}>{busy ? '…' : 'Check out'}</button>
          : <button className="sq-btn sq-btn-primary" style={{ padding: '10px 22px', fontSize: 14 }} disabled={busy} onClick={checkIn}>{busy ? '…' : "I'm here — check in"}</button>}
      </div>
      {stats && (stats.visits30 > 0 || visit) && (
        <div style={{ display: 'flex', gap: '6px 22px', flexWrap: 'wrap', marginTop: 12, paddingTop: 10, borderTop: `1px solid ${visit ? '#bfe0cc' : LINE}` }}>
          <span style={{ fontSize: 11.5, color: SUB }}>Last 30 days:&nbsp;<strong style={{ color: INK, fontVariantNumeric: 'tabular-nums' }}>{stats.visits30} visit{stats.visits30 === 1 ? '' : 's'}</strong></span>
          {stats.totalMin30 > 0 && <span style={{ fontSize: 11.5, color: SUB }}>Time working out:&nbsp;<strong style={{ color: INK, fontVariantNumeric: 'tabular-nums' }}>{fmtMin(stats.totalMin30)}</strong></span>}
          {stats.lastVisit && !visit && <span style={{ fontSize: 11.5, color: FAINT }}>last visit {stats.lastVisit}</span>}
        </div>
      )}
    </div>
  )
}
