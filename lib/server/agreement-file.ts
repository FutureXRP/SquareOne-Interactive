import { serviceDb } from '@/lib/server/billing'
import { bookingDoc } from '@/lib/server/booking-card'
import { agreementPdf } from '@/lib/server/agreement-pdf'

// The signed agreement for a booking, as a PDF file — the uploaded one
// when it was signed outside the system (0059), otherwise generated from
// the online signature. Null when nothing is signed.

export const AGREEMENT_BUCKET = 'agreements'

export async function agreementFile(bookingId: string): Promise<{ bytes: Uint8Array; filename: string } | null> {
  const doc = await bookingDoc(bookingId)
  if (!doc?.agreement) return null
  const a = doc.agreement
  const base = `SquareOne-Rental-Agreement-${doc.code}`
  if (a.source === 'uploaded' && a.filePath) {
    const { data, error } = await serviceDb().storage.from(AGREEMENT_BUCKET).download(a.filePath)
    if (error || !data) { console.error('[agreement-file]', error?.message); return null }
    return { bytes: new Uint8Array(await data.arrayBuffer()), filename: `${base}.pdf` }
  }
  const bytes = await agreementPdf({
    snapshot: a.snapshot, answers: a.answers, signature: a.signature, signedAt: a.signedAt,
    repName: a.repName, repSignedAt: a.repSignedAt, rooms: doc.rooms, addons: doc.addons,
  })
  return { bytes, filename: `${base}.pdf` }
}

export function pdfResponse(f: { bytes: Uint8Array; filename: string }, download: boolean): Response {
  return new Response(Buffer.from(f.bytes), {
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `${download ? 'attachment' : 'inline'}; filename="${f.filename}"`,
      'cache-control': 'private, no-store',
    },
  })
}
