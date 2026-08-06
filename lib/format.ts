// Money is integer cents everywhere; dollars exist only at render time.

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })

export function formatCents(cents: number): string {
  return usd.format(cents / 100)
}

export function formatHour(h: number): string {
  const whole = Math.floor(h)
  const mins = Math.round((h - whole) * 60)
  const period = whole >= 12 ? 'PM' : 'AM'
  const display = whole % 12 === 0 ? 12 : whole % 12
  return mins === 0 ? `${display} ${period}` : `${display}:${String(mins).padStart(2, '0')} ${period}`
}
