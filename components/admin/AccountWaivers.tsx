'use client'
import { useEffect, useState } from 'react'
import { INK, SUB, FAINT, LINE, BLUE, GREEN } from '@/lib/theme'
import { getAccountWaivers, deleteWaiverRecord, WAIVER_RECORDS_EVENT, type WaiverRecord } from '@/lib/waiver-records'

// Every waiver this account has signed, on the account until someone
// deletes it. Open one to read the exact language that was on screen the
// day they signed — that's the point of keeping it.
export function AccountWaivers({ accountId, canDelete }: { accountId: string; canDelete: boolean }) {
  const [records, setRecords] = useState<WaiverRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let on = true
    const sync = () => {
      getAccountWaivers(accountId)
        .then((r) => { if (on) { setRecords(r); setLoading(false) } })
        .catch(() => { if (on) setLoading(false) })
    }
    sync()
    window.addEventListener(WAIVER_RECORDS_EVENT, sync)
    return () => { on = false; window.removeEventListener(WAIVER_RECORDS_EVENT, sync) }
  }, [accountId])

  const remove = async (r: WaiverRecord) => {
    if (!window.confirm(`Delete ${r.participant}'s signature on "${r.formName}" from ${r.signedOn}? This is the only copy — it can't be undone.`)) return
    setError(null)
    const res = await deleteWaiverRecord(r.id)
    if (!res.ok) setError('Couldn’t delete that signature — run migration 0034 and try again.')
  }

  return (
    <div style={{ marginBottom: 14 }}>
      <span className="sq-label">Signed waivers</span>
      {loading ? (
        <p style={{ fontSize: 11.5, color: FAINT, margin: 0 }}>Loading…</p>
      ) : records.length === 0 ? (
        <p style={{ fontSize: 11.5, color: FAINT, margin: 0, lineHeight: 1.5 }}>
          Nothing signed on this account yet — waivers land here the moment someone signs one during signup or a booking.
        </p>
      ) : (
        <div style={{ border: `1px solid ${LINE}`, borderRadius: 10, overflow: 'hidden' }}>
          {records.map((r, i) => {
            const isOpen = open === r.id
            return (
              <div key={r.id} style={{ borderBottom: i < records.length - 1 ? `1px solid ${LINE}` : 'none' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', background: isOpen ? '#f7f9fd' : '#fff', flexWrap: 'wrap' }}>
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0, color: GREEN }}>
                    <rect x="1.5" y="1.5" width="13" height="13" rx="4" fill="#e5f2ea" />
                    <path d="M4.8 8.3l2.2 2.2 4.2-4.8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <div style={{ flex: 1, minWidth: 150 }}>
                    <p style={{ fontSize: 12.5, fontWeight: 700, color: INK, margin: 0 }}>{r.formName}</p>
                    <p style={{ fontSize: 11.5, color: SUB, margin: 0 }}>
                      {r.participant}
                      {r.signedBy && r.signedBy !== r.participant ? ` · signed by ${r.signedBy}` : ''} · {r.signedOn}
                    </p>
                  </div>
                  <button className="sq-btn sq-btn-ghost" style={{ padding: '4px 10px', fontSize: 11 }} onClick={() => setOpen(isOpen ? null : r.id)}>
                    {isOpen ? 'Close' : 'View'}
                  </button>
                  {canDelete && (
                    <button className="sq-btn sq-btn-danger" style={{ padding: '4px 10px', fontSize: 11 }} onClick={() => remove(r)}>Delete</button>
                  )}
                </div>
                {isOpen && (
                  <div style={{ padding: '2px 12px 12px 36px', background: '#f7f9fd' }}>
                    {r.terms.length > 0 ? (
                      r.terms.map((t, j) => (
                        <p key={j} style={{ fontSize: 11.5, color: SUB, lineHeight: 1.55, margin: '0 0 8px', paddingLeft: 13, position: 'relative' }}>
                          <span style={{ position: 'absolute', left: 0, top: 5, width: 5, height: 5, background: `${BLUE}30`, border: `1.5px solid ${BLUE}`, borderRadius: 2, transform: 'rotate(45deg)' }} />
                          {t}
                        </p>
                      ))
                    ) : (
                      <p style={{ fontSize: 11.5, color: FAINT, margin: '0 0 8px', lineHeight: 1.5 }}>
                        This signature predates waiver snapshots, so we don&rsquo;t have a copy of the wording
                        as it read that day. Everything signed from now on keeps its own copy.
                      </p>
                    )}
                    {Object.entries(r.responses).map(([label, picked]) => (
                      <p key={label} style={{ fontSize: 11.5, color: SUB, margin: '0 0 4px' }}>
                        <strong style={{ color: INK }}>{label}:</strong> {picked.join(', ') || '—'}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
      {error && <p style={{ fontSize: 11.5, color: '#cf4436', margin: '6px 0 0', fontWeight: 600 }}>{error}</p>}
    </div>
  )
}
