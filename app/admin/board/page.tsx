import Link from 'next/link'
import { Board } from '@/components/board/Board'
import { card, INK, FAINT, LINE, BLUE } from '@/lib/theme'
import { bookings, kpis } from '@/lib/demo-data'

export default function BoardPage() {
  const holds = bookings.filter((b) => b.status === 'hold').length
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })

  return (
    <div className="sq-page" style={{ padding: '34px 40px 48px', maxWidth: 1180, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 24, marginBottom: 22, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 800, color: INK, margin: '0 0 6px', letterSpacing: '-0.03em' }}>The Board</h1>
          <p style={{ fontSize: 13, color: FAINT, margin: 0 }}>
            {today}&nbsp;&nbsp;·&nbsp;&nbsp;{kpis.bookingsToday} bookings&nbsp;&nbsp;·&nbsp;&nbsp;{holds} unpaid holds
          </p>
        </div>
        <Link href="/admin" style={{ fontSize: 12.5, color: BLUE, fontWeight: 600, textDecoration: 'none' }}>← Back to Today</Link>
      </div>

      <div className="sq-card" style={{ ...card, padding: '4px 14px 14px' }}>
        <Board />
      </div>

      <p style={{ fontSize: 11.5, color: FAINT, marginTop: 18, lineHeight: 1.5, borderTop: `1px solid ${LINE}`, paddingTop: 12 }}>
        Placeholder data — booking blocks are demo values until the live schedule flows. Week view arrives with Phase 1.
      </p>
    </div>
  )
}
