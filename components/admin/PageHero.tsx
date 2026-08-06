import { HERO_GRADIENT } from '@/lib/theme'

// Store-style gradient hero band used at the top of every admin module page,
// echoing the public store's look (ghosted rotated squares, navy→blue).
export function PageHero({ title, sub, chip, children }: {
  title: string
  sub?: React.ReactNode
  chip?: string
  children?: React.ReactNode
}) {
  return (
    <div style={{ position: 'relative', overflow: 'hidden', background: HERO_GRADIENT, borderRadius: 18, padding: '26px 30px', color: '#fff', marginBottom: 26, boxShadow: '0 14px 34px rgba(24,39,64,.26)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap' }}>
      <div style={{ position: 'absolute', right: -48, top: -60, width: 210, height: 210, border: '2px solid rgba(255,255,255,0.08)', borderRadius: 30, transform: 'rotate(18deg)', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', right: 30, top: -20, width: 110, height: 110, border: '2px solid rgba(255,255,255,0.12)', borderRadius: 18, transform: 'rotate(18deg)', pointerEvents: 'none' }} />
      <div style={{ position: 'relative', minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: sub ? 5 : 0, flexWrap: 'wrap' }}>
          <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0, letterSpacing: '-0.03em' }}>{title}</h1>
          {chip && <span style={{ fontSize: 10.5, fontWeight: 700, background: 'rgba(255,255,255,0.16)', padding: '3px 11px', borderRadius: 999, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{chip}</span>}
        </div>
        {sub && <p style={{ fontSize: 13, opacity: 0.85, margin: 0, lineHeight: 1.5 }}>{sub}</p>}
      </div>
      {children && <div style={{ position: 'relative', flexShrink: 0 }}>{children}</div>}
    </div>
  )
}

// Right-side stat block for the hero (mirrors the store hero's big number).
export function HeroStat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={{ textAlign: 'right' }}>
      <p style={{ fontSize: 10.5, margin: '0 0 2px', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700, opacity: 0.78 }}>{label}</p>
      <p style={{ fontSize: 27, fontWeight: 800, margin: 0, letterSpacing: '-0.03em', fontVariantNumeric: 'tabular-nums' }}>{value}</p>
      {sub && <p style={{ fontSize: 11.5, opacity: 0.85, margin: '2px 0 0' }}>{sub}</p>}
    </div>
  )
}
