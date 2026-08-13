import { PlanPicker } from '@/components/store/PlanPicker'
import { ContentText } from '@/components/store/FooterNav'
import { INK, SUB, FAINT, LINE } from '@/lib/theme'

export const metadata = { title: 'Fitness Memberships — SquareOne Interactive' }

const faqs = [
  ['How do I get in the door?', 'Your profile includes a member code — scan it at any entrance during open hours. Family plans give every household member their own code.'],
  ['Can I cancel anytime?', 'Yes. Cancel from your account and your fitness membership stays active through the end of the paid period. No cancellation fees.'],
  ['Do members get discounts?', 'Members get member pricing on room rentals, birthday parties, and programs like Speed & Agility.'],
  ['Is there a joining fee?', 'No joining fee. Your first payment is your first month.'],
]

export default function MembershipsPage() {
  return (
    <div className="sq-page" style={{ padding: '34px 20px 10px', maxWidth: 1180, margin: '0 auto' }}>
      <div style={{ textAlign: 'center', maxWidth: 560, margin: '0 auto 32px' }}>
        <h1 style={{ fontSize: 30, fontWeight: 800, color: INK, margin: '0 0 8px', letterSpacing: '-0.03em' }}><ContentText k="memberships.heading" fallback="Simple fitness memberships, no surprises" /></h1>
        <p style={{ fontSize: 14, color: SUB, margin: 0, lineHeight: 1.6 }}>
          <ContentText k="memberships.sub" fallback="Month to month, cancel anytime, and every dollar supports SquareOne Compassion’s work in Tulsa." />
        </p>
      </div>

      <div style={{ maxWidth: 760, margin: '0 auto 44px' }}>
        <PlanPicker />
      </div>

      <div style={{ maxWidth: 640, margin: '0 auto' }}>
        <h2 style={{ fontSize: 18, fontWeight: 800, color: INK, margin: '0 0 14px', letterSpacing: '-0.02em' }}>Common questions</h2>
        {faqs.map(([q, a]) => (
          <div key={q} style={{ padding: '14px 0', borderBottom: `1px solid ${LINE}` }}>
            <p style={{ fontSize: 13.5, fontWeight: 700, color: INK, margin: '0 0 4px' }}>{q}</p>
            <p style={{ fontSize: 13, color: SUB, margin: 0, lineHeight: 1.6 }}>{a}</p>
          </div>
        ))}
        <p style={{ fontSize: 11.5, color: FAINT, margin: '18px 0 0' }}>Join online today and pay at the desk — automatic billing arrives with Stripe.</p>
      </div>
    </div>
  )
}
