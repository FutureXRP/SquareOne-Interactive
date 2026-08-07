import { PageHero } from '@/components/admin/PageHero'
import { card, INK, SUB, FAINT, LINE, BLUE } from '@/lib/theme'
import { messages } from '@/lib/admin-data'

export default function MessagesPage() {
  return (
    <div className="sq-page" style={{ padding: '34px 40px 20px', maxWidth: 1180, margin: '0 auto' }}>
      <PageHero title="Messages" sub="Email and SMS to members and guests — Claude drafts the words, deterministic code fills every number." chip="integration pending" />

      <div className="sq-card" style={{ ...card, overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: `1px solid ${LINE}` }}>
          <span style={{ fontSize: 13.5, fontWeight: 700, color: INK }}>Recent sends</span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <div style={{ minWidth: 560 }}>
            {messages.map((m, i) => (
              <div key={i} className="sq-row" style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 20px', borderBottom: i < messages.length - 1 ? `1px solid ${LINE}` : 'none' }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: m.channel === 'email' ? BLUE : '#8a4bbf', background: m.channel === 'email' ? '#eef4fb' : '#f3ecfa', padding: '2px 9px', borderRadius: 999, textTransform: 'uppercase', letterSpacing: '0.05em', flexShrink: 0, minWidth: 48, textAlign: 'center' }}>{m.channel}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 13, fontWeight: 700, color: INK, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.subject}</p>
                  <p style={{ fontSize: 12, color: SUB, margin: 0 }}>to {m.audience} · {m.when}</p>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <p style={{ fontSize: 12.5, fontWeight: 700, color: INK, margin: 0, fontVariantNumeric: 'tabular-nums' }}>{m.sent} sent</p>
                  <p style={{ fontSize: 11, color: FAINT, margin: 0, fontVariantNumeric: 'tabular-nums' }}>{m.openRate == null ? 'delivery only' : `${Math.round(m.openRate * 100)}% opened`}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <p style={{ fontSize: 11.5, color: FAINT, marginTop: 16 }}>Example sends — the composer, templates, and open tracking arrive with the communications integration.</p>
    </div>
  )
}
