import { FacilityGrid } from '@/components/store/FacilityGrid'
import { ContentText } from '@/components/store/FooterNav'
import { INK, SUB, FAINT } from '@/lib/theme'

export const metadata = { title: 'Rent a room — SquareOne Interactive' }

export default function FacilitiesPage() {
  return (
    <div className="sq-page" style={{ padding: '34px 20px 10px', maxWidth: 1180, margin: '0 auto' }}>
      <h1 style={{ fontSize: 28, fontWeight: 800, color: INK, margin: '0 0 6px', letterSpacing: '-0.03em' }}><ContentText k="facilities.heading" fallback="Rent a room or facility" /></h1>
      <p style={{ fontSize: 14, color: SUB, margin: '0 0 28px', maxWidth: 560 }}>
        <ContentText k="facilities.sub" fallback="Pick a space, choose a time, and request your booking online — 1 to 6 hours, at least 48 hours ahead. Sign any waiver as you book. Booking within 14 days of your event? Pay at least the deposit within 24 hours to secure it. Booking further out? Nothing is due until your event is 14 days away. Members get member pricing automatically." />
      </p>

      <FacilityGrid />

      <p style={{ fontSize: 11.5, color: FAINT, margin: '26px 0 0' }}>Live pricing and availability — parties within 14 days of the event secure their rooms with at least the deposit within 24 hours.</p>
    </div>
  )
}
