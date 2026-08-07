'use client'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { PageHero } from '@/components/admin/PageHero'
import { AdminOnly } from '@/components/admin/AdminOnly'
import { card, INK, SUB, FAINT, LINE, BLUE, GREEN } from '@/lib/theme'
import { formatCents } from '@/lib/format'
import { getProducts, saveProduct, addProduct, deleteProduct, productSlug, PRODUCT_COLORS, type ProductConfig } from '@/lib/products-store'
import { useDebouncedSave } from '@/lib/use-debounced-save'
import { isSupabaseConfigured } from '@/lib/supabase'

function dollarsToCents(v: string): number {
  const n = Number.parseFloat(v.replace(/[$,\s]/g, ''))
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : 0
}

export default function ShopAdminPage() {
  const [products, setProducts] = useState<ProductConfig[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [savedNote, setSavedNote] = useState(false)

  const debouncedSave = useDebouncedSave(async (p: ProductConfig) => {
    await saveProduct(p)
    setSavedNote(true)
    window.setTimeout(() => setSavedNote(false), 1800)
  })

  useEffect(() => {
    if (!isSupabaseConfigured()) return
    getProducts().then(setProducts).catch(() => {})
  }, [])

  const editing = products.find((p) => p.id === editingId) ?? null

  const patch = (id: string, patchVal: Partial<ProductConfig>) => {
    setProducts((cur) => {
      const next = cur.map((p) => (p.id === id ? { ...p, ...patchVal } : p))
      const product = next.find((p) => p.id === id)
      if (product) debouncedSave(product)
      return next
    })
  }

  const removeProduct = async (id: string, name: string) => {
    if (!window.confirm(`Delete ${name} from the shop? This can't be undone.`)) return
    const result = await deleteProduct(id)
    if (result !== 'failed') {
      setProducts(await getProducts())
      if (editingId === id) setEditingId(null)
      if (result === 'hidden') window.alert('This product has order history, so it was hidden from the shop instead of deleted.')
    }
  }

  const createProduct = async () => {
    const id = productSlug('New Product', new Set(products.map((p) => p.id)))
    const product: Omit<ProductConfig, 'sort'> = {
      id,
      name: 'New Product',
      priceCents: 2000,
      tag: '',
      colors: [PRODUCT_COLORS[0], PRODUCT_COLORS[1]],
      active: false,
    }
    const ok = await addProduct(product)
    if (ok) {
      setProducts(await getProducts())
      setEditingId(id)
    }
  }

  return (
    <AdminOnly>
    <div className="sq-page" style={{ padding: '34px 40px 20px', maxWidth: 1180, margin: '0 auto' }}>
      <PageHero title="Shop" sub="The merch catalog people see in the store — add products, set prices, and take items down, live for every visitor." chip={`${products.filter((p) => p.active).length} live in store`}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {savedNote && <span style={{ fontSize: 12, fontWeight: 700 }}>Saved ✓</span>}
          <button className="sq-btn" style={{ background: '#fff', color: '#182740' }} onClick={createProduct}>+ Add a product</button>
        </div>
      </PageHero>

      <div className="sq-grid-2" style={{ display: 'grid', gridTemplateColumns: 'minmax(260px, 1fr) minmax(320px, 1.6fr)', gap: 16 }}>
        {/* Product list */}
        <div className="sq-card" style={{ ...card, alignSelf: 'start' }}>
          {products.map((p, i) => (
            <button key={p.id} onClick={() => setEditingId(p.id)} style={{
              font: 'inherit', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left',
              background: editingId === p.id ? '#eef4fb' : 'transparent', border: 'none',
              padding: '13px 18px', borderBottom: i < products.length - 1 ? `1px solid ${LINE}` : 'none',
            }}>
              <span style={{ width: 22, height: 22, borderRadius: 6, background: `linear-gradient(135deg, ${p.colors[0]}, ${p.colors[1]})`, flexShrink: 0 }} />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 13.5, fontWeight: 700, color: editingId === p.id ? BLUE : INK }}>{p.name}</span>
                <span style={{ display: 'block', fontSize: 11.5, color: SUB, fontVariantNumeric: 'tabular-nums' }}>{formatCents(p.priceCents)}{p.tag ? ` · ${p.tag}` : ''}</span>
              </span>
              {p.active
                ? <span style={{ fontSize: 10, fontWeight: 700, color: GREEN, background: '#e5f2ea', padding: '1px 8px', borderRadius: 999 }}>live</span>
                : <span style={{ fontSize: 10, fontWeight: 700, color: SUB, background: '#eef2f8', padding: '1px 8px', borderRadius: 999 }}>hidden</span>}
            </button>
          ))}
          {products.length === 0 && (
            <p style={{ fontSize: 13, color: SUB, padding: '16px 18px', margin: 0 }}>
              {isSupabaseConfigured() ? 'No products yet — add your first one.' : 'Connect Supabase to manage the catalog.'}
            </p>
          )}
        </div>

        {/* Editor */}
        {editing ? (
          <div className="sq-card" style={{ ...card, padding: '20px 24px', alignSelf: 'start' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginBottom: 14 }}>
              <div>
                <label className="sq-label" htmlFor="p-name">Product name</label>
                <input id="p-name" className="sq-input" value={editing.name} onChange={(e) => patch(editing.id, { name: e.target.value })} />
              </div>
              <div>
                <label className="sq-label" htmlFor="p-price">Price ($)</label>
                <input id="p-price" className="sq-input" inputMode="decimal" defaultValue={(editing.priceCents / 100).toFixed(2)} key={`price-${editing.id}`}
                  onBlur={(e) => patch(editing.id, { priceCents: dollarsToCents(e.target.value) })} />
              </div>
              <div>
                <label className="sq-label" htmlFor="p-tag">Badge (optional)</label>
                <input id="p-tag" className="sq-input" value={editing.tag} placeholder="bestseller" onChange={(e) => patch(editing.id, { tag: e.target.value })} />
              </div>
            </div>

            {([0, 1] as const).map((slot) => (
              <div key={slot} style={{ marginBottom: 14 }}>
                <span className="sq-label">{slot === 0 ? 'Card color' : 'Card accent color'}</span>
                <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                  {PRODUCT_COLORS.map((c) => (
                    <button key={c} aria-label={`Color ${c}`} onClick={() => {
                      const colors: [string, string] = slot === 0 ? [c, editing.colors[1]] : [editing.colors[0], c]
                      patch(editing.id, { colors })
                    }} style={{
                      width: 26, height: 26, borderRadius: 7, background: c, cursor: 'pointer',
                      border: editing.colors[slot] === c ? '2.5px solid #1f2c42' : '2.5px solid transparent',
                    }} />
                  ))}
                </div>
              </div>
            ))}

            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
              <div style={{ width: 52, height: 52, borderRadius: 13, background: `linear-gradient(135deg, ${editing.colors[0]}, ${editing.colors[1]})`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <div style={{ width: 20, height: 20, border: '2px solid rgba(255,255,255,0.9)', borderRadius: 5 }} />
              </div>
              <p style={{ fontSize: 11.5, color: FAINT, margin: 0, lineHeight: 1.5 }}>
                Product art preview — the two colors make the card&apos;s gradient until product photos arrive.
              </p>
            </div>

            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, fontWeight: 600, color: SUB, cursor: 'pointer', marginBottom: 4 }}>
              <input type="checkbox" checked={editing.active} onChange={(e) => patch(editing.id, { active: e.target.checked })} style={{ accentColor: BLUE }} />
              Visible in the shop
            </label>

            <div style={{ borderTop: `1px solid ${LINE}`, marginTop: 16, paddingTop: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
              <Link href="/shop" style={{ fontSize: 12.5, color: BLUE, fontWeight: 600, textDecoration: 'none' }}>Preview the shop →</Link>
              <button className="sq-btn sq-btn-danger" style={{ padding: '6px 13px', fontSize: 11.5 }} onClick={() => removeProduct(editing.id, editing.name)}>Delete product</button>
            </div>
            <p style={{ fontSize: 11, color: FAINT, margin: '10px 0 0' }}>Saves automatically as you type — live for every visitor.</p>
          </div>
        ) : (
          <div className="sq-card" style={{ ...card, padding: '30px 32px', alignSelf: 'start', textAlign: 'center' }}>
            <p style={{ fontSize: 13.5, color: SUB, margin: 0 }}>Select a product to edit it, or add a new one.</p>
          </div>
        )}
      </div>
    </div>
    </AdminOnly>
  )
}
