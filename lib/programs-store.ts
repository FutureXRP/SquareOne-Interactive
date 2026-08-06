'use client'
// Editable programs catalog.

import { createLocalStore } from '@/lib/local-store'
import { programs as DEFAULT_PROGRAMS, type ProgramRow } from '@/lib/admin-data'

export interface EditableProgram extends ProgramRow {
  id: string
  active: boolean
}

const store = createLocalStore<EditableProgram[]>('sq-programs-v1', () =>
  DEFAULT_PROGRAMS.map((p, i) => ({ ...p, id: `pg-${i + 1}`, active: true }))
)

export const PROGRAMS_EVENT = store.event

export function getPrograms(): EditableProgram[] {
  return store.get()
}

export function savePrograms(programs: EditableProgram[]) {
  store.save(programs)
}

export function resetPrograms() {
  store.reset()
}
