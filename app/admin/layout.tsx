import { Sidebar } from '@/components/layout/Sidebar'
import { AdminGate } from '@/components/admin/AdminGate'
import { NAVY } from '@/lib/theme'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="sq-shell" style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar />
      <main style={{ flex: 1, overflow: 'auto', minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <div style={{ flex: 1 }}><AdminGate>{children}</AdminGate></div>

        {/* Store-matching navy footer on every admin screen */}
        <footer style={{ background: NAVY, color: 'rgba(255,255,255,0.62)', marginTop: 30 }}>
          <div style={{ maxWidth: 1180, margin: '0 auto', padding: '16px 40px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px 18px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px 18px', flexWrap: 'wrap' }}>
              {['Early Learning Center', 'Interactive', 'Medical Center', 'Event Rooms', 'Donate'].map((s, i) => (
                <span key={s} style={{ fontSize: 11.5, fontWeight: s === 'Interactive' ? 700 : 500, color: s === 'Interactive' ? '#fff' : 'rgba(255,255,255,0.62)', display: 'inline-flex', alignItems: 'center', gap: 18 }}>
                  {i > 0 && <span style={{ width: 4, height: 4, background: 'rgba(255,255,255,0.3)', borderRadius: 1, transform: 'rotate(45deg)' }} />}
                  {s}
                </span>
              ))}
            </div>
            <span style={{ fontSize: 11.5 }}>part of SquareOne Compassion</span>
          </div>
        </footer>
      </main>
    </div>
  )
}
