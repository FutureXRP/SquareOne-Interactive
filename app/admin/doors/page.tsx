'use client'
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { PageHero, HeroStat } from '@/components/admin/PageHero'
import { card, INK, SUB, FAINT, LINE, BLUE, GREEN, RED } from '@/lib/theme'
import { formatHour } from '@/lib/format'
import { getCheckIns, CHECKINS_EVENT, type CheckIn } from '@/lib/checkins-store'
import { isSupabaseConfigured } from '@/lib/supabase'

const OUTCOME: Record<string, { label: string; color: string; bg: string }> = {
  in: { label: 'IN', color: GREEN, bg: '#e5f2ea' },
  denied: { label: 'DENIED', color: RED, bg: '#fae7e4' },
  flagged: { label: 'FLAGGED', color: '#b07818', bg: '#faf0dc' },
}

const RANGES = [
  { days: 1, label: 'Today' },
  { days: 7, label: 'Last 7 days' },
  { days: 30, label: 'Last 30 days' },
]

export default function DoorsPage() {
  const [range, setRange] = useState(1)
  const [checkIns, setCheckIns] = useState<CheckIn[]>([])
  const todayIso = useMemo(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }, [])

  useEffect(() => {
    if (!isSupabaseConfigured()) return
    let on = true
    const sync = () => { getCheckIns(range).then((c) => { if (on) setCheckIns(c) }).catch(() => {}) }
    sync()
    const timer = window.setInterval(sync, 60_000) // stays live while open
    window.addEventListener(CHECKINS_EVENT, sync)
    return () => { on = false; window.clearInterval(timer); window.removeEventListener(CHECKINS_EVENT, sync) }
  }, [range])

  const today = checkIns.filter((c) => c.dateIso === todayIso)
  const appUnlocks = checkIns.filter((c) => c.method === 'app unlock').length
  const deskCheckIns = checkIns.filter((c) => c.method !== 'app unlock').length
  const flagged = checkIns.filter((c) => c.outcome !== 'in').length

  // Arrivals by hour, for today — shows the shape of the day at a glance.
  const byHour = useMemo(() => {
    const hours = Array.from({ length: 18 }, (_, i) => i + 5) // 5 AM – 10 PM
    return hours.map((h) => ({ h, n: today.filter((c) => c.hour === h).length }))
  }, [today])
  const maxHour = Math.max(...byHour.map((b) => b.n), 1)

  return (
    <div className="sq-page" style={{ padding: '34px 40px 20px', maxWidth: 1180, margin: '0 auto' }}>
      <PageHero title="Check-ins & Doors" sub="Every arrival, live: walk-ins and parties from the Front Desk plus member door unlocks from the app." chip="live">
        <HeroStat label="Today" value={String(today.length)} sub="arrivals so far" />
      </PageHero>

      {/* Range filter */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {RANGES.map((r) => (
          <button key={r.days} onClick={() => setRange(r.days)} style={{
            font: 'inherit', cursor: 'pointer', fontSize: 12.5, fontWeight: 600, padding: '6px 15px', borderRadius: 999,
            color: range === r.days ? '#fff' : SUB, background: range === r.days ? BLUE : '#fff',
            border: `1.5px solid ${range === r.days ? BLUE : LINE}`,
          }}>
            {r.label}
          </button>
        ))}
      </div>

      {/* Stat tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14, marginBottom: 16 }}>
        {[
          { label: 'Total arrivals', value: String(checkIns.length) },
          { label: 'Door unlocks (app)', value: String(appUnlocks), sub: 'members, no card scan' },
          { label: 'Front-desk check-ins', value: String(deskCheckIns) },
          { label: 'Denied / flagged', value: String(flagged) },
        ].map((t) => (
          <div key={t.label} className="sq-card" style={{ ...card, padding: '16px 20px' }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: FAINT, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 6px' }}>{t.label}</p>
            <p style={{ fontSize: 22, fontWeight: 800, color: INK, margin: 0, fontVariantNumeric: 'tabular-nums' }}>{t.value}</p>
            {t.sub && <p style={{ fontSize: 11.5, color: SUB, margin: '2px 0 0' }}>{t.sub}</p>}
          </div>
        ))}
      </div>

      {/* Today's arrivals by hour */}
      <div className="sq-card" style={{ ...card, padding: '18px 22px', marginBottom: 16 }}>
        <p style={{ fontSize: 13.5, fontWeight: 700, color: INK, margin: '0 0 14px' }}>Today&apos;s arrivals by hour</p>
        {today.length === 0 ? (
          <p style={{ fontSize: 13, color: SUB, margin: 0 }}>
            {isSupabaseConfigured() ? 'Nobody through the door yet today.' : 'Connect Supabase to see live check-ins.'}
          </p>
        ) : (
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 90 }}>
            {byHour.map((b) => (
              <div key={b.h} style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}
                title={`${formatHour(b.h)}: ${b.n} arrival${b.n === 1 ? '' : 's'}`}>
                <div style={{ width: '100%', maxWidth: 26, height: Math.max((b.n / maxHour) * 64, b.n > 0 ? 6 : 2), borderRadius: '4px 4px 0 0', background: b.n > 0 ? `linear-gradient(180deg, #5b93d6, ${BLUE})` : '#eef2f8' }} />
                <span style={{ fontSize: 8.5, color: FAINT, whiteSpace: 'nowrap' }}>{b.h % 3 === 0 ? formatHour(b.h) : ''}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Live log */}
      <div className="sq-card" style={card}>
        <div style={{ padding: '14px 20px', borderBottom: `1px solid ${LINE}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 13.5, fontWeight: 700, color: INK }}>Arrival log</span>
          <Link href="/admin/queue" style={{ fontSize: 12.5, color: BLUE, fontWeight: 600, textDecoration: 'none' }}>Check someone in →</Link>
        </div>
        {checkIns.length === 0 && (
          <p style={{ fontSize: 13, color: SUB, padding: '16px 20px', margin: 0 }}>
            No arrivals in this range yet — front-desk check-ins and member door unlocks appear here the moment they happen.
          </p>
        )}
        {checkIns.slice(0, 60).map((c, i) => {
          const o = OUTCOME[c.outcome] ?? OUTCOME.in
          return (
            <div key={c.id} className="sq-row" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 20px', borderBottom: i < Math.min(checkIns.length, 60) - 1 ? `1px solid ${LINE}` : 'none' }}>
              <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 11.5, color: FAINT, minWidth: 62, fontVariantNumeric: 'tabular-nums' }}>
                {range > 1 ? `${c.dateIso.slice(5).replace('-', '/')} ` : ''}{c.when}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 13, fontWeight: 700, color: INK, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.who}</p>
                <p style={{ fontSize: 11.5, color: SUB, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {c.context} · {c.entryPoint} · {c.method}
                </p>
              </div>
              {c.method === 'app unlock' && (
                <span style={{ fontSize: 10, fontWeight: 700, color: BLUE, background: '#eef4fb', padding: '2px 9px', borderRadius: 999, flexShrink: 0 }}>door</span>
              )}
              <span style={{ fontSize: 10.5, fontWeight: 700, color: o.color, background: o.bg, padding: '2px 9px', borderRadius: 999, flexShrink: 0 }}>{o.label}</span>
            </div>
          )
        })}
      </div>
      <p style={{ fontSize: 11.5, color: FAINT, marginTop: 16 }}>
        Live — walk-ins and parties come from the <Link href="/admin/queue" style={{ color: BLUE, fontWeight: 600 }}>Front Desk</Link>,
        door entries from the member app&apos;s Unlock button. The page also refreshes itself every minute while open.
      </p>
    </div>
  )
}
