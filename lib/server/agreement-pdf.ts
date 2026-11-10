import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib'
import {
  AGREEMENT_ADDRESS, AGREEMENT_SECTIONS, PHOTO_OPTIONS, SIGNATURE_STATEMENT,
  type AgreementAnswers, type AgreementSnapshot,
} from '@/lib/rental-agreement'

// The signed Event Rental Agreement as a PDF — the renter's copy and the
// one kept on the booking. Laid out from the same structured text as the
// online form (lib/rental-agreement.ts), so the PDF says exactly what they
// agreed to, with their answers, initials, and signature filled in.

const INK = rgb(0.12, 0.17, 0.26)
const SUB = rgb(0.39, 0.45, 0.55)
const LINE = rgb(0.86, 0.89, 0.94)

// The built-in PDF fonts only speak Windows-1252; smart quotes and dashes
// come through, but anything stranger is swapped for a plain equivalent.
function clean(s: string): string {
  return (s ?? '')
    .replace(/[‘’]/g, '’').replace(/[“”]/g, '"')
    .replace(/→/g, '->').replace(/[☐]/g, '[ ]').replace(/[☑✓]/g, '[x]')
    .replace(/ /g, ' ')
    .replace(/[^\x09\x0A\x0D\x20-\x7E -ÿ–—‘’“”•…€]/g, '')
}

function money(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}

interface Fonts { regular: PDFFont; bold: PDFFont; italic: PDFFont }

class Writer {
  page: PDFPage
  y: number
  readonly margin = 54
  readonly width: number
  private doc: PDFDocument
  private fonts: Fonts
  private footer: string
  constructor(doc: PDFDocument, fonts: Fonts, footer: string) {
    this.doc = doc
    this.fonts = fonts
    this.footer = footer
    this.page = this.newPage()
    this.width = this.page.getWidth() - this.margin * 2
    this.y = this.page.getHeight() - this.margin
  }

  private newPage(): PDFPage {
    const p = this.doc.addPage([612, 792])
    p.drawText(clean(this.footer), { x: 54, y: 30, size: 8, font: this.fonts.regular, color: SUB })
    return p
  }

  ensure(h: number) {
    if (this.y - h < this.margin + 10) {
      this.page = this.newPage()
      this.y = this.page.getHeight() - this.margin
    }
  }

  wrap(text: string, font: PDFFont, size: number, width: number): string[] {
    const out: string[] = []
    for (const para of clean(text).split('\n')) {
      let line = ''
      for (const word of para.split(/\s+/).filter(Boolean)) {
        const next = line ? `${line} ${word}` : word
        if (font.widthOfTextAtSize(next, size) > width && line) { out.push(line); line = word } else line = next
      }
      out.push(line)
    }
    return out
  }

  text(t: string, o: { size?: number; font?: keyof Fonts; color?: ReturnType<typeof rgb>; indent?: number; gap?: number } = {}) {
    const size = o.size ?? 10
    const font = this.fonts[o.font ?? 'regular']
    const indent = o.indent ?? 0
    for (const line of this.wrap(t, font, size, this.width - indent)) {
      this.ensure(size + 3)
      this.page.drawText(line, { x: this.margin + indent, y: this.y - size, size, font, color: o.color ?? INK })
      this.y -= size + 3
    }
    this.y -= o.gap ?? 2
  }

  bullet(t: string, size = 9.5) {
    const font = this.fonts.regular
    const lines = this.wrap(t, font, size, this.width - 14)
    lines.forEach((line, i) => {
      this.ensure(size + 3)
      if (i === 0) this.page.drawText('•', { x: this.margin + 3, y: this.y - size, size, font, color: INK })
      this.page.drawText(line, { x: this.margin + 14, y: this.y - size, size, font, color: INK })
      this.y -= size + 3
    })
    this.y -= 1
  }

  field(label: string, value: string) {
    const size = 10
    this.ensure(size + 4)
    const l = `${clean(label)}: `
    this.page.drawText(l, { x: this.margin, y: this.y - size, size, font: this.fonts.regular, color: SUB })
    const lw = this.fonts.regular.widthOfTextAtSize(l, size)
    const lines = this.wrap(value || '—', this.fonts.bold, size, this.width - lw)
    lines.forEach((line, i) => {
      if (i > 0) this.ensure(size + 3)
      this.page.drawText(line, { x: this.margin + lw, y: this.y - size, size, font: this.fonts.bold, color: INK })
      this.y -= size + 3
    })
    this.y -= 2
  }

  rule(gap = 8) {
    this.ensure(gap * 2)
    this.y -= gap
    this.page.drawLine({ start: { x: this.margin, y: this.y }, end: { x: this.margin + this.width, y: this.y }, thickness: 0.7, color: LINE })
    this.y -= gap
  }
}

