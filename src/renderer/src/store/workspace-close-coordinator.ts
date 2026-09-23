import type { DocumentSession } from './workspace-types'

export type DocumentCloseChoice = 'cancel' | 'discard' | 'save'

/** Shared decision contract for a tab close and whole-application close. */
export async function resolveDocumentClose(
  dirty: boolean,
  requestChoice: () => Promise<string>,
  save: () => Promise<boolean>
): Promise<DocumentCloseChoice | 'clean'> {
  if (!dirty) return 'clean'
  const choice = await requestChoice()
  if (choice === 'discard') return 'discard'
  if (choice === 'save' && await save()) return 'save'
  return 'cancel'
}

export interface ApplicationClosePorts {
  hasDialog: () => boolean
  sessions: () => readonly DocumentSession[]
  prepare: () => Promise<void>
  waitForSaves: () => Promise<boolean>
  /** Lands recordings still waiting for PNG encoding before any dirty check. */
  flushRecordings: (sessions: readonly DocumentSession[]) => Promise<void>
  confirm: (session: DocumentSession) => Promise<DocumentCloseChoice | 'clean'>
  discardRecovery: (id: string) => Promise<void>
  waitForDocumentCloses: () => Promise<void>
  flushHistory: (session: DocumentSession) => Promise<unknown>
  approve: () => void
  cancel: () => void
  reportError: (error: unknown) => void
}

/** Owns exit sequencing and re-entry protection; UI supplies only the decisions. */
export function createApplicationCloseCoordinator(ports: ApplicationClosePorts): () => Promise<void> {
  let closing = false
  return async () => {
    if (closing) return
    if (ports.hasDialog()) { ports.cancel(); return }
    closing = true
    let approved = false
    try {
      await ports.prepare()
      if (!await ports.waitForSaves()) return
      // Flush before the dirty check: a produced frame that has not finished
      // encoding yet must reach the archive instead of being dropped on exit.
      await ports.flushRecordings(ports.sessions())
      for (const session of ports.sessions().filter((item) => item.document.dirty)) {
        const choice = await ports.confirm(session)
        if (choice === 'cancel') return
        if (choice === 'discard' && session.recoveryOriginId === null) await ports.discardRecovery(session.document.id)
      }
      await ports.waitForDocumentCloses()
      await ports.flushRecordings(ports.sessions())
      await Promise.all(ports.sessions().map(ports.flushHistory))
      await ports.waitForDocumentCloses()
      if (!await ports.waitForSaves()) return
      ports.approve()
      approved = true
    } catch (error) {
      ports.reportError(error)
    } finally {
      if (!approved) { closing = false; ports.cancel() }
    }
  }
}
