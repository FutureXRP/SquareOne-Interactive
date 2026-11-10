'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { INK, SUB } from '@/lib/theme'
import { WaiverPanel } from '@/components/store/WaiverPanel'
import type { RequiredWaiver } from '@/lib/waiver-forms'

// The waiver step on a booking's pay link. Waivers are part of booking,
// not something guests sign at the door — so the renter signs here before
// the payment buttons appear, one waiver at a time. When the
// last one is signed the page reloads and the payment options appear.
export function PayWaivers({ token, waivers, paid }: { token: string; waivers: RequiredWaiver[]; paid: boolean }) {
  const router = useRouter()
  const [left, setLeft] = useState(waivers)
  if (left.length === 0) return null
  const w = left[0]

  const signWith = async (signer: string, answers: Record<string, string[]>) => {
    try {
      const res = await fetch(`/api/pay/${token}/waiver`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ formId: w.id, signer, answers, agree: true }),
      })
      const json = (await res.json().catch(() => ({}))) as { message?: string }
      return res.ok ? { ok: true } : { ok: false, message: json.message }
    } catch {
      return { ok: false, message: 'Could not reach the server. Please try again.' }
    }
  }

  const onSigned = () => {
    const rest = left.slice(1)
    setLeft(rest)
    if (rest.length === 0) router.refresh()
  }

  return (
    <div>
      <p style={{ fontSize: 13.5, fontWeight: 800, color: INK, margin: '0 0 4px' }}>
        {paid ? 'Sign before your event' : 'Step 1: sign the waiver'}
        {left.length > 1 ? ` (${waivers.length - left.length + 1} of ${waivers.length})` : ''}
      </p>
      <p style={{ fontSize: 12.5, color: SUB, margin: '0 0 12px', lineHeight: 1.55 }}>
        {paid
          ? 'This booking still needs its waiver. Please sign it now — there’s no waiver signing at the door.'
          : 'This booking’s waiver is signed before payment — there’s no waiver signing at the door. Once it’s signed, the payment options appear right here.'}
      </p>
      <WaiverPanel key={w.id} def={w} compact onSigned={onSigned} signWith={signWith}
        storedNote="Your signature is stored securely with this booking." />
    </div>
  )
}
