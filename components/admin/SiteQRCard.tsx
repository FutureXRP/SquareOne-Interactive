'use client'
import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { INK, FAINT, LINE, NAVY } from '@/lib/theme'

// The store's own QR — scan it and land on the live site. Drawn from the
// address the admin is actually running on (admin and store are one app,
// one domain), so it can never point at a stale URL. Same construction
// as the Cash App card: level-H error correction so the navy brand badge
// can sit over the middle, and a poster-size print copy for the door,
// flyers, and the front desk.
export function SiteQRCard() {
  const [svg, setSvg] = useState('')
  const [url, setUrl] = useState('')

  useEffect(() => {
    let on = true
    const origin = (process.env.NEXT_PUBLIC_SITE_URL || window.location.origin).replace(/\/$/, '')
    setUrl(origin)
    QRCode.toString(origin, {
      type: 'svg',
      errorCorrectionLevel: 'H',
      margin: 0,
      color: { dark: '#182740', light: '#ffffff00' },
    })
      .then((s) => { if (on) setSvg(s.replace('<svg ', '<svg width="132" height="132" ')) })
      .catch(() => { if (on) setSvg('') })
    return () => { on = false }
  }, [])

  if (!svg) return null
  const pretty = url.replace(/^https?:\/\//, '')

  // Poster copy in its own window so printing doesn't drag Settings along.
  const printIt = () => {
    const w = window.open('', '_blank', 'width=520,height=680')
    if (!w) return
    w.document.write(`<!doctype html><html><head><title>SquareOne Interactive — ${pretty}</title></head>
      <body style="margin:0;display:flex;align-items:center;justify-content:center;min-height:100vh;font-family:system-ui,sans-serif">
        <div style="text-align:center;padding:40px">
          <p style="font-size:30px;font-weight:800;color:#182740;margin:0 0 24px;letter-spacing:-0.02em">SquareOne Interactive</p>
          <div style="position:relative;width:340px;height:340px;margin:0 auto">
            ${svg.replace('width="132" height="132"', 'width="340" height="340"')}
            <span style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:76px;height:76px;border-radius:18px;background:#182740;border:6px solid #fff;display:flex;align-items:center;justify-content:center;color:#fff;font-size:30px;font-weight:800">SQ</span>
          </div>
          <p style="font-size:22px;font-weight:700;color:#182740;margin:22px 0 6px">${pretty}</p>
          <p style="font-size:15px;color:#6b7687;margin:0;line-height:1.5">Scan to book a room, plan a party,<br/>or join the fitness membership</p>
        </div>
      </body></html>`)
    w.document.close()
    w.focus()
    w.print()
  }

  return (
    <div style={{ marginTop: 10, background: '#fff', border: `1px solid ${LINE}`, borderRadius: 14, padding: '14px 14px 10px', width: 'fit-content', textAlign: 'center' }}>
      <div style={{ position: 'relative', width: 132, height: 132, margin: '0 auto' }}>
        <div style={{ lineHeight: 0 }} dangerouslySetInnerHTML={{ __html: svg }} />
        <span style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: 34, height: 34, borderRadius: 8, background: NAVY, border: '3px solid #fff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 13, fontWeight: 800 }}>SQ</span>
      </div>
      <p style={{ fontSize: 12.5, fontWeight: 800, color: INK, margin: '8px 0 0', letterSpacing: '-0.01em' }}>{pretty}</p>
      <p style={{ fontSize: 10.5, color: FAINT, margin: '1px 0 6px' }}>Scan to open the store — book rooms, join the gym</p>
      <button
        onClick={printIt}
        style={{ font: 'inherit', fontSize: 11, fontWeight: 600, color: INK, background: 'none', border: `1px solid ${LINE}`, borderRadius: 8, padding: '5px 12px', cursor: 'pointer' }}
      >
        Print a poster copy
      </button>
    </div>
  )
}
