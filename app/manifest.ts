import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'SquareOne Interactive',
    short_name: 'SquareOne',
    description: 'Memberships, room rentals, door access, and the SquareOne shop — Tulsa, OK.',
    start_url: '/',
    display: 'standalone',
    background_color: '#f8fafd',
    theme_color: '#182740',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
