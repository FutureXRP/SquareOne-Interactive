import type { Metadata } from 'next'
import { AdminGate } from '@/components/admin/AdminGate'

// The dashboard never renders for anyone but verified staff (AdminGate),
// and search engines are told to stay out entirely.
export const metadata: Metadata = {
  title: 'Staff — SquareOne Interactive',
  robots: { index: false, follow: false },
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AdminGate>{children}</AdminGate>
}
