/* eslint-disable @next/next/no-img-element */
// The real SquareOne mark (public/logo.svg).
export function Logo({ size = 28, radius = 7 }: { size?: number; radius?: number }) {
  return (
    <img src="/logo.svg" alt="SquareOne" width={size} height={size} style={{ width: size, height: size, borderRadius: radius, display: 'block', flexShrink: 0 }} />
  )
}
