'use client'
import { useEffect, useState } from 'react'
import { formatHour } from '@/lib/format'
import { getSiteConfig, SITE_CONFIG_EVENT, type SiteConfig } from '@/lib/site-config-store'

// Footer address + hours — reads the admin-editable site config.
export function FooterInfo() {
  const [cfg, setCfg] = useState<SiteConfig | null>(null)

  useEffect(() => {
    const sync = () => setCfg(getSiteConfig())
    sync()
    window.addEventListener(SITE_CONFIG_EVENT, sync)
    return () => window.removeEventListener(SITE_CONFIG_EVENT, sync)
  }, [])

  if (!cfg) return null
  return (
    <>
      <p style={{ fontSize: 12, margin: 0, lineHeight: 1.6 }}>{cfg.address}</p>
      <p style={{ fontSize: 12, margin: '2px 0 0', lineHeight: 1.6 }}>{cfg.weekdayLabel}: {formatHour(cfg.weekdayOpenH)} – {formatHour(cfg.weekdayCloseH)}</p>
      <p style={{ fontSize: 12, margin: '2px 0 0', lineHeight: 1.6 }}>{cfg.sundayLabel}: {formatHour(cfg.sundayOpenH)} – {formatHour(cfg.sundayCloseH)}</p>
      <p style={{ fontSize: 12, margin: '2px 0 0', lineHeight: 1.6 }}>{cfg.phone}</p>
    </>
  )
}
