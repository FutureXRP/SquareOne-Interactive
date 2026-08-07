'use client'
import { useEffect, useState } from 'react'
import { Board } from '@/components/board/Board'
import { PageHero, HeroStat } from '@/components/admin/PageHero'
import { card, FAINT } from '@/lib/theme'
import { bookingsForDate, isoDate, BOOKINGS_EVENT } from '@/lib/staff-bookings-store'
import { isSupabaseConfigured } from '@/lib/supabase'

export default function BoardPage() {
  const [counts, setCounts] = useState({ bookings: 0, holds: 0 })
  const [today, setToday] = useState('')

  useEffect(() => {
    setToday(new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }))
    if (!isSupabaseConfigured()) return
    let on = true
    const sync = () => {
      bookingsForDate(isoDate(0)).then((b) => {
        if (on) setCounts({ bookings: b.length, holds: b.filter((x) => x.status === 'hold').length })
      }).catch(() => {})
    }
    sync()
    window.addEventListener(BOOKINGS_EVENT, sync)
    return () => { on = false; window.removeEventListener(BOOKINGS_EVENT, sync) }
  }, [])

  return (
    <div className="sq-page" style={{ padding: '34px 40px 20px', maxWidth: 1180, margin: '0 auto' }}>
      <PageHero title="The Board" sub={`${today} · one lane per zone, 6 AM–11 PM`} chip={`${counts.holds} unpaid holds`}>
        <HeroStat label="Bookings today" value={String(counts.bookings)} sub="striped blocks are unpaid holds" />
      </PageHero>

      <div className="sq-card" style={{ ...card, padding: '4px 14px 14px' }}>
        <Board />
      </div>

      <p style={{ fontSize: 11.5, color: FAINT, marginTop: 18, lineHeight: 1.5 }}>
        Live booking book — store requests and desk bookings land here the moment they happen.
      </p>
    </div>
  )
}
