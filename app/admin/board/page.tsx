import { Board } from '@/components/board/Board'
import { PageHero, HeroStat } from '@/components/admin/PageHero'
import { card, FAINT, LINE } from '@/lib/theme'
import { bookings, kpis } from '@/lib/demo-data'

export default function BoardPage() {
  const holds = bookings.filter((b) => b.status === 'hold').length
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })

  return (
    <div className="sq-page" style={{ padding: '34px 40px 48px', maxWidth: 1180, margin: '0 auto' }}>
      <PageHero title="The Board" sub={`${today} · one lane per zone, 6 AM–11 PM`} chip={`${holds} unpaid holds`}>
        <HeroStat label="Bookings today" value={String(kpis.bookingsToday)} sub="striped blocks are unpaid holds" />
      </PageHero>

      <div className="sq-card" style={{ ...card, padding: '4px 14px 14px' }}>
        <Board />
      </div>

      <p style={{ fontSize: 11.5, color: FAINT, marginTop: 18, lineHeight: 1.5, borderTop: `1px solid ${LINE}`, paddingTop: 12 }}>
        Placeholder data — booking blocks are demo values until the live schedule flows. Week view arrives with Phase 1.
      </p>
    </div>
  )
}
