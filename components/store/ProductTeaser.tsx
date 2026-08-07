'use client'
import Link from 'next/link'
import { card, INK, SUB } from '@/lib/theme'
import { formatCents } from '@/lib/format'
import { getActiveProducts, PRODUCTS_EVENT, type ProductConfig } from '@/lib/products-store'
import { useLive } from '@/lib/use-live'

// Home-page merch strip — first four live products from the admin catalog.
export function ProductTeaser() {
  const { data: products } = useLive<ProductConfig[]>(getActiveProducts, [PRODUCTS_EVENT], [])

  if (products.length === 0) return null
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 14 }}>
      {products.slice(0, 4).map((p) => (
        <Link key={p.id} href="/shop" style={{ textDecoration: 'none' }}>
          <div className="sq-card" style={{ ...card, overflow: 'hidden' }}>
            <div style={{ height: 96, background: '#eef4fb', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: `linear-gradient(135deg, ${p.colors[0]}, ${p.colors[1]})`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ width: 18, height: 18, border: '2px solid rgba(255,255,255,0.85)', borderRadius: 4 }} />
              </div>
            </div>
            <div style={{ padding: '11px 14px 13px' }}>
              <p style={{ fontSize: 13, fontWeight: 600, color: INK, margin: '0 0 2px' }}>{p.name}</p>
              <p style={{ fontSize: 12.5, fontWeight: 700, color: SUB, margin: 0, fontVariantNumeric: 'tabular-nums' }}>{formatCents(p.priceCents)}</p>
            </div>
          </div>
        </Link>
      ))}
    </div>
  )
}
