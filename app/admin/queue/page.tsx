import Link from 'next/link'
import { PageHero } from '@/components/admin/PageHero'
import { card, INK, SUB, FAINT, LINE, BLUE, RED } from '@/lib/theme'
import { frontDeskQueue, type Urgency } from '@/lib/demo-data'

const URGENCY: Record<Urgency, { label: string; color: string; bg: string }> = {
  urgent: { label: 'urgent', color: RED, bg: '#fae7e4' },
  soon: { label: 'soon', color: '#b07818', bg: '#faf0dc' },
  idea: { label: 'idea', color: SUB, bg: '#eef2f8' },
}

const resolvedToday = [
  'Reissued fob for D. Fields (staff) · 11:20 AM',
  'Collected $32.00 past-due — Nguyen family · 10:05 AM',
  'Confirmed Saturday party — Ramos family · 9:12 AM',
]

export default function QueuePage() {
  return (
    <div className="sq-page" style={{ padding: '34px 40px 20px', maxWidth: 1180, margin: '0 auto' }}>
      <PageHero title="Front Desk" sub="Only items that need a human — each with one clear action. Everything else stays automated." chip={`${frontDeskQueue.length} open`} />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 14, marginBottom: 24 }}>
        {frontDeskQueue.map((q, i) => {
          const u = URGENCY[q.urgency]
          return (
            <Link key={i} href={q.href} style={{ textDecoration: 'none' }}>
              <div className="sq-card" style={{ ...card, padding: '16px 18px', height: '100%', borderTop: `3px solid ${u.color}` }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 4 }}>
                  <p style={{ fontSize: 14, fontWeight: 700, color: INK, margin: 0, lineHeight: 1.3 }}>{q.title}</p>
                  <span style={{ fontSize: 10.5, fontWeight: 700, color: u.color, background: u.bg, padding: '2px 9px', borderRadius: 999, flexShrink: 0 }}>{u.label}</span>
                </div>
                <p style={{ fontSize: 12.5, color: SUB, margin: '0 0 10px', lineHeight: 1.5 }}>{q.detail}</p>
                <span style={{ fontSize: 12.5, fontWeight: 700, color: BLUE }}>{q.action} →</span>
              </div>
            </Link>
          )
        })}
      </div>

      <div className="sq-card" style={card}>
        <div style={{ padding: '14px 20px', borderBottom: `1px solid ${LINE}` }}>
          <span style={{ fontSize: 13.5, fontWeight: 700, color: INK }}>Resolved today</span>
        </div>
        {resolvedToday.map((r, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 20px', borderBottom: i < resolvedToday.length - 1 ? `1px solid ${LINE}` : 'none' }}>
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0, color: '#2e8b57' }}><rect x="1.5" y="1.5" width="13" height="13" rx="4" fill="#e5f2ea"/><path d="M4.8 8.3l2.2 2.2 4.2-4.8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></svg>
            <p style={{ fontSize: 12.5, color: SUB, margin: 0 }}>{r}</p>
          </div>
        ))}
      </div>
      <p style={{ fontSize: 11.5, color: FAINT, marginTop: 16 }}>Example queue — the live version of this view is on the Today page (holds and balances are already real there); door and program items join when those integrations ship.</p>
    </div>
  )
}
