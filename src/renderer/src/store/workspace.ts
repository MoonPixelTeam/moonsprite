import { createWorkspaceServices } from './workspace-services'
import { createWorkspaceRecording } from './workspace-recording'
import { create } from 'zustand'
import { loadColorRolePreferences } from '@/core/color-role-preferences'
import { touchMetadata } from './workspace-session'
import type { WorkspaceState } from './workspace-state'
import { createWorkspaceSessionCommands } from './workspace-commands-session'
import { createWorkspaceSliceCommands } from './workspace-commands-slice'
import { createWorkspaceToolCommands } from './workspace-commands-tool'
import { createWorkspaceColorCommands } from './workspace-commands-color'
import { createWorkspaceViewSelectionCommands } from './workspace-commands-view-selection'
import { createWorkspaceHistoryCommands } from './workspace-commands-history'
import { createWorkspaceTilemapCommands } from './workspace-commands-tilemap'
import { createWorkspaceFreeTileCommands } from './workspace-commands-free-tile'
import { createWorkspaceAnimationCommands } from './workspace-commands-animation'
import { createWorkspaceLayerCommands } from './workspace-commands-layer'
import { createWorkspaceClipboardCommands } from './workspace-commands-clipboard'
import { createWorkspaceDocumentIoCommands } from './workspace-commands-document-io'
import { createWorkspaceRecoveryCommands } from './workspace-commands-recovery'
import { createWorkspaceUiCommands } from './workspace-commands-ui'

export type { ExportOptions, SaveAsOptions } from './document-file-service'
export type { SpriteSheetExportOptions } from '@/core/sprite-sheet'
export type { AdjustmentSnapshot, AnimationPlaybackMode, AppDialog, CanvasResizePreview, DialogChoice, DocumentSession, FloatingPaste, OutlinePreview, SelectionPivot } from './workspace-types'
export type { LayerPropertyField, LayerPropertyTarget, LayerPropertyValues } from './workspace-layer-properties'
export type { LayerMoveDuplicateResult, LayerMoveState } from './workspace-layer-move'
export type { AntiAliasPreview, ColorReplacementPreview, ColorReplacementTarget, FreeTileInstancePropertyChanges, FreeTileLayerOptions, TextCelPreview, TextLayerDraftTarget, TilemapLayerOptions, WorkspaceState } from './workspace-state'
export type { AnimationSelectionNormalizationOptions } from './workspace-animation-selection'
export { normalizeAnimationSelection } from './workspace-animation-selection'

const initialColorRoles = loadColorRolePreferences()

export const useWorkspace = create<WorkspaceState>((set, get) => {
  const recording = createWorkspaceRecording((document) => {
    const sessions = get().sessions
    const session = sessions.find((candidate) => candidate.document === document)
    if (!session) return
    touchMetadata(session)
    session.revision += 1
    set({ sessions: [...sessions] })
  }, message => set({ message }))
  const context = { get, set, recording, services: createWorkspaceServices() }
  return {
    sessions: [],
    activeId: null,
    sharedPrimaryColor: { ...initialColorRoles.primary },
    sharedSecondaryColor: { ...initialColorRoles.secondary },
    layerStyleClipboard: null,
    message: null,
    saveProgress: null,
    dialog: null,
    recoveryRecords: [],
    ...createWorkspaceSessionCommands(context),
    ...createWorkspaceSliceCommands(context),
    ...createWorkspaceToolCommands(context),
    ...createWorkspaceColorCommands(context),
    ...createWorkspaceViewSelectionCommands(context),
    ...createWorkspaceHistoryCommands(context),
    ...createWorkspaceTilemapCommands(context),
    ...createWorkspaceFreeTileCommands(context),
    ...createWorkspaceAnimationCommands(context),
    ...createWorkspaceLayerCommands(context),
    ...createWorkspaceClipboardCommands(context),
    ...createWorkspaceDocumentIoCommands(context),
    ...createWorkspaceRecoveryCommands(context),
    ...createWorkspaceUiCommands(context)
  }
})
