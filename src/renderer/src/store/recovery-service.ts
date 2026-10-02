import type { MoonSpriteApi } from '@shared/types-platform'
import type { RecoveryRecord } from '@shared/types-files'
import type { SpriteDocument } from '@shared/types-document'
import { clearProjectSaveBaseline, encodeProjectAsync } from '@/core/project-format'
import { decodeDocumentFileAsync } from '@/core/document-files'
import { translateCurrent as tr } from '@/core/localization'
import { beginRuntimeDiagnosticOperation, runtimeDiagnosticsActive } from '@/core/runtime-diagnostics'
import { prepareLocalTimelapseSave } from './timelapse-library-service'

export interface RecoveryAutosaveTarget {
  id: string
  document: SpriteDocument
  /** Session revisions let recovery skip an encode when the dirty flag is
   * still set but the document has not changed since the last successful
   * recovery write. */
  revision?: number
  contentRevision?: number
}

export class RecoveryService {
  private queue: Promise<void> = Promise.resolve()
  private readonly savedRevisions = new Map<string, { revision?: number; contentRevision?: number }>()

  private enqueue(task: () => Promise<void>): Promise<void> {
    const operation = this.queue.then(task, task)
    this.queue = operation.then(() => undefined, () => undefined)
    return operation
  }

  list(api: MoonSpriteApi, retentionDays: number): Promise<RecoveryRecord[]> {
    return api.listRecoveries(retentionDays)
  }

  async restore(api: MoonSpriteApi, record: RecoveryRecord): Promise<SpriteDocument> {
    const diagnostic = runtimeDiagnosticsActive()
      ? beginRuntimeDiagnosticOperation('recovery.restore', {}, 5_000)
      : null
    try {
      const data = await api.readRecovery(record.id)
      diagnostic?.mark('read-complete', { archiveBytes: data.byteLength })
      const document = await decodeDocumentFileAsync(data, `${record.id}.moonsprite`)
      clearProjectSaveBaseline(document)
      document.filePath = null
      document.sourceFilePath = undefined
      document.name = tr('core.recovery.restoredName', { name: record.name })
      document.dirty = true
      diagnostic?.finish('ok', { width: document.width, height: document.height, layers: document.layers.length })
      return document
    } catch (error) {
      diagnostic?.finish('error', { message: error instanceof Error ? error.message : String(error) })
      throw error
    }
  }

  autosave(api: MoonSpriteApi, targets: readonly RecoveryAutosaveTarget[]): Promise<void> {
    return this.enqueue(async () => {
      const diagnostic = runtimeDiagnosticsActive()
        ? beginRuntimeDiagnosticOperation('recovery.autosave', { documents: targets.length }, 5_000)
        : null
      const failures: Error[] = []
      for (const [index, { id, document, revision, contentRevision }] of targets.entries()) {
        const previous = this.savedRevisions.get(id)
        const canDeduplicate = revision !== undefined || contentRevision !== undefined
        if (canDeduplicate && previous && previous.revision === revision && previous.contentRevision === contentRevision) continue
        try {
          diagnostic?.mark('encode-start', { index, width: document.width, height: document.height, layers: document.layers.length })
          await prepareLocalTimelapseSave(document, api)
          // Recovery only needs editable project data. Serial processing prevents
          // multiple large documents from being cloned and compressed together.
          const data = await encodeProjectAsync(document, { includePreview: false, compressionLevel: 1 })
          diagnostic?.mark('write-start', { index, archiveBytes: data.byteLength })
          await api.writeRecovery(id, document.name, data)
          // Only mark the revision after the write succeeds. A failed encode
          // or write must remain eligible for the next recovery cycle.
          if (canDeduplicate) this.savedRevisions.set(id, { revision, contentRevision })
        } catch (error) {
          failures.push(new Error(`${document.name}: ${error instanceof Error ? error.message : String(error)}`))
        }
      }
      diagnostic?.finish(failures.length > 0 ? 'error' : 'ok', { failures: failures.length })
      if (failures.length > 0) throw new AggregateError(failures, tr('core.recovery.autosaveFailed', { count: failures.length }))
    })
  }

  delete(api: MoonSpriteApi, id: string): Promise<void> {
    return this.enqueue(async () => {
      await api.deleteRecovery(id)
      this.savedRevisions.delete(id)
    })
  }

  discard(api: MoonSpriteApi, id: string): Promise<void> {
    return this.enqueue(async () => {
      await api.deleteRecovery(id)
      this.savedRevisions.delete(id)
    })
  }
}
