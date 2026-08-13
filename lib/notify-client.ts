'use client'
// Fire-and-forget confirmation emails. The browser only names the event
// and the row — the server builds and sends the actual email. Never
// blocks or fails the action that triggered it.

import { supabase } from '@/lib/supabase'

export type NotifyKind =
  | 'booking.hold' | 'booking.confirmed' | 'booking.canceled'
  | 'booking.rescheduled' | 'booking.updated' | 'booking.deleted'
  | 'booking.approved'
  | 'booking.payment' | 'payment.receipt' | 'refund.issued'
  | 'membership.canceled' | 'membership.resumed'
  | 'event.assigned' | 'event.guest_confirmed' | 'event.moved'

export async function notify(kind: NotifyKind, id: string): Promise<void> {
  try {
    const { data } = await supabase().auth.getSession()
    const token = data.session?.access_token
    if (!token) return
    await fetch('/api/notify', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ kind, id }),
    })
  } catch {
    // A confirmation email is never worth breaking a booking over.
  }
}
