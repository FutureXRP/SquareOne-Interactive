'use client'
import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { card, INK, SUB, FAINT, LINE, BLUE, GREEN } from '@/lib/theme'
import {
  REPORTS, REPORT_GROUPS, cellText, toCsv, downloadCsv, type ReportResult,
} from '@/lib/report-center'
import { isSupabaseConfigured } from '@/lib/supabase'

function isoDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Named ranges people actually ask for, resolved against today.
function preset(kind: string): { from: string; to: string } {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const back = (days: number) => {
    const d = new Date(today)
    d.setDate(d.getDate() - days + 1)
    return d
  }
  switch (kind) {
    case 'today': return { from: isoDay(today), to: isoDay(today) }
    case '7': return { from: isoDay(back(7)), to: isoDay(today) }
    case '30': return { from: isoDay(back(30)), to: isoDay(today) }
    case '90': return { from: isoDay(back(90)), to: isoDay(today) }
    case 'this-month': return { from: isoDay(new Date(now.getFullYear(), now.getMonth(), 1)), to: isoDay(today) }
    case 'last-month': {
      const first = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      const last = new Date(now.getFullYear(), now.getMonth(), 0)
      return { from: isoDay(first), to: isoDay(last) }
    }
    case 'this-year': return { from: isoDay(new Date(now.getFullYear(), 0, 1)), to: isoDay(today) }
    case 'last-year': return { from: isoDay(new Date(now.getFullYear() - 1, 0, 1)), to: isoDay(new Date(now.getFullYear() - 1, 11, 31)) }
    default: return { from: isoDay(back(30)), to: isoDay(today) }
  }
}

const PRESETS: { key: string; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: '7', label: 'Last 7 days' },
  { key: '30', label: 'Last 30 days' },
  { key: 'this-month', label: 'This month' },
  { key: 'last-month', label: 'Last month' },
  { key: '90', label: 'Last 90 days' },
  { key: 'this-year', label: 'This year' },
  { key: 'last-year', label: 'Last year' },
]

