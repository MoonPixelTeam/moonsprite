import type { MoonSpriteApi } from '@shared/types-platform'
import type { RecoveryRecord } from '@shared/types-files'
import type { SpriteDocument } from '@shared/types-document'
import { clearProjectSaveBaseline, encodeProjectAsync } from '@/core/project-format'
import { decodeDocumentFileAsync } from '@/core/document-files'
import { translateCurrent as tr } from '@/core/localization'
import { beginRuntimeDiagnosticOperation, runtimeDiagnosticsActive } from '@/core/runtime-diagnostics'

export interface RecoveryAutosaveTarget {
  id: string
  document: SpriteDocument
}

export class RecoveryService {
  private queue: Promise<void> = Promise.resolve()

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
      for (const [index, { id, document }] of targets.entries()) {
        try {
          diagnostic?.mark('encode-start', { index, width: document.width, height: document.height, layers: document.layers.length })
          // Recovery only needs editable project data. Serial processing prevents
          // multiple large documents from being cloned and compressed together.
          const data = await encodeProjectAsync(document, { includePreview: false, compressionLevel: 1 })
          diagnostic?.mark('write-start', { index, archiveBytes: data.byteLength })
          await api.writeRecovery(id, document.name, data)
        } catch (error) {
          failures.push(new Error(`${document.name}: ${error instanceof Error ? error.message : String(error)}`))
        }
      }
      diagnostic?.finish(failures.length > 0 ? 'error' : 'ok', { failures: failures.length })
      if (failures.length > 0) throw new AggregateError(failures, tr('core.recovery.autosaveFailed', { count: failures.length }))
    })
  }

  delete(api: MoonSpriteApi, id: string): Promise<void> {
    return this.enqueue(() => api.deleteRecovery(id))
  }

  discard(api: MoonSpriteApi, id: string): Promise<void> {
    return this.enqueue(() => api.deleteRecovery(id))
  }
}
