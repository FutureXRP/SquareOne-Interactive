import { serviceDb, sendAndLog } from '@/lib/server/billing'
import { bookingFactsAny } from '@/lib/server/booking-facts'
import { emailForStaffUser } from '@/lib/server/event-facts'
import { bookingReminder, bookingStaffReminder } from '@/lib/server/emails'

// Customer reminders a week out and the day before, and the day-before
// note to whoever is running the event (0060). Each is stamped once sent,
// so the hourly job never repeats one.

interface Row {
  id: string
  during: string
  created_at: string
  run_by_staff_id: string | null
  reminder_week_sent_at: string | null
  reminder_day_sent_at: string | null
  staff_reminder_sent_at: string | null
}

const HOUR = 3600_000

function startOf(during: string): number | null {
  const m = /^[[(]"?([^",]+)"?\s*,/.exec(during)
  return m ? new Date(m[1]).getTime() : null
}

export async function sendBookingReminders(now = Date.now()): Promise<{ week: number; day: number; staff: number } | null> {
  const db = serviceDb()
  const { data, error } = await db.from('bookings')
    .select('id, during, created_at, run_by_staff_id, reminder_week_sent_at, reminder_day_sent_at, staff_reminder_sent_at')
    .in('status', ['hold', 'confirmed']).is('lead_booking_id', null).gt('price_cents', 0)
    .limit(1000)
  if (error) return null // pre-0060
  let week = 0, day = 0, staff = 0
  for (const r of data as Row[]) {
    const start = startOf(r.during)
    if (!start || start <= now) continue
    const until = start - now
    const bookedRecently = now - new Date(r.created_at).getTime() < 2 * 24 * HOUR
    const wantDay = until <= 30 * HOUR && !r.reminder_day_sent_at
    const wantWeek = !wantDay && until <= 7 * 24 * HOUR && until > 2 * 24 * HOUR && !r.reminder_week_sent_at && !bookedRecently
    const wantStaff = until <= 30 * HOUR && !r.staff_reminder_sent_at && !!r.run_by_staff_id
    if (!wantDay && !wantWeek && !wantStaff) continue
    const resolved = await bookingFactsAny(r.id)
    if (!resolved) continue
    const stampCol = wantDay ? 'reminder_day_sent_at' : 'reminder_week_sent_at'
    if (wantDay || wantWeek) {
      // Claim it first so two runs can't both send.
      const { data: claimed } = await db.from('bookings').update({ [stampCol]: new Date(now).toISOString() })
        .eq('id', r.id).is(stampCol, null).select('id')
      if ((claimed ?? []).length > 0 && resolved.to) {
        await sendAndLog(wantDay ? 'booking.reminder_day' : 'booking.reminder_week', resolved.to.email,
          bookingReminder(resolved.facts, wantDay ? 'day' : 'week'), { accountId: resolved.b.account_id, bookingId: r.id })
        if (wantDay) day += 1; else week += 1
      }
    }
    if (wantStaff) {
      const { data: claimed } = await db.from('bookings').update({ staff_reminder_sent_at: new Date(now).toISOString() })
        .eq('id', r.id).is('staff_reminder_sent_at', null).select('id')
      if ((claimed ?? []).length > 0) {
        const { data: st } = await db.from('staff').select('name, user_id').eq('id', r.run_by_staff_id as string).maybeSingle()
        const s = st as { name: string; user_id: string | null } | null
        const to = s?.user_id ? await emailForStaffUser(s.user_id) : null
        if (s && to) {
          await sendAndLog('booking.reminder_staff', to, bookingStaffReminder(resolved.facts, s.name), { bookingId: r.id })
          staff += 1
        }
      }
    }
  }
  return { week, day, staff }
}
