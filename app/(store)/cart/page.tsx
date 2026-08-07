'use client'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { card, INK, SUB, FAINT, LINE, BLUE, GREEN } from '@/lib/theme'
import { formatCents } from '@/lib/format'
import { productById } from '@/lib/store-data'
import { clearCart, getCart, setCartQty, SESSION_EVENT, type CartItem } from '@/lib/session'
import { findCoupon, couponDiscountCents, type Coupon } from '@/lib/coupons-store'

export default function CartPage() {
  const [items, setItems] = useState<CartItem[]>([])
  const [placed, setPlaced] = useState(false)
  const [code, setCode] = useState('')
  const [coupon, setCoupon] = useState<Coupon | null>(null)
  const [couponError, setCouponError] = useState(false)

  useEffect(() => {
    const sync = () => setItems(getCart())
    sync()
    window.addEventListener(SESSION_EVENT, sync)
    return () => window.removeEventListener(SESSION_EVENT, sync)
  }, [])

  const rows = items.map((c) => ({ ...c, product: productById[c.productId] })).filter((r) => r.product)
  const subtotalCents = rows.reduce((n, r) => n + r.product.priceCents * r.qty, 0)
  const discountCents = coupon ? couponDiscountCents(coupon, subtotalCents) : 0
  const totalCents = subtotalCents - discountCents

  const applyCoupon = async () => {
    try {
      const found = await findCoupon(code)
      setCoupon(found)
      setCouponError(!found && code.trim() !== '')
    } catch {
      setCoupon(null)
      setCouponError(true)
    }
  }

  const placeOrder = () => {
    clearCart()
    setPlaced(true)
  }

  if (placed) {
    return (
      <div className="sq-page" style={{ padding: '40px 20px 10px', maxWidth: 560, margin: '0 auto' }}>
        <div className="sq-card" style={{ ...card, padding: '30px 32px' }}>
          <div style={{ width: 40, height: 40, borderRadius: 11, background: '#e5f2ea', color: GREEN, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
            <svg width="20" height="20" viewBox="0 0 16 16" fill="none"><path d="M3 8.5l3.2 3.2L13 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </div>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: INK, margin: '0 0 8px' }}>Order noted — pick up at the front desk</h1>
          <p style={{ fontSize: 13.5, color: SUB, margin: '0 0 18px', lineHeight: 1.6 }}>
            Show your member code at the desk and we&apos;ll take payment there.
            Online checkout arrives with Stripe.
          </p>
          <Link href="/shop" className="sq-btn sq-btn-primary">Back to the shop</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="sq-page" style={{ padding: '34px 20px 10px', maxWidth: 760, margin: '0 auto' }}>
      <h1 style={{ fontSize: 28, fontWeight: 800, color: INK, margin: '0 0 22px', letterSpacing: '-0.03em' }}>Your cart</h1>

      {rows.length === 0 ? (
        <div className="sq-card" style={{ ...card, padding: '30px 32px', textAlign: 'center' }}>
          <p style={{ fontSize: 14, color: SUB, margin: '0 0 16px' }}>Your cart is empty.</p>
          <Link href="/shop" className="sq-btn sq-btn-primary">Browse the shop</Link>
        </div>
      ) : (
        <div className="sq-card" style={card}>
          {rows.map((r, i) => (
            <div key={r.productId} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 20px', borderBottom: `1px solid ${LINE}` }}>
              <div style={{ width: 44, height: 44, borderRadius: 11, background: `linear-gradient(135deg, ${r.product.colors[0]}, ${r.product.colors[1]})`, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ width: 16, height: 16, border: '2px solid rgba(255,255,255,0.9)', borderRadius: 4 }} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 13.5, fontWeight: 700, color: INK, margin: 0 }}>{r.product.name}</p>
                <p style={{ fontSize: 12, color: FAINT, margin: 0, fontVariantNumeric: 'tabular-nums' }}>{formatCents(r.product.priceCents)} each</p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {(['-', '+'] as const).map((op) => (
                  <button key={op} onClick={() => setCartQty(r.productId, r.qty + (op === '+' ? 1 : -1))} aria-label={op === '+' ? 'Add one' : 'Remove one'} style={{
                    font: 'inherit', cursor: 'pointer', width: 26, height: 26, borderRadius: 7,
                    border: `1px solid ${LINE}`, background: '#fff', color: SUB, fontWeight: 700, lineHeight: 1,
                  }}>{op}</button>
                ))}
                <span style={{ fontSize: 13, fontWeight: 700, color: INK, minWidth: 20, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>{r.qty}</span>
              </div>
              <span style={{ fontSize: 13.5, fontWeight: 700, color: INK, minWidth: 64, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{formatCents(r.product.priceCents * r.qty)}</span>
            </div>
          ))}
          {/* Coupon */}
          <div style={{ padding: '14px 20px', borderBottom: `1px solid ${LINE}` }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <input className="sq-input" style={{ width: 160 }} placeholder="Coupon code" value={code}
                onChange={(e) => { setCode(e.target.value); setCouponError(false) }}
                onKeyDown={(e) => { if (e.key === 'Enter') applyCoupon() }} />
              <button className="sq-btn sq-btn-ghost" style={{ padding: '8px 14px' }} onClick={applyCoupon}>Apply</button>
              {coupon && <span style={{ fontSize: 12, fontWeight: 700, color: GREEN }}>{coupon.code} applied — {coupon.note}</span>}
              {couponError && <span style={{ fontSize: 12, fontWeight: 600, color: '#cf4436' }}>That code isn&apos;t valid.</span>}
            </div>
          </div>

          <div style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
            <div>
              {coupon && discountCents > 0 && (
                <p style={{ fontSize: 12, color: GREEN, margin: '0 0 2px', fontVariantNumeric: 'tabular-nums' }}>
                  {formatCents(subtotalCents)} − {formatCents(discountCents)} coupon
                </p>
              )}
              <p style={{ fontSize: 12, color: FAINT, margin: 0 }}>Total · pay at pickup</p>
              <p style={{ fontSize: 20, fontWeight: 800, color: INK, margin: 0, fontVariantNumeric: 'tabular-nums' }}>{formatCents(totalCents)}</p>
            </div>
            <button className="sq-btn sq-btn-primary" onClick={placeOrder}>Place pickup order</button>
          </div>
        </div>
      )}

      <p style={{ fontSize: 11.5, color: FAINT, margin: '20px 0 0' }}>Pay at pickup — online checkout arrives with Stripe.</p>
    </div>
  )
}
