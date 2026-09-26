import { createAdjustmentLayerCommands } from './workspace-commands-adjustment-layer'
import type { WorkspaceCommandContext } from './workspace-command-context'
import type { WorkspaceLayerCommands } from './workspace-state'
import { createLayerCreationCommands } from './workspace-commands-layer-creation'
import { createLayerAdjustmentCommands } from './workspace-commands-layer-adjustment'
import { createLayerPropertiesCommands } from './workspace-commands-layer-properties'
import { createLayerTextCommands } from './workspace-commands-layer-text'
import { createLayerStructureCommands } from './workspace-commands-layer-structure'
import { createLayerSelectionCommands } from './workspace-commands-layer-selection'
import { createLayerMaskCommands } from './workspace-commands-layer-mask'

/** Composition only. Each workflow owns its helpers and temporary state. */
export function createWorkspaceLayerCommands(context: WorkspaceCommandContext<'applyActiveLayerAdjustmentFromSnapshot' | 'activateLayerForCanvas' | 'assignLayersToGroup' | 'cancelTextBoxTransform' | 'commitFloatingPaste' | 'deleteSelectedLayers' | 'mutateActive' | 'previewLayerStyleEntries' | 'pushHistory' | 'redo' | 'reorderLayers' | 'selectAnimationMaskCell' | 'selectGroupMask' | 'setClippingMask' | 'setLayerStylesForTargets' | 'undo', 'documentTransactions'>): WorkspaceLayerCommands {
  return {
    ...createLayerCreationCommands(context),
    ...createAdjustmentLayerCommands(context),
    ...createLayerAdjustmentCommands(context),
    ...createLayerPropertiesCommands(context),
    ...createLayerTextCommands(context),
    ...createLayerStructureCommands(context),
    ...createLayerSelectionCommands(context),
    ...createLayerMaskCommands(context),
  }
}
