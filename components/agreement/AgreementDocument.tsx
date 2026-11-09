import { formatCents } from '@/lib/format'
import {
  AGREEMENT_ADDRESS, AGREEMENT_SECTIONS, PHOTO_OPTIONS, SIGNATURE_STATEMENT,
  type AgreementAnswers, type AgreementSnapshot, type AgreementSection,
} from '@/lib/rental-agreement'

// A signed Event Rental Agreement, laid out like the paper form — the
// renter's copy on the pay page and the staff copy (printable) in the
// admin both render this, from the record as it was signed.

const INK = '#1f2c42'
const SUB = '#64748c'
const LINE = '#dbe4f0'

function Field({ label, value }: { label: string; value: string }) {
  return (
    <p style={{ fontSize: 13, color: SUB, margin: '0 0 6px', lineHeight: 1.5 }}>
      {label}: <strong style={{ color: INK, fontWeight: 700 }}>{value || '—'}</strong>
    </p>
  )
}

function Box({ on }: { on: boolean }) {
  return <span style={{ display: 'inline-block', width: 16, fontWeight: 800, color: on ? INK : '#b9c5d6' }}>{on ? '☑' : '☐'}</span>
}

export function AgreementTerms({ section, initials }: { section: AgreementSection; initials?: string }) {
  return (
    <div style={{ borderTop: `1px solid ${LINE}`, padding: '14px 0 4px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
        <p style={{ fontSize: 13.5, fontWeight: 800, color: INK, margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{section.title}</p>
        {initials !== undefined && (
          <span style={{ fontSize: 12, color: SUB }}>Initial: <strong style={{ color: INK, fontFamily: 'Georgia, serif', fontStyle: 'italic', fontSize: 14 }}>{initials || '____'}</strong></span>
        )}
      </div>
      {section.groups.map((g, i) => (
        <div key={i} style={{ margin: '0 0 10px' }}>
          {g.heading && <p style={{ fontSize: 12, fontWeight: 700, color: SUB, textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 4px' }}>{g.heading}</p>}
          {g.intro && <p style={{ fontSize: 12.5, color: INK, margin: '0 0 4px', lineHeight: 1.55 }}>{g.intro}</p>}
          <ul style={{ margin: 0, paddingLeft: 20 }}>
            {g.bullets.map((b, j) => <li key={j} style={{ fontSize: 12.5, color: INK, lineHeight: 1.55, margin: '0 0 2px' }}>{b}</li>)}
          </ul>
          {g.footnote && <p style={{ fontSize: 12, color: SUB, margin: '6px 0 0', fontStyle: 'italic', lineHeight: 1.5 }}>*{g.footnote}</p>}
        </div>
      ))}
    </div>
  )
}

export function AgreementDocument({ snapshot, answers, signature, signedAt, repName, repSignedAt, rooms, addons }: {
  snapshot: AgreementSnapshot
  answers: AgreementAnswers
  signature: string
  signedAt: string
  repName?: string | null
  repSignedAt?: string | null
  rooms: string[]
  addons: string[]
}) {
  const day = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'America/Chicago' })
  const allRooms = [...new Set([...rooms, ...answers.spaces])]
  const allAddons = [...new Set([...addons, ...answers.addons])]
  return (
    <div style={{ color: INK }}>
      <div style={{ textAlign: 'center', marginBottom: 14 }}>
        <p style={{ fontSize: 18, fontWeight: 800, margin: 0, letterSpacing: '-0.01em' }}>SquareOne Event Rental Agreement</p>
        <p style={{ fontSize: 12, color: SUB, margin: '2px 0 0' }}>{AGREEMENT_ADDRESS}</p>
      </div>
      <p style={{ fontSize: 13, color: SUB, margin: '0 0 12px', lineHeight: 1.55 }}>
        This Event Rental Agreement is entered into on <strong style={{ color: INK }}>{day(signedAt)}</strong>, between SquareOne and Renter.
        Booking <strong style={{ color: INK }}>{snapshot.code}</strong>.
      </p>

      <p style={{ fontSize: 13.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em', margin: '0 0 8px' }}>Renter information</p>
      <Field label="Renter name" value={snapshot.renterName} />
      <Field label="Address" value={answers.address} />
      <Field label="Phone number" value={snapshot.phone} />

      <p style={{ fontSize: 13.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em', margin: '12px 0 8px' }}>Event details</p>
      <Field label="Event type" value={snapshot.eventType} />
      <Field label="Event date" value={snapshot.eventDate} />
      <Field label="Event time" value={`From ${snapshot.timeFrom} to ${snapshot.timeTo}`} />
      <Field label="Setup time" value={`${snapshot.setupTime} · Leave time: ${snapshot.leaveTime}`} />
      <Field label="Estimated guest count" value={String(answers.guestCount)} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10, margin: '6px 0 6px' }}>
        <div>
          <p style={{ fontSize: 12, fontWeight: 700, color: SUB, margin: '0 0 4px' }}>Space(s) reserved</p>
          {allRooms.map((r) => <p key={r} style={{ fontSize: 12.5, margin: '0 0 2px' }}><Box on={answers.spaces.includes(r)} /> {r}</p>)}
        </div>
        <div>
          <p style={{ fontSize: 12, fontWeight: 700, color: SUB, margin: '0 0 4px' }}>Event add-on(s)</p>
          {allAddons.length === 0
            ? <p style={{ fontSize: 12.5, color: SUB, margin: 0 }}>None offered</p>
            : allAddons.map((a) => <p key={a} style={{ fontSize: 12.5, margin: '0 0 2px' }}><Box on={answers.addons.includes(a)} /> {a}</p>)}
        </div>
      </div>

      {AGREEMENT_SECTIONS.map((s) => <AgreementTerms key={s.id} section={s} initials={answers.initials[s.id]} />)}

      <div style={{ borderTop: `1px solid ${LINE}`, padding: '12px 0 4px' }}>
        <Field label="Total rental fee" value={formatCents(snapshot.totalCents)} />
        <Field label="Deposit (non-refundable)" value={formatCents(snapshot.depositCents)} />
        <Field label="Remaining balance (at signing)" value={formatCents(snapshot.balanceCents)} />
      </div>

      <div style={{ borderTop: `1px solid ${LINE}`, padding: '12px 0 4px' }}>
        <p style={{ fontSize: 12, fontWeight: 700, color: SUB, textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 6px' }}>Photo &amp; social media permission</p>
        {PHOTO_OPTIONS.map((o) => (
          <p key={o.id} style={{ fontSize: 12.5, margin: '0 0 4px', lineHeight: 1.5 }}><Box on={answers.photoPermission === o.id} /> {o.label}</p>
        ))}
      </div>

      <div style={{ borderTop: `1px solid ${LINE}`, padding: '12px 0 0' }}>
        <p style={{ fontSize: 13.5, fontWeight: 800, margin: '0 0 6px' }}>Agreement &amp; signature</p>
        <p style={{ fontSize: 12.5, color: SUB, margin: '0 0 10px', lineHeight: 1.55 }}>{SIGNATURE_STATEMENT}</p>
        <p style={{ fontSize: 13, color: SUB, margin: '0 0 4px' }}>
          Renter signature: <span style={{ fontFamily: 'Georgia, serif', fontStyle: 'italic', fontSize: 18, color: INK }}>{signature}</span>
        </p>
        <Field label="Date" value={day(signedAt)} />
        <p style={{ fontSize: 13, color: SUB, margin: '10px 0 4px' }}>
          SquareOne representative:{' '}
          {repName
            ? <span style={{ fontFamily: 'Georgia, serif', fontStyle: 'italic', fontSize: 16, color: INK }}>{repName}</span>
            : <strong style={{ color: INK }}>awaiting countersignature</strong>}
        </p>
        {repSignedAt && <Field label="Date" value={day(repSignedAt)} />}
      </div>
    </div>
  )
}
