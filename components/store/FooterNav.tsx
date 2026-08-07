'use client'
import Link from 'next/link'
import { getSiteContent, CONTENT_EVENT, NAV_DEFAULT, type SiteContent } from '@/lib/content-store'
import { useLive } from '@/lib/use-live'

// Footer "Visit" links follow the editable store nav.
export function FooterVisit() {
  const { data: content } = useLive<SiteContent | null>(getSiteContent, [CONTENT_EVENT], null)
  const links = (content?.nav ?? NAV_DEFAULT).filter((l) => l.visible)
  return (
    <>
      {links.map((l) => l.href.startsWith('http')
        ? <a key={l.id} href={l.href} target="_blank" rel="noreferrer" style={{ display: 'block', fontSize: 12.5, color: 'rgba(255,255,255,0.72)', textDecoration: 'none', marginBottom: 5 }}>{l.label}</a>
        : <Link key={l.id} href={l.href} style={{ display: 'block', fontSize: 12.5, color: 'rgba(255,255,255,0.72)', textDecoration: 'none', marginBottom: 5 }}>{l.label}</Link>
      )}
    </>
  )
}

// Any editable text string, for use inside server components (like the footer).
export function ContentText({ k, fallback }: { k: string; fallback: string }) {
  const { data: content } = useLive<SiteContent | null>(getSiteContent, [CONTENT_EVENT], null)
  return <>{content?.text[k] ?? fallback}</>
}
