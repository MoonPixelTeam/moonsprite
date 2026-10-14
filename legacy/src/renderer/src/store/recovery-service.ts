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
  private readonly pendingAutosaves = new Map<string, { target?: RecoveryAutosaveTarget; api: MoonSpriteApi; completion: Promise<void> }>()

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
    const operations = targets.map(target => {
      const id = target.id
      const pending = this.pendingAutosaves.get(target.id)
      if (pending) {
        pending.target = target
        pending.api = api
        return pending.completion
      }
      const job = { target: target as RecoveryAutosaveTarget | undefined, api, completion: Promise.resolve() }
      this.pendingAutosaves.set(target.id, job)
      job.completion = this.enqueue(async () => {
        if (this.pendingAutosaves.get(id) === job) this.pendingAutosaves.delete(id)
        const current = job.target
        job.target = undefined
        if (current) await this.saveTarget(job.api, current)
      })
      return job.completion
    })
    return Promise.allSettled(operations).then(results => {
      const failures = results.flatMap(result => result.status === 'rejected'
        ? result.reason instanceof AggregateError ? result.reason.errors : [result.reason] : [])
      if (failures.length) throw new AggregateError(failures, tr('core.recovery.autosaveFailed', { count: failures.length }))
    })
  }

  private async saveTarget(api: MoonSpriteApi, target: RecoveryAutosaveTarget): Promise<void> {
    const diagnostic = runtimeDiagnosticsActive()
      ? beginRuntimeDiagnosticOperation('recovery.autosave', { documents: 1 }, 5_000)
      : null
    const { id, document, revision, contentRevision } = target
    const previous = this.savedRevisions.get(id)
    const canDeduplicate = revision !== undefined || contentRevision !== undefined
    if (canDeduplicate && previous && previous.revision === revision && previous.contentRevision === contentRevision) {
      diagnostic?.finish('ok', { skipped: true })
      return
    }
    try {
      diagnostic?.mark('encode-start', { width: document.width, height: document.height, layers: document.layers.length })
      await prepareLocalTimelapseSave(document, api)
      const data = await encodeProjectAsync(document, { includePreview: false, compressionLevel: 1 })
      diagnostic?.mark('write-start', { archiveBytes: data.byteLength })
      await api.writeRecovery(id, document.name, data)
      // A failed encode/write must remain eligible for the next recovery cycle.
      if (canDeduplicate) this.savedRevisions.set(id, { revision, contentRevision })
      diagnostic?.finish('ok')
    } catch (error) {
      diagnostic?.finish('error', { message: String(error) })
      throw new AggregateError([new Error(`${document.name}: ${error instanceof Error ? error.message : String(error)}`)], tr('core.recovery.autosaveFailed', { count: 1 }))
    }
  }

  delete(api: MoonSpriteApi, id: string): Promise<void> {
    const pending = this.pendingAutosaves.get(id)
    if (pending) pending.target = undefined
    this.pendingAutosaves.delete(id)
    return this.enqueue(async () => {
      await api.deleteRecovery(id)
      this.savedRevisions.delete(id)
    })
  }

  discard(api: MoonSpriteApi, id: string): Promise<void> {
    return this.delete(api, id)
  }
}
