import Link from 'next/link'
import { card, INK, SUB, FAINT, NAVY, BLUE } from '@/lib/theme'
import { bookingForToken } from '@/lib/server/pay-links'
import { bookingDoc } from '@/lib/server/booking-card'
import { AgreementForm } from '@/components/agreement/AgreementForm'
import { AgreementDocument } from '@/components/agreement/AgreementDocument'

// The Event Rental Agreement for one booking, reached from the booking's
// pay link (so guests booked at the desk can sign without an account).
// Unsigned: the fillable form. Signed: the renter's copy, as signed.

export const dynamic = 'force-dynamic'

function Shell({ token, children }: { token: string; children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', background: '#f4f7fb', padding: '32px 14px' }}>
      <div style={{ maxWidth: 680, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <Link href="/" style={{ fontSize: 15, fontWeight: 800, color: NAVY, textDecoration: 'none' }}>SquareOne Interactive</Link>
          <Link href={`/pay/${token}`} style={{ fontSize: 12.5, fontWeight: 600, color: BLUE, textDecoration: 'none' }}>← Back to your booking</Link>
        </div>
        {children}
        <p style={{ fontSize: 11.5, color: FAINT, textAlign: 'center', margin: '16px 0 0', lineHeight: 1.6 }}>
          Questions about the agreement? Call the front desk — we&rsquo;re happy to walk through it.
        </p>
      </div>
    </div>
  )
}

export default async function AgreementPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const found = await bookingForToken(token)
  const doc = found ? await bookingDoc(found.row.id) : null

  if (!found || !doc) {
    return (
      <Shell token={token}>
        <div className="sq-card" style={{ ...card, padding: '26px 28px', textAlign: 'center' }}>
          <p style={{ fontSize: 16, fontWeight: 800, color: INK, margin: '0 0 6px' }}>This link isn&rsquo;t valid</p>
          <p style={{ fontSize: 13, color: SUB, margin: 0 }}>Give us a call and we&rsquo;ll get you the right one.</p>
        </div>
      </Shell>
    )
  }

  return (
    <Shell token={token}>
      <div className="sq-card" style={{ ...card, padding: '24px 26px' }}>
        {doc.agreement && !(doc.agreementStale && doc.status !== 'canceled') ? (
          <>
            <div style={{ background: '#e5f2ea', border: '1px solid #bcdfc9', borderRadius: 10, padding: '11px 14px', marginBottom: 18 }}>
              <p style={{ fontSize: 13.5, fontWeight: 700, color: '#1d6b3f', margin: 0 }}>Signed — this is your copy.</p>
              <p style={{ fontSize: 12, color: SUB, margin: '2px 0 0' }}>Print it or save it as a PDF from your browser&rsquo;s share menu if you&rsquo;d like one.</p>
            </div>
            <AgreementDocument
              snapshot={doc.agreement.snapshot} answers={doc.agreement.answers}
              signature={doc.agreement.signature} signedAt={doc.agreement.signedAt}
              repName={doc.agreement.repName} repSignedAt={doc.agreement.repSignedAt}
              rooms={doc.rooms} addons={doc.addons}
            />
          </>
        ) : doc.status === 'canceled' ? (
          <p style={{ fontSize: 13, color: SUB, margin: 0 }}>This booking has been canceled, so there&rsquo;s no agreement to sign.</p>
        ) : (
          <AgreementForm
            token={token} snapshot={doc.snapshot} rooms={doc.rooms} addons={doc.addons}
            bookedRoom={doc.bookedRoom} bookedRooms={doc.bookedRooms} bookedAddons={doc.bookedAddons}
            resign={!!doc.agreement && doc.agreementStale}
          />
        )}
      </div>
    </Shell>
  )
}
