import QRCode from 'qrcode'

// The pay page's Cash App QR — drawn fresh on every load from the $cashtag
// staff saved on Settings, with the exact amount owed baked into the link.
// Generating it (instead of embedding an uploaded screenshot) means it can
// never go stale when the cashtag changes, never blurs, and always carries
// the right amount for this booking.
export async function cashAppQrSvg(tag: string, amountCents: number): Promise<string> {
  if (!tag || amountCents <= 0) return ''
  const url = `https://cash.app/$${tag}/${(amountCents / 100).toFixed(2)}`
  try {
    // Level-H error correction tolerates 30% damage, which is what lets the
    // green $ badge sit over the middle — same construction as the official
    // Cash App card — and still scan first try.
    const svg = await QRCode.toString(url, {
      type: 'svg',
      errorCorrectionLevel: 'H',
      margin: 0,
      color: { dark: '#182740', light: '#ffffff00' },
    })
    // qrcode emits a viewBox-only <svg>; pin the on-screen size here so the
    // markup can be dropped in with dangerouslySetInnerHTML untouched.
    return svg.replace('<svg ', '<svg width="150" height="150" ')
  } catch {
    return ''
  }
}
