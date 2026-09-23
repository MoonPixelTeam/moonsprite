import { buildImportedSpriteSheet, spriteSheetImportPlan, type SpriteSheetImportOptions } from '@/core/sprite-sheet-import'
import { checkResourceLimit } from '@/core/resource-policy'
import { syncActiveAnimationFrame } from '@/core/animation'
import { translateCurrent as tr } from '@/core/localization'
import { openDocumentFile } from './document-file-service'
import { captureDocumentStructureSnapshot, restoreDocumentStructureSnapshot, documentStructureDeltaBytes } from './workspace-document-history'
import { cloneSelectionMask } from './workspace-session'
import { mutateDocumentSession } from './workspace-mutation'
import type { WorkspaceCommandContext } from './workspace-command-context'

export function createSpriteSheetImportCommands({ get, set, recording }: WorkspaceCommandContext<'addSession' | 'commitFloatingPaste'>) {
  return {
    async chooseSpriteSheetImportSource(): Promise<string | null> {
      try {
        const result = await window.moonSprite.openFiles()
        if (result.canceled || !result.filePaths.length) return null
        const document = await openDocumentFile(window.moonSprite, result.filePaths[0])
        get().addSession(document)
        return document.id
      } catch (error) { set({ message: error instanceof Error ? error.message : tr('workspace.open.error') }); return null }
    },
    async importSpriteSheet(documentId: string, options: SpriteSheetImportOptions): Promise<boolean> {
      try {
        if (get().activeId === documentId) get().commitFloatingPaste()
        const session = get().sessions.find(item => item.document.id === documentId)
        if (!session) return false
        const plan = spriteSheetImportPlan(session.document, options)
        if (!plan.count) throw new Error(tr('spriteSheetImport.empty'))
        const revision = session.contentRevision, frameId = session.document.animation?.activeFrameId
        const resource = await window.moonSprite.getResourceInfo()
        const check = checkResourceLimit(options.width, options.height, plan.count * 3 + 2, session.document.colorMode, resource)
        if (!check.allowed) throw new Error(check.reason)
        const unchanged = () => get().sessions.includes(session) && session.contentRevision === revision && session.document.animation?.activeFrameId === frameId
        if (!unchanged()) throw new Error(tr('spriteSheetImport.changed'))
        syncActiveAnimationFrame(session.document)
        const result = await buildImportedSpriteSheet(session.document, options)
        if (!unchanged()) throw new Error(tr('spriteSheetImport.changed'))
        mutateDocumentSession(session, current => {
          const before = captureDocumentStructureSnapshot(current.document)
          const after = captureDocumentStructureSnapshot(result)
          const size = { width: current.document.width, height: current.document.height }
          const selection = cloneSelectionMask(current.selection), pivot = current.selectionPivot ? { ...current.selectionPivot } : null
          const apply = (snapshot: typeof before, width: number, height: number, original: boolean) => {
            current.document.width = width; current.document.height = height
            restoreDocumentStructureSnapshot(current.document, snapshot)
            current.selection = original ? cloneSelectionMask(selection) : null
            current.selectionPivot = original && pivot ? { ...pivot } : null
            current.lastPencilPoint = null; current.lastEraserPoint = null
          }
          apply(after, result.width, result.height, false)
          current.history.push({ label: tr('spriteSheetImport.title'), bytes: documentStructureDeltaBytes(before, after) + (selection?.mask?.byteLength ?? 0) + 64,
            undo: () => apply(before, size.width, size.height, true), redo: () => apply(after, result.width, result.height, false), requiresAnimationSync: false })
        }, { change: 'content', normalizeSelection: true }, recording.recordDocumentOperation)
        set({ sessions: [...get().sessions] })
        return true
      } catch (error) { set({ message: error instanceof Error ? error.message : tr('spriteSheetImport.invalid') }); return false }
    }
  }
}
