'use client'
import { useLive } from '@/lib/use-live'
import { formatHour } from '@/lib/format'
import { getSiteConfig, SITE_CONFIG_EVENT, type SiteConfig } from '@/lib/site-config-store'
import { DAY_NAMES } from '@/lib/facilities-store'

const SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

// Group consecutive days (Mon-first) that share the same hours into lines
// like "Mon – Sat: 5:30 AM – 10 PM" / "Sunday: 1 PM – 10 PM" / "Tue: Closed".
function hourLines(cfg: SiteConfig): string[] {
  if (!cfg.hoursByDay) {
    return [
      `${cfg.weekdayLabel}: ${formatHour(cfg.weekdayOpenH)} – ${formatHour(cfg.weekdayCloseH)}`,
      `${cfg.sundayLabel}: ${formatHour(cfg.sundayOpenH)} – ${formatHour(cfg.sundayCloseH)}`,
    ]
  }
  const order = [1, 2, 3, 4, 5, 6, 0]
  const key = (dow: number) => {
    const d = cfg.hoursByDay![dow]
    return d.closed ? 'closed' : `${d.openH}-${d.closeH}`
  }
  const lines: string[] = []
  let start = 0
  for (let i = 1; i <= order.length; i++) {
    if (i === order.length || key(order[i]) !== key(order[start])) {
      const from = order[start]
      const to = order[i - 1]
      const label = start === i - 1 ? DAY_NAMES[from] : `${SHORT[from]} – ${SHORT[to]}`
      const d = cfg.hoursByDay![from]
      lines.push(d.closed ? `${label}: Closed` : `${label}: ${formatHour(d.openH)} – ${formatHour(d.closeH)}`)
      start = i
    }
  }
  return lines
}

// The next scheduled closure within 14 days, for a heads-up in the footer.
function upcomingClosure(cfg: SiteConfig): string | null {
  if (!cfg.closures?.length) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const soon = new Date(today.getTime() + 14 * 24 * 3600_000)
  const next = cfg.closures
    .map((c) => ({ ...c, d: new Date(`${c.date}T00:00:00`) }))
    .filter((c) => !isNaN(c.d.getTime()) && c.d >= today && c.d <= soon)
    .sort((a, b) => a.d.getTime() - b.d.getTime())[0]
  if (!next) return null
  const when = next.d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  return `Closed ${when}${next.label ? ` — ${next.label}` : ''}`
}

// Footer address + hours — reads the admin-editable site config.
export function FooterInfo() {
  const { data: cfg } = useLive<SiteConfig | null>(getSiteConfig, [SITE_CONFIG_EVENT], null)

  if (!cfg) return null
  const closure = upcomingClosure(cfg)
  return (
    <>
      <p style={{ fontSize: 12, margin: 0, lineHeight: 1.6 }}>{cfg.address}</p>
      {hourLines(cfg).map((line) => (
        <p key={line} style={{ fontSize: 12, margin: '2px 0 0', lineHeight: 1.6 }}>{line}</p>
      ))}
      {closure && <p style={{ fontSize: 12, margin: '2px 0 0', lineHeight: 1.6, fontWeight: 700 }}>{closure}</p>}
      <p style={{ fontSize: 12, margin: '2px 0 0', lineHeight: 1.6 }}>{cfg.phone}</p>
    </>
  )
}
