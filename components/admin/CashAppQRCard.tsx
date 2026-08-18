'use client'
import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { INK, FAINT, LINE } from '@/lib/theme'

// The facility's Cash App QR, drawn live from whatever $cashtag is in the
// box above it — retype the tag and the code redraws itself. Same
// construction as the pay page's QR (and the official Cash App card):
// level-H error correction so the green $ badge can sit over the middle.
// This one encodes the plain profile link, no amount — it's the code you
// print and tape to the desk.
export function CashAppQRCard({ cashtag }: { cashtag: string }) {
  const tag = cashtag.trim().replace(/^\$/, '')
  const [svg, setSvg] = useState('')

  useEffect(() => {
    let on = true
    if (!tag) { setSvg(''); return }
    QRCode.toString(`https://cash.app/$${tag}`, {
      type: 'svg',
      errorCorrectionLevel: 'H',
      margin: 0,
      color: { dark: '#182740', light: '#ffffff00' },
    })
      .then((s) => { if (on) setSvg(s.replace('<svg ', '<svg width="132" height="132" ')) })
      .catch(() => { if (on) setSvg('') })
    return () => { on = false }
  }, [tag])

  if (!tag || !svg) return null

  // A desk-size copy in its own window, so printing doesn't drag the whole
  // settings page along.
  const printIt = () => {
    const w = window.open('', '_blank', 'width=520,height=680')
    if (!w) return
    w.document.write(`<!doctype html><html><head><title>Cash App — $${tag}</title></head>
      <body style="margin:0;display:flex;align-items:center;justify-content:center;min-height:100vh;font-family:system-ui,sans-serif">
        <div style="text-align:center;padding:40px">
          <div style="position:relative;width:340px;height:340px;margin:0 auto">
            ${svg.replace('width="132" height="132"', 'width="340" height="340"')}
            <span style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:76px;height:76px;border-radius:18px;background:#00D632;border:6px solid #fff;display:flex;align-items:center;justify-content:center;color:#fff;font-size:40px;font-weight:800">$</span>
          </div>
          <p style="font-size:26px;font-weight:800;color:#182740;margin:22px 0 4px">$${tag}</p>
          <p style="font-size:14px;color:#6b7687;margin:0">Scan with your phone camera to pay with Cash App</p>
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
        <span style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: 32, height: 32, borderRadius: 8, background: '#00D632', border: '3px solid #fff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 17, fontWeight: 800 }}>$</span>
      </div>
      <p style={{ fontSize: 12.5, fontWeight: 800, color: INK, margin: '8px 0 0', letterSpacing: '-0.01em' }}>${tag}</p>
      <p style={{ fontSize: 10.5, color: FAINT, margin: '1px 0 6px' }}>What customers scan to pay you</p>
      <button
        onClick={printIt}
        style={{ font: 'inherit', fontSize: 11, fontWeight: 600, color: INK, background: 'none', border: `1px solid ${LINE}`, borderRadius: 8, padding: '5px 12px', cursor: 'pointer' }}
      >
        Print a desk copy
      </button>
    </div>
  )
}
