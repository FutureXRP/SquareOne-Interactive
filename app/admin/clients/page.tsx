import { PageHero, HeroStat } from '@/components/admin/PageHero'
import { card, INK, SUB, FAINT, LINE, GREEN, RED } from '@/lib/theme'
import { formatCents } from '@/lib/format'
import { clients } from '@/lib/admin-data'

export default function ClientsPage() {
  const owingCents = clients.filter((c) => c.balanceCents > 0).reduce((n, c) => n + c.balanceCents, 0)

  return (
    <div className="sq-page" style={{ padding: '34px 40px 20px', maxWidth: 1180, margin: '0 auto' }}>
      <PageHero title="Clients" sub="Family accounts and members. Balances come from the ledger — never edited by hand." chip={`${clients.length} accounts`}>
        <HeroStat label="Outstanding" value={formatCents(owingCents)} sub="across flagged accounts" />
      </PageHero>

      <div className="sq-card" style={{ ...card, overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: `1px solid ${LINE}` }}>
          <span style={{ fontSize: 13.5, fontWeight: 700, color: INK }}>Accounts</span>
          <span style={{ fontSize: 11.5, color: FAINT, marginLeft: 10 }}>read-only until Phase 2</span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <div style={{ minWidth: 640 }}>
            {clients.map((c, i) => (
              <div key={c.account} className="sq-row" style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 20px', borderBottom: i < clients.length - 1 ? `1px solid ${LINE}` : 'none' }}>
                <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#eef4fb', color: '#2f6db8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12.5, fontWeight: 800, flexShrink: 0, textTransform: 'uppercase' }}>{c.account.charAt(0)}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <p style={{ fontSize: 13, fontWeight: 700, color: INK, margin: 0 }}>{c.account}</p>
                    {c.flag && <span style={{ fontSize: 10, fontWeight: 700, color: RED, background: '#fae7e4', padding: '1px 8px', borderRadius: 999 }}>{c.flag}</span>}
                  </div>
                  <p style={{ fontSize: 12, color: SUB, margin: 0 }}>{c.members} member{c.members > 1 ? 's' : ''} · {c.plan === 'None' ? 'no membership' : `${c.plan} plan`} · last seen {c.lastSeen}</p>
                </div>
                <span style={{ fontSize: 13.5, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: c.balanceCents > 0 ? RED : c.balanceCents < 0 ? GREEN : FAINT, minWidth: 74, textAlign: 'right' }}>
                  {c.balanceCents === 0 ? '—' : c.balanceCents < 0 ? `+${formatCents(-c.balanceCents)}` : formatCents(c.balanceCents)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
      <p style={{ fontSize: 11.5, color: FAINT, marginTop: 16 }}>Negative balances show as green credit. Client editing and Amilia import land in the migration phase.</p>
    </div>
  )
}
