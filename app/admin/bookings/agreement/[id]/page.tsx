'use client'
import Link from 'next/link'
import { use, useEffect, useState } from 'react'
import { card, INK, SUB, BLUE, GREEN } from '@/lib/theme'
import { AgreementDocument } from '@/components/agreement/AgreementDocument'
import { getAgreement, countersignAgreement, type AgreementRecord } from '@/lib/agreements-store'
import { getRooms } from '@/lib/facilities-store'
import { getActiveAddons } from '@/lib/addons-store'
import { getMyStaff, type StaffMember } from '@/lib/staff-store'

// One booking's signed rental agreement, as the renter signed it — for
// staff to read, print for the file, and countersign as the SquareOne
// representative.
export default function AgreementViewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [rec, setRec] = useState<AgreementRecord | null | undefined>(undefined)
  const [rooms, setRooms] = useState<string[]>([])
  const [addons, setAddons] = useState<string[]>([])
  const [me, setMe] = useState<StaffMember | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    getAgreement(id).then(setRec).catch(() => setRec(null))
    getRooms().then((r) => setRooms(r.map((x) => x.name))).catch(() => {})
    getActiveAddons().then((a) => setAddons(a.map((x) => x.name))).catch(() => {})
    getMyStaff().then(setMe).catch(() => {})
  }, [id])

  const countersign = async () => {
    if (!me || busy) return
    setBusy(true)
    const ok = await countersignAgreement(id, { id: me.id, name: me.name })
    setBusy(false)
    if (ok) setRec(await getAgreement(id))
    else window.alert('Could not countersign — try again.')
  }

  return (
    <div className="sq-page" style={{ padding: '30px 40px 20px', maxWidth: 820, margin: '0 auto' }}>
      <div className="sq-noprint" style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <Link href={`/admin/bookings?open=${id}`} style={{ fontSize: 12.5, fontWeight: 600, color: BLUE, textDecoration: 'none' }}>← Back to the booking</Link>
        <span style={{ flex: 1 }} />
        {rec && (
          <button className="sq-btn sq-btn-ghost" style={{ padding: '7px 14px', fontSize: 12 }} onClick={() => window.print()}>Print / save PDF</button>
        )}
        {rec && !rec.repName && me && (
          <button className="sq-btn sq-btn-primary" style={{ padding: '7px 14px', fontSize: 12 }} disabled={busy} onClick={countersign}>
            {busy ? 'Signing…' : `Countersign as ${me.name}`}
          </button>
        )}
        {rec?.repName && <span style={{ fontSize: 12, fontWeight: 700, color: GREEN }}>✓ Countersigned by {rec.repName}</span>}
      </div>
      <div className="sq-card" style={{ ...card, padding: '28px 32px' }}>
        {rec === undefined && <p style={{ fontSize: 13, color: SUB, margin: 0 }}>Loading…</p>}
        {rec === null && (
          <p style={{ fontSize: 13, color: SUB, margin: 0 }}>
            No signed agreement for this booking yet. The renter signs from the booking&rsquo;s pay link
            (it&rsquo;s in every booking email), or open that link on a tablet at the desk.
          </p>
        )}
        {rec && (
          <AgreementDocument
            snapshot={rec.snapshot} answers={rec.answers} signature={rec.signature} signedAt={rec.signedAt}
            repName={rec.repName} repSignedAt={rec.repSignedAt} rooms={rooms} addons={addons}
          />
        )}
      </div>
      <p className="sq-noprint" style={{ fontSize: 11, color: INK, opacity: 0.5, margin: '10px 0 0' }}>
        Signed electronically on the booking&rsquo;s page — the renter typed their name and checked that they agree.
      </p>
    </div>
  )
}