export interface AgreementPdfInput {
  snapshot: AgreementSnapshot
  answers: AgreementAnswers
  signature: string
  signedAt: string
  repName?: string | null
  repSignedAt?: string | null
  rooms: string[] // every room name, for the spaces checklist
  addons: string[]
}

export async function agreementPdf(a: AgreementPdfInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  doc.setTitle(`SquareOne Event Rental Agreement — ${a.snapshot.code}`)
  doc.setAuthor('SquareOne Interactive')
  doc.setSubject(`Signed by ${a.signature}`)
  const fonts: Fonts = {
    regular: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
    italic: await doc.embedFont(StandardFonts.TimesRomanItalic),
  }
  const when = (iso: string) => new Date(iso).toLocaleString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/Chicago',
  })
  const w = new Writer(doc, fonts, `SquareOne Event Rental Agreement · ${a.snapshot.code} · signed electronically ${when(a.signedAt)} (Central)`)
  const ans = a.answers ?? ({} as AgreementAnswers)

  w.text('SquareOne Event Rental Agreement', { size: 17, font: 'bold' })
  w.text(AGREEMENT_ADDRESS, { size: 9.5, color: SUB, gap: 6 })

  w.text('RENTER INFORMATION', { size: 10.5, font: 'bold', gap: 4 })
  w.field('Renter name', a.snapshot.renterName)
  w.field('Address', ans.address ?? '')
  w.field('Phone number', a.snapshot.phone)
  w.field('Event type', a.snapshot.eventType)
  w.field('Event date', a.snapshot.eventDate)
  w.field('Event time', `${a.snapshot.timeFrom} – ${a.snapshot.timeTo}`)
  w.field('Setup time (arrive)', a.snapshot.setupTime)
  w.field('Leave time', a.snapshot.leaveTime)
  w.field('Estimated guest count', ans.guestCount ? String(ans.guestCount) : '—')
  const spaces = ans.spaces ?? []
  w.field('Space(s) reserved', spaces.join(', ') || '—')
  if (a.snapshot.bookedRooms && a.snapshot.bookedRooms.length > 0) w.field('Rooms on the booking when signed', a.snapshot.bookedRooms.join(', '))
  w.field('Event add-on(s)', (ans.addons ?? []).join(', ') || 'none')
  w.field('Confirmation', a.snapshot.code)

  for (const section of AGREEMENT_SECTIONS) {
    w.rule()
    w.text(section.title.toUpperCase(), { size: 10.5, font: 'bold', gap: 4 })
    for (const g of section.groups) {
      if (g.heading) w.text(g.heading.toUpperCase(), { size: 8.5, font: 'bold', color: SUB, gap: 1 })
      if (g.intro) w.text(g.intro, { size: 9.5 })
      for (const b of g.bullets) w.bullet(b)
      if (g.footnote) w.text(`*${g.footnote}`, { size: 9, color: SUB, gap: 4 })
    }
    const initials = (ans.initials as Record<string, string> | undefined)?.[section.id] ?? ''
    w.text(`Renter's initials for this section: ${initials || '____'}`, { size: 10, font: 'bold', gap: 2 })
  }

  w.rule()
  w.text('PAYMENT', { size: 10.5, font: 'bold', gap: 4 })
  w.field('Total rental fee', money(a.snapshot.totalCents))
  w.field('Deposit (non-refundable)', money(a.snapshot.depositCents))
  w.field('Remaining balance when signed', money(a.snapshot.balanceCents))

  w.rule()
  w.text('PHOTO & SOCIAL MEDIA PERMISSION', { size: 10.5, font: 'bold', gap: 4 })
  for (const o of PHOTO_OPTIONS) w.text(`${ans.photoPermission === o.id ? '[x]' : '[ ]'}  ${o.label}`, { size: 9.5 })

  w.rule()
  w.text(SIGNATURE_STATEMENT, { size: 9.5, gap: 8 })
  w.ensure(40)
  w.text('Renter signature:', { size: 9, color: SUB, gap: 0 })
  w.text(a.signature, { size: 18, font: 'italic', gap: 2 })
  w.text(`Signed electronically by ${a.signature} on ${when(a.signedAt)} (Central time).`, { size: 9, color: SUB, gap: 8 })
  w.text('SquareOne representative:', { size: 9, color: SUB, gap: 0 })
  if (a.repName) {
    w.text(a.repName, { size: 16, font: 'italic', gap: 2 })
    if (a.repSignedAt) w.text(`Countersigned on ${when(a.repSignedAt)} (Central time).`, { size: 9, color: SUB })
  } else {
    w.text('Not yet countersigned.', { size: 9.5, color: SUB })
  }

  return doc.save()
}
