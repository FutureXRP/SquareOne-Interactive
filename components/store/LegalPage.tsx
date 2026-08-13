'use client'
import Link from 'next/link'
import { card, INK, SUB, FAINT, LINE, BLUE } from '@/lib/theme'

// Shared shell for Terms and Privacy: a readable column, a last-updated
// stamp, and a table of contents built from the sections themselves.
export interface LegalSection {
  id: string
  heading: string
  paragraphs: (string | string[])[] // a string[] renders as a bulleted list
}

export function LegalPage({
  title, intro, updated, sections,
}: {
  title: string
  intro: string
  updated: string
  sections: LegalSection[]
}) {
  return (
    <div className="sq-page" style={{ padding: '40px 24px 20px', maxWidth: 820, margin: '0 auto' }}>
      <h1 style={{ fontSize: 32, fontWeight: 800, color: INK, margin: '0 0 8px', letterSpacing: '-0.03em' }}>{title}</h1>
      <p style={{ fontSize: 12.5, color: FAINT, margin: '0 0 18px' }}>Last updated {updated}</p>
      <p style={{ fontSize: 15, color: SUB, lineHeight: 1.7, margin: '0 0 26px' }}>{intro}</p>

      <div className="sq-card" style={{ ...card, padding: '16px 20px', marginBottom: 30 }}>
        <p style={{ fontSize: 11, fontWeight: 700, color: FAINT, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 8px' }}>On this page</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 18px' }}>
          {sections.map((s, i) => (
            <a key={s.id} href={`#${s.id}`} style={{ fontSize: 13, color: BLUE, fontWeight: 600, textDecoration: 'none' }}>
              {i + 1}. {s.heading}
            </a>
          ))}
        </div>
      </div>

      {sections.map((s, i) => (
        <section key={s.id} id={s.id} style={{ marginBottom: 30, scrollMarginTop: 20 }}>
          <h2 style={{ fontSize: 18, fontWeight: 800, color: INK, margin: '0 0 10px', letterSpacing: '-0.02em' }}>
            {i + 1}. {s.heading}
          </h2>
          {s.paragraphs.map((p, j) =>
            Array.isArray(p) ? (
              <ul key={j} style={{ margin: '0 0 12px', paddingLeft: 22 }}>
                {p.map((item, k) => (
                  <li key={k} style={{ fontSize: 14.5, color: SUB, lineHeight: 1.7, marginBottom: 5 }}>{item}</li>
                ))}
              </ul>
            ) : (
              <p key={j} style={{ fontSize: 14.5, color: SUB, lineHeight: 1.75, margin: '0 0 12px' }}>{p}</p>
            ),
          )}
        </section>
      ))}

      <div style={{ borderTop: `1px solid ${LINE}`, paddingTop: 18, display: 'flex', gap: 18, flexWrap: 'wrap' }}>
        <Link href="/terms" style={{ fontSize: 13, color: BLUE, fontWeight: 600, textDecoration: 'none' }}>Terms of Service</Link>
        <Link href="/privacy" style={{ fontSize: 13, color: BLUE, fontWeight: 600, textDecoration: 'none' }}>Privacy Policy</Link>
        <Link href="/" style={{ fontSize: 13, color: BLUE, fontWeight: 600, textDecoration: 'none' }}>Back to the store</Link>
      </div>
    </div>
  )
}
