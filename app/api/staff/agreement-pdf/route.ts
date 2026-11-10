import { NextResponse } from 'next/server'
import { getStaffCaller } from '@/lib/server/billing'
import { agreementFile, pdfResponse } from '@/lib/server/agreement-file'

// Any staff member can open a booking's signed agreement PDF — online or
// uploaded. A companion room's agreement is its lead booking's.
export async function GET(req: Request) {
  const caller = await getStaffCaller(req)
  if (!caller) return NextResponse.json({ message: 'Staff only.' }, { status: 401 })
  const id = new URL(req.url).searchParams.get('booking') ?? ''
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ message: 'Missing booking.' }, { status: 400 })
  const f = await agreementFile(id)
  if (!f) return NextResponse.json({ message: 'No signed agreement on this booking.' }, { status: 404 })
  return pdfResponse(f, false)
}
