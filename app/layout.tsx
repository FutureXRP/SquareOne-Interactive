import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'SquareOne Interactive',
  description: 'Facility platform for SquareOne Interactive — part of SquareOne Compassion.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