export default function ReportLibraryPage() {
  const [reportId, setReportId] = useState(REPORTS[0].id)
  const [from, setFrom] = useState(preset('30').from)
  const [to, setTo] = useState(preset('30').to)
  const [activePreset, setActivePreset] = useState('30')
  const [result, setResult] = useState<ReportResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)
  const [preparedAt, setPreparedAt] = useState('')

  const def = REPORTS.find((r) => r.id === reportId) ?? REPORTS[0]
  const rangeLabel = from === to
    ? new Date(`${from}T12:00:00`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : `${new Date(`${from}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} – ${new Date(`${to}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`

  const run = useCallback(() => {
    if (!isSupabaseConfigured()) return
    setLoading(true)
    setFailed(false)
    // The range is inclusive of the end day, so query up to the next midnight.
    const fromIso = new Date(`${from}T00:00:00`).toISOString()
    const end = new Date(`${to}T00:00:00`)
    end.setDate(end.getDate() + 1)
    def.run(fromIso, end.toISOString())
      .then((r) => { setResult(r); setPreparedAt(new Date().toLocaleString('en-US', { month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })) })
      .catch(() => setFailed(true))
      .finally(() => setLoading(false))
  }, [def, from, to])

  useEffect(() => { run() }, [run])

  const applyPreset = (key: string) => {
    const p = preset(key)
    setFrom(p.from)
    setTo(p.to)
    setActivePreset(key)
  }

  const saveCsv = () => {
    if (!result) return
    const csv = toCsv(result, def.name, rangeLabel)
    downloadCsv(`squareone-${def.id}-${from}-to-${to}.csv`, csv)
  }

  return (
    <div className="sq-page" style={{ padding: '30px 40px 20px', maxWidth: 1240, margin: '0 auto' }}>
      <style>{`@media print {
        .sq-sidebar, .report-controls, .sq-footer, footer { display: none !important }
        .sq-page { padding: 0 !important; max-width: none !important }
        .report-sheet { box-shadow: none !important; border: none !important; padding: 0 !important }
        .report-layout { display: block !important }
        table { font-size: 10pt }
        thead { display: table-header-group }
        tr { break-inside: avoid }
      }`}</style>

      <div className="report-controls">
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 4, flexWrap: 'wrap' }}>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: INK, margin: 0, letterSpacing: '-0.03em' }}>Report Center</h1>
          <Link href="/admin/reports" style={{ fontSize: 12.5, color: BLUE, fontWeight: 600, textDecoration: 'none' }}>← Live dashboard</Link>
        </div>
        <p style={{ fontSize: 13, color: SUB, margin: '0 0 18px' }}>
          {REPORTS.length} reports over any date range — read on screen, save as CSV for the bookkeeper, or print to PDF.
        </p>

        {/* Date range */}
        <div className="sq-card" style={{ ...card, padding: '14px 18px', marginBottom: 16 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
            {PRESETS.map((p) => (
              <button key={p.key} onClick={() => applyPreset(p.key)} style={{
                font: 'inherit', cursor: 'pointer', fontSize: 12.5, fontWeight: 600,
                color: activePreset === p.key ? '#fff' : SUB, background: activePreset === p.key ? BLUE : '#fff',
                border: `1.5px solid ${activePreset === p.key ? BLUE : LINE}`, borderRadius: 999, padding: '6px 15px',
              }}>{p.label}</button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div>
              <label className="sq-label" htmlFor="r-from">From</label>
              <input id="r-from" type="date" className="sq-input" style={{ width: 165 }} value={from}
                onChange={(e) => { setFrom(e.target.value); setActivePreset('custom') }} />
            </div>
            <div>
              <label className="sq-label" htmlFor="r-to">To</label>
              <input id="r-to" type="date" className="sq-input" style={{ width: 165 }} value={to}
                onChange={(e) => { setTo(e.target.value); setActivePreset('custom') }} />
            </div>
            <button className="sq-btn sq-btn-ghost" style={{ padding: '9px 16px' }} onClick={run} disabled={loading}>
              {loading ? 'Running…' : 'Refresh'}
            </button>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
              <button className="sq-btn sq-btn-primary" style={{ padding: '9px 18px' }} disabled={!result || result.rows.length === 0} onClick={saveCsv}>
                Download CSV
              </button>
              <button className="sq-btn sq-btn-navy" style={{ padding: '9px 18px' }} disabled={!result} onClick={() => window.print()}>
                Print / Save as PDF
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="report-layout" style={{ display: 'grid', gridTemplateColumns: 'minmax(230px, 260px) 1fr', gap: 16, alignItems: 'start' }}>
        {/* Report picker */}
        <div className="sq-card report-controls" style={{ ...card, alignSelf: 'start', overflow: 'hidden' }}>
          {REPORT_GROUPS.map((group) => (
            <div key={group}>
              <p style={{ fontSize: 10.5, fontWeight: 700, color: BLUE, textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0, padding: '11px 16px 5px', background: '#fafbfd' }}>{group}</p>
              {REPORTS.filter((r) => r.group === group).map((r) => (
                <button key={r.id} onClick={() => setReportId(r.id)} style={{
                  font: 'inherit', cursor: 'pointer', display: 'block', width: '100%', textAlign: 'left',
                  background: reportId === r.id ? '#eef4fb' : 'transparent', border: 'none',
                  borderLeft: `3px solid ${reportId === r.id ? BLUE : 'transparent'}`,
                  padding: '9px 16px', borderBottom: `1px solid ${LINE}`,
                }}>
                  <span style={{ display: 'block', fontSize: 12.5, fontWeight: reportId === r.id ? 700 : 600, color: reportId === r.id ? BLUE : INK }}>{r.name}</span>
                </button>
              ))}
            </div>
          ))}
        </div>

        {/* The sheet */}
        <div className="sq-card report-sheet" style={{ ...card, padding: '26px 30px', minWidth: 0 }}>
          <div style={{ borderBottom: `2px solid ${INK}`, paddingBottom: 12, marginBottom: 16 }}>
            <p style={{ fontSize: 17, fontWeight: 800, color: INK, margin: 0, letterSpacing: '-0.02em' }}>SquareOne Interactive · {def.name}</p>
            <p style={{ fontSize: 12, color: SUB, margin: '3px 0 0' }}>{rangeLabel}{preparedAt ? ` · prepared ${preparedAt}` : ''}</p>
            <p className="report-controls" style={{ fontSize: 11.5, color: FAINT, margin: '6px 0 0', lineHeight: 1.5 }}>{def.blurb}</p>
          </div>

          {loading && <p style={{ fontSize: 13, color: SUB, margin: 0 }}>Running the report…</p>}
          {failed && <p style={{ fontSize: 13, color: '#b23f33', margin: 0 }}>That report couldn&apos;t run — check the browser console for the database error.</p>}

          {!loading && result && (
            <>
              {result.summary.length > 0 && (
                <div style={{ display: 'flex', gap: '10px 30px', flexWrap: 'wrap', marginBottom: 18 }}>
                  {result.summary.map((s) => (
                    <div key={s.label}>
                      <p style={{ fontSize: 10, fontWeight: 700, color: FAINT, textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 2px' }}>{s.label}</p>
                      <p style={{ fontSize: 15.5, fontWeight: 800, color: INK, margin: 0, fontVariantNumeric: 'tabular-nums' }}>{s.value}</p>
                    </div>
                  ))}
                </div>
              )}

              {result.note && (
                <p style={{ fontSize: 11.5, color: '#7a5a14', background: '#faf0dc', border: '1px solid #f0ddb8', borderRadius: 8, padding: '8px 11px', margin: '0 0 14px', lineHeight: 1.5 }}>
                  {result.note}
                </p>
              )}

              {result.columns.length === 0 ? null : result.rows.length === 0 ? (
                <p style={{ fontSize: 13, color: SUB, margin: 0 }}>Nothing to report for {rangeLabel.toLowerCase()}.</p>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ borderBottom: `1.5px solid ${INK}` }}>
                        {result.columns.map((c) => (
                          <th key={c.key} style={{
                            textAlign: c.kind === 'money' || c.kind === 'number' || c.kind === 'hours' ? 'right' : 'left',
                            padding: '6px 8px', fontSize: 10, fontWeight: 700, color: INK,
                            textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap',
                          }}>{c.label}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {result.rows.map((row, i) => (
                        <tr key={i} style={{ borderBottom: `1px solid ${LINE}` }}>
                          {result.columns.map((c) => {
                            const numeric = c.kind === 'money' || c.kind === 'number' || c.kind === 'hours'
                            return (
                              <td key={c.key} style={{
                                padding: '6px 8px',
                                textAlign: numeric ? 'right' : 'left',
                                color: c.kind === 'money' ? INK : SUB,
                                fontWeight: c.kind === 'money' ? 700 : 400,
                                fontVariantNumeric: numeric ? 'tabular-nums' : 'normal',
                                whiteSpace: c.kind ? 'nowrap' : 'normal',
                              }}>
                                {cellText(row[c.key] ?? '', c.kind)}
                              </td>
                            )
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <p style={{ fontSize: 10, color: FAINT, marginTop: 18, borderTop: `1px solid ${LINE}`, paddingTop: 8 }}>
                SquareOne Interactive · part of SquareOne Compassion · generated from live records{result.rows.length > 0 ? ` · ${result.rows.length} rows` : ''}
              </p>
            </>
          )}
        </div>
      </div>

      <p className="report-controls" style={{ fontSize: 11.5, color: FAINT, marginTop: 16, lineHeight: 1.6 }}>
        <strong style={{ color: SUB }}>CSV</strong> opens in Excel, Google Sheets, or QuickBooks — money comes through as plain numbers so it totals correctly.{' '}
        <strong style={{ color: SUB }}>Print / Save as PDF</strong> opens your browser&apos;s print box; choose &quot;Save as PDF&quot; as the
        destination for a filed copy. The sidebar and buttons stay off the page.{' '}
        <span style={{ color: GREEN }}>●</span> every number is read live at the moment you run it.
      </p>
    </div>
  )
}
