import { registerAdjustmentPreviewController } from '@/core/adjustment-preview-lifecycle'
import type { FilterPresetId, LcdScreenFilterOptions } from '@/core/filter-presets'
import type { WorkspaceCommandContext } from './workspace-command-context'
import type { DocumentSession } from './workspace-types'
import type { WorkspaceLayerCommands } from './workspace-state'
import { activeSession } from './workspace-access'

export type FilterChoice = FilterPresetId | 'lcd'
export interface FilterPreviewOptions { id: FilterChoice; opacity?: number; lcd?: Partial<LcdScreenFilterOptions> }
export interface FilterPreviewHandle {
  update: (options: FilterPreviewOptions | null) => Promise<void>
  cancel: () => void
  apply: (options: FilterPreviewOptions) => Promise<void>
}
export interface FilterPreviewTransaction { active: () => boolean; rollback?: () => void }
export const invalidateFilterPreview = (session: DocumentSession): void => {
  const fromRevision = session.contentRevision
  session.revision += 1
  session.contentRevision += 1
  session.contentInvalidation = { kind: 'full', fromRevision, revision: session.contentRevision }
}

/** Preview owns only the temporary filter structure, never document history or dirty state. */
export function createFilterPreview(
  { get, set }: WorkspaceCommandContext<'commitFloatingPaste' | 'mutateActive' | 'applyActiveLayerAdjustmentFromSnapshot'>,
  commands: (transaction?: FilterPreviewTransaction) => Pick<WorkspaceLayerCommands, 'applyFilterPreset' | 'applyLcdScreenFilter'>
): FilterPreviewHandle {
  const session = activeSession(get())
  let generation = 0, closed = false, suspended = false
  let transaction: FilterPreviewTransaction | undefined
  let latest: FilterPreviewOptions | null = null
  const restore = (): void => {
    generation += 1
    if (!transaction?.rollback || !session) return
    transaction.rollback()
    transaction = undefined
    invalidateFilterPreview(session)
    set({ sessions: [...get().sessions] })
  }
  const run = (options: FilterPreviewOptions, target?: FilterPreviewTransaction): Promise<void> => {
    const api = commands(target)
    return options.id === 'lcd' ? api.applyLcdScreenFilter(options.lcd) : api.applyFilterPreset(options.id, options.opacity)
  }
  const update = async (options: FilterPreviewOptions | null): Promise<void> => {
    latest = options
    restore()
    if (closed || suspended || !options || !session || activeSession(get()) !== session) return
    const ticket = generation
    transaction = { active: () => !closed && !suspended && ticket === generation && activeSession(get()) === session }
    await run(options, transaction)
  }
  const unregister = session ? registerAdjustmentPreviewController(session.document.id, {
    suspend: () => { suspended = true; restore() },
    resume: () => { suspended = false; void update(latest) }
  }) : () => {}
  const cancel = (): void => { closed = true; unregister(); restore() }
  return { update, cancel, apply: async options => {
    cancel()
    if (session && activeSession(get()) === session) await run(options)
  } }
}
