'use client'
import { useState } from 'react'
import { card, INK, SUB, FAINT, BLUE } from '@/lib/theme'
import { formatCents } from '@/lib/format'
import { PRODUCTS } from '@/lib/store-data'
import { addToCart } from '@/lib/session'

export default function ShopPage() {
  const [added, setAdded] = useState<string | null>(null)

  const add = (id: string) => {
    addToCart(id)
    setAdded(id)
    window.setTimeout(() => setAdded((cur) => (cur === id ? null : cur)), 1200)
  }

  return (
    <div className="sq-page" style={{ padding: '34px 20px 10px', maxWidth: 1180, margin: '0 auto' }}>
      <h1 style={{ fontSize: 28, fontWeight: 800, color: INK, margin: '0 0 6px', letterSpacing: '-0.03em' }}>SquareOne gear</h1>
      <p style={{ fontSize: 14, color: SUB, margin: '0 0 28px', maxWidth: 520 }}>
        Rep the square. Every purchase supports SquareOne Compassion programs.
        Pick up in person at the front desk — shipping comes later.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16 }}>
        {PRODUCTS.map((p) => (
          <div key={p.id} className="sq-card" style={{ ...card, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div style={{ height: 140, background: '#eef4fb', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
              {p.tag && <span style={{ position: 'absolute', top: 10, left: 10, fontSize: 10, fontWeight: 700, color: '#7a5a14', background: '#faf0dc', padding: '2px 9px', borderRadius: 999, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{p.tag}</span>}
              <div style={{ width: 62, height: 62, borderRadius: 16, background: `linear-gradient(135deg, ${p.colors[0]}, ${p.colors[1]})`, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 8px 20px rgba(24,39,64,.18)' }}>
                <div style={{ width: 26, height: 26, border: '2.5px solid rgba(255,255,255,0.9)', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <div style={{ width: 7, height: 7, background: 'rgba(255,255,255,0.9)', borderRadius: 2 }} />
                </div>
              </div>
            </div>
            <div style={{ padding: '13px 16px 16px', flex: 1, display: 'flex', flexDirection: 'column' }}>
              <p style={{ fontSize: 13.5, fontWeight: 700, color: INK, margin: '0 0 2px' }}>{p.name}</p>
              <p style={{ fontSize: 13, fontWeight: 700, color: SUB, margin: '0 0 12px', fontVariantNumeric: 'tabular-nums' }}>{formatCents(p.priceCents)}</p>
              <button
                className={`sq-btn ${added === p.id ? 'sq-btn-navy' : 'sq-btn-ghost'}`}
                style={{ width: '100%', marginTop: 'auto', padding: '8px 14px' }}
                onClick={() => add(p.id)}
              >
                {added === p.id ? 'Added ✓' : 'Add to cart'}
              </button>
            </div>
          </div>
        ))}
      </div>

      <p style={{ fontSize: 11.5, color: FAINT, margin: '26px 0 0' }}>
        Checkout goes live with the POS — for now, orders are paid at pickup.
        {' '}<a href="/cart" style={{ color: BLUE, fontWeight: 600 }}>View cart →</a>
      </p>
    </div>
  )
}
