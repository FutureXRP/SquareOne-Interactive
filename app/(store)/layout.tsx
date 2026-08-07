import Link from 'next/link'
import { StoreHeader } from '@/components/store/StoreHeader'
import { FooterInfo } from '@/components/store/FooterInfo'
import { NAVY } from '@/lib/theme'

export default function StoreLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <StoreHeader />
      <div style={{ flex: 1 }}>{children}</div>

      <footer style={{ background: NAVY, color: 'rgba(255,255,255,0.72)', marginTop: 48 }}>
        <div style={{ maxWidth: 1180, margin: '0 auto', padding: '30px 20px 26px' }}>
          <div style={{ display: 'flex', gap: '20px 40px', flexWrap: 'wrap', justifyContent: 'space-between', marginBottom: 22 }}>
            <div style={{ maxWidth: 320 }}>
              <p style={{ fontSize: 14, fontWeight: 700, color: '#fff', margin: '0 0 6px' }}>SquareOne Interactive</p>
              <FooterInfo />
            </div>
            <div style={{ display: 'flex', gap: 40, flexWrap: 'wrap' }}>
              <div>
                <p style={{ fontSize: 11, fontWeight: 700, color: '#fff', textTransform: 'uppercase', letterSpacing: '0.07em', margin: '0 0 8px' }}>Visit</p>
                {[['Rent a room', '/facilities'], ['Event packages', '/packages'], ['Fitness memberships', '/memberships'], ['Shop', '/shop']].map(([label, href]) => (
                  <Link key={href} href={href} style={{ display: 'block', fontSize: 12.5, color: 'rgba(255,255,255,0.72)', textDecoration: 'none', marginBottom: 5 }}>{label}</Link>
                ))}
              </div>
              <div>
                <p style={{ fontSize: 11, fontWeight: 700, color: '#fff', textTransform: 'uppercase', letterSpacing: '0.07em', margin: '0 0 8px' }}>Members</p>
                {[['My account', '/account'], ['Member card', '/account/card'], ['My bookings', '/account/bookings'], ['Billing', '/account/billing']].map(([label, href]) => (
                  <Link key={href} href={href} style={{ display: 'block', fontSize: 12.5, color: 'rgba(255,255,255,0.72)', textDecoration: 'none', marginBottom: 5 }}>{label}</Link>
                ))}
              </div>
            </div>
          </div>
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.14)', paddingTop: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px 18px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px 18px', flexWrap: 'wrap' }}>
              {['Early Learning Center', 'Interactive', 'Medical Center', 'Event Rooms', 'Donate'].map((s, i) => (
                <span key={s} style={{ fontSize: 11.5, fontWeight: s === 'Interactive' ? 700 : 500, color: s === 'Interactive' ? '#fff' : 'rgba(255,255,255,0.55)', display: 'inline-flex', alignItems: 'center', gap: 18 }}>
                  {i > 0 && <span style={{ width: 4, height: 4, background: 'rgba(255,255,255,0.3)', borderRadius: 1, transform: 'rotate(45deg)' }} />}
                  {s}
                </span>
              ))}
            </div>
            <span style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.55)' }}>part of SquareOne Compassion · a 501(c)(3)</span>
          </div>
        </div>
      </footer>
    </div>
  )
}
