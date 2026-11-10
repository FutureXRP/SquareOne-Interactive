import { NextResponse } from 'next/server'
import { serviceDb } from '@/lib/server/billing'
import { bookingForToken } from '@/lib/server/pay-links'
import { waiversDueForBooking } from '@/lib/server/booking-waivers'

// Signs one of a booking's waivers from its pay link — the step that
// comes before paying. Same authorization as the rest of the page: holding
// the link is the permission, so a guest booked at the desk signs without
// an account. Only a waiver this booking actually owes can be signed here,
// and the words recorded with the signature are the form as it reads on
// the server right now, never text the browser sent.

function text(v: unknown, max = 200): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : ''
}

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const found = await bookingForToken(token)
  if (!found) return NextResponse.json({ message: 'This link isn’t valid.' }, { status: 404 })
  if (found.row.status === 'canceled') return NextResponse.json({ message: 'That booking has been canceled.' }, { status: 409 })

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const formId = text(body.formId, 100)
  const signer = text(body.signer, 120)
  const due = await waiversDueForBooking(found.row.id)
  const w = due.find((d) => d.id === formId)
  // Already covered (signed in another tab, or by someone else in the
  // party) is a success, not an error.
  if (!w) return NextResponse.json({ ok: true, already: true })
  if (signer.length < 2) return NextResponse.json({ message: 'Type your full legal name to sign.' }, { status: 400 })
  if (body.agree !== true) return NextResponse.json({ message: 'Tick the box confirming you agree.' }, { status: 400 })

  // Answers: only the questions and checkboxes this form actually has.
  const raw = (body.answers ?? {}) as Record<string, unknown>
  const answers: Record<string, string[]> = {}
  for (const c of w.choices) {
    const picked = (Array.isArray(raw[c.label]) ? raw[c.label] as unknown[] : [])
      .map((v) => text(v, 200)).filter((v) => c.options.includes(v))
    const ok = c.single ? (!c.required || picked.length === 1) : (!c.required || picked.length > 0)
    if (!ok || (c.single && picked.length > 1)) {
      return NextResponse.json({ message: `Answer “${c.label}” to sign.` }, { status: 400 })
    }
    if (picked.length > 0) answers[c.label] = picked
  }
  for (const a of w.agreements) {
    const ticked = Array.isArray(raw[a.label]) && (raw[a.label] as unknown[]).includes('agreed')
    if (a.required && !ticked) return NextResponse.json({ message: `Tick “${a.label}” to sign.` }, { status: 400 })
    if (ticked) answers[a.label] = ['agreed']
  }

  const base = {
    form_id: w.id,
    account_id: found.row.account_id,
    signed_by: signer,
    participant: signer,
    signature: signer,
  }
  const withAnswers = Object.keys(answers).length > 0 ? { responses: answers } : {}
  // booking_id arrives with 0054, the snapshot with 0034, responses with
  // 0013 — a missing column must never cost a signature.
  const attempts = [
    { ...base, ...withAnswers, booking_id: found.row.id, form_name: w.name, signed_terms: w.terms },
    { ...base, ...withAnswers, form_name: w.name, signed_terms: w.terms },
    { ...base, ...withAnswers },
    base,
  ]
  const db = serviceDb()
  for (const payload of attempts) {
    const { error } = await db.from('form_submissions').insert(payload)
    if (!error) return NextResponse.json({ ok: true })
    if (error.code !== 'PGRST204' && error.code !== '42703') {
      console.error('[pay/waiver]', error.message)
      break
    }
  }
  return NextResponse.json({ message: 'We couldn’t save your signature — please try again, or call the front desk.' }, { status: 500 })
}
