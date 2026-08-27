'use client'
import { useEffect, useState } from 'react'
import { card, INK, SUB, FAINT, LINE, BLUE, GREEN, GOLD } from '@/lib/theme'
import { getEmailWording, saveEmailWording, EMAIL_WORDING_EVENT, type EmailWording } from '@/lib/email-wording-store'
import { supabase } from '@/lib/supabase'

// Every email the system sends, editable in place. The subject can be
// replaced outright ({default} inserts the automatic one, which carries
// the room and date); staff paragraphs slot in above and below the
// generated body. The generated middle — amounts, dates, codes, pay
// links — stays machine-written, so no edit can make a receipt lie.

const CATALOG: { group: string; items: { kind: string; label: string; blurb: string }[] }[] = [
  {
    group: 'Bookings',
    items: [
      { kind: 'booking.hold', label: 'Room held', blurb: 'A room is being held while payment is awaited.' },
      { kind: 'booking.approved', label: 'Reservation approved', blurb: 'Staff confirmed a reservation that was in review.' },
      { kind: 'booking.confirmed', label: 'Booking confirmed', blurb: 'The booking is locked in.' },
      { kind: 'booking.payment', label: 'Deposit / paid in full', blurb: 'A payment landed on a booking — deposit or settled.' },
      { kind: 'booking.rescheduled', label: 'Booking moved', blurb: 'Date or time changed.' },
      { kind: 'booking.updated', label: 'Booking updated', blurb: 'Details changed (price, title, extras).' },
      { kind: 'booking.canceled', label: 'Booking canceled', blurb: 'Canceled by the customer, staff, or an expired hold.' },
      { kind: 'booking.deleted', label: 'Booking removed', blurb: 'A booking row was deleted outright.' },
      { kind: 'booking.staff_assigned', label: 'Staff: you’re running this', blurb: 'To the staff member put on a booking.' },
      { kind: 'booking.approval_alert', label: 'Staff: reservation needs approval', blurb: 'The heads-up to the address chosen on Settings when a customer books.' },
    ],
  },
  {
    group: 'Payments',
    items: [
      { kind: 'payment.receipt', label: 'Payment receipt', blurb: 'A standalone receipt for money taken at the desk.' },
      { kind: 'payment.voided', label: 'Payment record corrected', blurb: 'A mistakenly recorded payment was struck.' },
      { kind: 'refund.issued', label: 'Refund sent', blurb: 'Money went back to the customer.' },
    ],
  },
  {
    group: 'Memberships',
    items: [
      { kind: 'membership.welcome', label: 'Welcome — membership active', blurb: 'Right after a successful signup.' },
      { kind: 'membership.staff_alert', label: 'Staff: new member joined', blurb: 'The heads-up to the address chosen on Settings.' },
      { kind: 'membership.changed', label: 'Plan changed', blurb: 'Switched between plans.' },
      { kind: 'membership.renewed', label: 'Monthly renewal receipt', blurb: 'The recurring charge went through.' },
      { kind: 'membership.payment_failed', label: 'Payment failed', blurb: 'The card was declined on renewal.' },
      { kind: 'membership.canceled', label: 'Membership set to end', blurb: 'They canceled — access runs to period end.' },
      { kind: 'membership.resumed', label: 'Membership back on', blurb: 'A cancel was reversed before it took effect.' },
      { kind: 'membership.ended', label: 'Membership ended', blurb: 'The paid period ran out after a cancel.' },
      { kind: 'password.reset_by_staff', label: 'Password reset by staff', blurb: 'Staff reset a member’s password from the desk.' },
    ],
  },
  {
    group: 'Events & tours',
    items: [
      { kind: 'event.assigned', label: 'Staff: event assigned', blurb: 'A tour or calendar event was put on someone.' },
      { kind: 'event.reminder_staff', label: 'Staff event reminder', blurb: 'The advance nudge before their event.' },
      { kind: 'event.guest_confirmed', label: 'Guest: tour confirmed', blurb: 'To the visitor who booked the tour.' },
      { kind: 'event.reminder_guest', label: 'Guest tour reminder', blurb: 'The advance nudge to the visitor.' },
      { kind: 'event.moved', label: 'Event moved', blurb: 'A tour or event changed date or time.' },
    ],
  },
]

