import type { Metadata, Viewport } from 'next'
import { SWRegister } from '@/components/pwa/SWRegister'
import './globals.css'

export const metadata: Metadata = {
  title: 'SquareOne Interactive',
  description: 'Memberships, room rentals, door access, and the SquareOne shop — part of SquareOne Compassion, Tulsa, OK.',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'SquareOne',
  },
  icons: {
    icon: [{ url: '/icon-192.png', sizes: '192x192', type: 'image/png' }],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
}

export const viewport: Viewport = {
  themeColor: '#182740',
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <SWRegister />
      </body>
    </html>
  )
}
