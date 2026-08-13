import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { serviceDb, sendAndLog } from '@/lib/server/billing'
import { eventReminderStaff, eventGuestReminder } from '@/lib/server/emails'
import { EVENT_SELECT, factsFrom, emailForStaffUser, type EventRow } from '@/lib/server/event-facts'

// Sends "this is tomorrow" reminders for tours and scheduled events, to
// the staff member running it and to the visitor coming in. Runs on a
// schedule (see vercel.json) and can also be triggered by hand from the
// dashboard. Each reminder is stamped once sent, so running it every hour
// never sends the same one twice.

const WINDOW_HOURS = 26 // catches "tomorrow" on an hourly run

function whenPhrase(startsAt: string): string {
  const hours = (new Date(startsAt).getTime() - Date.now()) / 3600_000
  if (hours <= 3) return 'in a couple of hours'
  if (hours <= 14) return 'today'
  return 'tomorrow'
}

// Either the scheduler's secret, or a signed-in staff member pressing the
// button. Without CRON_SECRET set, only staff can trigger it.
async function authorized(req: Request): Promise<boolean> {
  const auth = req.headers.get('authorization') ?? ''
  const secret = process.env.CRON_SECRET
  if (secret && auth === `Bearer ${secret}`) return true

  const token = auth.replace(/^Bearer /, '')
  if (!token) return false
  const anon = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
    { global: { headers: { Authorization: `Bearer ${token}` } } },
  )
  const { data: userData } = await anon.auth.getUser()
  const userId = userData?.user?.id
  if (!userId) return false
  const { data } = await serviceDb().from('staff').select('active').eq('user_id', userId).maybeSingle()
  return !!(data as { active: boolean } | null)?.active
}

async function run(): Promise<{ staffSent: number; guestsSent: number; considered: number }> {
  const db = serviceDb()
  const now = new Date()
  const until = new Date(now.getTime() + WINDOW_HOURS * 3600_000)

  const { data, error } = await db.from('staff_events')
    .select(EVENT_SELECT)
    .eq('status', 'scheduled')
    .gte('starts_at', now.toISOString())
    .lt('starts_at', until.toISOString())
    .order('starts_at')
    .limit(200)
  if (error) throw new Error(error.message)

  const rows = data as unknown as EventRow[]
  let staffSent = 0
  let guestsSent = 0

  for (const e of rows) {
    const facts = factsFrom(e)
    const phrase = whenPhrase(e.starts_at)

    if (!e.staff_reminder_sent_at && e.staff?.user_id) {
      const to = await emailForStaffUser(e.staff.user_id)
      if (to) {
        await sendAndLog('event.reminder_staff', to, eventReminderStaff(facts, phrase), {})
        await db.from('staff_events').update({ staff_reminder_sent_at: new Date().toISOString() }).eq('id', e.id)
        staffSent += 1
      }
    }

    if (!e.guest_reminder_sent_at && e.guest_email) {
      await sendAndLog('event.reminder_guest', e.guest_email, eventGuestReminder(facts, phrase), {})
      await db.from('staff_events').update({ guest_reminder_sent_at: new Date().toISOString() }).eq('id', e.id)
      guestsSent += 1
    }
  }

  return { staffSent, guestsSent, considered: rows.length }
}

export async function GET(req: Request) {
  if (!(await authorized(req))) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  try {
    return NextResponse.json({ ok: true, ...(await run()) })
  } catch (e) {
    console.error('[reminders]', e)
    return NextResponse.json({ error: 'failed', message: e instanceof Error ? e.message : 'run failed' }, { status: 500 })
  }
}

// Same work, for the "Send reminders now" button in the dashboard.
export async function POST(req: Request) {
  return GET(req)
}