const BLANK = (kind: string): EmailWording => ({ kind, subject: '', topNote: '', bottomNote: '' })

export function EmailWordingEditor() {
  const [wording, setWording] = useState<Map<string, EmailWording> | null | 'loading'>('loading')
  const [openKind, setOpenKind] = useState<string | null>(null)
  const [draft, setDraft] = useState<EmailWording | null>(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  // The real template rendered with sample facts, current edits applied —
  // exactly the assembly a live send goes through.
  const [preview, setPreview] = useState<{ subject: string; html: string } | null>(null)
  const [previewBusy, setPreviewBusy] = useState(false)

  const loadPreview = async (kind: string) => {
    setPreviewBusy(true)
    setPreview(null)
    try {
      const { data } = await supabase().auth.getSession()
      const token = data.session?.access_token
      if (!token) { setPreviewBusy(false); return }
      const res = await fetch('/api/email/preview', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ kind }),
      })
      if (res.ok) setPreview(await res.json() as { subject: string; html: string })
    } catch { /* preview is best effort */ }
    setPreviewBusy(false)
  }

  useEffect(() => {
    let on = true
    const sync = () => { getEmailWording().then((m) => { if (on) setWording(m) }).catch(() => { if (on) setWording(null) }) }
    sync()
    window.addEventListener(EMAIL_WORDING_EVENT, sync)
    return () => { on = false; window.removeEventListener(EMAIL_WORDING_EVENT, sync) }
  }, [])

  const open = (kind: string) => {
    if (openKind === kind) { setOpenKind(null); setDraft(null); setPreview(null); return }
    const cur = wording instanceof Map ? wording.get(kind) : undefined
    setOpenKind(kind)
    setDraft(cur ? { ...cur } : BLANK(kind))
    setNote(null)
    loadPreview(kind)
  }

  const save = async () => {
    if (!draft || busy) return
    setBusy(true)
    const ok = await saveEmailWording(draft)
    setBusy(false)
    setNote(ok
      ? (!draft.subject.trim() && !draft.topNote.trim() && !draft.bottomNote.trim()
        ? 'Cleared — this email is back to its stock wording.'
        : 'Saved — takes effect on sends within a minute.')
      : 'Could not save — has 0043_email_wording.sql been run in Supabase?')
    if (ok) loadPreview(draft.kind)
  }

  return (
    <div className="sq-card" style={{ ...card, overflow: 'hidden', marginBottom: 16 }}>
      <div style={{ padding: '14px 20px', borderBottom: `1px solid ${LINE}` }}>
        <span style={{ fontSize: 13.5, fontWeight: 700, color: INK }}>Email wording</span>
        <p style={{ fontSize: 12, color: SUB, margin: '3px 0 0', lineHeight: 1.55 }}>
          Every email the system sends, editable here. Rewrite the subject line and add your own words above
          and below the details. The generated middle — amounts, dates, codes, and pay links — stays
          machine-written, so a receipt can never say the wrong number.
        </p>
      </div>

      {wording === null && (
        <p style={{ fontSize: 12.5, color: GOLD, fontWeight: 600, padding: '14px 20px', margin: 0 }}>
          Editable wording needs 0043_email_wording.sql — run it in Supabase and this list lights up.
        </p>
      )}

      {CATALOG.map((g) => (
        <div key={g.group}>
          <p style={{ fontSize: 11, fontWeight: 700, color: FAINT, textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0, padding: '12px 20px 6px' }}>{g.group}</p>
          {g.items.map((item) => {
            const edited = wording instanceof Map && wording.has(item.kind)
            const isOpen = openKind === item.kind
            return (
              <div key={item.kind} style={{ borderTop: `1px solid ${LINE}` }}>
                <button onClick={() => open(item.kind)}
                  style={{ font: 'inherit', display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', background: isOpen ? '#fafbfd' : 'none', border: 'none', cursor: 'pointer', padding: '10px 20px' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 600, color: INK, margin: 0 }}>
                      {item.label}
                      {edited && <span style={{ fontSize: 10, fontWeight: 700, color: BLUE, background: '#eef4fb', padding: '1px 8px', borderRadius: 999, marginLeft: 8 }}>edited</span>}
                    </p>
                    <p style={{ fontSize: 11.5, color: FAINT, margin: 0 }}>{item.blurb}</p>
                  </div>
                  <span style={{ fontSize: 11.5, fontWeight: 600, color: BLUE }}>{isOpen ? 'Close' : 'Edit'}</span>
                </button>
                {isOpen && draft && (
                  <div style={{ padding: '4px 20px 16px', background: '#fafbfd' }}>
                    {/* What this email looks like right now, edits included */}
                    <div style={{ background: '#fff', border: `1px solid ${LINE}`, borderRadius: 12, overflow: 'hidden', marginBottom: 14 }}>
                      <div style={{ padding: '9px 14px', borderBottom: `1px solid ${LINE}`, background: '#fafbfd' }}>
                        <p style={{ fontSize: 11, fontWeight: 700, color: FAINT, textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 2px' }}>Currently sends as</p>
                        <p style={{ fontSize: 12.5, fontWeight: 700, color: INK, margin: 0 }}>
                          {previewBusy ? 'Rendering the preview…' : preview ? `Subject: ${preview.subject}` : 'Preview unavailable.'}
                        </p>
                      </div>
                      {preview && (
                        <iframe
                          title={`preview-${item.kind}`}
                          sandbox=""
                          srcDoc={preview.html}
                          style={{ width: '100%', height: 380, border: 'none', display: 'block', background: '#f4f7fb' }}
                        />
                      )}
                      <p style={{ fontSize: 10.5, color: FAINT, margin: 0, padding: '6px 14px 8px' }}>
                        Rendered with sample details (Jordan Alvarez, BK-1234, sample amounts) — real sends use the real facts.
                      </p>
                    </div>
                    <label className="sq-label" htmlFor={`ew-subj-${item.kind}`}>Subject line</label>
                    <input id={`ew-subj-${item.kind}`} className="sq-input" style={{ marginBottom: 2 }}
                      placeholder="blank = the automatic subject" value={draft.subject}
                      onChange={(e) => setDraft({ ...draft, subject: e.target.value })} />
                    <p style={{ fontSize: 11, color: FAINT, margin: '2px 0 10px' }}>
                      Type <strong style={{ color: SUB }}>{'{default}'}</strong> anywhere to insert the automatic
                      subject — it carries the room, date, and amount for this specific email.
                    </p>
                    <label className="sq-label" htmlFor={`ew-top-${item.kind}`}>Your words at the top</label>
                    <textarea id={`ew-top-${item.kind}`} className="sq-input" rows={2} style={{ resize: 'vertical', marginBottom: 10 }}
                      placeholder="Shown right under the headline, before the details." value={draft.topNote}
                      onChange={(e) => setDraft({ ...draft, topNote: e.target.value })} />
                    <label className="sq-label" htmlFor={`ew-bot-${item.kind}`}>Your words at the bottom</label>
                    <textarea id={`ew-bot-${item.kind}`} className="sq-input" rows={2} style={{ resize: 'vertical', marginBottom: 12 }}
                      placeholder="Shown after the details, before the button." value={draft.bottomNote}
                      onChange={(e) => setDraft({ ...draft, bottomNote: e.target.value })} />
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      <button className="sq-btn sq-btn-primary" style={{ padding: '8px 16px', fontSize: 12 }} disabled={busy} onClick={save}>
                        {busy ? 'Saving…' : 'Save wording'}
                      </button>
                      <button className="sq-btn sq-btn-ghost" style={{ padding: '8px 14px', fontSize: 12 }} disabled={busy}
                        onClick={() => setDraft(BLANK(item.kind))}>
                        Reset to stock wording
                      </button>
                      {note && <span style={{ fontSize: 12, fontWeight: 600, color: note.startsWith('Could not') ? GOLD : GREEN }}>{note}</span>}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}
