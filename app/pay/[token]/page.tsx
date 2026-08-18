import Link from 'next/link'
import { card, INK, SUB, FAINT, LINE, NAVY, BLUE, GREEN, RED } from '@/lib/theme'
import { formatCents } from '@/lib/format'
import { bookingForToken } from '@/lib/server/pay-links'
import { serviceDb } from '@/lib/server/billing'
import { cashAppQrSvg } from '@/lib/server/cashapp-qr'
import { PayPanel } from './PayPanel'

// The facility's $cashtag, when staff have set one on Settings. Empty
// string (or a pre-0040 database) simply hides the Cash App option.
async function cashtag(): Promise<string> {
  try {
    const { data, error } = await serviceDb().from('site_config').select('cashapp_cashtag').limit(1).maybeSingle()
    if (error) return ''
    return ((data as { cashapp_cashtag?: string } | null)?.cashapp_cashtag ?? '').trim()
  } catch {
    return ''
  }
}

// Where a booking email's pay button lands. No sign-in — the link itself
// is the authorisation, the way a payment link on an invoice is — and it
// does exactly one thing: pay this booking. It cannot cancel, move, or
// reprice anything, and shows nothing about the account behind it.

export const dynamic = 'force-dynamic'

function Row({ label, value, strong, tone }: { label: string; value: string; strong?: boolean; tone?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '7px 0' }}>
      <span style={{ fontSize: 13, color: SUB }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: strong ? 800 : 600, color: tone ?? INK, fontVariantNumeric: 'tabular-nums' }}>{value}</span>
    </div>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', background: '#f4f7fb', padding: '40px 16px' }}>
      <div style={{ maxWidth: 460, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 18 }}>
          <Link href="/" style={{ fontSize: 16, fontWeight: 800, color: NAVY, textDecoration: 'none', letterSpacing: '-0.02em' }}>
            SquareOne Interactive
          </Link>
          <p style={{ fontSize: 11.5, color: FAINT, margin: '2px 0 0' }}>Tulsa</p>
        </div>
        {children}
        <p style={{ fontSize: 11.5, color: FAINT, textAlign: 'center', margin: '18px 0 0', lineHeight: 1.6 }}>
          Questions about this booking? Reply to the email it came from, or call the front desk.
        </p>
      </div>
    </div>
  )
}

export default async function PayPage({ params, searchParams }: {
  params: Promise<{ token: string }>
  searchParams: Promise<{ paid?: string }>
}) {
  const { token } = await params
  const { paid } = await searchParams
  const [found, tag] = await Promise.all([bookingForToken(token), cashtag()])

  if (!found) {
    return (
      <Shell>
        <div className="sq-card" style={{ ...card, padding: '28px 30px', textAlign: 'center' }}>
          <p style={{ fontSize: 16, fontWeight: 800, color: INK, margin: '0 0 6px' }}>This link isn&rsquo;t valid</p>
          <p style={{ fontSize: 13, color: SUB, margin: '0 0 16px', lineHeight: 1.6 }}>
            It may have been mistyped, or the booking may have been removed. Give us a call and
            we&rsquo;ll sort it out in a minute.
          </p>
          <Link href="/" className="sq-btn sq-btn-ghost" style={{ padding: '9px 18px' }}>Go to the website</Link>
        </div>
      </Shell>
    )
  }

  const t = found.target
  const settled = t.balanceCents <= 0
  const canceled = t.status === 'canceled'

  // The Cash App QR carries the amount actually due right now — the same
  // deposit-or-balance choice PayPanel's buttons make.
  const showDeposit = t.depositDueCents > 0 && t.depositDueCents < t.balanceCents
  const cashQr = tag && !canceled && !settled
    ? await cashAppQrSvg(tag.replace(/^\$/, ''), showDeposit ? t.depositDueCents : t.balanceCents)
    : ''

  return (
    <Shell>
      <div className="sq-card" style={{ ...card, padding: '26px 30px' }}>
        {/* Stripe sends them back here; the webhook may land a moment later,
            so say what happened rather than showing a stale balance. */}
        {paid === '1' && (
          <div style={{ background: '#e5f2ea', border: '1px solid #bcdfc9', borderRadius: 10, padding: '12px 14px', marginBottom: 18 }}>
            <p style={{ fontSize: 13.5, fontWeight: 700, color: '#1d6b3f', margin: '0 0 2px' }}>Payment received — thank you.</p>
            <p style={{ fontSize: 12.5, color: SUB, margin: 0, lineHeight: 1.5 }}>
              Your receipt is on its way by email. If the balance below still looks unchanged,
              give it a moment and refresh.
            </p>
          </div>
        )}

        <p style={{ fontSize: 11, fontWeight: 700, color: FAINT, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 6px' }}>
          {canceled ? 'Canceled booking' : settled ? 'Paid in full' : 'Pay for your booking'}
        </p>
        <p style={{ fontSize: 19, fontWeight: 800, color: INK, margin: '0 0 2px', letterSpacing: '-0.02em' }}>{t.room}</p>
        <p style={{ fontSize: 13.5, color: SUB, margin: 0 }}>{t.date} · {t.time}</p>

        {t.inReview && !canceled && (
          <p style={{ fontSize: 12.5, color: '#5b4708', background: '#fdf3dc', borderRadius: 9, padding: '10px 12px', margin: '14px 0 0', lineHeight: 1.55 }}>
            This reservation is still being reviewed by our team. You&rsquo;re welcome to pay now —
            it holds the room while we confirm, and we&rsquo;ll refund you in full if we can&rsquo;t.
          </p>
        )}

        <div style={{ borderTop: `1px solid ${LINE}`, margin: '16px 0 4px' }} />
        <Row label="What" value={t.title} />
        <Row label="Confirmation" value={t.code} />
        <Row label="Booking total" value={formatCents(t.priceCents)} />
        <Row label="Paid so far" value={formatCents(t.paidCents)} tone={t.paidCents > 0 ? GREEN : undefined} />
        <Row label="Balance" value={formatCents(t.balanceCents)} strong tone={t.balanceCents > 0 ? RED : GREEN} />
        <div style={{ borderTop: `1px solid ${LINE}`, margin: '4px 0 18px' }} />

        {canceled ? (
          <p style={{ fontSize: 13, color: SUB, margin: 0, lineHeight: 1.6 }}>
            This booking has been canceled, so there&rsquo;s nothing to pay. If that&rsquo;s a surprise,
            call us and we&rsquo;ll get it straightened out.
          </p>
        ) : settled ? (
          <p style={{ fontSize: 13, color: SUB, margin: 0, lineHeight: 1.6 }}>
            You&rsquo;re all paid up — nothing further to do. Come a few minutes early so we can get
            you settled.
          </p>
        ) : (
          <PayPanel token={token} target={t} cashtag={tag} bookingCode={t.code} cashQr={cashQr} />
        )}
      </div>

      <p style={{ fontSize: 11.5, color: FAINT, textAlign: 'center', margin: '14px 0 0', lineHeight: 1.6 }}>
        Have an account with us? <Link href="/account" style={{ color: BLUE, fontWeight: 600 }}>Sign in</Link> to
        see all your bookings, reschedule, or cancel.
      </p>
    </Shell>
  )
}
