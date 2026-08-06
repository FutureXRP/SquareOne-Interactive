import Link from 'next/link'
import { PageHero } from '@/components/admin/PageHero'
import { StaffManager } from '@/components/admin/StaffManager'
import { card, INK, SUB, FAINT, LINE, ZONES } from '@/lib/theme'
import { formatCents } from '@/lib/format'
import { FACILITIES } from '@/lib/store-data'
import { HOURS, ADDRESS } from '@/lib/store-data'

export default function SettingsPage() {
  return (
    <div className="sq-page" style={{ padding: '34px 40px 20px', maxWidth: 1180, margin: '0 auto' }}>
      <PageHero title="Settings" sub="Facilities, price schedules, staff roles, and house rules — the knobs behind everything else." chip={`${ZONES.length} zones`} />

      <div className="sq-grid-2" style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 16 }}>
        {/* Facilities & pricing */}
        <div className="sq-card" style={{ ...card, overflow: 'hidden' }}>
          <div style={{ padding: '14px 20px', borderBottom: `1px solid ${LINE}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 13.5, fontWeight: 700, color: INK }}>Facilities &amp; price schedules</span>
            <Link href="/admin/rooms" style={{ fontSize: 12.5, color: '#2f6db8', fontWeight: 600, textDecoration: 'none' }}>Edit in Rooms &amp; Pricing →</Link>
          </div>
          {FACILITIES.map((f, i) => (
            <div key={f.zone.id} className="sq-row" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 20px', borderBottom: i < FACILITIES.length - 1 ? `1px solid ${LINE}` : 'none' }}>
              <span style={{ width: 9, height: 9, borderRadius: 2, background: f.zone.color, flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 13, fontWeight: 700, color: INK, margin: 0 }}>{f.zone.name}</p>
                <p style={{ fontSize: 11.5, color: SUB, margin: 0 }}>{f.capacity}</p>
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                {f.pricing.map((p) => (
                  <span key={p.label} style={{ fontSize: 10.5, fontWeight: 600, color: SUB, background: '#eef2f8', padding: '2px 9px', borderRadius: 999, fontVariantNumeric: 'tabular-nums' }}>
                    {p.label} {formatCents(p.cents)}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Staff — editable roles drive booking & payment permissions */}
          <StaffManager />

          {/* Hours & location */}
          <div className="sq-card" style={{ ...card, padding: '16px 20px' }}>
            <p style={{ fontSize: 13.5, fontWeight: 700, color: INK, margin: '0 0 8px' }}>Hours &amp; location</p>
            {HOURS.map((h) => (
              <p key={h.days} style={{ fontSize: 12.5, color: SUB, margin: '0 0 3px' }}>{h.days}: {h.open} – {h.close}</p>
            ))}
            <p style={{ fontSize: 12, color: FAINT, margin: '8px 0 0' }}>{ADDRESS}</p>
          </div>
        </div>
      </div>
      <p style={{ fontSize: 11.5, color: FAINT, marginTop: 16 }}>Editing arrives with Phase 1 admin tools — these read from the same catalog the store uses.</p>
    </div>
  )
}
