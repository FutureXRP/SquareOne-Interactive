import { NextResponse } from 'next/server'
import { bookingForToken } from '@/lib/server/pay-links'
import { agreementFile, pdfResponse } from '@/lib/server/agreement-file'

// The renter's copy of their signed agreement, as a PDF. Same permission
// as the rest of the booking page: holding the link.
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const found = await bookingForToken(token)
  if (!found) return NextResponse.json({ message: 'This link isn’t valid.' }, { status: 404 })
  const f = await agreementFile(found.row.id)
  if (!f) return NextResponse.json({ message: 'There’s no signed agreement on this booking yet.' }, { status: 404 })
  return pdfResponse(f, new URL(req.url).searchParams.get('download') === '1')
}
