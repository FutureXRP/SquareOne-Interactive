import { FacilityGrid } from '@/components/store/FacilityGrid'
import { INK, SUB, FAINT } from '@/lib/theme'

export const metadata = { title: 'Rent a room — SquareOne Interactive' }

export default function FacilitiesPage() {
  return (
    <div className="sq-page" style={{ padding: '34px 20px 10px', maxWidth: 1180, margin: '0 auto' }}>
      <h1 style={{ fontSize: 28, fontWeight: 800, color: INK, margin: '0 0 6px', letterSpacing: '-0.03em' }}>Rent a room or facility</h1>
      <p style={{ fontSize: 14, color: SUB, margin: '0 0 28px', maxWidth: 560 }}>
        Pick a space, choose a time, and request your booking online — up to 8 hours.
        A hold keeps your slot while you pay the deposit, and members get member pricing automatically.
      </p>

      <FacilityGrid />

      <p style={{ fontSize: 11.5, color: FAINT, margin: '26px 0 0' }}>Live pricing and availability — a hold keeps your slot for 24 hours while you pay the deposit.</p>
    </div>
  )
}
