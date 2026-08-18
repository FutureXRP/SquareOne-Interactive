'use client'
// Fire-and-forget confirmation emails. The browser only names the event
// and the row — the server builds and sends the actual email. Never
// blocks or fails the action that triggered it.

import { supabase } from '@/lib/supabase'

export type NotifyKind =
  | 'booking.hold' | 'booking.confirmed' | 'booking.canceled'
  | 'booking.rescheduled' | 'booking.updated' | 'booking.deleted'
  | 'booking.approved' | 'booking.staff_assigned'
  | 'booking.payment' | 'payment.receipt' | 'payment.voided' | 'refund.issued'
  | 'membership.canceled' | 'membership.resumed'
  | 'event.assigned' | 'event.guest_confirmed' | 'event.moved'

export async function notify(kind: NotifyKind, id: string): Promise<void> {
  await notifyReport(kind, id)
}

// Same send, but the caller hears the server's actual verdict — sent, or
// skipped and why. For flows where the UI promises "an email went out"
// and must not say so unless it's true.
export async function notifyReport(kind: NotifyKind, id: string): Promise<{ sent: boolean; reason: string | null }> {
  try {
    const { data } = await supabase().auth.getSession()
    const token = data.session?.access_token
    if (!token) return { sent: false, reason: 'signed_out' }
    const res = await fetch('/api/notify', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ kind, id }),
    })
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; skipped?: string }
    if (res.ok && json.ok && !json.skipped) return { sent: true, reason: null }
    return { sent: false, reason: json.skipped ?? `server_${res.status}` }
  } catch {
    // A confirmation email is never worth breaking a booking over.
    return { sent: false, reason: 'network' }
  }
}
