import { commitPixelEdit } from '@/core/history'
import type { WorkspaceViewSelectionCommands } from './workspace-state'
import type { WorkspaceCommandContext } from './workspace-command-context'
import { createViewCommands } from './workspace-commands-view'
import { createSelectionPropertiesCommands } from './workspace-commands-selection-properties'
import { createSelectionTransformCommands } from './workspace-commands-selection-transform'
import { createSelectionEffectsCommands } from './workspace-commands-selection-effects'
import { createSelectionFloatingCommands } from './workspace-commands-selection-floating'
import { createSelectionMoveCommands } from './workspace-commands-selection-move'
import { withTileSelectionMove } from './workspace-tile-selection-move'
import { createSelectionFlipCommands } from './workspace-commands-selection-flip'

/** Composition only; each workflow declares its own command dependencies. */
export function createWorkspaceViewSelectionCommands(context: WorkspaceCommandContext<
  | 'beginFloatingSelectionTransform'
  | 'cancelFloatingPaste'
  | 'cancelTextBoxTransform'
  | 'commitFloatingPaste'
  | 'commitPixelEdit'
  | 'commitSelectionChange'
  | 'commitTilemapSelectionMove'
  | 'moveActiveSelectionWithSelectionHistory'
  | 'moveLayerBy'
  | 'mutateActive'
  | 'outlineActiveSelection'
  | 'previewTextBoxTransform'
  | 'pushHistory'
  | 'redo'
  | 'setView'
  | 'setSelection'
  | 'undo'
  | 'updateFloatingPastePreview'
>): WorkspaceViewSelectionCommands {
  return {
    ...createViewCommands(context),
    ...createSelectionPropertiesCommands(context),
    ...createSelectionTransformCommands(context),
    ...createSelectionEffectsCommands(context),
    ...createSelectionFloatingCommands(context),
    ...withTileSelectionMove(context, createSelectionMoveCommands(context)),
    ...createSelectionFlipCommands(context),
  }
}
