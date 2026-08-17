'use client'
import { useEffect, useRef, useState } from 'react'
import { INK, SUB, FAINT, LINE, GREEN, RED } from '@/lib/theme'
import { formatCents } from '@/lib/format'
import { supabase } from '@/lib/supabase'

// Desk card payments that are actually payments. Two paths:
//
// Card on file — charges the card the customer saved with Stripe, with
// their say-so at the counter or on the phone. Nobody sees a number.
//
// Type the card — for phone orders. The number is typed into a Stripe
// Elements field that lives inside Stripe's own iframe: it goes straight
// to Stripe and never touches our page's code or our server. Never take a
// card number any other way — not into notes, not on paper.

declare global {
  interface Window {
    Stripe?: (key: string) => StripeJs
  }
}
interface StripeJs {
  elements: () => { create: (kind: 'card', opts?: object) => CardElement }
  confirmCardPayment: (secret: string, data: { payment_method: { card: CardElement } }) =>
    Promise<{ error?: { message?: string }; paymentIntent?: { id: string; status: string } }>
}
interface CardElement { mount: (sel: HTMLElement) => void; unmount: () => void }

let stripeJsLoading: Promise<void> | null = null
function loadStripeJs(): Promise<void> {
  if (window.Stripe) return Promise.resolve()
  if (!stripeJsLoading) {
    stripeJsLoading = new Promise((resolve, reject) => {
      const s = document.createElement('script')
      s.src = 'https://js.stripe.com/v3/'
      s.onload = () => resolve()
      s.onerror = () => reject(new Error('Could not load Stripe.'))
      document.head.appendChild(s)
    })
  }
  return stripeJsLoading
}

async function authedPost(path: string, body: unknown): Promise<{ ok: boolean; status: number; json: Record<string, unknown> }> {
  const { data } = await supabase().auth.getSession()
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${data.session?.access_token ?? ''}` },
    body: JSON.stringify(body),
  })
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>
  return { ok: res.ok, status: res.status, json }
}

export function ChargeCard({ bookingId, amountLabel, which, onPaid }: {
  bookingId: string
  amountLabel: string // "the $105.00 balance"
  which: 'deposit' | 'balance'
  onPaid: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const [manual, setManual] = useState<{ secret: string } | null>(null)
  const [pubKey, setPubKey] = useState<string | null>(null)
  const cardHost = useRef<HTMLDivElement | null>(null)
  const stripeRef = useRef<StripeJs | null>(null)
  const elementRef = useRef<CardElement | null>(null)

  useEffect(() => {
    fetch('/api/billing/status').then((r) => r.json()).then((j: { publishableKey?: string | null }) => {
      setPubKey(j.publishableKey ?? null)
    }).catch(() => {})
  }, [])

  // Mount the Stripe card field once the manual form opens.
  useEffect(() => {
    if (!manual || !pubKey || !cardHost.current) return
    let alive = true
    loadStripeJs().then(() => {
      if (!alive || !window.Stripe || !cardHost.current) return
      stripeRef.current = window.Stripe(pubKey)
      elementRef.current = stripeRef.current.elements().create('card', {
        style: { base: { fontSize: '15px', color: '#1f2c42' } },
      })
      elementRef.current.mount(cardHost.current)
    }).catch(() => setError('Could not load the card form.'))
    return () => { alive = false; elementRef.current?.unmount(); elementRef.current = null }
  }, [manual, pubKey])

  const chargeSaved = async () => {
    if (busy) return
    setBusy(true); setError(null)
    const res = await authedPost('/api/billing/charge-card', { bookingId, which, mode: 'saved' })
    setBusy(false)
    if (res.ok) {
      const last4 = res.json.last4 as string | null
      setDone(`Charged ${amountLabel}${last4 ? ` to the card ending ${last4}` : ''}. Receipt is on its way.`)
      onPaid()
    } else {
      setError((res.json.message as string) ?? 'Could not charge the saved card.')
    }
  }

  const openManual = async () => {
    if (busy) return
    if (!pubKey) { setError('Add NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY in Vercel to type cards at the desk.'); return }
    setBusy(true); setError(null)
    const res = await authedPost('/api/billing/charge-card', { bookingId, which, mode: 'manual' })
    setBusy(false)
    if (res.ok && res.json.clientSecret) setManual({ secret: res.json.clientSecret as string })
    else setError((res.json.message as string) ?? 'Could not start the charge.')
  }

  const confirmManual = async () => {
    if (busy || !manual || !stripeRef.current || !elementRef.current) return
    setBusy(true); setError(null)
    const result = await stripeRef.current.confirmCardPayment(manual.secret, {
      payment_method: { card: elementRef.current },
    })
    if (result.error || !result.paymentIntent) {
      setBusy(false)
      setError(result.error?.message ?? 'The card was declined.')
      return
    }
    // Record immediately; the webhook is the belt to this suspender.
    await authedPost('/api/billing/confirm-intent', { paymentIntentId: result.paymentIntent.id })
    setBusy(false)
    setManual(null)
    setDone(`Charged ${amountLabel}. Receipt is on its way.`)
    onPaid()
  }

  if (done) {
    return <p style={{ fontSize: 12.5, fontWeight: 700, color: GREEN, margin: '10px 0 0' }}>{done}</p>
  }

  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button className="sq-btn sq-btn-primary" style={{ padding: '7px 14px', fontSize: 12 }} disabled={busy} onClick={chargeSaved}>
          {busy ? 'Working…' : 'Charge card on file'}
        </button>
        <button className="sq-btn sq-btn-ghost" style={{ padding: '7px 14px', fontSize: 12 }} disabled={busy || !!manual} onClick={openManual}>
          Type the card (phone order)
        </button>
      </div>

      {manual && (
        <div style={{ marginTop: 12, padding: 14, background: '#fff', border: `1px solid ${LINE}`, borderRadius: 10, maxWidth: 460 }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: INK, margin: '0 0 8px' }}>Card number, expiry, CVC, ZIP</p>
          <div ref={cardHost} style={{ padding: '10px 12px', border: `1px solid ${LINE}`, borderRadius: 8 }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
            <button className="sq-btn sq-btn-primary" style={{ padding: '7px 14px', fontSize: 12 }} disabled={busy} onClick={confirmManual}>
              {busy ? 'Charging…' : `Charge ${amountLabel}`}
            </button>
            <button className="sq-btn sq-btn-ghost" style={{ padding: '7px 14px', fontSize: 12 }} disabled={busy} onClick={() => setManual(null)}>Cancel</button>
          </div>
          <p style={{ fontSize: 11, color: FAINT, margin: '10px 0 0', lineHeight: 1.5 }}>
            The number goes straight to Stripe from this field — it never touches our system, so read it
            back to the customer, charge it, and don&rsquo;t write it down anywhere.
          </p>
        </div>
      )}

      {error && <p style={{ fontSize: 12, color: RED, margin: '10px 0 0', fontWeight: 600, lineHeight: 1.5 }}>{error}</p>}
      <p style={{ fontSize: 11, color: SUB, margin: '8px 0 0', lineHeight: 1.5 }}>
        Card on file works when they&rsquo;ve paid online before — always with the customer&rsquo;s say-so.
      </p>
    </div>
  )
}
