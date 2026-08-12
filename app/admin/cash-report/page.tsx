'use client'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { card, INK, SUB, FAINT, LINE, BLUE, GREEN, RED } from '@/lib/theme'
import { formatCents } from '@/lib/format'
import { getDrawerMonth, DRAWER_EVENT, type DrawerMonth } from '@/lib/cash-drawer-store'
import { isSupabaseConfigured } from '@/lib/supabase'

// Printable month-by-month cash bag statement for the bookkeeper:
// opening balance, every entry with a running balance, totals, closing.
export default function CashReportPage() {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1) // 1-12
  const [report, setReport] = useState<DrawerMonth | null>(null)
  const [checked, setChecked] = useState(false)
  const [printedAt, setPrintedAt] = useState('')

  useEffect(() => {
    if (!isSupabaseConfigured()) return
    let on = true
    const sync = () => {
      getDrawerMonth(year, month).then((r) => { if (on) { setReport(r); setChecked(true) } }).catch(() => {})
    }
    sync()
    setPrintedAt(new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }))
    window.addEventListener(DRAWER_EVENT, sync)
    return () => { on = false; window.removeEventListener(DRAWER_EVENT, sync) }
  }, [year, month])

  const monthLabel = new Date(year, month - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  const shift = (d: number) => {
    const next = new Date(year, month - 1 + d, 1)
    setYear(next.getFullYear())
    setMonth(next.getMonth() + 1)
  }
  const isCurrent = year === now.getFullYear() && month === now.getMonth() + 1

  // Running balance per row
  let running = report?.openingCents ?? 0

  return (
    <div className="sq-page" style={{ padding: '34px 40px 20px', maxWidth: 900, margin: '0 auto' }}>
      <style>{`@media print {
        .sq-sidebar, .cash-report-controls, .sq-footer, footer { display: none !important }
        .sq-page { padding: 0 !important; max-width: none !important }
        .cash-report-sheet { box-shadow: none !important; border: none !important }
      }`}</style>

      {/* Controls — never printed */}
      <div className="cash-report-controls" style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        <Link href="/admin/payments" style={{ fontSize: 12.5, color: BLUE, fontWeight: 600, textDecoration: 'none' }}>← Payments</Link>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}>
          <button className="sq-btn sq-btn-ghost" style={{ padding: '6px 12px', fontSize: 13 }} onClick={() => shift(-1)}>‹</button>
          <span style={{ fontSize: 13.5, fontWeight: 700, color: INK, minWidth: 150, textAlign: 'center' }}>{monthLabel}</span>
          <button className="sq-btn sq-btn-ghost" style={{ padding: '6px 12px', fontSize: 13 }} onClick={() => shift(1)} disabled={isCurrent}>›</button>
        </div>
        <button className="sq-btn sq-btn-primary" style={{ padding: '8px 18px' }} onClick={() => window.print()} disabled={!report}>
          Print for the bookkeeper
        </button>
      </div>

      {!report && checked && (
        <div className="sq-card" style={{ ...card, padding: '18px 22px' }}>
          <p style={{ fontSize: 13, color: SUB, margin: 0 }}>The cash bag needs 0024_cash_drawer.sql — run it in Supabase first.</p>
        </div>
      )}

      {report && (
        <div className="sq-card cash-report-sheet" style={{ ...card, padding: '32px 36px' }}>
          {/* Letterhead */}
          <div style={{ borderBottom: `2px solid ${INK}`, paddingBottom: 14, marginBottom: 18 }}>
            <p style={{ fontSize: 18, fontWeight: 800, color: INK, margin: 0, letterSpacing: '-0.02em' }}>SquareOne Interactive</p>
            <p style={{ fontSize: 12.5, color: SUB, margin: '2px 0 0' }}>Cash bag statement · {monthLabel} · prepared {printedAt}</p>
          </div>

          {/* Summary strip */}
          <div style={{ display: 'flex', gap: '10px 34px', flexWrap: 'wrap', marginBottom: 20 }}>
            {[
              ['Opening balance', formatCents(report.openingCents), INK],
              ['Cash in', `+${formatCents(report.inCents)}`, GREEN],
              ['Cash out', `−${formatCents(report.outCents)}`, RED],
              ['Closing balance', formatCents(report.closingCents), INK],
            ].map(([label, value, color]) => (
              <div key={label as string}>
                <p style={{ fontSize: 10.5, fontWeight: 700, color: FAINT, textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 2px' }}>{label}</p>
                <p style={{ fontSize: 16, fontWeight: 800, color: color as string, margin: 0, fontVariantNumeric: 'tabular-nums' }}>{value}</p>
              </div>
            ))}
          </div>

          {/* Ledger */}
          {report.entries.length === 0 ? (
            <p style={{ fontSize: 13, color: SUB, margin: 0 }}>No cash bag activity in {monthLabel}.</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: `1.5px solid ${INK}` }}>
                  {['Date', 'Entry', 'Recorded by', 'In', 'Out', 'Balance'].map((h, i) => (
                    <th key={h} style={{ textAlign: i >= 3 ? 'right' : 'left', padding: '6px 8px', fontSize: 10.5, fontWeight: 700, color: INK, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {report.entries.map((e) => {
                  running += e.amountCents
                  return (
                    <tr key={e.id} style={{ borderBottom: `1px solid ${LINE}` }}>
                      <td style={{ padding: '7px 8px', color: SUB, whiteSpace: 'nowrap' }}>{e.when}</td>
                      <td style={{ padding: '7px 8px', color: INK, fontWeight: 600 }}>{e.reason}</td>
                      <td style={{ padding: '7px 8px', color: SUB }}>{e.staffName ?? '—'}</td>
                      <td style={{ padding: '7px 8px', textAlign: 'right', color: GREEN, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                        {e.amountCents > 0 ? formatCents(e.amountCents) : ''}
                      </td>
                      <td style={{ padding: '7px 8px', textAlign: 'right', color: RED, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                        {e.amountCents < 0 ? formatCents(-e.amountCents) : ''}
                      </td>
                      <td style={{ padding: '7px 8px', textAlign: 'right', color: INK, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{formatCents(running)}</td>
                    </tr>
                  )
                })}
                <tr>
                  <td colSpan={3} style={{ padding: '9px 8px', fontWeight: 800, color: INK }}>Totals · {report.entries.length} entries</td>
                  <td style={{ padding: '9px 8px', textAlign: 'right', fontWeight: 800, color: GREEN, fontVariantNumeric: 'tabular-nums' }}>{formatCents(report.inCents)}</td>
                  <td style={{ padding: '9px 8px', textAlign: 'right', fontWeight: 800, color: RED, fontVariantNumeric: 'tabular-nums' }}>{formatCents(report.outCents)}</td>
                  <td style={{ padding: '9px 8px', textAlign: 'right', fontWeight: 800, color: INK, fontVariantNumeric: 'tabular-nums' }}>{formatCents(report.closingCents)}</td>
                </tr>
              </tbody>
            </table>
          )}

          {/* Sign-off for the paper file */}
          <div style={{ display: 'flex', gap: 40, marginTop: 34, flexWrap: 'wrap' }}>
            {['Counted by', 'Reviewed by'].map((label) => (
              <div key={label} style={{ flex: 1, minWidth: 180 }}>
                <div style={{ borderBottom: `1px solid ${INK}`, height: 28 }} />
                <p style={{ fontSize: 10.5, color: SUB, margin: '4px 0 0' }}>{label} · date</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="cash-report-controls" style={{ fontSize: 11.5, color: FAINT, marginTop: 16 }}>
        Pick the month, then Print — the sidebar and buttons stay off the paper. Cash payments, cash payouts, deposits,
        and corrections all appear with who recorded them and a running balance.
      </p>
    </div>
  )
}
