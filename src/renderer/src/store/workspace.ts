import { create } from 'zustand'
import type { SelectionQuad } from '@shared/types'
import type { AnimationCel, AnimationCelSurface, AnimationLayerMask, AnimationLoopDirection, AnimationLoopSection, AnimationTimeline, BackgroundPatternId, BlendMode, BrushDitherSettings, BrushPaintMode, BrushShape, BrushTexture, CanvasAnchor, ColorMode, DocumentSlice, FillKind, FillMode, FreeTileCelData, FreeTileInstance, FreeTileSourceLayer, GradientDither, GradientStop, ImageBrush, ImageBrushSettings, ImageResizeInterpolation, InkMode, LayerGroup, LayerMask, LayerStyles, LineKind, LiquifyMode, MoveKind, OutlineSettings, PaletteEntry, PaletteSlotLayout, ProceduralBrushId, ProceduralBrushSettings, RasterLayer, RecoveryRecord, RgbaColor, SelectionKind, SelectionMask, SelectionMode, SelectionRect, ShapeKind, ShapeRatio, SpriteDocument, StoredPalette, TextCelData, TilemapCell, TileRepeatMode, Tileset, TimelapseExportFormat, TimelapseSettings, ToolId, ViewState } from '@shared/types'
import { checkResourceLimit } from '@/core/resource-policy'
import { beginPixelEdit, commitPixelEdit, HistoryStack, pixelEditHasChanges, recordPixel, revertPixelEdit, type ContentInvalidationHint, type HistoryEntry, type PixelEdit } from '@/core/history'
import { applySmoothBrush, smoothChangedLiquifyPixels } from '@/core/smooth-brush'
import { invalidateRasterContentBounds } from '@/core/document'
import { animationMaskAt, animationMaskSlotAt, cacheRasterContentBounds, cachedLayerContentBounds, captureDocumentImageResizeSnapshot, compositeRegion, convertDocumentColorMode, createAnimationMaskLookup, createDocument, createId, createLayer, createSparseLayer, createLayerMask as createAttachedLayerMask, documentImageResizeSnapshotBytes, documentVisibleContentBounds, duplicateLayer, expandLayerStyleInvalidationRect, findLayerMask, findOrAddPaletteColor, getDescendantGroupIds, getGroup, getGroupLockingAncestor, getLayerIdsInGroup, getLayer, getActiveLayer, getLayerLockingGroup, isGroupEffectivelyLocked, isLayerEffectivelyLocked, isLayerEffectivelyVisible, isLayerMask, layerContentBounds, markLayerContentChanged, markRasterStorageContentChanged, normalCompositeLayers, paletteColorIdForCanvas, readLayerColor, readLayerColorAt, resolveAnimationMask, resizeDocumentAt, resizeDocumentImage, restoreDocumentImageResizeSnapshot, writeLayerColor } from '@/core/document'
import { activateAnimationFrame, addBlankAnimationFrame, animationCelContentSelection, animationCelHasContent, animationCelKey, animationGroupMaskAt, animationLayerAtFrame, cloneAnimationCel, cloneAnimationCelSurface, cloneAnimationCelsForLayer, cloneAnimationGroupMask, cloneAnimationLayerMask, cloneDocumentForAnimationFrame, connectAnimationCels, createAnimationCelLookup, deleteAnimationFrame, detachLinkedLayerContent, disconnectAnimationCels, duplicateAnimationFrame, ensureAnimationDocument, firstPlayableAnimationFrameId, inheritAnimationFrameCelLinks, linkAnimationFrameCels, mapAnimationCelBlock, nextAnimationFrameId, normalizeAnimationCelZIndex, parseAnimationCelKey, refreshActiveAnimationFrame, removeAnimationCelsForLayers, resolveAnimationCel, resizeAnimationCelsAt, restoreAnimationCels, setAnimationFrameDuration, setAnimationLoop, stepAnimationFrameId, syncActiveAnimationFrame, syncActiveAnimationLayer, synchronizeLinkedLayerContents, synchronizeLinkedLayerGroupContents } from '@/core/animation'
import { advanceAnimationLoopSectionPlayback, animationLoopSectionAtFrame, animationLoopSectionStartFrameId, cloneAnimationLoopSections, normalizeAnimationLoopSections, reconcileAnimationLoopSectionsAfterFrameReorder, resolveAnimationLoopSectionRange, stepAnimationLoopSectionFrameId } from '@/core/animation-loop-sections'
import { flushViewPreview } from '@/core/view-preview-lifecycle'
import { consumePendingCanvasGestureHistory } from '@/core/canvas-input'
import { deferCanvasShortcut, isCanvasToolGestureLocked } from '@/core/canvas-tool-gesture-lock'
import { consumeCanvasResizePreviewHistory } from '@/core/canvas-resize-preview'
import { directSourceImageSaveTarget, fileNameFromPath } from '@/core/document-files'
import { openProgress } from '@/core/open-progress'
import { recordRuntimeDiagnostic, runtimeDiagnosticsActive } from '@/core/runtime-diagnostics'
import { saveProgress } from '@/core/save-progress'
import { createSelectionBrush, encodeBrushPng } from '@/core/brushes'
import { buildSpriteSheetExportDocument, createSpriteSheetDocument, createSpriteSheetExportTargets, EmptySpriteSheetError, resolveSpriteSheetArea, stackSpriteSheetDocuments, type SpriteSheetExportOptions } from '@/core/sprite-sheet'
import { antiAliasSelection, applySelectionTransform, applySelectionTranslationCommit, applySelectionTranslationPreview, captureSelectionTransform, clampSelection, clearSelection, fillSelectionOrCanvas, flipLayer, flipSelection, flipSelectionTransformSource, moveSelection, outlineSelection, outlineSelectionBoundary, replaceLayerColor, restoreSelectionTranslationPreview, selectionTranslationPreviewEdit, transformSelectionCopy, type SelectionTransformLayerState, type SelectionTransformSource, type SelectionTranslationPreview } from '@/core/tools'
import { applySelectionTransformLayerState, captureAnimationFrameSelectionTransformStates, selectionTransformLayerForState } from '@/core/selection-transform-targets'
import { applyRelativeLuminance, colorEquals, packColor, pixelIndex, relativeLuminanceColor, unpackColor } from '@/core/raster'
import { combineSelection, flipSelectionMask, invertSelectionMask, rotateSelectionTargetAroundPivot, selectionContains, selectionQuadFromRect, shearTransformedSelection, shiftSelection, transformSelectionMask, transformSelectionMaskQuad, transformedSelectionControlPoints, transformedSelectionPivotPreset, type SelectionShearTransform } from '@/core/selection'
import { recordRecentProject } from '@/core/home-history'
import { createProceduralBrush, isProceduralBrushId, normalizeProceduralBrushSettings, PROCEDURAL_BRUSH_IDS } from '@/core/brushes'
import { publishBrushLibraryChanged } from '@/core/brush-library-events'
import { brushLibraryLocation } from '@/core/brush-library-location'
import { mergeLayerDown, mergeLayerGroup, mergeRasterLayers, mergeVisibleLayers as mergeVisibleDocumentLayers, type LayerMergeSuccess } from '@/core/layer-merge'
import { applyColorAdjustment, applyColorAdjustmentDirect, isColorAdjustmentIdentity, type ColorAdjustment } from '@/core/adjustments'
import type { AdjustmentPreviewResult } from '@/core/adjustment-preview-protocol'
import { assignGroupToGroup as assignGroupToGroupOperation, assignGroupToRoot as assignGroupToRootOperation, assignLayersAboveGroup as assignLayersAboveGroupOperation, assignLayersToGroup as assignLayersToGroupOperation, assignLayersToRoot as assignLayersToRootOperation, canMoveGroupInto, createLayerGroup as createLayerGroupOperation, moveGroupToRootEdge as moveGroupToRootEdgeOperation, moveLayerPanelRows as moveLayerPanelRowsOperation, moveLayersToRootEdge as moveLayersToRootEdgeOperation, positionGroupNextToLayer as positionGroupNextToLayerOperation, reorderGroup as reorderGroupOperation, reorderLayers as reorderLayersOperation, ungroupSelected as ungroupSelectedOperation, type LayerPanelRowMoveTarget } from '@/core/layer-operations'
import { buildLayerPanelTree, getLayerPanelAncestorGroupIds } from '@/core/layer-panel-layout'
import { DEFAULT_LAYER_DISPLAY_COLOR_PRESETS, loadEditorPreferences, SAVE_FORMAT_PREFERENCE_KEY, saveEditorPreferences, saveImageKindForPreference } from '@/core/file-preferences'
import { normalizeProjectDisplaySettings, normalizeProjectStatistics, normalizeTimelapseSettings } from '@/core/project-metadata'
import { clampSliceRect, sanitizeSliceName } from '@/core/slices'
import { commitPreparedTimelapseSnapshot, createTimelapseCaptureCache, isTimelapseVideoFormat, prepareTimelapseSnapshot, resetTimelapseSmartCapture, type TimelapseCaptureCache, type TimelapseExportOptions } from '@/core/timelapse'
import { translate, type TranslationKey, type TranslationParams } from '@/core/localization'
import { resolveClipboardPlacement } from '@/core/clipboard-placement'
import { cloneProceduralSettings, defaultToolSettings, loadToolSettings, normalizePersistedBrushProfile, saveToolSettings, type BrushTool, type PersistedBrushProfile, type PersistedToolSettings } from '@/core/tool-preferences'
import { normalizeGapClosingThreshold } from '@/core/contiguous-region'
import { normalizeBrushDitherSettings } from '@/core/gradient-color'
import { cloneOutlineSettings, defaultOutlineSettings, normalizeOutlineSettings } from '@/core/outline-settings'
import { readStoredString } from '@/core/storage'
import { ACTIVE_PALETTE_ID_STORAGE_KEY } from '@/core/panel-preferences'
import { normalizePaletteColumns, normalizePaletteSlots, paletteOrderFromSlots } from '@/core/palette-layout'
import { loadColorRolePreferences, persistColorRolePreferences } from '@/core/color-role-preferences'
import { persistProjectLayerPanelState } from '@/core/layer-panel-state'
import { defaultSymmetryCenter, type SymmetryAxes, type SymmetryCenter } from '@/core/symmetry'
import { saveDocumentViewState } from '@/core/document-view-state'
import type { TimelineRowRef } from '@/core/animation-timeline-identity'
import { brushPressureFromDynamics, migrateBrushPressureSettings, normalizeBrushPressureSettings, patchBrushDynamicsGradientDither, patchBrushDynamicsMapping, type BrushDynamicsEffect, type BrushDynamicsMapping, type BrushPressureSettings } from '@/core/pressure'
import { cloneTextCelData, convertTextSurface, normalizeTextBoxBounds, normalizeTextCelData, rasterizeText, translateTextCelData } from '@/core/text-raster'
import { cloneLayerStyles, hasConfiguredLayerStyles, hasEnabledLayerStyles, layerStyleOutputBounds, layerStylesEqual, layerStylesHistoryBytes } from '@/core/layer-styles'
import { renderBackgroundPatternIndexed, renderBackgroundPatternRgba, renderBackgroundTileIndexed, renderBackgroundTileRgba, type BackgroundPatternTile } from '@/core/background-patterns'
import { encodeSelectionBackgroundPreset } from '@/core/background-preset-images'
import { isLinkableRasterLayer, linkedLayerDefaultNameSequence, linkedLayerMembers, setLinkedLayerGroupDisplayColor, shareLinkedRasterContent } from '@/core/linked-layers'
import { activeTilemapCelTarget, applyTilemapDocumentEdit, applyTilemapSelectionCellMove, applyTilemapTilesetDocumentEdit, applyTilesetTileReferences, captureTilesetTileReferences, convertTilemapPixelEdit, flipTilemapSelection, rerenderTilesetReferences, rerenderTilesetTileReferences } from '@/core/tilemap-document'
import { appendBlankTilesetTile, cloneTilemapCelData, cloneTileset, compactTilesetTileSlots, createBlankTileset, createTilemapCelData, deleteTilesetTiles as deleteTilesetTilesData, MAX_TILE_SIZE, renderTilemapSurface, reorderTilesetTiles as reorderTilesetTilesData, setTilesetTileSlots as setTilesetTileSlotsData, sliceRasterSurfaceToTilemap, tileRepeatFitZoom, tilemapCellBounds, tilemapCellIndexAtPoint, tilemapCellTranslationForSelection, tilemapEditBytes, tilemapTilesetEditBytes, tilemapTilesetEditHasChanges, wrapSelectionMaskForTileRepeat, writeTilesetTilePixels, type TilemapDrawingMode, type TilemapEdit, type TilemapTilesetEdit } from '@/core/tilemap'
import { cloneFreeTileCelData, createFreeTileCelData, freeTileCelDataEqual, freeTileInstanceBounds, freeTileSourceForInstance, renderFreeTileSurface, type FreeTileDrawingMode } from '@/core/free-tile'
import { activeFreeTileCelTarget, applyFreeTilePlacementEdit, applyFreeTileReferences, applyFreeTileSourceLayerSnapshot, applyFreeTileSourceSnapshot, captureFreeTileImageResizeState, captureFreeTileReferences, captureFreeTileSourceReferences, captureFreeTileSourceSnapshot, ensureFreeTileTilesetOwnership, freeTileCelTargetAt, freeTileLayerIdsForSource, freeTileLayersForSet, freeTileLayerTilesets, freeTileSetIdForLayer, freeTileSourceEditSnapshotBytes, freeTileSourceEditSnapshotsEqual, freeTileSourceOwnerForId, freeTileSourcesForLayer, rasterSurfaceToFreeTileStamps, replaceFreeTileSetSources, rerenderFreeTileReferences, rerenderFreeTileSourceReferences, resizeFreeTileDocumentImage, validateFreeTileImageResize, type FreeTileCelTarget, type FreeTilePlacementEdit, type FreeTileSourceEditSnapshot } from '@/core/free-tile-document'
import { createFreeTileSourceEditRaster, freeTileSelectionToEditRaster, freeTileSourceSnapshotFromEditRaster, freeTileTransformTargetToEditRaster } from '@/core/free-tile-edit'
import { filterPresetById, lcdChannelColorAtNormalized, lcdChannelOffset, lcdScanlineColorAtNormalized, normalizeLcdScreenFilterOptions, renderFilterPreset, type FilterPresetId, type LcdScreenFilterOptions } from '@/core/filter-presets'
import { exportDocumentFile, exportSpriteSheetFile, exportTimelapseFile, openDocumentFile, saveDocumentFile, type ExportOptions, type FileOperationLifecycle, type SaveAsOptions } from './document-file-service'
import { RecoveryService } from './recovery-service'
import { projectRollbackProgress } from '@/core/project-rollback-progress'
import { configureLocalHistory, flushLocalHistoryPersist, scheduleLocalHistoryPersist, restoreLocalHistory } from './local-history-service'
import { startDocumentCloseTask, waitForDocumentCloseTasks } from './document-close-tasks'
import { inheritCommittedPixelChanges } from '@/core/history'
import { recordUsageEvent, recordUsageExport } from '@/platform/usage-statistics'
import { clipboardService, selectionClipboardImage, type AnimationCelClipboardSnapshot, type AnimationFrameClipboardSnapshot, type LayerClipboard, type LayerCollectionClipboard, type LayerMaskClipboard, type SelectionClipboard } from './clipboard-service'
import { captureAdjustmentSnapshot, captureLayerUi, commitLayerMerge, prepareAdjustmentSnapshotTargets, restoreAdjustmentSnapshot, restoreAdjustmentSnapshotRegions, restorePreparedAdjustmentSnapshotLayer } from './workspace-history'
import { captureDocumentCanvasResizeSnapshot, captureDocumentColorModeSnapshot, captureDocumentStructureSnapshot, captureLayerContentSnapshot, documentCanvasResizeSnapshotBytes, documentColorModeSnapshotBytes, documentStructureDeltaBytes, layerContentSnapshotBytes, restoreDocumentCanvasResizeSnapshot, restoreDocumentColorModeSnapshot, restoreDocumentStructureSnapshot, restoreLayerContentSnapshot, type DocumentStructureSnapshot } from './workspace-document-history'
import { activeLayerMask, activePaintLayer, applyBrushProfile, brushProfileFromSession, clearSelectionBrushPaintColors, cloneSelectionMask, copyCanvasToolSettings, enterLayerMaskEditing, exitLayerMaskEditing, isBrushTool, isToolAvailableForSession, persistToolSettings, remapSelectionBrushColors, rememberBrushProfile, selectedTransformLayersForSession, sessionFromDocument, invalidateSessionContent, touch, touchMetadata } from './workspace-session'
import { addPaletteColor as addPaletteColorCommand, applyPalette as applyPaletteCommand, deletePaletteColors as deletePaletteColorsCommand, gradientPaletteColors as gradientPaletteColorsCommand, gradientPaletteSlots as gradientPaletteSlotsCommand, movePaletteColor as movePaletteColorCommand, reorderPaletteColors as reorderPaletteColorsCommand, reversePaletteColors as reversePaletteColorsCommand, selectPaletteColor as selectPaletteColorCommand, selectPaletteColors as selectPaletteColorsCommand, sortPaletteColors as sortPaletteColorsCommand, updatePaletteColor as updatePaletteColorCommand } from './workspace-palette'
import { DocumentTransactionRegistry } from './document-transactions'
import { beginFreeTileInstancePropertiesTransaction as beginFreeTileInstancePropertiesTransactionCommand, beginFreeTileSourcePropertiesTransaction as beginFreeTileSourcePropertiesTransactionCommand, cancelFreeTileInstancePropertiesTransaction as cancelFreeTileInstancePropertiesTransactionCommand, cancelFreeTileSourcePropertiesTransaction as cancelFreeTileSourcePropertiesTransactionCommand, commitFreeTileInstancePropertiesTransaction as commitFreeTileInstancePropertiesTransactionCommand, commitFreeTileSourcePropertiesTransaction as commitFreeTileSourcePropertiesTransactionCommand, previewFreeTileInstancePropertiesTransaction as previewFreeTileInstancePropertiesTransactionCommand, previewFreeTileSourcePropertiesTransaction as previewFreeTileSourcePropertiesTransactionCommand } from './workspace-free-tile-properties'
import { beginLayerPropertiesTransaction as beginLayerPropertiesTransactionCommand, cancelLayerPropertiesTransaction as cancelLayerPropertiesTransactionCommand, commitLayerPropertiesTransaction as commitLayerPropertiesTransactionCommand, previewLayerPropertiesTransaction as previewLayerPropertiesTransactionCommand, type LayerPropertyField, type LayerPropertyTarget, type LayerPropertyValues } from './workspace-layer-properties'
import { beginLayerMoveDuplicatePreview as beginLayerMoveDuplicatePreviewCommand, cancelLayerMovePreview as cancelLayerMovePreviewCommand, createLayerMoveHistoryEntry, previewLayerMove as previewLayerMoveCommand, type LayerMoveDuplicateResult, type LayerMoveState } from './workspace-layer-move'
import type { AntiAliasPreview, ColorReplacementPreview, ColorReplacementTarget, FreeTileInstancePropertyChanges, TextCelPreview, TextLayerDraftTarget, WorkspaceState } from './workspace-state'
import { splitLayerStyles as splitLayerStylesCommand } from './workspace-layer-style-split'
import type { PaletteSortDirection, PaletteSortMode } from '@/core/palette'
import type { AdjustmentSnapshot, AnimationFrameClipboardItem, AnimationMaskClipboardItem, AnimationPlaybackMode, AppDialog, CanvasResizePreview, DocumentSession, FloatingPaste, FloatingSelectionBoxHistoryEntry, OutlinePreview, SelectionPivot, TimelineActiveContext } from './workspace-types'

export type { ExportOptions, SaveAsOptions } from './document-file-service'
export type { SpriteSheetExportOptions } from '@/core/sprite-sheet'
export type { AdjustmentSnapshot, AnimationPlaybackMode, AppDialog, CanvasResizePreview, DialogChoice, DocumentSession, FloatingPaste, OutlinePreview, SelectionPivot } from './workspace-types'
export type { LayerPropertyField, LayerPropertyTarget, LayerPropertyValues } from './workspace-layer-properties'
export type { LayerMoveDuplicateResult, LayerMoveState } from './workspace-layer-move'
export type { AntiAliasPreview, ColorReplacementPreview, ColorReplacementTarget, FreeTileInstancePropertyChanges, FreeTileLayerOptions, TextCelPreview, TextLayerDraftTarget, TilemapLayerOptions, WorkspaceState } from './workspace-state'

function activeSession(state: WorkspaceState): DocumentSession | null {
  return state.sessions.find((session) => session.document.id === state.activeId) ?? null
}

type ExportConflictPolicy = 'overwrite' | 'rename' | null

const createExportConflictHandler = (
  requestDialog: WorkspaceState['requestDialog'],
  allowBulk: boolean
): NonNullable<FileOperationLifecycle['onConflict']> => {
  let policy: ExportConflictPolicy = null

  return async (filePath, suggestedPath) => {
    if (policy) return policy

    const choice = await requestDialog({
      title: tr('file.export.conflictTitle'),
      message: tr('file.export.conflictMessage', { name: fileNameFromPath(filePath) }),
      detail: tr('file.export.conflictDetail', { suggestedName: fileNameFromPath(suggestedPath) }),
      choices: [
        { id: 'overwrite', label: tr('file.export.conflictOverwrite'), tone: 'danger' },
        { id: 'rename', label: tr('file.export.conflictRename'), tone: 'primary' },
        ...(allowBulk ? [
          { id: 'overwrite-all', label: tr('file.export.conflictOverwriteAll'), tone: 'danger' as const },
          { id: 'rename-all', label: tr('file.export.conflictRenameAll'), tone: 'primary' as const }
        ] : []),
        { id: 'cancel', label: tr('file.export.conflictCancel'), tone: 'quiet' }
      ]
    })

    if (choice === 'overwrite-all') {
      policy = 'overwrite'
      return policy
    }
    if (choice === 'rename-all') {
      policy = 'rename'
      return policy
    }
    return choice === 'overwrite' || choice === 'rename' ? choice : 'cancel'
  }
}

const exportTaskCount = (document: SpriteDocument, options?: ExportOptions): number => {
  switch (options?.target) {
    case 'frames':
      return Math.max(1, document.animation?.frames.length ?? 1)
    case 'slices': {
      const slices = document.slices ?? []
      return options.sliceId ? (slices.some((slice) => slice.id === options.sliceId) ? 1 : 0) : slices.length
    }
    case 'layer':
      return options.layerId && document.layers.some((layer) => layer.id === options.layerId) ? 1 : document.layers.length
    default:
      return 1
  }
}

const applyStoredPaletteToNewDocument = (document: SpriteDocument, palette: StoredPalette): void => {
  const paletteSession = sessionFromDocument(document)
  const layout = palette.columns !== undefined && palette.slots !== undefined
    ? { columns: palette.columns, slots: palette.slots }
    : undefined
  applyPaletteCommand(paletteSession, palette.colors.map((color) => ({ ...color })), layout)
  // The temporary session only applies the document data; its UI state and history
  // are intentionally discarded before the new document enters the workspace.
  document.paletteColumns = normalizePaletteColumns(document.paletteColumns)
  document.paletteSlots = normalizePaletteSlots(document.palette.map((entry) => entry.id), document.paletteOrder, document.paletteSlots, document.paletteColumns)
  document.paletteOrder = paletteOrderFromSlots(document.paletteSlots)
}

const clearAnimationClipboards = (session: DocumentSession): void => {
  session.animationCellClipboard = []
  session.animationCellClipboardAnchorKey = null
  session.animationMaskClipboard = []
  session.animationMaskClipboardAnchorKey = null
  session.animationFrameClipboard = []
}

type AnimationSelectionHistorySnapshot = {
  selectedLayerIds: string[]
  layerSelectionExplicit: boolean
  selectedGroupId: string | null
  selectedGroupIds: string[]
  selectedAnimationFrameIds: string[]
  animationFrameSelectionAnchorId: string | null
  selectedAnimationCellKeys: string[]
  animationCellSelectionAnchorKey: string | null
  animationCellSelectionExplicit: boolean
  selectedAnimationMaskCellKeys: string[]
  selectedAnimationMaskRowKeys: string[]
  animationMaskCellSelectionAnchorKey: string | null
  activeLayerId: string
  activeFrameId: string | null
  activeLayerMaskId: string | null
  layerMaskIsolatedView: boolean
  timelineActiveContext: TimelineActiveContext
}

const captureAnimationSelectionHistory = (session: DocumentSession): AnimationSelectionHistorySnapshot => ({
  selectedLayerIds: [...session.selectedLayerIds],
  layerSelectionExplicit: session.layerSelectionExplicit === true,
  selectedGroupId: session.selectedGroupId,
  selectedGroupIds: [...session.selectedGroupIds],
  selectedAnimationFrameIds: [...session.selectedAnimationFrameIds],
  animationFrameSelectionAnchorId: session.animationFrameSelectionAnchorId,
  selectedAnimationCellKeys: [...session.selectedAnimationCellKeys],
  animationCellSelectionAnchorKey: session.animationCellSelectionAnchorKey,
  animationCellSelectionExplicit: session.animationCellSelectionExplicit,
  selectedAnimationMaskCellKeys: [...session.selectedAnimationMaskCellKeys],
  selectedAnimationMaskRowKeys: [...session.selectedAnimationMaskRowKeys],
  animationMaskCellSelectionAnchorKey: session.animationMaskCellSelectionAnchorKey,
  activeLayerId: session.document.activeLayerId,
  activeFrameId: session.document.animation?.activeFrameId ?? null,
  activeLayerMaskId: session.activeLayerMaskId,
  layerMaskIsolatedView: session.layerMaskIsolatedView,
  timelineActiveContext: {
    row: session.timelineActiveContext.row ? { ...session.timelineActiveContext.row } : null,
    frameId: session.timelineActiveContext.frameId,
    maskEditTargetId: session.timelineActiveContext.maskEditTargetId
  }
})

const restoreAnimationSelectionHistory = (session: DocumentSession, snapshot: AnimationSelectionHistorySnapshot): void => {
  session.selectedLayerIds = [...snapshot.selectedLayerIds]
  session.layerSelectionExplicit = snapshot.layerSelectionExplicit === true
  session.selectedGroupId = snapshot.selectedGroupId
  session.selectedGroupIds = [...snapshot.selectedGroupIds]
  session.selectedAnimationFrameIds = [...snapshot.selectedAnimationFrameIds]
  session.animationFrameSelectionAnchorId = snapshot.animationFrameSelectionAnchorId
  session.selectedAnimationCellKeys = [...snapshot.selectedAnimationCellKeys]
  session.animationCellSelectionAnchorKey = snapshot.animationCellSelectionAnchorKey
  session.animationCellSelectionExplicit = snapshot.animationCellSelectionExplicit
  session.selectedAnimationMaskCellKeys = [...snapshot.selectedAnimationMaskCellKeys]
  session.selectedAnimationMaskRowKeys = [...snapshot.selectedAnimationMaskRowKeys]
  session.animationMaskCellSelectionAnchorKey = snapshot.animationMaskCellSelectionAnchorKey
  session.document.activeLayerId = snapshot.activeLayerId
  if (snapshot.activeFrameId) activateAnimationFrame(session.document, snapshot.activeFrameId)
  session.activeLayerMaskId = snapshot.activeLayerMaskId
  session.layerMaskIsolatedView = snapshot.layerMaskIsolatedView
  if (snapshot.activeLayerMaskId && findLayerMask(session.document, snapshot.activeLayerMaskId)) enterLayerMaskEditing(session)
  else exitLayerMaskEditing(session)
  session.timelineActiveContext = {
    row: snapshot.timelineActiveContext.row ? { ...snapshot.timelineActiveContext.row } : null,
    frameId: snapshot.timelineActiveContext.frameId,
    maskEditTargetId: snapshot.timelineActiveContext.maskEditTargetId
  }
}

const historyEntryWithAnimationSelection = (
  session: DocumentSession,
  entry: HistoryEntry,
  before: AnimationSelectionHistorySnapshot,
  after: AnimationSelectionHistorySnapshot
): HistoryEntry => ({
  ...entry,
  bytes: entry.bytes + 64 + (before.selectedAnimationCellKeys.length + before.selectedAnimationMaskCellKeys.length + after.selectedAnimationCellKeys.length + after.selectedAnimationMaskCellKeys.length) * 16,
  undo: () => { entry.undo(); restoreAnimationSelectionHistory(session, before) },
  redo: () => { entry.redo(); restoreAnimationSelectionHistory(session, after) }
})

const brushDynamicsEnabled = (session: DocumentSession): boolean => Object.values(session.brushDynamics.effects).some((mapping) => mapping.sensor !== null)

const enableBrushDynamicsPreview = (): void => {
  const preferences = loadEditorPreferences()
  // If preview is explicitly disabled, full-edge is the least surprising
  // mode that also exposes the live dynamic outline while drawing.
  const nextBrushPreviewMode = preferences.brushPreviewMode === 'none' ? 'full-edge' : preferences.brushPreviewMode
  if (preferences.drawingBrushPreviewEnabled && nextBrushPreviewMode === preferences.brushPreviewMode) return
  saveEditorPreferences({
    ...preferences,
    drawingBrushPreviewEnabled: true,
    brushPreviewMode: nextBrushPreviewMode
  })
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('moonsprite:preferences-changed'))
}

const distinctLinkedLayerTargets = (document: SpriteDocument, layerIds: readonly string[]): string[] => {
  const seenLinks = new Set<string>()
  return [...new Set(layerIds)].filter((layerId) => {
    const layer = document.layers.find((candidate) => candidate.id === layerId)
    if (!layer?.linkedContentId) return Boolean(layer)
    if (seenLinks.has(layer.linkedContentId)) return false
    seenLinks.add(layer.linkedContentId)
    return true
  })
}

const shareLinkedLayerPreviewContents = (document: SpriteDocument, layerIds: readonly string[]): void => {
  for (const layerId of distinctLinkedLayerTargets(document, layerIds)) {
    const source = document.layers.find((candidate) => candidate.id === layerId)
    if (!source?.linkedContentId) continue
    for (const member of linkedLayerMembers(document, source.linkedContentId)) shareLinkedRasterContent(member, source)
  }
}

const commitLinkedLayerAdjustmentContents = (document: SpriteDocument, layerIds: readonly string[]): void => {
  for (const layerId of distinctLinkedLayerTargets(document, layerIds)) {
    if (document.layers.find((candidate) => candidate.id === layerId)?.linkedContentId) syncActiveAnimationLayer(document, layerId)
  }
}

const tilemapEditCellIndexForSelection = (session: DocumentSession, selection: SelectionMask): number | undefined => {
  if (session.tilemapMode !== 'edit' || activePaintLayer(session).kind !== 'tilemap') return undefined
  const target = activeTilemapCelTarget(session.document)
  if (!target) return undefined
  for (let y = selection.y; y < selection.y + selection.height; y += 1) for (let x = selection.x; x < selection.x + selection.width; x += 1) {
    if (!selectionContains(selection, x, y)) continue
    const index = tilemapCellIndexAtPoint(target.tilemap, target.surface.offsetX, target.surface.offsetY, x, y)
    if (index !== null && target.tilemap.cells[index]) return index
  }
  return undefined
}

const tilemapEditClipForCell = (session: DocumentSession, cellIndex: number | undefined): SelectionRect | undefined => {
  if (cellIndex === undefined) return undefined
  const target = activeTilemapCelTarget(session.document)
  return target?.tilemap.cells[cellIndex]
    ? tilemapCellBounds(target.tilemap, target.surface.offsetX, target.surface.offsetY, cellIndex)
    : undefined
}

interface TextLayerDraftState {
  documentId: string
  before: DocumentStructureSnapshot
  beforeSelection: ReturnType<typeof captureLayerUi>
  selectedAnimationCellKeys: string[]
  animationCellSelectionAnchorKey: string | null
  animationCellSelectionExplicit: boolean
  selectedAnimationFrameIds: string[]
  animationFrameSelectionAnchorId: string | null
  dirty: boolean
  updatedAt: string
}

const textLayerDrafts = new Map<string, TextLayerDraftState>()
const documentTransactions = new DocumentTransactionRegistry<DocumentSession>()
const DEFERRED_PASTE_AREA_THRESHOLD = 256 * 256
let activeExportCancellation: (() => void) | null = null

const invalidateTextLayerDraft = (session: DocumentSession, panelChanged = false): void => {
  const fromRevision = session.contentRevision
  session.revision += 1
  session.contentRevision += 1
  if (panelChanged) session.layersPanelRevision += 1
  session.contentInvalidation = { kind: 'full', fromRevision, revision: session.contentRevision }
}

const cloneSlices = (slices: readonly DocumentSlice[] | undefined): DocumentSlice[] =>
  (slices ?? []).map((slice) => ({ ...slice }))

const PROJECT_ROLLBACK_HISTORY_LABEL = '回档工程备份'
const isProjectRollbackHistoryEntry = (entry: Pick<HistoryEntry, 'label'> | null | undefined): boolean => entry?.label === PROJECT_ROLLBACK_HISTORY_LABEL
let isApplyingDeferredProjectRollbackHistory = false

const historyPositionIncludesProjectRollback = (entries: readonly { label: string }[], from: number, to: number): boolean =>
  entries.slice(Math.min(from, to), Math.max(from, to)).some(isProjectRollbackHistoryEntry)

const deferProjectRollbackHistoryChange = (operation: () => void): void => {
  projectRollbackProgress.begin()
  const run = () => {
    isApplyingDeferredProjectRollbackHistory = true
    try {
      operation()
    } finally {
      isApplyingDeferredProjectRollbackHistory = false
      projectRollbackProgress.endAfterPaint()
    }
  }
  if (typeof window === 'undefined') {
    run()
    return
  }
  // The first frame lets React paint the overlay; the following frame starts
  // the synchronous document swap without making the dialog flash afterward.
  window.requestAnimationFrame(() => window.requestAnimationFrame(run))
}

const cloneProjectRollbackSnapshot = (document: SpriteDocument): SpriteDocument => structuredClone(document)

const projectRollbackSnapshotBytes = (document: SpriteDocument): number => {
  const buffers = new Set<ArrayBufferLike>()
  const visited = new Set<object>()
  const visit = (value: unknown): void => {
    if (!value || typeof value !== 'object') return
    if (ArrayBuffer.isView(value)) {
      buffers.add(value.buffer)
      return
    }
    if (value instanceof ArrayBuffer) {
      buffers.add(value)
      return
    }
    if (visited.has(value)) return
    visited.add(value)
    if (Array.isArray(value)) for (const item of value) visit(item)
    else for (const item of Object.values(value)) visit(item)
  }
  visit(document)
  return [...buffers].reduce((total, buffer) => total + buffer.byteLength, 0)
}

const restoreProjectRollbackSnapshot = (session: DocumentSession, snapshot: SpriteDocument): void => {
  const history = session.history
  const recoveryOriginId = session.recoveryOriginId
  const revision = session.revision
  const contentRevision = session.contentRevision
  const layersPanelRevision = session.layersPanelRevision
  const restored = sessionFromDocument(cloneProjectRollbackSnapshot(snapshot))
  Object.assign(session, restored)
  session.history = history
  session.recoveryOriginId = recoveryOriginId
  // Canvas composites are keyed by document ID and content revision. Keep
  // those counters monotonic across a document swap so restored pixels cannot
  // collide with a pre-rollback composite cache entry.
  session.revision = revision
  session.contentRevision = contentRevision
  session.layersPanelRevision = layersPanelRevision
}

const restoreSlices = (session: DocumentSession, slices: readonly DocumentSlice[], selectedSliceId: string | null, selectedSliceIds: readonly string[] = selectedSliceId ? [selectedSliceId] : []): void => {
  session.document.slices = cloneSlices(slices)
  const validIds = selectedSliceIds.filter((id, index) => selectedSliceIds.indexOf(id) === index && slices.some((slice) => slice.id === id))
  session.selectedSliceIds = validIds
  session.selectedSliceId = selectedSliceId && validIds.includes(selectedSliceId) ? selectedSliceId : validIds.at(-1) ?? null
}

const selectedSliceIds = (session: DocumentSession): string[] =>
  session.selectedSliceIds?.length ? [...session.selectedSliceIds] : session.selectedSliceId ? [session.selectedSliceId] : []

const slicesEqual = (first: readonly DocumentSlice[], second: readonly DocumentSlice[]): boolean =>
  first.length === second.length && first.every((slice, index) => {
    const other = second[index]
    return Boolean(other)
      && slice.id === other.id
      && slice.name === other.name
      && slice.x === other.x
      && slice.y === other.y
      && slice.width === other.width
      && slice.height === other.height
  })

const hasSelectedPaintTarget = (session: DocumentSession): boolean =>
  Boolean(session.activeLayerMaskId && findLayerMask(session.document, session.activeLayerMaskId))
  || session.selectedLayerIds.includes(session.document.activeLayerId)

const mergeSelectionRects = (first: SelectionRect, second: SelectionRect): SelectionRect => {
  const left = Math.min(first.x, second.x)
  const top = Math.min(first.y, second.y)
  const right = Math.max(first.x + first.width, second.x + second.width)
  const bottom = Math.max(first.y + first.height, second.y + second.height)
  return { x: left, y: top, width: right - left, height: bottom - top }
}

const intersectSelectionRects = (first: SelectionRect, second: SelectionRect): SelectionRect | null => {
  const x = Math.max(first.x, second.x)
  const y = Math.max(first.y, second.y)
  const right = Math.min(first.x + first.width, second.x + second.width)
  const bottom = Math.min(first.y + first.height, second.y + second.height)
  return right > x && bottom > y ? { x, y, width: right - x, height: bottom - y } : null
}

const visibleLayerContentBoundsWithinSelection = (document: SpriteDocument, layer: RasterLayer, selection: SelectionMask): SelectionMask | null => {
  // Scan the selection itself. The layer content bounds can be stale or cover
  // another piece of content after the layer has been expanded, while shrink
  // must be based only on pixels inside the current selection.
  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY
  for (let y = selection.y; y < selection.y + selection.height; y += 1) {
    for (let x = selection.x; x < selection.x + selection.width; x += 1) {
      if (!selectionContains(selection, x, y) || readLayerColorAt(document, layer, x, y).a === 0) continue
      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, x)
      maxY = Math.max(maxY, y)
    }
  }
  if (maxX < minX || maxY < minY) return null
  const width = maxX - minX + 1
  const height = maxY - minY + 1
  if (!selection.mask) return { x: minX, y: minY, width, height }

  // Keep irregular selections irregular while trimming their empty perimeter.
  // The content bounds determine the new frame; the original selection mask
  // determines which pixels remain selected inside that frame.
  const mask = new Uint8Array(width * height)
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      if (selectionContains(selection, x, y)) mask[(y - minY) * width + x - minX] = 1
    }
  }
  return { x: minX, y: minY, width, height, mask }
}

const selectionRectContains = (container: SelectionRect, target: SelectionRect): boolean => container.x <= target.x
  && container.y <= target.y
  && container.x + container.width >= target.x + target.width
  && container.y + container.height >= target.y + target.height

const markAdjustmentPreviewChanged = (session: DocumentSession, rect: SelectionRect): void => {
  const clipped = intersectSelectionRects(rect, { x: 0, y: 0, width: session.document.width, height: session.document.height })
  if (!clipped) return
  const fromRevision = session.contentRevision
  session.revision += 1
  session.contentRevision += 1
  session.contentInvalidation = {
    kind: 'region',
    frameId: session.document.animation?.activeFrameId,
    rect: clipped,
    fromRevision,
    revision: session.contentRevision
  }
}

const applyAdjustmentPreviewResultLayer = (layer: RasterLayer, result: AdjustmentPreviewResult['layers'][number], palette: readonly PaletteEntry[]): boolean => {
  if (layer.format !== result.format) return false
  const localX = result.x - layer.offsetX
  const localY = result.y - layer.offsetY
  if (localX < 0 || localY < 0 || localX + result.width > layer.width || localY + result.height > layer.height) return false
  const components = layer.format === 'rgba' ? 4 : 1
  for (let row = 0; row < result.height; row += 1) {
    const sourceOffset = row * result.width * components
    const targetOffset = ((localY + row) * layer.width + localX) * components
    if (layer.format === 'rgba' && result.pixels instanceof Uint8ClampedArray) {
      layer.pixels.set(result.pixels.subarray(sourceOffset, sourceOffset + result.width * components), targetOffset)
    } else if (layer.format === 'indexed' && result.pixels instanceof Uint32Array) {
      layer.pixels.set(result.pixels.subarray(sourceOffset, sourceOffset + result.width), targetOffset)
    } else return false
  }
  markLayerContentChanged(layer)
  cacheRasterContentBounds(layer, palette, result.localContentBounds)
  return true
}

const adjustmentPreviewResultCoversTargets = (session: DocumentSession, baseline: AdjustmentSnapshot, result: AdjustmentPreviewResult): boolean => {
  let targetCount = 0
  for (const layerSnapshot of baseline.layers) {
    const layer = session.document.layers.find((candidate) => candidate.id === layerSnapshot.layerId)
    if (!layer || layer.kind || isLayerEffectivelyLocked(session.document, layer)) continue
    targetCount += 1
    const contentBounds = cachedLayerContentBounds(session.document, layer) ?? layerContentBounds(session.document, layer)
    if (!contentBounds) continue
    const required = session.selection ? intersectSelectionRects(contentBounds, session.selection) : contentBounds
    if (!required) continue
    const previewLayer = result.layers.find((candidate) => candidate.layerId === layer.id && candidate.format === layer.format)
    if (!previewLayer || !selectionRectContains(previewLayer, required)) return false
  }
  return targetCount > 0
}

const adjustmentLinkedInvalidationRects = (document: SpriteDocument, source: RasterLayer, sourceRect: SelectionRect): SelectionRect[] => {
  const localRect = {
    x: sourceRect.x - source.offsetX,
    y: sourceRect.y - source.offsetY,
    width: sourceRect.width,
    height: sourceRect.height
  }
  const targets = source.linkedContentId ? linkedLayerMembers(document, source.linkedContentId) : [source]
  return targets.flatMap((target) => {
    const rect = intersectSelectionRects({
      x: target.offsetX + localRect.x,
      y: target.offsetY + localRect.y,
      width: localRect.width,
      height: localRect.height
    }, { x: 0, y: 0, width: document.width, height: document.height })
    return rect ? [rect] : []
  })
}

const adjustmentSnapshotInvalidationRect = (session: DocumentSession, baseline: AdjustmentSnapshot): SelectionRect | null => {
  let invalidation: SelectionRect | null = null
  for (const layerSnapshot of baseline.layers) {
    const layer = session.document.layers.find((candidate) => candidate.id === layerSnapshot.layerId)
    if (!layer || layer.kind || isLayerEffectivelyLocked(session.document, layer)) continue
    const contentBounds = cachedLayerContentBounds(session.document, layer) ?? layerContentBounds(session.document, layer)
    const sourceRect = contentBounds && session.selection ? intersectSelectionRects(contentBounds, session.selection) : contentBounds
    if (!sourceRect) continue
    for (const rect of adjustmentLinkedInvalidationRects(session.document, layer, sourceRect)) {
      invalidation = invalidation ? mergeSelectionRects(invalidation, rect) : rect
    }
  }
  return invalidation
}

const markFloatingPreviewChanged = (session: DocumentSession, before: SelectionRect, after: SelectionRect): void => {
  const fromRevision = session.contentRevision
  session.revision += 1
  session.contentRevision += 1
  const pendingLayerIds = session.pendingPaste?.layers?.map((state) => state.layerId)
    ?? (session.pendingPaste?.layerId ? [session.pendingPaste.layerId] : [])
  const styledPreview = pendingLayerIds.some((id) => {
    const layer = session.document.layers.find((candidate) => candidate.id === id)
    return Boolean(layer && hasEnabledLayerStyles(layer.layerStyles))
  })
  session.contentInvalidation = styledPreview
    ? { kind: 'full', fromRevision, revision: session.contentRevision }
    : {
        kind: 'region',
        frameId: session.document.animation?.activeFrameId,
        rect: mergeSelectionRects(before, after),
        fromRevision,
        revision: session.contentRevision
      }
}

const markFloatingOverlayChanged = (session: DocumentSession): void => {
  session.revision += 1
}

const syncFloatingPrimaryLayerState = (pending: FloatingPaste): void => {
  const primary = pending.layers?.[0]
  if (!primary) return
  pending.layerId = primary.layerId
  pending.source = primary.source
  pending.previewEdit = primary.previewEdit
  pending.translationPreview = primary.translationPreview
}

const restoreSelectionTransformLayerPreview = (document: SpriteDocument, layerState: SelectionTransformLayerState): void => {
  if (layerState.translationPreview) restoreSelectionTranslationPreview(document, layerState.translationPreview)
  else if (layerState.previewEdit) revertPixelEdit(document, layerState.previewEdit)
}

const previewFloatingFreeTileSource = (session: DocumentSession, pending: FloatingPaste): boolean => {
  if (!pending.freeTile) return false
  const changed = applyFreeTileSourceSnapshot(session.document, freeTileSourceSnapshotFromEditRaster(pending.freeTile.edit))
  if (!changed) return false
  const fromRevision = session.contentRevision
  session.revision += 1
  session.contentRevision += 1
  session.layersPanelRevision += 1
  session.contentInvalidation = { kind: 'full', fromRevision, revision: session.contentRevision }
  return true
}

const restoreFloatingPreview = (session: DocumentSession): void => {
  const pending = session.pendingPaste
  if (!pending || pending.previewDeferred) return
  if (pending.layers?.length) {
    for (const layerState of pending.layers) restoreSelectionTransformLayerPreview(session.document, layerState)
    return
  }
  const previewDocument = pending.freeTile?.edit.document ?? session.document
  if (pending.translationPreview) restoreSelectionTranslationPreview(previewDocument, pending.translationPreview)
  else if (pending.previewEdit) revertPixelEdit(previewDocument, pending.previewEdit)
}

const selectionMasksEqual = (left: SelectionMask | null, right: SelectionMask | null): boolean => {
  if (left === right) return true
  if (!left || !right) return false
  if (left.x !== right.x || left.y !== right.y || left.width !== right.width || left.height !== right.height) return false
  if (left.mask === right.mask) return true
  return left.mask?.length === right.mask?.length && Boolean(left.mask?.every((value, index) => value === right.mask?.[index]))
}

const rectangularSelection = (selection: SelectionRect): SelectionMask => ({
  x: selection.x,
  y: selection.y,
  width: selection.width,
  height: selection.height
})

const selectionShearForAngle = (target: SelectionRect, angle: number): SelectionShearTransform | undefined => {
  const normalized = Math.max(-89, Math.min(89, Number.isFinite(angle) ? angle : 0))
  if (Math.abs(normalized) < 0.0001) return undefined
  return {
    axis: 'x',
    edge: 's',
    amount: Math.tan(normalized * Math.PI / 180) * Math.max(1, target.height)
  }
}

const selectionShearAngle = (target: SelectionRect, shear: SelectionShearTransform | undefined): number => {
  if (!shear || shear.amount === 0) return 0
  const reference = shear.axis === 'x' ? Math.max(1, target.height) : Math.max(1, target.width)
  return Math.round(Math.atan(shear.amount / reference) * 1800 / Math.PI) / 10
}

const floatingSelectionGeometrySource = (pending: FloatingPaste): SelectionMask => pending.freeTile?.selectionSource
  ?? (pending.source.origin === 'clipboard' ? rectangularSelection(pending.source.selection) : pending.source.selection)

const cloneSelectionPivot = (pivot: SelectionPivot | null | undefined): SelectionPivot | null => pivot ? { ...pivot } : null

const cloneSelectionQuad = (quad: SelectionQuad | null | undefined): SelectionQuad | null => quad
  ? {
      nw: { ...quad.nw },
      ne: { ...quad.ne },
      se: { ...quad.se },
      sw: { ...quad.sw }
    }
  : null

const translateSelectionQuad = (quad: SelectionQuad | null | undefined, deltaX: number, deltaY: number): SelectionQuad | null => {
  const cloned = cloneSelectionQuad(quad)
  if (!cloned) return null
  for (const corner of ['nw', 'ne', 'se', 'sw'] as const) {
    cloned[corner].x += deltaX
    cloned[corner].y += deltaY
  }
  return cloned
}

const cloneFloatingSelectionBoxHistoryEntry = (entry: FloatingSelectionBoxHistoryEntry): FloatingSelectionBoxHistoryEntry => ({
  beforeSelection: cloneSelectionMask(entry.beforeSelection)!,
  afterSelection: cloneSelectionMask(entry.afterSelection)!,
  beforePivot: cloneSelectionPivot(entry.beforePivot),
  afterPivot: cloneSelectionPivot(entry.afterPivot)
})

const clearFloatingSelectionBoxHistory = (pending: FloatingPaste): void => {
  pending.selectionBoxUndo = undefined
  pending.selectionBoxRedo = undefined
}

const recordFloatingSelectionBoxMove = (
  session: DocumentSession,
  pending: FloatingPaste,
  beforeSelection: SelectionMask,
  afterSelection: SelectionMask,
  beforePivot: SelectionPivot | null,
  afterPivot: SelectionPivot | null
): void => {
  const entry: FloatingSelectionBoxHistoryEntry = {
    beforeSelection: cloneSelectionMask(beforeSelection)!,
    afterSelection: cloneSelectionMask(afterSelection)!,
    beforePivot: cloneSelectionPivot(beforePivot),
    afterPivot: cloneSelectionPivot(afterPivot)
  }
  pending.selectionBoxUndo = [...(pending.selectionBoxUndo ?? []), entry]
  pending.selectionBoxRedo = undefined
  session.selection = cloneSelectionMask(afterSelection)
  session.selectionPivot = cloneSelectionPivot(afterPivot)
}

const undoFloatingSelectionBoxMove = (session: DocumentSession): boolean => {
  const pending = session.pendingPaste
  const entry = pending?.selectionBoxUndo?.pop()
  if (!pending || !entry) return false
  pending.selectionBoxRedo = [...(pending.selectionBoxRedo ?? []), cloneFloatingSelectionBoxHistoryEntry(entry)]
  session.selection = cloneSelectionMask(entry.beforeSelection)
  session.selectionPivot = cloneSelectionPivot(entry.beforePivot)
  return true
}

const redoFloatingSelectionBoxMove = (session: DocumentSession): boolean => {
  const pending = session.pendingPaste
  const entry = pending?.selectionBoxRedo?.pop()
  if (!pending || !entry) return false
  pending.selectionBoxUndo = [...(pending.selectionBoxUndo ?? []), cloneFloatingSelectionBoxHistoryEntry(entry)]
  session.selection = cloneSelectionMask(entry.afterSelection)
  session.selectionPivot = cloneSelectionPivot(entry.afterPivot)
  return true
}

const floatingPasteSelectionForCommit = (session: DocumentSession, pending: FloatingPaste): SelectionMask => pending.source.origin === 'clipboard'
  && (pending.selectionBoxUndo?.length ?? 0) > 0
  && session.selection
  ? cloneSelectionMask(session.selection)!
  : cloneSelectionMask(pending.target)!

const restoreMovedClipboardPaste = (session: DocumentSession): boolean => {
  const pending = session.pendingPaste
  if (!pending || pending.source.origin !== 'clipboard' || !pending.copy || pending.layers?.length || pending.freeTile) return false
  const layer = session.document.layers.find((candidate) => candidate.id === pending.layerId)
  if (!layer || layer.kind) return false
  const sourceSelection = floatingSelectionGeometrySource(pending)
  const transformTarget = pending.transformTarget ?? {
    x: pending.target.x,
    y: pending.target.y,
    width: pending.target.width,
    height: pending.target.height
  }
  const atPasteOrigin = transformTarget.x === sourceSelection.x
    && transformTarget.y === sourceSelection.y
    && transformTarget.width === sourceSelection.width
    && transformTarget.height === sourceSelection.height
    && !transformTarget.flipHorizontal
    && !transformTarget.flipVertical
    && (pending.transformAngle ?? 0) % 360 === 0
    && (!pending.transformShear || pending.transformShear.amount === 0)
    && selectionMasksEqual(pending.target, sourceSelection)
  if (atPasteOrigin) return false

  const previousTarget = cloneSelectionMask(pending.target)!
  restoreFloatingPreview(session)
  const target = cloneSelectionMask(sourceSelection)!
  pending.target = cloneSelectionMask(target)!
  pending.transformTarget = { x: target.x, y: target.y, width: target.width, height: target.height }
  pending.transformAngle = 0
  pending.transformShear = undefined
  pending.translationPreview = null
  pending.previewEdit = pending.previewDeferred
    ? null
    : applySelectionTranslationCommit(session.document, pending.source, target, true, layer) ?? beginPixelEdit(layer.id)
  session.selection = cloneSelectionMask(target)
  session.selectionPivot = null
  if (pending.previewDeferred) markFloatingOverlayChanged(session)
  else markFloatingPreviewChanged(session, previousTarget, target)
  return true
}

const commitCanvasResize = (
  session: DocumentSession,
  width: number,
  height: number,
  offsetX: number,
  offsetY: number,
  trimOutside: boolean,
  label: string,
  selectionMode: 'shift' | 'clear' = 'shift'
): void => {
  const before = captureDocumentCanvasResizeSnapshot(session.document)
  const beforeSelection = cloneSelectionMask(session.selection)
  const beforeSelectionPivot = session.selectionPivot ? { ...session.selectionPivot } : null
  const sourceWidth = session.document.width
  const sourceHeight = session.document.height
  const resized = resizeDocumentAt(session.document, width, height, offsetX, offsetY, trimOutside)
  resizeAnimationCelsAt(session.document, resized.offsetX, resized.offsetY, trimOutside, sourceWidth, sourceHeight)
  session.selection = selectionMode === 'clear' ? null : shiftSelection(beforeSelection, resized.offsetX, resized.offsetY, width, height)
  session.selectionPivot = selectionMode === 'clear' || !session.selection || !beforeSelectionPivot
    ? null
    : { x: beforeSelectionPivot.x + resized.offsetX, y: beforeSelectionPivot.y + resized.offsetY }
  session.canvasResizePreview = null
  session.lastPencilPoint = null
  session.lastEraserPoint = null
  const after = captureDocumentCanvasResizeSnapshot(session.document)
  const afterSelection = cloneSelectionMask(session.selection)
  const afterSelectionPivot = session.selectionPivot ? { ...session.selectionPivot } : null
  session.history.push({
    label,
    bytes: documentCanvasResizeSnapshotBytes(before) + documentCanvasResizeSnapshotBytes(after) + (beforeSelection?.mask?.byteLength ?? 0) + (afterSelection?.mask?.byteLength ?? 0) + 64,
    undo: () => {
      restoreDocumentCanvasResizeSnapshot(session.document, before)
      session.selection = cloneSelectionMask(beforeSelection)
      session.selectionPivot = beforeSelectionPivot ? { ...beforeSelectionPivot } : null
    },
    redo: () => {
      restoreDocumentCanvasResizeSnapshot(session.document, after)
      session.selection = cloneSelectionMask(afterSelection)
      session.selectionPivot = afterSelectionPivot ? { ...afterSelectionPivot } : null
    },
    requiresAnimationSync: false
  })
}

const combinedPixelHistoryEntry = (
  session: DocumentSession,
  entries: readonly HistoryEntry[],
  label: string,
  beforeSelection: SelectionMask | null,
  afterSelection: SelectionMask,
  beforeSelectionPivot: SelectionPivot | null,
  afterSelectionPivot: SelectionPivot | null = null,
  beforeFreeTransformQuad: SelectionQuad | null = null,
  afterFreeTransformQuad: SelectionQuad | null = null
): HistoryEntry => ({
  label,
  bytes: entries.reduce((sum, entry) => sum + entry.bytes, 0)
    + (beforeSelection?.mask?.byteLength ?? 0)
    + (afterSelection.mask?.byteLength ?? 0)
    + 64,
  undo: () => {
    for (let index = entries.length - 1; index >= 0; index -= 1) entries[index].undo()
    session.selection = cloneSelectionMask(beforeSelection)
    session.selectionPivot = beforeSelectionPivot ? { ...beforeSelectionPivot } : null
    session.freeTransformQuad = cloneSelectionQuad(beforeFreeTransformQuad)
  },
  redo: () => {
    for (const entry of entries) entry.redo()
    session.selection = cloneSelectionMask(afterSelection)
    session.selectionPivot = afterSelectionPivot ? { ...afterSelectionPivot } : null
    session.freeTransformQuad = cloneSelectionQuad(afterFreeTransformQuad)
  },
  invalidation: { kind: 'full' },
  affectedLayerIds: [...new Set(entries.flatMap((entry) => entry.affectedLayerIds ?? []))]
})

const applyTextSurface = (document: SpriteDocument, layer: RasterLayer, source: AnimationCel, cel: AnimationCel, text: TextCelData, surface: AnimationCelSurface): void => {
  source.text = cloneTextCelData(text)
  source.surface = surface
  source.opacity = layer.opacity
  if (cel !== source) {
    cel.text = source.text
    cel.surface = source.surface
    cel.opacity = source.opacity
  }
}

const renderTextAtCurrentSurface = (document: SpriteDocument, raw: TextCelData, targetX: number, targetY: number): ReturnType<typeof rasterizeText> => {
  let rendered = rasterizeText(raw, targetX, targetY)
  const deltaX = Math.trunc(targetX - rendered.rgba.offsetX)
  const deltaY = Math.trunc(targetY - rendered.rgba.offsetY)
  if (deltaX !== 0 || deltaY !== 0) rendered = rasterizeText(translateTextCelData(rendered.data, deltaX, deltaY), targetX, targetY)
  return rendered
}

const timelapseCaptureCaches = new WeakMap<SpriteDocument, TimelapseCaptureCache>()
const timelapseCaptureTasks = new WeakMap<SpriteDocument, Promise<void>>()
const timelapseCaptureGenerations = new WeakMap<SpriteDocument, number>()

const captureCacheFor = (document: SpriteDocument): TimelapseCaptureCache => {
  const cached = timelapseCaptureCaches.get(document)
  if (cached) return cached
  const created = createTimelapseCaptureCache()
  timelapseCaptureCaches.set(document, created)
  return created
}

const queueTimelapseCapture = (session: DocumentSession): Promise<void> => {
  const document = session.document
  const captureRevision = session.contentRevision
  const captureInvalidation = session.contentInvalidation
  const prepared = prepareTimelapseSnapshot(document, Date.now(), {
    cache: captureCacheFor(document),
    contentRevision: captureRevision,
    contentInvalidation: captureInvalidation
  })
  if (!prepared) return Promise.resolve()
  const generation = timelapseCaptureGenerations.get(document) ?? 0
  const previous = timelapseCaptureTasks.get(document) ?? Promise.resolve()
  let tracked = Promise.resolve()
  tracked = previous.catch(() => undefined).then(async () => {
    await commitPreparedTimelapseSnapshot(document, prepared, () => (timelapseCaptureGenerations.get(document) ?? 0) === generation)
    const currentSessions = useWorkspace.getState().sessions
    if (currentSessions.some((current) => current.document === document)) useWorkspace.setState({ sessions: [...currentSessions] })
  }).finally(() => {
    if (timelapseCaptureTasks.get(document) === tracked) timelapseCaptureTasks.delete(document)
  })
  timelapseCaptureTasks.set(document, tracked)
  return tracked
}

const scheduleTimelapseCapture = (session: DocumentSession): void => {
  const settings = normalizeTimelapseSettings(session.document.timelapse, session.document.timelapse?.snapshots ?? [])
  session.document.timelapse = settings
  if (!settings.enabled) return
  if (!session.animationPlaying) void queueTimelapseCapture(session).catch(() => undefined)
}

const flushTimelapseCapture = async (session: DocumentSession): Promise<void> => {
  await timelapseCaptureTasks.get(session.document)
}

const recordDocumentOperation = (session: DocumentSession, activity?: { stroke?: boolean; durationMs?: number }, captureTimelapse = true): void => {
  const statistics = normalizeProjectStatistics(session.document.statistics)
  statistics.operationCount += 1
  if (activity?.stroke) statistics.strokeCount += 1
  if (activity?.durationMs) statistics.drawingTimeMs += Math.max(0, Math.round(activity.durationMs))
  session.document.statistics = statistics
  if (activity?.stroke) recordUsageEvent('drawingStroke')
  if (captureTimelapse) scheduleTimelapseCapture(session)
}

const shouldCaptureTimelapseHistoryStep = (session: DocumentSession): boolean =>
  normalizeTimelapseSettings(session.document.timelapse, session.document.timelapse?.snapshots ?? []).recordUndoSteps === true

const persistDisplaySettings = (session: DocumentSession, view: Partial<ViewState>): boolean => {
  if (!('showPixelGrid' in view) && !('showGrid' in view) && !('grid' in view)) return false
  const current = normalizeProjectDisplaySettings(session.document.displaySettings)
  session.document.displaySettings = normalizeProjectDisplaySettings({
    ...current,
    ...('showPixelGrid' in view ? { showPixelGrid: view.showPixelGrid } : {}),
    ...('showGrid' in view ? { showGrid: view.showGrid } : {}),
    ...('grid' in view ? { grid: view.grid } : {})
  })
  return true
}

const cloneAnimationCelsForLayerIds = (document: SpriteDocument, layerIds: readonly string[], frameId?: string): AnimationCel[] => {
  syncActiveAnimationFrame(document)
  const ids = new Set(layerIds)
  const timeline = ensureAnimationDocument(document)
  return timeline.cels
    .filter((cel) => ids.has(cel.layerId) && (!frameId || cel.frameId === frameId))
    .map(cloneAnimationCel)
}

const cloneAnimationLayerMasksForLayerIds = (document: SpriteDocument, layerIds: ReadonlySet<string>): AnimationLayerMask[] =>
  (ensureAnimationDocument(document).layerMasks ?? [])
    .filter((entry) => layerIds.has(entry.layerId))
    .map((entry) => cloneAnimationLayerMask(entry))

const removeAnimationLayerMasksForLayerIds = (document: SpriteDocument, layerIds: ReadonlySet<string>): void => {
  const timeline = ensureAnimationDocument(document)
  timeline.layerMasks = (timeline.layerMasks ?? []).filter((entry) => !layerIds.has(entry.layerId))
}

const restoreAnimationLayerMasks = (document: SpriteDocument, masks: readonly AnimationLayerMask[]): void => {
  const timeline = ensureAnimationDocument(document)
  timeline.layerMasks ??= []
  for (const entry of masks) {
    if (timeline.layerMasks.some((candidate) => candidate.layerId === entry.layerId && candidate.frameId === entry.frameId)) continue
    timeline.layerMasks.push(cloneAnimationLayerMask(entry))
  }
}

type LayerContentKind = 'raster' | 'text' | 'tilemap' | 'free-tile'

const layerContentKind = (layer: RasterLayer | undefined): LayerContentKind => layer?.kind ?? 'raster'
const animationCelContentKind = (cel: AnimationCel): LayerContentKind => cel.tilemap ? 'tilemap' : cel.freeTiles ? 'free-tile' : cel.text ? 'text' : 'raster'

type LayerRowSelectionMode = boolean | 'replace' | 'toggle' | 'range'

const selectedGroupRows = (session: DocumentSession): string[] =>
  session.selectedGroupIds.length > 0 ? [...session.selectedGroupIds] : session.selectedGroupId ? [session.selectedGroupId] : []

const selectedDirectLayerRows = (session: DocumentSession): string[] =>
  // Descendant layers are implicit only for a pure single-group selection.
  // Mixed group + layer selections keep their explicit layer ids; an active
  // group context must never hide those ids from grouping, moving, or range
  // insertion commands.
  session.selectedGroupId
    && selectedGroupRows(session).length === 1
    && session.selectedLayerIds.length === 0
    ? []
    : [...session.selectedLayerIds]

const ensureTileSelection = (session: DocumentSession): void => {
  if (session.tilemapMode !== 'create' && session.tilemapMode !== 'hybrid' && session.tilemapMode !== 'paint' && session.tilemapMode !== 'edit') session.tilemapMode = 'hybrid'
  if (session.freeTileMode !== 'paint' && session.freeTileMode !== 'edit') session.freeTileMode = 'paint'
  const tilesets = session.document.tilesets ?? []
  if (tilesets.length === 0) {
    session.selectedTilesetId = null
    session.selectedTileId = null
    session.secondaryTileId = null
    return
  }
  const freeTarget = activeFreeTileCelTarget(session.document)
  const target = freeTarget ? null : activeTilemapCelTarget(session.document)
  const tilemapTilesetIds = new Set(session.document.layers.flatMap((layer) => layer.kind === 'tilemap' && layer.tilemapTilesetId ? [layer.tilemapTilesetId] : []))
  const compatible = freeTarget
    ? tilesets.filter((tileset) => freeTarget.sources.some((source) => source.tileset.id === tileset.id))
    : target
      ? tilesets.filter((tileset) => tilemapTilesetIds.has(tileset.id))
      : tilesets
  const selected = compatible.find((tileset) => tileset.id === session.selectedTilesetId) ?? compatible[0] ?? null
  session.selectedTilesetId = selected?.id ?? null
  session.selectedTileId = selected?.tileIds.includes(session.selectedTileId ?? '')
    ? session.selectedTileId
    : selected?.tileIds[0] ?? null
  session.secondaryTileId = selected?.tileIds.includes(session.secondaryTileId ?? '')
    ? session.secondaryTileId
    : selected?.tileIds[0] ?? null
}

const clearFreeTileInstanceSelection = (session: DocumentSession): void => {
  session.selectedFreeTileInstanceId = null
  session.selectedFreeTileInstanceIds = []
  session.freeTileInstanceSelectionAnchorId = null
}

const setFreeTileInstanceSelectionState = (
  session: DocumentSession,
  instanceIds: readonly string[],
  primaryInstanceId: string | null,
  anchorInstanceId: string | null = primaryInstanceId
): void => {
  const target = activeFreeTileCelTarget(session.document)
  if (!target) {
    clearFreeTileInstanceSelection(session)
    return
  }
  const validIds = new Set(target.freeTiles.instances.map((instance) => instance.id))
  const selectedIds = [...new Set(instanceIds)].filter((id) => validIds.has(id))
  const primaryId = primaryInstanceId && validIds.has(primaryInstanceId)
    ? primaryInstanceId
    : selectedIds.at(-1) ?? null
  if (!primaryId) {
    clearFreeTileInstanceSelection(session)
    return
  }
  if (!selectedIds.includes(primaryId)) selectedIds.push(primaryId)
  session.selectedFreeTileInstanceId = primaryId
  session.selectedFreeTileInstanceIds = selectedIds
  session.freeTileInstanceSelectionAnchorId = anchorInstanceId && validIds.has(anchorInstanceId)
    ? anchorInstanceId
    : primaryId
}

const ensureFreeTileInstanceSelection = (session: DocumentSession): void => {
  const primaryId = session.selectedFreeTileInstanceId
  if (!primaryId) {
    clearFreeTileInstanceSelection(session)
    return
  }
  setFreeTileInstanceSelectionState(
    session,
    session.selectedFreeTileInstanceIds ?? [],
    primaryId,
    session.freeTileInstanceSelectionAnchorId
  )
}

const syncFreeTileInstanceSourceSelection = (
  session: DocumentSession,
  instanceId: string,
  role: 'primary' | 'secondary' = 'primary'
): boolean => {
  const target = activeFreeTileCelTarget(session.document)
  const instance = target?.freeTiles.instances.find((candidate) => candidate.id === instanceId)
  const source = target && instance ? freeTileSourceForInstance(target.sources, instance) : null
  const tileId = source?.tileset.tileIds[0] ?? null
  if (!instance || !source || !tileId) return false
  session.selectedTilesetId = source.tileset.id
  if (role === 'secondary') session.secondaryTileId = tileId
  else session.selectedTileId = tileId
  session.selectedTileId = source.tileset.tileIds.includes(session.selectedTileId ?? '') ? session.selectedTileId : tileId
  session.secondaryTileId = source.tileset.tileIds.includes(session.secondaryTileId ?? '') ? session.secondaryTileId : tileId
  return true
}

const requestTilesetPanelVisibility = (visible: boolean): void => {
  window.dispatchEvent(new CustomEvent(`moonsprite:${visible ? 'show' : 'hide'}-workspace-panel`, { detail: { id: 'tileset' } }))
}

const documentUsesTilesetPanel = (document: SpriteDocument | null | undefined): boolean =>
  Boolean(document?.layers.some((layer) => layer.kind === 'tilemap' || layer.kind === 'free-tile'))

const requestTilesetPanelForLayer = (document: SpriteDocument, layerId: string): void => {
  if (document.layers.some((layer) => layer.id === layerId && layer.kind === 'tilemap')) requestTilesetPanelVisibility(true)
}

const defaultFreeTileSourceDisplayColor = (index: number): RgbaColor => {
  const presets = loadEditorPreferences().layerDisplayColorPresets
  const available = presets.length > 0 ? presets : DEFAULT_LAYER_DISPLAY_COLOR_PRESETS
  return { ...available[index % available.length] }
}

const nextAvailableLayerDisplayColor = (document: SpriteDocument): RgbaColor => {
  const presets = loadEditorPreferences().layerDisplayColorPresets
  const available = presets.length > 0 ? presets : DEFAULT_LAYER_DISPLAY_COLOR_PRESETS
  const used = [...document.layers, ...document.groups].flatMap((owner) => owner.displayColor ? [owner.displayColor] : [])
  const usage = available.map((preset) => used.filter((color) => colorEquals(color, preset)).length)
  const leastUsed = Math.min(...usage)
  return { ...available[Math.max(0, usage.indexOf(leastUsed))] }
}

const createLinkedLayerNameAllocator = (document: SpriteDocument): ((linkedContentId: string, fallbackName: string) => string) => {
  const sequences = new Map<string, ReturnType<typeof linkedLayerDefaultNameSequence>>()
  return (linkedContentId, fallbackName) => {
    const sequence = sequences.get(linkedContentId)
      ?? linkedLayerDefaultNameSequence(document, linkedContentId, tr('layers.linkedCopySuffix'), fallbackName)
    sequences.set(linkedContentId, sequence)
    const name = tr('layers.linkedDefaultName', { name: sequence.baseName, index: sequence.nextIndex })
    sequence.nextIndex += 1
    return name
  }
}

const cloneFreeTileSourceLayer = (source: FreeTileSourceLayer): FreeTileSourceLayer => ({
  ...source,
  displayColor: source.displayColor ? { ...source.displayColor } : undefined
})

const freeTileSourceLayerEqual = (left: FreeTileSourceLayer, right: FreeTileSourceLayer): boolean =>
  left.id === right.id
  && left.name === right.name
  && left.tilesetId === right.tilesetId
  && left.description === right.description
  && left.visible === right.visible
  && left.locked === right.locked
  && left.opacity === right.opacity
  && left.blendMode === right.blendMode
  && left.offsetX === right.offsetX
  && left.offsetY === right.offsetY
  && JSON.stringify(left.displayColor ?? null) === JSON.stringify(right.displayColor ?? null)

interface IndexedTilesetSnapshot {
  index: number
  tileset: Tileset
}

const tilemapTilesetBytes = (tileset: Tileset): number => tileset.pixels.byteLength + tileset.tileIds.length * 32 + (tileset.tileSlots?.length ?? tileset.tileIds.length) * 8

const cloneOwnedLayerTilesets = (
  document: SpriteDocument,
  pairs: readonly { source: RasterLayer; target: RasterLayer }[]
): Tileset[] => {
  const timeline = ensureAnimationDocument(document)
  const created: Tileset[] = []
  for (const { source, target } of pairs) {
    if (source.kind !== target.kind || (target.kind !== 'tilemap' && target.kind !== 'free-tile')) continue
    if (source.kind === 'tilemap' && target.kind === 'tilemap') {
      const sourceTileset = document.tilesets?.find((tileset) => tileset.id === source.tilemapTilesetId)
      if (!sourceTileset) continue
      const tileset = { ...cloneTileset(sourceTileset), id: createId('tileset'), name: target.name }
      target.tilemapTilesetId = tileset.id
      for (const cel of timeline.cels) {
        if (cel.layerId !== target.id || !cel.tilemap) continue
        for (const cell of cel.tilemap.cells) if (cell?.tilesetId === sourceTileset.id) cell.tilesetId = tileset.id
      }
      created.push(tileset)
      continue
    }
    if (source.kind !== 'free-tile' || target.kind !== 'free-tile') continue
    const sourceIdMap = new Map<string, string>()
    target.freeTileSetId = createId('free-tile-set')
    target.freeTileSources = (source.freeTileSources ?? []).flatMap((sourceLayer) => {
      const sourceTileset = document.tilesets?.find((tileset) => tileset.id === sourceLayer.tilesetId)
      if (!sourceTileset) return []
      const nextSourceId = createId('free-tile-source')
      const tileset = { ...cloneTileset(sourceTileset), id: createId('tileset'), name: sourceLayer.name }
      sourceIdMap.set(sourceLayer.id, nextSourceId)
      created.push(tileset)
      return [{ ...cloneFreeTileSourceLayer(sourceLayer), id: nextSourceId, tilesetId: tileset.id }]
    })
    delete target.freeTileTilesetId
    for (const cel of timeline.cels) {
      if (cel.layerId !== target.id || !cel.freeTiles) continue
      cel.freeTiles.instances = cel.freeTiles.instances.flatMap((instance) => {
        const sourceId = instance.sourceId ? sourceIdMap.get(instance.sourceId) : undefined
        return sourceId ? [{ ...instance, sourceId, tileId: undefined }] : []
      })
    }
  }
  if (created.length > 0) document.tilesets = [...(document.tilesets ?? []), ...created]
  return created
}

const removableOwnedTilesets = (
  document: SpriteDocument,
  removedLayerIds: ReadonlySet<string>,
  ownerLayers: readonly RasterLayer[] = document.layers
): IndexedTilesetSnapshot[] => {
  const candidateIds = new Set(ownerLayers
    .filter((layer) => removedLayerIds.has(layer.id))
    .flatMap((layer) => layer.kind === 'tilemap' && layer.tilemapTilesetId
      ? [layer.tilemapTilesetId]
      : layer.kind === 'free-tile' ? (layer.freeTileSources ?? []).map((source) => source.tilesetId) : []))
  if (candidateIds.size === 0) return []
  const retainedOwnerIds = new Set(document.layers
    .filter((layer) => !removedLayerIds.has(layer.id))
    .flatMap((layer) => layer.kind === 'tilemap' && layer.tilemapTilesetId
      ? [layer.tilemapTilesetId]
      : layer.kind === 'free-tile' ? (layer.freeTileSources ?? []).map((source) => source.tilesetId) : []))
  const retainedReferenceIds = new Set((document.animation?.cels ?? [])
    .filter((cel) => !removedLayerIds.has(cel.layerId) && cel.tilemap)
    .flatMap((cel) => cel.tilemap!.cells.flatMap((cell) => cell ? [cell.tilesetId] : [])))
  return (document.tilesets ?? []).flatMap((tileset, index) => candidateIds.has(tileset.id) && !retainedOwnerIds.has(tileset.id) && !retainedReferenceIds.has(tileset.id)
    ? [{ index, tileset }]
    : [])
}

const removeTilesetSnapshots = (document: SpriteDocument, snapshots: readonly IndexedTilesetSnapshot[]): void => {
  if (snapshots.length === 0) return
  const ids = new Set(snapshots.map((snapshot) => snapshot.tileset.id))
  document.tilesets = (document.tilesets ?? []).filter((tileset) => !ids.has(tileset.id))
}

const restoreTilesetSnapshots = (document: SpriteDocument, snapshots: readonly IndexedTilesetSnapshot[]): void => {
  document.tilesets ??= []
  for (const snapshot of [...snapshots].sort((left, right) => left.index - right.index)) {
    if (!document.tilesets.some((tileset) => tileset.id === snapshot.tileset.id)) document.tilesets.splice(Math.min(snapshot.index, document.tilesets.length), 0, snapshot.tileset)
  }
}

const commitLayerMergeWithOwnedTilesets = (
  session: DocumentSession,
  beforeDocument: DocumentStructureSnapshot,
  beforeUi: ReturnType<typeof captureLayerUi>,
  result: LayerMergeSuccess,
  label: string
): boolean => {
  const hadTilesetPanelContent = beforeDocument.layers.some((layer) => layer.kind === 'tilemap' || layer.kind === 'free-tile')
  const removedLayerIds = new Set(result.removedLayerIds)
  const removedFreeTileLayerIds = new Set(beforeDocument.layers
    .filter((layer) => removedLayerIds.has(layer.id) && layer.kind === 'free-tile')
    .map((layer) => layer.id))
  removeTilesetSnapshots(session.document, removableOwnedTilesets(session.document, removedFreeTileLayerIds, beforeDocument.layers))
  commitLayerMerge(session, beforeDocument, beforeUi, result, label)
  normalizeAnimationSelection(session)
  return hadTilesetPanelContent && !documentUsesTilesetPanel(session.document)
}

const applyLayerName = (document: SpriteDocument, layer: RasterLayer, name: string): void => {
  layer.name = name
  const tilesetId = layer.kind === 'tilemap' ? layer.tilemapTilesetId : undefined
  if (!tilesetId) return
  const tilemapOwners = document.layers.filter((candidate) => candidate.kind === 'tilemap' && candidate.tilemapTilesetId === tilesetId)
  if (tilemapOwners.length > 1) return
  const tileset = document.tilesets?.find((candidate) => candidate.id === tilesetId)
  if (tileset) tileset.name = name
}

const timelineRowExists = (session: DocumentSession, row: TimelineRowRef): boolean => {
  if (row.kind === 'layer') return session.document.layers.some((layer) => layer.id === row.ownerId)
  if (row.kind === 'group') return session.document.groups.some((group) => group.id === row.ownerId)
  const timeline = session.document.animation
  if (!timeline) return false
  return row.ownerKind === 'layer'
    ? session.document.layers.some((layer) => layer.id === row.ownerId)
      && (timeline.layerMasks ?? []).some((entry) => entry.layerId === row.ownerId)
    : session.document.groups.some((group) => group.id === row.ownerId)
      && (timeline.groupMasks ?? []).some((entry) => entry.groupId === row.ownerId)
}

const timelineRowsEqual = (left: TimelineRowRef | null, right: TimelineRowRef | null): boolean =>
  left === right || Boolean(left && right
    && left.kind === right.kind
    && left.ownerKind === right.ownerKind
    && left.ownerId === right.ownerId)

const setTimelineActiveContext = (
  session: DocumentSession,
  row: TimelineRowRef,
  frameId = session.document.animation?.activeFrameId ?? null,
  maskEditTargetId: string | null = row.kind === 'mask' ? session.activeLayerMaskId : null
): void => {
  const current = session.timelineActiveContext
  if (timelineRowsEqual(current.row, row) && current.frameId === frameId && current.maskEditTargetId === maskEditTargetId) return
  session.timelineActiveContext = { row: { ...row }, frameId, maskEditTargetId }
}

const setTimelineActiveFrame = (session: DocumentSession, frameId: string): void => {
  if (session.timelineActiveContext.frameId === frameId) return
  session.timelineActiveContext = { ...session.timelineActiveContext, frameId }
}

const activateTimelineMask = (
  session: DocumentSession,
  ownerKind: 'layer' | 'group',
  ownerId: string,
  frameId: string,
  maskId: string,
): void => {
  session.activeLayerMaskId = maskId
  enterLayerMaskEditing(session)
  setTimelineActiveContext(session, { kind: 'mask', ownerKind, ownerId }, frameId, maskId)
}

const ensureTimelineActiveContext = (session: DocumentSession): void => {
  const timeline = session.document.animation
  const current = session.timelineActiveContext
  const currentRow = current?.row && timelineRowExists(session, current.row) ? current.row : null
  const fallbackLayerId = session.document.layers.some((layer) => layer.id === session.document.activeLayerId)
    ? session.document.activeLayerId
    : session.document.layers.at(-1)?.id ?? null
  const row = currentRow ?? (fallbackLayerId ? { kind: 'layer' as const, ownerKind: 'layer' as const, ownerId: fallbackLayerId } : null)
  const frameId = current?.frameId && timeline?.frames.some((frame) => frame.id === current.frameId)
    ? current.frameId
    : timeline?.activeFrameId ?? null
  const maskEditTargetId = row?.kind === 'mask' && session.activeLayerMaskId && findLayerMask(session.document, session.activeLayerMaskId)
    ? session.activeLayerMaskId
    : null
  if (timelineRowsEqual(current.row, row) && current.frameId === frameId && current.maskEditTargetId === maskEditTargetId) return
  session.timelineActiveContext = { row, frameId, maskEditTargetId }
}

const ensureLayerSelection = (session: DocumentSession): void => {
  const validLayerIds = new Set(session.document.layers.map((layer) => layer.id))
  const validGroupIds = new Set(session.document.groups.map((group) => group.id))
  session.selectedLayerIds = [...new Set(session.selectedLayerIds)].filter((id) => validLayerIds.has(id))
  session.selectedGroupIds = [...new Set(session.selectedGroupIds)].filter((id) => validGroupIds.has(id))
  if (!session.selectedGroupId || !validGroupIds.has(session.selectedGroupId) || !session.selectedGroupIds.includes(session.selectedGroupId)) {
    session.selectedGroupId = null
  }

  const fallbackLayerId = validLayerIds.has(session.document.activeLayerId)
    ? session.document.activeLayerId
    : session.selectedLayerIds.at(-1) ?? session.document.layers.at(-1)?.id
  if (fallbackLayerId && session.document.activeLayerId !== fallbackLayerId) session.document.activeLayerId = fallbackLayerId

  const animationSelectionActive = session.selectedAnimationFrameIds.length > 0
    || session.selectedAnimationCellKeys.length > 0
    || session.selectedAnimationMaskCellKeys.length > 0
    || session.selectedAnimationMaskRowKeys.length > 0
  // `selectedLayerIds` also preserves the implicit active editing target for
  // existing commands.  Its visual treatment is controlled separately by
  // `layerSelectionExplicit`.
  if (!animationSelectionActive && session.selectedLayerIds.length === 0 && session.selectedGroupIds.length === 0 && fallbackLayerId) {
    session.selectedLayerIds = [fallbackLayerId]
  }
  const anchorIsValid = session.layerSelectionAnchorId
    && (validLayerIds.has(session.layerSelectionAnchorId) || validGroupIds.has(session.layerSelectionAnchorId))
  if (!anchorIsValid) {
    session.layerSelectionAnchorId = session.selectedGroupIds.at(-1) ?? session.selectedLayerIds.at(-1) ?? fallbackLayerId ?? null
  }
  ensureTileSelection(session)
  ensureFreeTileInstanceSelection(session)
}

const clearAnimationMaskContext = (session: DocumentSession, preserveRowSelection = false): void => {
  session.selectedAnimationMaskCellKeys = []
  session.animationMaskCellSelectionAnchorKey = null
  if (!preserveRowSelection) session.selectedAnimationMaskRowKeys = []
  session.activeLayerMaskId = null
  session.layerMaskIsolatedView = false
  exitLayerMaskEditing(session)
}

const clearAnimationItemSelection = (session: DocumentSession, preserveMaskRowSelection = false): void => {
  session.selectedAnimationFrameIds = []
  session.animationFrameSelectionAnchorId = null
  session.selectedAnimationCellKeys = []
  session.animationCellSelectionAnchorKey = null
  session.animationCellSelectionExplicit = false
  clearAnimationMaskContext(session, preserveMaskRowSelection)
}

// Creating a layer changes the editing target but must not manufacture an
// explicit timeline selection (the latter owns the blue selection treatment).
const activateNewLayerContext = (session: DocumentSession, layerId: string, frameId: string): void => {
  session.document.activeLayerId = layerId
  session.selectedLayerIds = []
  session.selectedGroupId = null
  session.selectedGroupIds = []
  session.layerSelectionExplicit = false
  session.layerSelectionAnchorId = layerId
  clearAnimationItemSelection(session)
  session.activeLayerMaskId = null
  session.layerMaskIsolatedView = false
  setTimelineActiveContext(session, { kind: 'layer', ownerKind: 'layer', ownerId: layerId }, frameId, null)
}

export interface AnimationSelectionNormalizationOptions {
  /** Keep layer×frame cel slots selectable even when the slot is currently empty. */
  preserveEmptyCelSlots?: boolean
}

/**
 * Single cleanup boundary for timeline selection state. This function only
 * changes session/document activity context; it never touches dirty,
 * contentRevision, or history. Selection modes remain mutually exclusive for
 * frame vs ordinary/mask cel selection, while layer/group selection is allowed
 * to coexist with frame selection.
 */
export const normalizeAnimationSelection = (
  session: DocumentSession,
  options: AnimationSelectionNormalizationOptions = {}
): void => {
  const timeline = session.document.animation
  if (!timeline) {
    session.selectedAnimationFrameIds = []
    session.selectedAnimationCellKeys = []
    session.selectedAnimationMaskCellKeys = []
    session.selectedAnimationMaskRowKeys = []
    session.animationFrameSelectionAnchorId = null
    session.animationCellSelectionAnchorKey = null
    session.animationMaskCellSelectionAnchorKey = null
    session.animationCellSelectionExplicit = false
    return
  }
  const layerIds = new Set(session.document.layers.map((layer) => layer.id))
  const groupIds = new Set(session.document.groups.map((group) => group.id))
  const frameIds = new Set(timeline.frames.map((frame) => frame.id))
  const preserveEmptyCelSlots = options.preserveEmptyCelSlots === true
  const normalCelKeys = new Set(timeline.cels.map((cel) => animationCelKey(cel.layerId, cel.frameId)))
  const maskOwnerKeys = new Set<string>()
  for (const entry of timeline.layerMasks ?? []) maskOwnerKeys.add(`layer:${entry.layerId}`)
  for (const entry of timeline.groupMasks ?? []) maskOwnerKeys.add(`group:${entry.groupId}`)
  const validCelKey = (key: string): boolean => {
    const target = parseAnimationCelKey(key)
    return Boolean(target && layerIds.has(target.layerId) && frameIds.has(target.frameId) && (preserveEmptyCelSlots || normalCelKeys.has(key)))
  }
  const validMaskKey = (key: string): boolean => {
    const target = parseAnimationCelKey(key)
    return Boolean(target
      && frameIds.has(target.frameId)
      && (layerIds.has(target.layerId) ? maskOwnerKeys.has(`layer:${target.layerId}`) : groupIds.has(target.layerId) && maskOwnerKeys.has(`group:${target.layerId}`)))
  }
  const uniqueValid = (values: readonly string[], valid: (value: string) => boolean): string[] => [...new Set(values)].filter(valid)

  session.selectedLayerIds = uniqueValid(session.selectedLayerIds, (id) => layerIds.has(id))
  session.selectedGroupIds = uniqueValid(session.selectedGroupIds, (id) => groupIds.has(id))
  session.selectedAnimationFrameIds = uniqueValid(session.selectedAnimationFrameIds, (id) => frameIds.has(id))
  session.selectedAnimationCellKeys = uniqueValid(session.selectedAnimationCellKeys, validCelKey)
  session.selectedAnimationMaskCellKeys = uniqueValid(session.selectedAnimationMaskCellKeys, validMaskKey)
  session.selectedAnimationMaskRowKeys = uniqueValid(session.selectedAnimationMaskRowKeys, (key) => {
    const separator = key.indexOf(':')
    if (separator <= 0) return false
    const kind = key.slice(0, separator)
    const id = key.slice(separator + 1)
    return (kind === 'layer' ? layerIds : kind === 'group' ? groupIds : new Set<string>()).has(id)
  })

  const activeLayerId = layerIds.has(session.document.activeLayerId)
    ? session.document.activeLayerId
    : session.selectedLayerIds.at(-1) ?? session.document.layers.at(-1)?.id ?? null
  if (activeLayerId) session.document.activeLayerId = activeLayerId
  const activeFrameId = frameIds.has(timeline.activeFrameId)
    ? timeline.activeFrameId
    : timeline.frames[0]?.id ?? null
  if (activeFrameId && timeline.activeFrameId !== activeFrameId) {
    // This repair is intentionally restricted to explicit normalization
    // boundaries; mutateActive() must not silently switch frame surfaces on
    // high-frequency preview or pointer-update paths.
    activateAnimationFrame(session.document, activeFrameId)
  }

  if (session.selectedAnimationFrameIds.length > 0) {
    session.selectedAnimationCellKeys = []
    session.selectedAnimationMaskCellKeys = []
    // Frame selection may coexist with the explicitly selected mask row;
    // retain that row identity/context while clearing cel-level selections.
    session.animationCellSelectionExplicit = false
  } else if (session.selectedAnimationCellKeys.length > 0) {
    session.selectedAnimationMaskCellKeys = []
    session.selectedAnimationMaskRowKeys = []
    session.animationCellSelectionExplicit = session.animationCellSelectionExplicit === true
  } else if (session.selectedAnimationMaskCellKeys.length > 0) {
    session.selectedAnimationCellKeys = []
    session.selectedAnimationMaskRowKeys = []
    session.animationCellSelectionExplicit = false
  } else {
    session.animationCellSelectionExplicit = false
  }

  session.animationFrameSelectionAnchorId = session.selectedAnimationFrameIds.includes(session.animationFrameSelectionAnchorId ?? '')
    ? session.animationFrameSelectionAnchorId
    : session.selectedAnimationFrameIds.at(-1) ?? null
  session.animationCellSelectionAnchorKey = session.selectedAnimationCellKeys.includes(session.animationCellSelectionAnchorKey ?? '')
    ? session.animationCellSelectionAnchorKey
    : session.selectedAnimationCellKeys.at(-1) ?? null
  session.animationMaskCellSelectionAnchorKey = session.selectedAnimationMaskCellKeys.includes(session.animationMaskCellSelectionAnchorKey ?? '')
    ? session.animationMaskCellSelectionAnchorKey
    : session.selectedAnimationMaskCellKeys.at(-1) ?? null

  if (!session.selectedGroupId || !session.selectedGroupIds.includes(session.selectedGroupId)) session.selectedGroupId = null
  if (session.selectedGroupIds.length !== 1) session.selectedGroupId = null
  if (session.selectedLayerIds.length === 0
    && session.selectedGroupIds.length === 0
    && session.selectedAnimationFrameIds.length === 0
    && session.selectedAnimationCellKeys.length === 0
    && session.selectedAnimationMaskCellKeys.length === 0
    && session.selectedAnimationMaskRowKeys.length === 0
    && activeLayerId) session.selectedLayerIds = [activeLayerId]
  if (session.layerSelectionAnchorId && !layerIds.has(session.layerSelectionAnchorId) && !groupIds.has(session.layerSelectionAnchorId)) {
    session.layerSelectionAnchorId = session.selectedGroupIds.at(-1) ?? session.selectedLayerIds.at(-1) ?? activeLayerId
  }
  if (session.activeLayerMaskId && !findLayerMask(session.document, session.activeLayerMaskId)) session.activeLayerMaskId = null
}

const clearAnimationLoopPlayback = (session: DocumentSession): void => {
  session.animationPlaybackLoopSectionId = null
  session.animationPlaybackLoopIteration = 0
  session.animationPlaybackLoopSectionRepeatIndefinitely = false
  session.animationPlaybackLoopStack = []
  session.animationPlaybackTagCycleSectionId = null
}

const setAnimationLoopPlaybackSection = (session: DocumentSession, section: AnimationLoopSection): void => {
  session.animationPlaybackLoopSectionId = section.id
  session.animationPlaybackLoopIteration = 0
  session.animationPlaybackLoopSectionRepeatIndefinitely = section.repeatCount === null
}

const retargetAnimationLoopPlaybackAtFrame = (session: DocumentSession, frameId: string): void => {
  if (!session.animationPlaying || session.animationPlaybackMode !== 'tag') return
  const timeline = session.document.animation
  const loopSection = timeline ? animationLoopSectionAtFrame(timeline, frameId) : null
  clearAnimationLoopPlayback(session)
  if (!loopSection) return
  setAnimationLoopPlaybackSection(session, loopSection)
}

const activateAnimationPlaybackFrame = (session: DocumentSession, frameId: string): boolean => {
  if (!activateAnimationFrame(session.document, frameId)) return false
  const preserveMaskContext = (session.selectedAnimationMaskRowKeys?.length ?? 0) > 0
    || (session.selectedAnimationMaskCellKeys?.length ?? 0) > 0
    || session.activeLayerMaskId !== null
  if (!preserveMaskContext) {
    session.activeLayerMaskId = null
    session.layerMaskIsolatedView = false
  }
  session.lastPencilPoint = null
  session.lastEraserPoint = null
  session.revision += 1
  return true
}

const animationLoopSectionContainsFrame = (timeline: AnimationTimeline, section: AnimationLoopSection, frameId: string): boolean => {
  const range = resolveAnimationLoopSectionRange(timeline, section)
  const frameIndex = timeline.frames.findIndex((frame) => frame.id === frameId)
  return Boolean(range && frameIndex >= range.startIndex && frameIndex <= range.endIndex)
}

const nestedAnimationLoopSectionAtFrame = (timeline: AnimationTimeline, parent: AnimationLoopSection, frameId: string): AnimationLoopSection | null => {
  const parentRange = resolveAnimationLoopSectionRange(timeline, parent)
  const frameIndex = timeline.frames.findIndex((frame) => frame.id === frameId)
  if (!parentRange || frameIndex < parentRange.startIndex || frameIndex > parentRange.endIndex) return null
  return (timeline.loopSections ?? [])
    .map((section) => ({ section, range: resolveAnimationLoopSectionRange(timeline, section) }))
    .filter(({ section, range }) => Boolean(
      range
      && section.id !== parent.id
      && range.startIndex >= parentRange.startIndex
      && range.endIndex <= parentRange.endIndex
      && (range.endIndex - range.startIndex) < (parentRange.endIndex - parentRange.startIndex)
      && frameIndex >= range.startIndex
      && frameIndex <= range.endIndex
    ))
    .sort((left, right) => (left.range!.endIndex - left.range!.startIndex) - (right.range!.endIndex - right.range!.startIndex))
    .at(0)?.section ?? null
}

const animationLoopSectionBoundaryFrameId = (timeline: AnimationTimeline, section: AnimationLoopSection, direction: AnimationLoopDirection): string | null => {
  const range = resolveAnimationLoopSectionRange(timeline, section)
  if (!range) return null
  return timeline.frames[direction === 'forward' ? range.endIndex : range.startIndex]?.id ?? null
}

const updateSelectedAnimationFramesDisabled = (session: DocumentSession, update: boolean | 'toggle'): void => {
  const timeline = ensureAnimationDocument(session.document)
  const selected = new Set(session.selectedAnimationFrameIds.length ? session.selectedAnimationFrameIds : [timeline.activeFrameId])
  const frames = timeline.frames.filter((frame) => selected.has(frame.id))
  const before = frames.map((frame) => ({ id: frame.id, disabled: frame.disabled === true }))
  const after = before.map((frame) => ({
    id: frame.id,
    disabled: update === 'toggle' ? !frame.disabled : update
  }))
  if (!after.some((frame, index) => frame.disabled !== before[index]?.disabled)) return
  const apply = (values: Array<{ id: string; disabled: boolean }>): void => {
    const current = ensureAnimationDocument(session.document)
    for (const value of values) {
      const frame = current.frames.find((candidate) => candidate.id === value.id)
      if (!frame) continue
      if (value.disabled) frame.disabled = true
      else delete frame.disabled
    }
  }
  apply(after)
  if (session.animationPlaying && !firstPlayableAnimationFrameId(timeline)) {
    session.animationPlaying = false
    session.animationPlaybackStartFrameId = null
    clearAnimationLoopPlayback(session)
  }
  session.history.push({
    label: tr('workspace.history.toggleAnimationFrameDisabled'),
    bytes: frames.length * 24,
    undo: () => apply(before),
    redo: () => apply(after)
  })
}

const setAnimationLoopSections = (session: DocumentSession, sections: readonly AnimationLoopSection[]): void => {
  ensureAnimationDocument(session.document).loopSections = cloneAnimationLoopSections(sections)
  if ((session.animationPlaybackLoopSectionId && !sections.some((section) => section.id === session.animationPlaybackLoopSectionId))
    || (session.animationPlaybackTagCycleSectionId && !sections.some((section) => section.id === session.animationPlaybackTagCycleSectionId))) {
    session.animationPlaying = false
    session.animationPlaybackStartFrameId = null
    clearAnimationLoopPlayback(session)
  }
}

const layerHistoryBytes = (layer: RasterLayer): number => layer.pixels.byteLength + layerStylesHistoryBytes(layer.layerStyles)
const groupHistoryBytes = (group: LayerGroup): number => 96 + layerStylesHistoryBytes(group.layerStyles)

const assignLayerStyles = (layer: RasterLayer | LayerGroup, styles: LayerStyles | undefined): void => {
  const next = cloneLayerStyles(styles)
  if (next) layer.layerStyles = next
  else delete layer.layerStyles
}

const layerStyleOwnerForTarget = (document: SpriteDocument, target: LayerPropertyTarget): RasterLayer | LayerGroup | null =>
  target.kind === 'layer'
    ? document.layers.find((layer) => layer.id === target.id) ?? null
    : document.groups.find((group) => group.id === target.id) ?? null

const uniqueLayerStyleTargets = (document: SpriteDocument, targets: readonly LayerPropertyTarget[]): LayerPropertyTarget[] => {
  const seen = new Set<string>()
  return targets.filter((target) => {
    const key = `${target.kind}:${target.id}`
    if (seen.has(key) || !layerStyleOwnerForTarget(document, target)) return false
    seen.add(key)
    return true
  })
}

const unionRects = (left: SelectionRect, right: SelectionRect): SelectionRect => {
  const x = Math.min(left.x, right.x)
  const y = Math.min(left.y, right.y)
  const toX = Math.max(left.x + left.width, right.x + right.width)
  const toY = Math.max(left.y + left.height, right.y + right.height)
  return { x, y, width: toX - x, height: toY - y }
}

const layerStylePreviewInvalidationRect = (
  document: SpriteDocument,
  targets: readonly LayerPropertyTarget[]
): SelectionRect | null => {
  let rect: SelectionRect | null = null
  for (const target of targets) {
    if (target.kind !== 'layer') return null
    const layer = document.layers.find((candidate) => candidate.id === target.id)
    if (!layer) return null
    const bounds = layerContentBounds(document, layer)
    if (!bounds) continue
    const expanded = expandLayerStyleInvalidationRect(document, bounds, [layer.id])
    rect = rect ? unionRects(rect, expanded) : expanded
  }
  return rect
}

const layerReorderInvalidation = (
  document: SpriteDocument,
  beforeRenderOrder: readonly RasterLayer[] | null,
  afterRenderOrder: readonly RasterLayer[] | null
): ContentInvalidationHint => {
  if (!beforeRenderOrder || !afterRenderOrder || beforeRenderOrder.length !== afterRenderOrder.length) return { kind: 'full' }
  const beforePositions = new Map(beforeRenderOrder.map((layer, index) => [layer.id, index]))
  if (afterRenderOrder.some((layer) => !beforePositions.has(layer.id))) return { kind: 'full' }
  const changedLayers = afterRenderOrder.filter((layer, index) => beforePositions.get(layer.id) !== index)
  if (changedLayers.length === 0) return { kind: 'full' }
  let rect: SelectionRect | null = null
  for (const layer of changedLayers) {
    const bounds = cachedLayerContentBounds(document, layer)
    if (bounds === undefined) return { kind: 'full' }
    if (!bounds) continue
    const expanded = expandLayerStyleInvalidationRect(document, bounds, [layer.id])
    rect = rect ? unionRects(rect, expanded) : expanded
  }
  return rect ? { kind: 'region', rect } : { kind: 'full' }
}

const layerVisibilityInvalidation = (document: SpriteDocument, layer: RasterLayer): ContentInvalidationHint => {
  const bounds = cachedLayerContentBounds(document, layer)
  return bounds
    ? { kind: 'region', rect: expandLayerStyleInvalidationRect(document, bounds, [layer.id]) }
    : { kind: 'full' }
}

const groupVisibilityInvalidation = (document: SpriteDocument, groupId: string): ContentInvalidationHint => {
  if (!normalCompositeLayers(document)) return { kind: 'full' }
  const layerIds = new Set(getLayerIdsInGroup(document, groupId))
  let rect: SelectionRect | null = null
  for (const layer of document.layers) {
    if (!layerIds.has(layer.id)) continue
    const bounds = cachedLayerContentBounds(document, layer)
    if (bounds === undefined) return { kind: 'full' }
    if (!bounds) continue
    const expanded = expandLayerStyleInvalidationRect(document, bounds, [layer.id])
    rect = rect ? unionRects(rect, expanded) : expanded
  }
  return rect ? { kind: 'region', rect } : { kind: 'full' }
}

const layerBlendModeInvalidation = (document: SpriteDocument, layer: RasterLayer): ContentInvalidationHint => {
  const bounds = cachedLayerContentBounds(document, layer)
  return bounds
    ? { kind: 'region', frameId: document.animation?.activeFrameId, rect: expandLayerStyleInvalidationRect(document, bounds, [layer.id]) }
    : { kind: 'full' }
}

const groupBlendModeInvalidation = (document: SpriteDocument, groupId: string): ContentInvalidationHint => {
  const layerIds = new Set(getLayerIdsInGroup(document, groupId))
  let rect: SelectionRect | null = null
  for (const layer of document.layers) {
    if (!layerIds.has(layer.id)) continue
    const bounds = cachedLayerContentBounds(document, layer)
    if (bounds === undefined) return { kind: 'full' }
    if (!bounds) continue
    const expanded = expandLayerStyleInvalidationRect(document, bounds, [layer.id])
    rect = rect ? unionRects(rect, expanded) : expanded
  }
  return rect
    ? { kind: 'region', frameId: document.animation?.activeFrameId, rect }
    : { kind: 'full' }
}

const commitVisibilityChange = (
  session: DocumentSession,
  target: { visible: boolean },
  label: string,
  invalidationForCurrentFrame: () => ContentInvalidationHint,
  affectedLayerIds?: readonly string[],
  refreshPanelForRegion = false
): void => {
  const before = target.visible
  target.visible = !before
  const invalidation = invalidationForCurrentFrame()
  let entry: HistoryEntry
  const apply = (visible: boolean): void => {
    target.visible = visible
    entry.invalidation = invalidationForCurrentFrame()
    if (refreshPanelForRegion && entry.invalidation.kind === 'region') session.layersPanelRevision += 1
  }
  entry = {
    label,
    bytes: 8,
    undo: () => { apply(before) },
    redo: () => { apply(!before) },
    invalidation,
    affectedLayerIds: affectedLayerIds ? [...affectedLayerIds] : undefined,
    requiresAnimationSync: false
  }
  if (refreshPanelForRegion && invalidation.kind === 'region') session.layersPanelRevision += 1
  session.history.push(entry)
  touch(session, true, invalidation)
  recordDocumentOperation(session)
}

const applyLayerRowSelection = (
  session: DocumentSession,
  layerIds: readonly string[],
  groupIds: readonly string[],
  focus: { kind: 'layer' | 'group'; id: string },
  options: { preserveMaskRowSelection?: boolean } = {},
): void => {
  session.layerSelectionExplicit = true
  clearAnimationMaskContext(session, options.preserveMaskRowSelection === true)
  // Selecting a normal layer row leaves Free Tile instance editing. Instance
  // selection is entered explicitly through the instance-layer view or an
  // instance row, so it must not change the meaning of layer-level commands
  // such as Delete.
  session.freeTileInstanceLayerId = null
  clearFreeTileInstanceSelection(session)
  const selectedLayers = [...new Set(layerIds)].filter((id) => session.document.layers.some((layer) => layer.id === id))
  const selectedGroups = [...new Set(groupIds)].filter((id) => session.document.groups.some((group) => group.id === id))
  session.selectedGroupIds = selectedGroups
  if (selectedGroups.length === 1 && selectedLayers.length === 0) {
    session.selectedGroupId = selectedGroups[0]
    // A group row is its own selection target.  Descendant layers are
    // resolved lazily by selectedTransformLayersForSession and group
    // commands; mirroring them into selectedLayerIds makes the timeline and
    // canvas appear to have every child selected as well.
    session.selectedLayerIds = []
  } else {
    session.selectedGroupId = null
    session.selectedLayerIds = selectedLayers
  }
  if (focus.kind === 'layer' && session.document.layers.some((layer) => layer.id === focus.id)) session.document.activeLayerId = focus.id
  else if (focus.kind === 'group') {
    const member = session.document.layers.find((layer) => getLayerIdsInGroup(session.document, focus.id).includes(layer.id))
    if (member) session.document.activeLayerId = member.id
  }
  const activeLayer = session.document.layers.find((layer) => layer.id === session.document.activeLayerId)
  const ownedTilesetId = activeLayer?.kind === 'tilemap'
    ? activeLayer.tilemapTilesetId
    : activeLayer?.kind === 'free-tile' ? activeLayer.freeTileSources?.[0]?.tilesetId : undefined
  const ownedTileset = ownedTilesetId
    ? session.document.tilesets?.find((tileset) => tileset.id === ownedTilesetId)
    : null
  if (ownedTileset) {
    session.selectedTilesetId = ownedTileset.id
    session.selectedTileId = ownedTileset.tileIds.includes(session.selectedTileId ?? '') ? session.selectedTileId : ownedTileset.tileIds[0] ?? null
    session.secondaryTileId = ownedTileset.tileIds.includes(session.secondaryTileId ?? '') ? session.secondaryTileId : ownedTileset.tileIds[0] ?? null
  }
}

const hiddenAncestorGroupsForLayer = (document: SpriteDocument, layer: RasterLayer): LayerGroup[] => {
  const groups: LayerGroup[] = []
  const visited = new Set<string>()
  let groupId = layer.groupId ?? null
  while (groupId && !visited.has(groupId)) {
    visited.add(groupId)
    const group = document.groups.find((candidate) => candidate.id === groupId)
    if (!group) break
    if (group.visible === false) groups.push(group)
    groupId = group.parentGroupId ?? null
  }
  return groups
}

const hiddenAncestorGroupsForGroup = (document: SpriteDocument, group: LayerGroup): LayerGroup[] => {
  const groups: LayerGroup[] = []
  const visited = new Set<string>()
  let groupId = group.parentGroupId ?? null
  while (groupId && !visited.has(groupId)) {
    visited.add(groupId)
    const ancestor = document.groups.find((candidate) => candidate.id === groupId)
    if (!ancestor) break
    if (ancestor.visible === false) groups.push(ancestor)
    groupId = ancestor.parentGroupId ?? null
  }
  return groups
}

const layerOwnsTileset = (layer: RasterLayer, tilesetId: string): boolean =>
  (layer.kind === 'tilemap' && layer.tilemapTilesetId === tilesetId)
  || (layer.kind === 'free-tile' && layer.freeTileSources?.some((source) => source.tilesetId === tilesetId) === true)

const ownerLayerForTileset = (session: DocumentSession, tilesetId: string): RasterLayer | undefined =>
  session.document.layers.find((layer) => layer.id === session.document.activeLayerId && layerOwnsTileset(layer, tilesetId))
  ?? session.document.layers.find((layer) => layerOwnsTileset(layer, tilesetId))

const applyLayerRowRange = (
  session: DocumentSession,
  target: { kind: 'layer' | 'group'; id: string },
  options: { preserveMaskRowSelection?: boolean } = {},
): void => {
  const nodes = buildLayerPanelTree({
    layers: session.document.layers,
    groups: session.document.groups,
    collapsedGroupIds: session.collapsedGroupIds
  })
  const preserveMaskRows = options.preserveMaskRowSelection === true
  const panelRows = preserveMaskRows ? animationLayerPanelSelectionRows(session) : null
  const rowKey = (row: AnimationLayerPanelSelectionRow): string => row.kind === 'mask'
    ? `mask:${row.ownerKind}:${row.id}`
    : `${row.kind}:${row.id}`
  const visibleIds = panelRows ? panelRows.map(rowKey) : nodes.map((node) => node.id)
  const targetKey = panelRows ? `${target.kind}:${target.id}` : target.id
  const currentRows = [...selectedGroupRows(session), ...selectedDirectLayerRows(session)]
  const selectedMaskKey = panelRows ? session.selectedAnimationMaskRowKeys.at(-1) : undefined
  const anchorNormalRow = session.layerSelectionAnchorId
    ? panelRows?.find((row) => row.kind !== 'mask' && row.id === session.layerSelectionAnchorId)
    : undefined
  const anchorKey = selectedMaskKey && panelRows?.some((row) => rowKey(row) === `mask:${selectedMaskKey}`)
    ? `mask:${selectedMaskKey}`
    : anchorNormalRow
      ? rowKey(anchorNormalRow)
      : session.layerSelectionAnchorId && visibleIds.includes(session.layerSelectionAnchorId)
        ? session.layerSelectionAnchorId
      : currentRows.find((id) => panelRows ? panelRows.some((row) => row.kind !== 'mask' && row.id === id) : visibleIds.includes(id)) ?? targetKey
  const anchorIndex = visibleIds.indexOf(anchorKey)
  const targetIndex = visibleIds.indexOf(targetKey)
  if (anchorIndex < 0 || targetIndex < 0) {
    applyLayerRowSelection(session, target.kind === 'layer' ? [target.id] : [], target.kind === 'group' ? [target.id] : [], target)
    return
  }
  const selectedPanelRows = panelRows
    ? panelRows.slice(Math.min(anchorIndex, targetIndex), Math.max(anchorIndex, targetIndex) + 1)
    : null
  const selectedNodes = selectedPanelRows
    ? selectedPanelRows.filter((row): row is Extract<AnimationLayerPanelSelectionRow, { kind: 'layer' | 'group' }> => row.kind !== 'mask')
    : nodes.slice(Math.min(anchorIndex, targetIndex), Math.max(anchorIndex, targetIndex) + 1)
  // A group row is a selectable row in its own right, but its visible range
  // also spans the group's descendants.  When Shift starts on a group and
  // lands on one of its children, include the complete subtree; otherwise a
  // collapsed row ordering (group followed by its topmost child) would leave
  // the remaining children out of the selection.
  const anchorRowId = session.layerSelectionAnchorId
  const anchorGroupId = anchorRowId
    && session.document.groups.some((group) => group.id === session.layerSelectionAnchorId)
    ? session.layerSelectionAnchorId
    : null
  const targetGroupId = target.kind === 'group' ? target.id : null
  const anchorGroupDescendants = anchorGroupId
    ? new Set([anchorGroupId, ...getDescendantGroupIds(session.document, anchorGroupId)])
    : null
  const anchorGroupLayerIds = anchorGroupId ? new Set(getLayerIdsInGroup(session.document, anchorGroupId)) : null
  const targetGroupLayerIds = targetGroupId ? new Set(getLayerIdsInGroup(session.document, targetGroupId)) : null
  const rangeGroupId = anchorGroupId && target.kind === 'layer' && anchorGroupLayerIds?.has(target.id)
    ? anchorGroupId
    : targetGroupId && anchorRowId && targetGroupLayerIds?.has(anchorRowId)
      ? targetGroupId
      : anchorGroupId && targetGroupId && anchorGroupDescendants?.has(targetGroupId)
        ? anchorGroupId
        : null
  const rangeGroupIds = rangeGroupId
    ? new Set([rangeGroupId, ...getDescendantGroupIds(session.document, rangeGroupId)])
    : null
  const rangeLayerIds = rangeGroupId ? new Set(getLayerIdsInGroup(session.document, rangeGroupId)) : null
  const expandedSelectedNodes = rangeGroupId
    ? nodes.filter((node) => (node.kind === 'group' && rangeGroupIds?.has(node.id) === true)
      || (node.kind === 'layer' && rangeLayerIds?.has(node.id) === true))
    : selectedNodes
  applyLayerRowSelection(
    session,
    expandedSelectedNodes.filter((node) => node.kind === 'layer').map((node) => node.id),
    expandedSelectedNodes.filter((node) => node.kind === 'group').map((node) => node.id),
    target,
    { preserveMaskRowSelection: options.preserveMaskRowSelection }
  )
  if (selectedPanelRows) session.selectedAnimationMaskRowKeys = selectedPanelRows
    .filter((row): row is Extract<AnimationLayerPanelSelectionRow, { kind: 'mask' }> => row.kind === 'mask')
    .map((row) => `${row.ownerKind}:${row.id}`)
}

const targetContainerTopIndex = (document: SpriteDocument, groupId: string | null): number => {
  if (!groupId) return document.layers.length
  const members = new Set(getLayerIdsInGroup(document, groupId))
  return document.layers.reduce((last, layer, index) => members.has(layer.id) ? index + 1 : last, 0)
}

const selectedRowInsertionTarget = (session: DocumentSession): LayerPanelRowMoveTarget => {
  const selectedGroups = new Set(selectedGroupRows(session))
  const selectedLayers = new Set(selectedDirectLayerRows(session))
  const row = buildLayerPanelTree({ layers: session.document.layers, groups: session.document.groups })
    .find((node) => node.kind === 'group' ? selectedGroups.has(node.id) : selectedLayers.has(node.id))
  return row
    ? { kind: 'row', rowKind: row.kind, id: row.id, position: 'above' }
    : { kind: 'edge', edge: 'top' }
}

const insertionTargetParent = (document: SpriteDocument, target: LayerPanelRowMoveTarget): string | null => {
  if (target.kind !== 'row' || !target.id || !target.rowKind) return null
  return target.rowKind === 'group'
    ? document.groups.find((group) => group.id === target.id)?.parentGroupId ?? null
    : document.layers.find((layer) => layer.id === target.id)?.groupId ?? null
}

const lockedGroupStructure = (document: SpriteDocument, groupId: string): boolean => {
  const groupIds = new Set([groupId, ...getDescendantGroupIds(document, groupId)])
  return document.groups.some((group) => groupIds.has(group.id) && isGroupEffectivelyLocked(document, group))
    || document.layers.some((layer) => Boolean(layer.groupId && groupIds.has(layer.groupId)) && isLayerEffectivelyLocked(document, layer))
}

const recoveryService = new RecoveryService()

const cloneColorReplacementPalette = (palette: SpriteDocument['palette']): SpriteDocument['palette'] =>
  palette.map((entry) => ({ ...entry, color: { ...entry.color } }))

const colorReplacementPalettesEqual = (left: SpriteDocument['palette'], right: SpriteDocument['palette']): boolean =>
  left.length === right.length && left.every((entry, index) => {
    const candidate = right[index]
    return Boolean(candidate && entry.id === candidate.id && colorEquals(entry.color, candidate.color))
  })

const optionalColorEquals = (left: RgbaColor | null | undefined, right: RgbaColor | null | undefined): boolean =>
  left === right || Boolean(left && right && colorEquals(left, right))

interface ColorReplacementResult {
  edits: PixelEdit[]
  pixelCount: number
  paletteCount: number
  lockedCount: number
}

const applyColorReplacementTarget = (session: DocumentSession, target: ColorReplacementTarget, sourceColor: RgbaColor, replacementColor: RgbaColor): ColorReplacementResult => {
  const edits: PixelEdit[] = []
  const seenPixels = new Set<object>()
  let lockedCount = 0
  const collect = (layer: RasterLayer | null, frameId?: string, selection: SelectionMask | null = null): void => {
    if (!layer || seenPixels.has(layer.pixels)) return
    seenPixels.add(layer.pixels)
    if (isLayerEffectivelyLocked(session.document, layer)) {
      lockedCount += 1
      return
    }
    const edit = replaceLayerColor(session.document, layer, sourceColor, replacementColor, selection)
    if (!edit) return
    if (frameId) edit.frameId = frameId
    edits.push(edit)
  }

  syncActiveAnimationFrame(session.document)
  const timeline = ensureAnimationDocument(session.document)
  if (target === 'palette') {
    let paletteCount = 0
    for (const entry of session.document.palette) {
      if (entry.id === 0 || !colorEquals(entry.color, sourceColor)) continue
      entry.color = { ...replacementColor }
      paletteCount += 1
    }
    if (colorEquals(session.primaryColor, sourceColor)) session.primaryColor = { ...replacementColor }
    if (colorEquals(session.secondaryColor, sourceColor)) session.secondaryColor = { ...replacementColor }
    return { edits, pixelCount: 0, paletteCount, lockedCount }
  }

  if (target === 'layer') {
    collect(activePaintLayer(session), timeline.activeFrameId)
  } else if (target === 'selection') {
    if (session.selection) collect(activePaintLayer(session), timeline.activeFrameId, session.selection)
  } else if (target === 'document') {
    for (const frame of timeline.frames) for (const layer of session.document.layers) collect(animationLayerAtFrame(session.document, layer.id, frame.id), frame.id)
  } else if (target === 'layers') {
    const layerIds = new Set(session.selectedLayerIds)
    for (const frame of timeline.frames) for (const layerId of layerIds) collect(animationLayerAtFrame(session.document, layerId, frame.id), frame.id)
  } else if (target === 'frames') {
    const frameIds = new Set(session.selectedAnimationFrameIds)
    for (const frameId of frameIds) for (const layer of session.document.layers) collect(animationLayerAtFrame(session.document, layer.id, frameId), frameId)
  } else if (target.startsWith('loop-section:')) {
    const sectionId = target.slice('loop-section:'.length)
    const section = timeline.loopSections?.find((candidate) => candidate.id === sectionId)
    const range = section ? resolveAnimationLoopSectionRange(timeline, section) : null
    if (range) {
      for (let frameIndex = range.startIndex; frameIndex <= range.endIndex; frameIndex += 1) {
        const frameId = timeline.frames[frameIndex].id
        for (const layer of session.document.layers) collect(animationLayerAtFrame(session.document, layer.id, frameId), frameId)
      }
    }
  } else {
    for (const key of session.selectedAnimationCellKeys) {
      const cell = parseAnimationCelKey(key)
      if (cell) collect(animationLayerAtFrame(session.document, cell.layerId, cell.frameId), cell.frameId)
    }
  }

  return {
    edits,
    pixelCount: edits.reduce((count, edit) => count + edit.before.size, 0),
    paletteCount: 0,
    lockedCount
  }
}

const restoreColorReplacementPreviewState = (session: DocumentSession, preview: ColorReplacementPreview): void => {
  for (let index = preview.edits.length - 1; index >= 0; index -= 1) revertPixelEdit(session.document, preview.edits[index])
  session.document.palette = cloneColorReplacementPalette(preview.palette)
  session.document.nextColorId = preview.nextColorId
  session.primaryColor = { ...preview.primaryColor }
  session.secondaryColor = { ...preview.secondaryColor }
  syncActiveAnimationFrame(session.document)
}

const invalidateColorReplacementPreview = (session: DocumentSession): void => {
  session.revision += 1
  session.contentRevision += 1
}

const restoreAntiAliasPreviewState = (session: DocumentSession, preview: AntiAliasPreview): void => {
  revertPixelEdit(session.document, preview.edit)
  syncActiveAnimationFrame(session.document)
}

const invalidateAntiAliasPreview = (session: DocumentSession): void => {
  const fromRevision = session.contentRevision
  session.revision += 1
  session.contentRevision += 1
  session.contentInvalidation = { kind: 'full', fromRevision, revision: session.contentRevision }
}

const tr = (key: TranslationKey, params?: TranslationParams): string => translate(loadEditorPreferences().language, key, params)
const persistAnimationPlaybackPreferences = (patch: { animationPlaybackRate?: number; animationPlaybackMode?: AnimationPlaybackMode | null; animationReturnToStart?: boolean }): void => {
  const preferences = loadEditorPreferences()
  saveEditorPreferences({ ...preferences, ...patch })
}
const persistOutlineSettings = (settings: OutlineSettings): void => {
  const preferences = loadEditorPreferences()
  saveEditorPreferences({ ...preferences, outlineSettings: cloneOutlineSettings(settings) })
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('moonsprite:preferences-changed'))
}
const savedOutlineSettingsForSession = (session: DocumentSession): OutlineSettings => {
  const projectSettings = session.document.outlineSettings
    ? normalizeOutlineSettings(session.document.outlineSettings, session.primaryColor)
    : null
  const softwarePreference = loadEditorPreferences().outlineSettings
  const softwareSettings = softwarePreference
    ? normalizeOutlineSettings(softwarePreference, session.primaryColor)
    : null
  return projectSettings ?? softwareSettings ?? defaultOutlineSettings(session.primaryColor)
}
const paletteEditSynchronizationLocked = (): boolean => readStoredString('moonsprite.palette-edit-locked') !== 'false'
const paletteColorSynchronizationEnabled = (): boolean => readStoredString('moonsprite.palette-sync-colors') === 'true'

interface FreeTileRasterPasteResult {
  createdSources: FreeTileSourceLayer[]
  createdTilesets: Tileset[]
  createdInstances: FreeTileInstance[]
  edit: FreeTilePlacementEdit
  pixelCount: number
}

interface FreeTilePasteSelectionState {
  selectedTilesetId: string | null
  selectedTileId: string | null
  secondaryTileId: string | null
  selectedFreeTileInstanceId: string | null
  selectedFreeTileInstanceIds: string[]
  freeTileInstanceSelectionAnchorId: string | null
  freeTileMode: FreeTileDrawingMode
}

const captureFreeTilePasteSelectionState = (session: DocumentSession): FreeTilePasteSelectionState => ({
  selectedTilesetId: session.selectedTilesetId,
  selectedTileId: session.selectedTileId,
  secondaryTileId: session.secondaryTileId,
  selectedFreeTileInstanceId: session.selectedFreeTileInstanceId,
  selectedFreeTileInstanceIds: [...session.selectedFreeTileInstanceIds],
  freeTileInstanceSelectionAnchorId: session.freeTileInstanceSelectionAnchorId,
  freeTileMode: session.freeTileMode
})

const applyFreeTilePasteSelectionState = (session: DocumentSession, state: FreeTilePasteSelectionState): void => {
  session.selectedTilesetId = state.selectedTilesetId
  session.selectedTileId = state.selectedTileId
  session.secondaryTileId = state.secondaryTileId
  session.selectedFreeTileInstanceId = state.selectedFreeTileInstanceId
  session.selectedFreeTileInstanceIds = [...state.selectedFreeTileInstanceIds]
  session.freeTileInstanceSelectionAnchorId = state.freeTileInstanceSelectionAnchorId
  session.freeTileMode = state.freeTileMode
}

const commitFreeTileSourceEditInSession = (
  session: DocumentSession,
  sourceId: string,
  before: FreeTileSourceEditSnapshot,
  after: FreeTileSourceEditSnapshot,
  label: string,
  placementEdit?: FreeTilePlacementEdit,
  selectionEdit?: {
    before: SelectionMask | null
    after: SelectionMask | null
    beforePivot: SelectionPivot | null
    afterPivot: SelectionPivot | null
  }
): HistoryEntry | null => {
  const sourceChanged = !freeTileSourceEditSnapshotsEqual(before, after)
  const placementChanged = Boolean(placementEdit && !freeTileCelDataEqual(placementEdit.before, placementEdit.after))
  const beforeSelection = cloneSelectionMask(selectionEdit?.before ?? null)
  const afterSelection = cloneSelectionMask(selectionEdit?.after ?? null)
  const beforeSelectionPivot = selectionEdit?.beforePivot ? { ...selectionEdit.beforePivot } : null
  const afterSelectionPivot = selectionEdit?.afterPivot ? { ...selectionEdit.afterPivot } : null
  const selectionChanged = Boolean(selectionEdit && (
    !selectionMasksEqual(beforeSelection, afterSelection)
    || beforeSelectionPivot?.x !== afterSelectionPivot?.x
    || beforeSelectionPivot?.y !== afterSelectionPivot?.y
  ))
  if (!sourceChanged && !placementChanged && !selectionChanged) return null
  const owner = freeTileSourceOwnerForId(session.document, sourceId)
  if (!owner || owner.source.id !== before.sourceId || owner.source.id !== after.sourceId) return null
  const applyBefore = (): void => {
    if (placementEdit) applyFreeTilePlacementEdit(session.document, placementEdit, 'before')
    if (sourceChanged) applyFreeTileSourceSnapshot(session.document, before)
    if (selectionEdit) {
      session.selection = cloneSelectionMask(beforeSelection)
      session.selectionPivot = beforeSelectionPivot ? { ...beforeSelectionPivot } : null
    }
  }
  const applyAfter = (): void => {
    if (sourceChanged) applyFreeTileSourceSnapshot(session.document, after)
    if (placementEdit) applyFreeTilePlacementEdit(session.document, placementEdit, 'after')
    if (selectionEdit) {
      session.selection = cloneSelectionMask(afterSelection)
      session.selectionPivot = afterSelectionPivot ? { ...afterSelectionPivot } : null
    }
  }
  applyAfter()
  const contentChanged = sourceChanged || placementChanged
  const entry: HistoryEntry = {
    label,
    bytes: freeTileSourceEditSnapshotBytes(before) + freeTileSourceEditSnapshotBytes(after)
      + (placementEdit ? (placementEdit.before.instances.length + placementEdit.after.instances.length) * 72 : 0)
      + (beforeSelection?.mask?.byteLength ?? 0)
      + (afterSelection?.mask?.byteLength ?? 0)
      + (selectionEdit ? 64 : 0),
    undo: applyBefore,
    redo: applyAfter,
    ...(contentChanged ? { invalidation: { kind: 'full' as const } } : {}),
    affectedLayerIds: freeTileLayerIdsForSource(session.document, owner.source.id),
    documentChanged: contentChanged,
    contentChanged,
    requiresAnimationSync: false
  }
  session.history.push(entry)
  if (contentChanged) {
    touch(session, true, { kind: 'full' })
    recordDocumentOperation(session, { stroke: true })
  }
  return entry
}

const deleteFreeTileSourceSelectionInSession = (session: DocumentSession): HistoryEntry | null => {
  if (!session.selection || session.freeTileMode !== 'edit') return null
  const target = activeFreeTileCelTarget(session.document)
  const instance = target && session.selectedFreeTileInstanceId
    ? target.freeTiles.instances.find((candidate) => candidate.id === session.selectedFreeTileInstanceId) ?? null
    : null
  const source = target && instance ? freeTileSourceForInstance(target.sources, instance) : null
  const sourceLayer = source ? target?.layer.freeTileSources?.find((candidate) => candidate.id === source.id) : null
  if (!target || !instance || !source || sourceLayer?.locked === true || source.visible === false || instance.locked === true || instance.visible === false) return null
  const bounds = freeTileInstanceBounds(instance, target.sources, target.surface.offsetX, target.surface.offsetY)
  const sourceEdit = createFreeTileSourceEditRaster(session.document, source, bounds, { x: session.selection.x, y: session.selection.y }, instance)
  if (!sourceEdit) return null
  const selection = freeTileSelectionToEditRaster(sourceEdit, session.selection)
  const edit = selection ? clearSelection(sourceEdit.document, selection, sourceEdit.layer) : null
  if (!edit) return null
  return commitFreeTileSourceEditInSession(
    session,
    source.id,
    sourceEdit.before,
    freeTileSourceSnapshotFromEditRaster(sourceEdit),
    tr('workspace.history.deleteSelection')
  )
}

const selectionClipboardSurface = (clipboard: SelectionClipboard, x: number, y: number): AnimationCelSurface => {
  const pixels = new Uint8ClampedArray(clipboard.width * clipboard.height * 4)
  for (let index = 0; index < clipboard.pixels.length; index += 1) {
    if (clipboard.mask && clipboard.mask[index] !== 1) continue
    const color = unpackColor(clipboard.pixels[index])
    const offset = index * 4
    pixels[offset] = color.r
    pixels[offset + 1] = color.g
    pixels[offset + 2] = color.b
    pixels[offset + 3] = color.a
  }
  return { format: 'rgba', width: clipboard.width, height: clipboard.height, offsetX: x, offsetY: y, pixels }
}

const pasteRasterSurfaceIntoFreeTileTarget = (
  document: SpriteDocument,
  target: FreeTileCelTarget,
  surface: AnimationCelSurface
): FreeTileRasterPasteResult | null => {
  const stamps = rasterSurfaceToFreeTileStamps(surface, document.palette)
  if (stamps.length === 0) return null
  const existingSources = target.layer.freeTileSources ?? []
  const usedNames = new Set(existingSources.map((source) => source.name))
  const createdSources: FreeTileSourceLayer[] = []
  const createdTilesets: Tileset[] = []
  const createdInstances: FreeTileInstance[] = []
  let sourceNumber = 1
  let pixelCount = 0
  for (const stamp of stamps) {
    while (usedNames.has(tr('workspace.freeTile.sourceName', { index: sourceNumber }))) sourceNumber += 1
    const name = tr('workspace.freeTile.sourceName', { index: sourceNumber })
    sourceNumber += 1
    usedNames.add(name)
    const sourceId = createId('free-tile-source')
    const tileId = createId('tile')
    const tileset = createBlankTileset(createId('tileset'), name, stamp.width, stamp.height, tileId, 1)
    if (!writeTilesetTilePixels(tileset, tileId, stamp.pixels)) return null
    const source: FreeTileSourceLayer = {
      id: sourceId,
      name,
      tilesetId: tileset.id,
      displayColor: defaultFreeTileSourceDisplayColor(existingSources.length + createdSources.length),
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: 'normal',
      offsetX: 0,
      offsetY: 0
    }
    const instance: FreeTileInstance = {
      id: createId('free-tile-instance'),
      sourceId,
      x: stamp.x - target.surface.offsetX,
      y: stamp.y - target.surface.offsetY,
      opacity: 1,
      blendMode: 'normal'
    }
    createdSources.push(source)
    createdTilesets.push(tileset)
    createdInstances.push(instance)
    for (let offset = 3; offset < stamp.pixels.length; offset += 4) if (stamp.pixels[offset] > 0) pixelCount += 1
  }
  replaceFreeTileSetSources(document, target.layer, [...existingSources, ...createdSources])
  document.tilesets = [...(document.tilesets ?? []), ...createdTilesets]
  const before = cloneFreeTileCelData(target.freeTiles)
  const after: FreeTileCelData = { instances: [...before.instances, ...createdInstances] }
  const edit: FreeTilePlacementEdit = { layerId: target.layer.id, frameId: target.cel.frameId, before, after, dirtyRect: null }
  applyFreeTilePlacementEdit(document, edit, 'after')
  return { createdSources, createdTilesets, createdInstances, edit, pixelCount }
}

const pasteSelectionClipboardIntoFreeTile = (
  session: DocumentSession,
  target: FreeTileCelTarget,
  clipboard: SelectionClipboard,
  x: number,
  y: number
): FreeTileRasterPasteResult | null => {
  const layer = target.layer
  const beforeSources = (layer.freeTileSources ?? []).map(cloneFreeTileSourceLayer)
  const beforeSelection = captureFreeTilePasteSelectionState(session)
  const result = pasteRasterSurfaceIntoFreeTileTarget(session.document, target, selectionClipboardSurface(clipboard, x, y))
  if (!result) return null
  const afterSources = (layer.freeTileSources ?? []).map(cloneFreeTileSourceLayer)
  const createdTilesets = result.createdTilesets.map(cloneTileset)
  const createdTilesetIds = new Set(createdTilesets.map((tileset) => tileset.id))
  const selectedSource = result.createdSources.at(-1) ?? null
  const selectedInstance = result.createdInstances.at(-1) ?? null
  const selectedTileset = selectedSource
    ? session.document.tilesets?.find((tileset) => tileset.id === selectedSource.tilesetId) ?? null
    : null
  const selectedTileId = selectedTileset?.tileIds[0] ?? null
  const afterSelection: FreeTilePasteSelectionState = {
    selectedTilesetId: selectedTileset?.id ?? beforeSelection.selectedTilesetId,
    selectedTileId: selectedTileId ?? beforeSelection.selectedTileId,
    secondaryTileId: selectedTileId ?? beforeSelection.secondaryTileId,
    selectedFreeTileInstanceId: selectedInstance?.id ?? beforeSelection.selectedFreeTileInstanceId,
    selectedFreeTileInstanceIds: selectedInstance ? [selectedInstance.id] : [...beforeSelection.selectedFreeTileInstanceIds],
    freeTileInstanceSelectionAnchorId: selectedInstance?.id ?? beforeSelection.freeTileInstanceSelectionAnchorId,
    freeTileMode: selectedSource ? 'edit' : beforeSelection.freeTileMode
  }
  const restoreBefore = (): void => {
    applyFreeTilePlacementEdit(session.document, result.edit, 'before')
    replaceFreeTileSetSources(session.document, layer, beforeSources)
    session.document.tilesets = (session.document.tilesets ?? []).filter((tileset) => !createdTilesetIds.has(tileset.id))
    applyFreeTilePasteSelectionState(session, beforeSelection)
  }
  const restoreAfter = (): void => {
    for (const tileset of createdTilesets) {
      if (!session.document.tilesets?.some((candidate) => candidate.id === tileset.id)) {
        session.document.tilesets = [...(session.document.tilesets ?? []), cloneTileset(tileset)]
      }
    }
    replaceFreeTileSetSources(session.document, layer, afterSources)
    applyFreeTilePlacementEdit(session.document, result.edit, 'after')
    applyFreeTilePasteSelectionState(session, afterSelection)
  }
  applyFreeTilePasteSelectionState(session, afterSelection)
  session.history.push({
    label: tr('workspace.history.pasteToLayer'),
    bytes: createdTilesets.reduce((sum, tileset) => sum + tilemapTilesetBytes(tileset), 0)
      + (beforeSources.length + afterSources.length) * 96
      + (result.edit.before.instances.length + result.edit.after.instances.length) * 72,
    undo: restoreBefore,
    redo: restoreAfter,
    invalidation: { kind: 'full' },
    affectedLayerIds: freeTileLayersForSet(session.document, freeTileSetIdForLayer(layer)).map((candidate) => candidate.id),
    contentChanged: true,
    requiresAnimationSync: false
  })
  touch(session, true, { kind: 'full' })
  recordDocumentOperation(session)
  return result
}

type FreeTileSelectedInstancePasteResult =
  | { status: 'pasted'; pixelCount: number }
  | { status: 'outside' | 'too-large' | 'unavailable'; pixelCount: 0 }

const pasteSelectionClipboardIntoSelectedFreeTileInstance = (
  session: DocumentSession,
  target: FreeTileCelTarget,
  instance: FreeTileInstance,
  clipboard: SelectionClipboard,
  x: number,
  y: number
): FreeTileSelectedInstancePasteResult => {
  const source = freeTileSourceForInstance(target.sources, instance)
  const sourceLayer = source ? target.layer.freeTileSources?.find((candidate) => candidate.id === source.id) : null
  if (!source || source.visible === false || sourceLayer?.locked === true || instance.visible === false || instance.locked === true) {
    return { status: 'unavailable', pixelCount: 0 }
  }
  const bounds = freeTileInstanceBounds(instance, target.sources, target.surface.offsetX, target.surface.offsetY)
  const sourceEdit = createFreeTileSourceEditRaster(session.document, source, bounds, { x, y }, instance)
  if (!sourceEdit) return { status: 'outside', pixelCount: 0 }
  let pixelCount = 0
  for (let sourceY = 0; sourceY < clipboard.height; sourceY += 1) {
    for (let sourceX = 0; sourceX < clipboard.width; sourceX += 1) {
      const sourceIndex = sourceY * clipboard.width + sourceX
      if (clipboard.mask && clipboard.mask[sourceIndex] !== 1) continue
      const localX = x + sourceX - sourceEdit.origin.x
      const localY = y + sourceY - sourceEdit.origin.y
      if (localX < 0 || localY < 0 || localX >= sourceEdit.layer.width || localY >= sourceEdit.layer.height) continue
      writeLayerColor(sourceEdit.document, sourceEdit.layer, localY * sourceEdit.layer.width + localX, unpackColor(clipboard.pixels[sourceIndex]))
      pixelCount += 1
    }
  }
  if (pixelCount === 0) return { status: 'outside', pixelCount: 0 }
  const after = freeTileSourceSnapshotFromEditRaster(sourceEdit)
  if (after.width > MAX_TILE_SIZE || after.height > MAX_TILE_SIZE) return { status: 'too-large', pixelCount: 0 }
  commitFreeTileSourceEditInSession(session, source.id, sourceEdit.before, after, tr('workspace.history.pasteToLayer'))
  const tileId = source.tileset.tileIds[0] ?? null
  session.selectedTilesetId = source.tileset.id
  session.selectedTileId = tileId
  session.secondaryTileId = tileId
  setFreeTileInstanceSelectionState(session, [instance.id], instance.id)
  session.freeTileMode = 'edit'
  return { status: 'pasted', pixelCount }
}

const updatePaletteColorWithSynchronization = (session: DocumentSession, id: number, color: RgbaColor): boolean => {
  const entry = session.document.palette.find((candidate) => candidate.id === id)
  if (!entry || colorEquals(entry.color, color)) return false
  const sourceColor = { ...entry.color }
  if (!paletteColorSynchronizationEnabled() || session.document.colorMode === 'indexed') {
    updatePaletteColorCommand(session, id, color)
    return true
  }

  const label = tr('palette.history.updated')
  session.history.beginCompound()
  updatePaletteColorCommand(session, id, color)
  const result = applyColorReplacementTarget(session, 'document', sourceColor, color)
  for (const edit of result.edits) {
    const history = commitPixelEdit(session.document, edit, label)
    if (history) session.history.push(history)
  }
  session.history.endCompound(label)
  return true
}

const layerMaskClipboard = (mask: LayerMask | undefined): LayerMaskClipboard | undefined => mask ? {
  width: mask.width,
  height: mask.height,
  offsetX: mask.offsetX,
  offsetY: mask.offsetY,
  pixels: new Uint8ClampedArray(mask.pixels)
} : undefined

const layerMaskFromClipboard = (source: LayerMaskClipboard | undefined, ownerId: string): LayerMask | undefined => {
  if (!source) return undefined
  const mask = createAttachedLayerMask(ownerId, source.width, source.height)
  mask.offsetX = source.offsetX
  mask.offsetY = source.offsetY
  mask.pixels.set(source.pixels)
  return mask
}

type AnimationMaskOwnerKind = 'layer' | 'group'
interface AnimationMaskSlotSnapshot {
  ownerId: string
  frameId: string
  ownerKind: AnimationMaskOwnerKind
  mask: LayerMask | null
}

const animationMaskOwnerKind = (document: SpriteDocument, ownerId: string): AnimationMaskOwnerKind | null =>
  document.layers.some((layer) => layer.id === ownerId) ? 'layer' : document.groups.some((group) => group.id === ownerId) ? 'group' : null

const directAnimationMaskAt = (document: SpriteDocument, ownerId: string, frameId: string): LayerMask | null => {
  const timeline = ensureAnimationDocument(document)
  const kind = animationMaskOwnerKind(document, ownerId)
  if (kind === 'layer') return (timeline.layerMasks ?? []).find((entry) => entry.layerId === ownerId && entry.frameId === frameId)?.mask ?? null
  if (kind === 'group') return (timeline.groupMasks ?? []).find((entry) => entry.groupId === ownerId && entry.frameId === frameId)?.mask ?? null
  return null
}

const cloneAnimationMaskForOwner = (source: LayerMask, ownerKind: AnimationMaskOwnerKind, ownerStorageId: string, options: { id?: string; preserveLink?: boolean } = {}): LayerMask => ({
  ...source,
  id: options.id ?? source.id,
  ownerKind: ownerKind === 'layer' ? 'cel' : 'group',
  ownerId: ownerStorageId,
  linkedMaskId: options.preserveLink === false ? null : source.linkedMaskId,
  pixels: new Uint8ClampedArray(source.pixels)
})

const whiteAnimationMaskForOwner = (source: LayerMask, ownerKind: AnimationMaskOwnerKind, ownerStorageId: string): LayerMask => {
  const mask = cloneAnimationMaskForOwner(source, ownerKind, ownerStorageId, { id: createId('mask'), preserveLink: false })
  for (let index = 0; index < mask.pixels.length; index += 4) {
    mask.pixels[index] = 255
    mask.pixels[index + 1] = 255
    mask.pixels[index + 2] = 255
    mask.pixels[index + 3] = 255
  }
  return mask
}

const ensureAnimationCelSlot = (document: SpriteDocument, layerId: string, frameId: string): { cel: AnimationCel; created: boolean } | null => {
  const timeline = ensureAnimationDocument(document)
  const existing = timeline.cels.find((candidate) => candidate.layerId === layerId && candidate.frameId === frameId)
  const layer = document.layers.find((candidate) => candidate.id === layerId)
  if (!layer || !timeline.frames.some((frame) => frame.id === frameId)) return null
  // Every cel belonging to a free-tile layer must carry its own instance
  // container. The source tileset remains owned by the layer and is therefore
  // shared across all animation frames, while instances stay frame-local.
  if (existing) {
    if (layer.kind === 'free-tile' && !existing.freeTiles) existing.freeTiles = createFreeTileCelData()
    return { cel: existing, created: false }
  }
  const cel: AnimationCel = {
    id: createId('cel'),
    layerId,
    frameId,
    opacity: layer.opacity,
    surface: layer.format === 'rgba'
      ? { format: 'rgba', width: 1, height: 1, offsetX: 0, offsetY: 0, pixels: new Uint8ClampedArray(4) }
      : { format: 'indexed', width: 1, height: 1, offsetX: 0, offsetY: 0, pixels: new Uint32Array(1) }
  }
  if (layer.kind === 'free-tile') cel.freeTiles = createFreeTileCelData()
  timeline.cels.push(cel)
  return { cel, created: true }
}

const setAnimationMaskSlot = (document: SpriteDocument, ownerId: string, frameId: string, mask: LayerMask | null): void => {
  const timeline = ensureAnimationDocument(document)
  const ownerKind = animationMaskOwnerKind(document, ownerId)
  if (ownerKind === 'layer') {
    if (!document.layers.some((layer) => layer.id === ownerId) || !timeline.frames.some((frame) => frame.id === frameId)) return
    timeline.layerMasks = (timeline.layerMasks ?? []).filter((entry) => entry.layerId !== ownerId || entry.frameId !== frameId)
    if (mask) timeline.layerMasks.push({ layerId: ownerId, frameId, mask: cloneAnimationMaskForOwner(mask, ownerKind, ownerId) })
    return
  }
  if (ownerKind !== 'group') return
  timeline.groupMasks = (timeline.groupMasks ?? []).filter((entry) => entry.groupId !== ownerId || entry.frameId !== frameId)
  if (mask) {
    timeline.groupMasks.push({ groupId: ownerId, frameId, mask: cloneAnimationMaskForOwner(mask, ownerKind, ownerId) })
  }
}

const animationMaskSlotSnapshot = (document: SpriteDocument, ownerId: string, frameId: string): AnimationMaskSlotSnapshot | null => {
  const ownerKind = animationMaskOwnerKind(document, ownerId)
  if (!ownerKind) return null
  const mask = directAnimationMaskAt(document, ownerId, frameId)
  return { ownerId, frameId, ownerKind, mask: mask ? cloneAnimationMaskForOwner(mask, ownerKind, mask.ownerId) : null }
}

const restoreAnimationMaskSlots = (document: SpriteDocument, snapshots: readonly AnimationMaskSlotSnapshot[]): void => {
  const timeline = ensureAnimationDocument(document)
  for (const snapshot of snapshots) {
    setAnimationMaskSlot(document, snapshot.ownerId, snapshot.frameId, snapshot.mask)
  }
}

const animationMaskOwnerIds = (session: DocumentSession): string[] => buildLayerPanelTree({
  layers: session.document.layers,
  groups: session.document.groups,
  collapsedGroupIds: []
}).map((node) => node.id)

type AnimationLayerPanelSelectionRow =
  | { kind: 'layer'; id: string }
  | { kind: 'group'; id: string }
  | { kind: 'mask'; ownerKind: 'layer' | 'group'; id: string }

const animationLayerPanelSelectionRows = (session: DocumentSession): AnimationLayerPanelSelectionRow[] => {
  const timeline = ensureAnimationDocument(session.document)
  const maskLookup = createAnimationMaskLookup(timeline)
  const maskOwners = new Set<string>()
  for (const cel of timeline.cels) {
    if (maskLookup.has(animationCelKey(cel.layerId, cel.frameId))) maskOwners.add(`layer:${cel.layerId}`)
  }
  for (const entry of timeline.groupMasks ?? []) maskOwners.add(`group:${entry.groupId}`)
  return buildLayerPanelTree({
    layers: session.document.layers,
    groups: session.document.groups,
    collapsedGroupIds: session.collapsedGroupIds
  }).flatMap((node): AnimationLayerPanelSelectionRow[] => {
    const ownerKind = node.kind
    const rows: AnimationLayerPanelSelectionRow[] = []
    if (maskOwners.has(`${ownerKind}:${node.id}`)) rows.push({ kind: 'mask', ownerKind, id: node.id })
    rows.push({ kind: ownerKind, id: node.id })
    return rows
  })
}

const mapAnimationMaskBlock = (session: DocumentSession, sourceKeys: readonly string[], sourceAnchorKey: string, targetOwnerId: string, targetFrameId: string): Array<{ sourceKey: string; targetKey: string }> => {
  const timeline = ensureAnimationDocument(session.document)
  const ownerIds = animationMaskOwnerIds(session)
  const ownerIndexes = new Map(ownerIds.map((id, index) => [id, index]))
  const frameIndexes = new Map(timeline.frames.map((frame, index) => [frame.id, index]))
  const sourceAnchor = parseAnimationCelKey(sourceAnchorKey)
  const targetOwnerIndex = ownerIndexes.get(targetOwnerId) ?? -1
  const targetFrameIndex = frameIndexes.get(targetFrameId) ?? -1
  if (!sourceAnchor || targetOwnerIndex < 0 || targetFrameIndex < 0) return []
  const sourceOwnerIndex = ownerIndexes.get(sourceAnchor.layerId) ?? -1
  const sourceFrameIndex = frameIndexes.get(sourceAnchor.frameId) ?? -1
  if (sourceOwnerIndex < 0 || sourceFrameIndex < 0) return []
  const placements = sourceKeys.flatMap((sourceKey) => {
    const source = parseAnimationCelKey(sourceKey)
    if (!source) return []
    const ownerIndex = ownerIndexes.get(source.layerId) ?? -1
    const frameIndex = frameIndexes.get(source.frameId) ?? -1
    const destinationOwner = ownerIds[targetOwnerIndex + ownerIndex - sourceOwnerIndex]
    const destinationFrame = timeline.frames[targetFrameIndex + frameIndex - sourceFrameIndex]
    return destinationOwner && destinationFrame ? [{ sourceKey, targetKey: animationCelKey(destinationOwner, destinationFrame.id) }] : []
  })
  return placements.length === sourceKeys.length && new Set(placements.map((placement) => placement.targetKey)).size === placements.length ? placements : []
}

const animationMaskPlacementsTargetEmptyLayerCel = (session: DocumentSession, placements: readonly { targetKey: string }[]): boolean => {
  const timeline = ensureAnimationDocument(session.document)
  const celByKey = new Map(timeline.cels.map((cel) => [animationCelKey(cel.layerId, cel.frameId), cel]))
  return placements.some(({ targetKey }) => {
    const target = parseAnimationCelKey(targetKey)
    if (!target || animationMaskOwnerKind(session.document, target.layerId) !== 'layer') return false
    const cel = celByKey.get(targetKey) ?? null
    return !animationCelHasContent(resolveAnimationCel(timeline, cel), session.document.palette)
  })
}

const animationMaskOwnerLocked = (document: SpriteDocument, ownerId: string): boolean => {
  const layer = document.layers.find((candidate) => candidate.id === ownerId)
  if (layer) return isLayerEffectivelyLocked(document, layer)
  const group = document.groups.find((candidate) => candidate.id === ownerId)
  return group ? isGroupEffectivelyLocked(document, group) : true
}

function layerClipboardFromDocument(document: SpriteDocument, layer: RasterLayer, groupKey: string | null = null): LayerClipboard {
  const pixels = new Uint8ClampedArray(layer.width * layer.height * 4)
  for (let y = 0; y < layer.height; y += 1) for (let x = 0; x < layer.width; x += 1) {
    const color = readLayerColorAt(document, layer, layer.offsetX + x, layer.offsetY + y)
    const offset = (y * layer.width + x) * 4
    pixels[offset] = color.r
    pixels[offset + 1] = color.g
    pixels[offset + 2] = color.b
    pixels[offset + 3] = color.a
  }
  const timeline = ensureAnimationDocument(document)
  const paletteById = new Map(document.palette.map((entry) => [entry.id, entry.color]))
  const animationCels = timeline.frames.flatMap((frame, frameIndex) => {
    const cel = timeline.cels.find((candidate) => candidate.layerId === layer.id && candidate.frameId === frame.id)
    const surface = cel?.surface
    if (!surface) return []
    const rgba = new Uint8ClampedArray(surface.width * surface.height * 4)
    if (surface.format === 'rgba') rgba.set(surface.pixels)
    else for (let index = 0; index < surface.pixels.length; index += 1) {
      const color = paletteById.get(surface.pixels[index]) ?? { r: 0, g: 0, b: 0, a: 0 }
      const offset = index * 4
      rgba[offset] = color.r
      rgba[offset + 1] = color.g
      rgba[offset + 2] = color.b
      rgba[offset + 3] = color.a
    }
    return [{
      frameIndex,
      width: surface.width,
      height: surface.height,
      offsetX: surface.offsetX,
      offsetY: surface.offsetY,
      storageOriginX: surface.storageOriginX,
      storageOriginY: surface.storageOriginY,
      zIndex: cel.zIndex,
      opacity: cel.opacity,
      text: cel.text ? cloneTextCelData(cel.text) : undefined,
      tilemap: cel.tilemap ? cloneTilemapCelData(cel.tilemap) : undefined,
      freeTiles: cel.freeTiles ? cloneFreeTileCelData(cel.freeTiles) : undefined,
      pixels: rgba,
      mask: layerMaskClipboard(animationMaskAt(timeline, layer.id, frame.id) ?? undefined)
    }]
  })
  return {
    name: layer.name,
    linkedContentId: layer.linkedContentId,
    kind: layer.kind,
    tilemapTilesetId: layer.tilemapTilesetId,
    freeTileSetId: layer.freeTileSetId,
    freeTileSources: layer.freeTileSources?.map(cloneFreeTileSourceLayer),
    width: layer.width,
    height: layer.height,
    offsetX: layer.offsetX,
    offsetY: layer.offsetY,
    visible: layer.visible,
    locked: layer.locked,
    opacity: layer.opacity,
    blendMode: layer.blendMode,
    clippingMask: layer.clippingMask === true,
    layerStyles: cloneLayerStyles(layer.layerStyles),
    background: layer.background ? { ...layer.background } : undefined,
    displayColor: layer.displayColor ? { ...layer.displayColor } : undefined,
    description: layer.description ?? '',
    groupKey,
    pixels,
    animationCels
  }
}

/** Convert an animation cel to a document-independent RGBA snapshot. Indexed palette
 * ids are meaningful only in the source document, so cross-document payloads never
 * retain them. */
function animationCelClipboardSnapshot(document: SpriteDocument, cel: AnimationCel): AnimationCel {
  const snapshot = cloneAnimationCel(cel)
  if (snapshot.surface?.format === 'indexed') {
    const paletteById = new Map(document.palette.map((entry) => [entry.id, entry.color]))
    const pixels = new Uint8ClampedArray(snapshot.surface.pixels.length * 4)
    for (let index = 0; index < snapshot.surface.pixels.length; index += 1) {
      const color = paletteById.get(snapshot.surface.pixels[index]) ?? { r: 0, g: 0, b: 0, a: 0 }
      const offset = index * 4
      pixels[offset] = color.r
      pixels[offset + 1] = color.g
      pixels[offset + 2] = color.b
      pixels[offset + 3] = color.a
    }
    snapshot.surface = { ...snapshot.surface, format: 'rgba', pixels, runtimeRaster: undefined }
  }
  return snapshot
}

function animationCelForTarget(document: SpriteDocument, layer: RasterLayer, source: AnimationCel): AnimationCel {
  const cel = cloneAnimationCel(source)
  cel.linkedCelId = null
  if (cel.surface?.format === 'rgba' && layer.format === 'rgba' && document.colorMode === 'grayscale') {
    cel.surface = { ...cel.surface, pixels: applyRelativeLuminance(cel.surface.pixels.slice()), runtimeRaster: undefined }
  }
  if (cel.surface?.format === 'rgba' && layer.format === 'indexed') {
    const pixels = Uint32Array.from({ length: cel.surface.width * cel.surface.height }, (_, index) => {
      const offset = index * 4
      return paletteColorIdForCanvas(document, {
        r: cel.surface?.format === 'rgba' ? cel.surface.pixels[offset] : 0,
        g: cel.surface?.format === 'rgba' ? cel.surface.pixels[offset + 1] : 0,
        b: cel.surface?.format === 'rgba' ? cel.surface.pixels[offset + 2] : 0,
        a: cel.surface?.format === 'rgba' ? cel.surface.pixels[offset + 3] : 0
      })
    })
    cel.surface = { ...cel.surface, format: 'indexed', pixels, runtimeRaster: undefined }
  }
  // A cross-file paste may target a different layer kind. Keep the rendered
  // surface as the portable representation, but do not leave special payload
  // metadata attached to an incompatible destination cel.
  if (layer.kind !== 'text') delete cel.text
  if (layer.kind !== 'tilemap') delete cel.tilemap
  if (layer.kind !== 'free-tile') delete cel.freeTiles
  return cel
}

function applyLayerClipboardAnimationCel(
  document: SpriteDocument,
  layer: RasterLayer,
  source: NonNullable<LayerClipboard['animationCels']>[number],
  tilesetIdMap: ReadonlyMap<string, string> = new Map(),
  freeTileSourceIdMap?: ReadonlyMap<string, string>
): void {
  const timeline = ensureAnimationDocument(document)
  const frame = timeline.frames[source.frameIndex]
  const cel = frame ? timeline.cels.find((candidate) => candidate.layerId === layer.id && candidate.frameId === frame.id) : null
  if (!cel) return
  cel.zIndex = normalizeAnimationCelZIndex(source.zIndex)
  cel.opacity = source.opacity ?? layer.opacity
  cel.text = source.text ? cloneTextCelData(source.text) : undefined
  cel.tilemap = source.tilemap ? {
    ...cloneTilemapCelData(source.tilemap),
    cells: source.tilemap.cells.map((cell) => cell ? { ...cell, tilesetId: tilesetIdMap.get(cell.tilesetId) ?? cell.tilesetId } : null)
  } : undefined
  cel.freeTiles = source.freeTiles
    ? {
        instances: source.freeTiles.instances.flatMap((instance) => {
          if (!freeTileSourceIdMap || !instance.sourceId) return [{ ...instance }]
          const sourceId = freeTileSourceIdMap.get(instance.sourceId)
          return sourceId ? [{ ...instance, sourceId, tileId: undefined }] : []
        })
      }
    : undefined
  cel.surface = layer.format === 'rgba'
    ? { format: 'rgba', width: source.width, height: source.height, offsetX: source.offsetX, offsetY: source.offsetY, storageOriginX: source.storageOriginX, storageOriginY: source.storageOriginY, pixels: document.colorMode === 'grayscale' ? applyRelativeLuminance(source.pixels.slice()) : source.pixels.slice() }
    : {
        format: 'indexed', width: source.width, height: source.height, offsetX: source.offsetX, offsetY: source.offsetY, storageOriginX: source.storageOriginX, storageOriginY: source.storageOriginY,
        pixels: Uint32Array.from({ length: source.width * source.height }, (_, index) => {
          const offset = index * 4
          return paletteColorIdForCanvas(document, { r: source.pixels[offset], g: source.pixels[offset + 1], b: source.pixels[offset + 2], a: source.pixels[offset + 3] })
        })
      }
  setAnimationMaskSlot(document, layer.id, frame.id, layerMaskFromClipboard(source.mask, layer.id) ?? null)
}

function pasteCrossDocumentAnimationCels(session: DocumentSession, snapshot: AnimationCelClipboardSnapshot): void {
  const timeline = ensureAnimationDocument(session.document)
  const targetKey = session.selectedAnimationCellKeys.at(-1) ?? animationCelKey(session.document.activeLayerId, timeline.activeFrameId)
  const target = parseAnimationCelKey(targetKey)
  if (!target) return
  const targetLayerIndex = session.document.layers.findIndex((layer) => layer.id === target.layerId)
  const targetFrameIndex = timeline.frames.findIndex((frame) => frame.id === target.frameId)
  if (targetLayerIndex < 0 || targetFrameIndex < 0) return
  const previousActiveFrameId = timeline.activeFrameId
  const previousSelection = [...session.selectedAnimationCellKeys]
  const previousSelectedFrameIds = [...session.selectedAnimationFrameIds]
  const previousSelectionExplicit = session.animationCellSelectionExplicit
  const maxFrameIndex = Math.max(...snapshot.items.map((item) => targetFrameIndex + item.frameIndex - snapshot.anchorFrameIndex))
  const minFrameIndex = Math.min(...snapshot.items.map((item) => targetFrameIndex + item.frameIndex - snapshot.anchorFrameIndex))
  if (minFrameIndex < 0) return
  const appendedFrames = Array.from({ length: Math.max(0, maxFrameIndex - timeline.frames.length + 1) }, () => ({ id: createId('frame'), duration: 100 }))
  if (appendedFrames.length > 0) timeline.frames.push(...appendedFrames)
  ensureAnimationDocument(session.document)
  const destinations = snapshot.items.map((item) => ({
    item,
    layer: session.document.layers[targetLayerIndex + item.layerIndex - snapshot.anchorLayerIndex],
    frame: timeline.frames[targetFrameIndex + item.frameIndex - snapshot.anchorFrameIndex]
  }))
  const resolvedDestinations = destinations.flatMap((destination) => {
    if (!destination.layer || !destination.frame) return []
    const cel = timeline.cels.find((candidate) => candidate.layerId === destination.layer!.id && candidate.frameId === destination.frame!.id)
    return cel ? [{ ...destination, cel }] : []
  })
  if (resolvedDestinations.length !== snapshot.items.length) {
    if (appendedFrames.length > 0) timeline.frames.splice(-appendedFrames.length, appendedFrames.length)
    return
  }
  const before = resolvedDestinations.map(({ cel }) => cloneAnimationCel(cel))
  const beforeMasks = resolvedDestinations.map(({ cel }) => animationMaskSlotSnapshot(session.document, cel.layerId, cel.frameId)).filter((entry): entry is AnimationMaskSlotSnapshot => Boolean(entry))
  const destinationBySourceId = new Map(resolvedDestinations.map(({ item, cel }) => [item.cel.id, cel]))
  const destinationMaskIdBySourceId = new Map(resolvedDestinations.flatMap(({ item }) => item.mask ? [[item.mask.mask.id, createId('mask')] as const] : []))
  for (const { item, layer, cel } of resolvedDestinations) {
    const next = animationCelForTarget(session.document, layer, item.cel)
    cel.linkedCelId = item.cel.linkedCelId ? destinationBySourceId.get(item.cel.linkedCelId)?.id ?? null : null
    cel.zIndex = next.zIndex
    cel.surface = next.surface
    cel.opacity = next.opacity
    cel.text = next.text
    cel.tilemap = next.tilemap
    cel.freeTiles = next.freeTiles
    if (item.mask) {
      const mask = cloneAnimationMaskForOwner(item.mask.mask, 'layer', cel.layerId, { id: destinationMaskIdBySourceId.get(item.mask.mask.id) ?? createId('mask'), preserveLink: false })
      mask.linkedMaskId = item.mask.mask.linkedMaskId ? destinationMaskIdBySourceId.get(item.mask.mask.linkedMaskId) ?? null : null
      setAnimationMaskSlot(session.document, cel.layerId, cel.frameId, mask)
    }
  }
  refreshActiveAnimationFrame(session.document)
  session.activeLayerMaskId = null
  session.selectedAnimationFrameIds = []
  session.animationFrameSelectionAnchorId = null
  session.selectedAnimationCellKeys = resolvedDestinations.map(({ cel }) => animationCelKey(cel.layerId, cel.frameId))
  session.animationCellSelectionAnchorKey = session.selectedAnimationCellKeys.at(-1) ?? null
  session.animationCellSelectionExplicit = true
  const after = resolvedDestinations.map(({ cel }) => cloneAnimationCel(cel))
  const afterMasks = resolvedDestinations.map(({ cel }) => animationMaskSlotSnapshot(session.document, cel.layerId, cel.frameId)).filter((entry): entry is AnimationMaskSlotSnapshot => Boolean(entry))
  const appendedIds = new Set(appendedFrames.map((frame) => frame.id))
  const restore = (snapshotCels: readonly AnimationCel[], masks: readonly AnimationMaskSlotSnapshot[], selection: readonly string[], frameSelection: readonly string[], explicit: boolean): void => {
    const current = ensureAnimationDocument(session.document)
    restoreAnimationCels(session.document, snapshotCels)
    restoreAnimationMaskSlots(session.document, masks)
    current.frames = current.frames.filter((frame) => !appendedIds.has(frame.id))
    current.cels = current.cels.filter((cel) => !appendedIds.has(cel.frameId))
    const fallback = current.frames.find((frame) => frame.id === previousActiveFrameId)?.id ?? current.frames[0]?.id
    if (fallback) activateAnimationFrame(session.document, fallback)
    session.selectedAnimationCellKeys = [...selection]
    session.selectedAnimationFrameIds = [...frameSelection]
    session.animationCellSelectionExplicit = explicit
    refreshActiveAnimationFrame(session.document)
  }
  const selectionAfter = [...session.selectedAnimationCellKeys]
  session.history.push({
    label: tr('workspace.history.pasteAnimationCel'),
    bytes: [...before, ...after].reduce((sum, cel) => sum + (cel.surface?.pixels.byteLength ?? 0), 0) + appendedFrames.length * 32,
    undo: () => restore(before, beforeMasks, previousSelection, previousSelectedFrameIds, previousSelectionExplicit),
    redo: () => {
      const current = ensureAnimationDocument(session.document)
      const index = Math.min(maxFrameIndex, current.frames.length)
      for (const frame of appendedFrames) if (!current.frames.some((candidate) => candidate.id === frame.id)) current.frames.splice(Math.min(index, current.frames.length), 0, { ...frame })
      restoreAnimationCels(session.document, after)
      restoreAnimationMaskSlots(session.document, afterMasks)
      session.selectedAnimationCellKeys = selectionAfter
      session.selectedAnimationFrameIds = []
      session.animationCellSelectionExplicit = true
      refreshActiveAnimationFrame(session.document)
    }
  })
}

function pasteCrossDocumentAnimationFrames(session: DocumentSession, snapshot: AnimationFrameClipboardSnapshot): void {
  const timeline = ensureAnimationDocument(session.document)
  const targetLayers = [...session.document.layers]
  const createdLayers: RasterLayer[] = []
  for (let index = targetLayers.length; index < snapshot.layers.length; index += 1) {
    const source = snapshot.layers[index]
    const layer = createLayer(source.name, source.width, source.height, session.document.colorMode)
    layer.id = createId('layer')
    layer.kind = source.kind
    layer.offsetX = source.offsetX
    layer.offsetY = source.offsetY
    layer.visible = source.visible
    layer.locked = source.locked
    layer.opacity = source.opacity
    layer.blendMode = source.blendMode
    if (source.clippingMask === true) layer.clippingMask = true
    targetLayers.push(layer)
    createdLayers.push(layer)
  }
  if (createdLayers.length > 0) {
    session.document.layers.push(...createdLayers)
    ensureAnimationDocument(session.document)
  }
  const selectedIds = new Set(session.selectedAnimationFrameIds.length ? session.selectedAnimationFrameIds : [timeline.activeFrameId])
  const anchorIndex = Math.max(-1, ...timeline.frames.map((frame, index) => selectedIds.has(frame.id) ? index : -1))
  const insertIndex = anchorIndex + 1
  const insertedFrames = snapshot.frames.map((frame) => ({ id: createId('frame'), duration: frame.duration, ...(frame.disabled === true ? { disabled: true } : {}) }))
  const insertedCelIdBySourceId = new Map<string, string>()
  const insertedCelItems = snapshot.frames.flatMap((sourceFrame, index) => sourceFrame.cels.flatMap((item) => {
    const layer = targetLayers[item.layerIndex]
    if (!layer) return []
    const cel = animationCelForTarget(session.document, layer, item.cel)
    const id = createId('cel')
    insertedCelIdBySourceId.set(item.cel.id, id)
    return [{ source: item.cel, cel: { ...cel, id, layerId: layer.id, frameId: insertedFrames[index].id, linkedCelId: null } }]
  }))
  const insertedCels = insertedCelItems.map(({ source, cel }) => ({
    ...cel,
    linkedCelId: source.linkedCelId ? insertedCelIdBySourceId.get(source.linkedCelId) ?? null : null
  }))
  const destinationLayerMaskIdBySourceId = new Map(snapshot.frames.flatMap((sourceFrame) => sourceFrame.layerMasks.map((item) => [item.mask.mask.id, createId('mask')] as const)))
  const destinationGroupMaskIdBySourceId = new Map(snapshot.frames.flatMap((sourceFrame) => sourceFrame.groupMasks.map((item) => [item.mask.mask.id, createId('mask')] as const)))
  const insertedLayerMasks = snapshot.frames.flatMap((sourceFrame, index) => sourceFrame.layerMasks.flatMap((item) => {
    const layer = targetLayers[item.layerIndex]
    if (!layer) return []
    const mask = cloneAnimationLayerMask(item.mask, layer.id, insertedFrames[index].id, destinationLayerMaskIdBySourceId.get(item.mask.mask.id))
    mask.mask.linkedMaskId = item.mask.mask.linkedMaskId ? destinationLayerMaskIdBySourceId.get(item.mask.mask.linkedMaskId) ?? null : null
    return [mask]
  }))
  const insertedGroupMasks = snapshot.frames.flatMap((sourceFrame, index) => sourceFrame.groupMasks.flatMap((item) => {
    const group = session.document.groups[item.groupIndex]
    if (!group) return []
    const mask = cloneAnimationGroupMask(item.mask, group.id, insertedFrames[index].id, destinationGroupMaskIdBySourceId.get(item.mask.mask.id))
    mask.mask.linkedMaskId = item.mask.mask.linkedMaskId ? destinationGroupMaskIdBySourceId.get(item.mask.mask.linkedMaskId) ?? null : null
    return [mask]
  }))
  const previousActiveFrameId = timeline.activeFrameId
  const previousSelectedFrameIds = [...session.selectedAnimationFrameIds]
  const insertedIds = new Set(insertedFrames.map((frame) => frame.id))
  const restoreCreatedLayers = (present: boolean): void => {
    if (present) {
      const missing = createdLayers.filter((layer) => !session.document.layers.some((candidate) => candidate.id === layer.id))
      if (missing.length > 0) session.document.layers.push(...missing)
      ensureAnimationDocument(session.document)
    } else if (createdLayers.length > 0) {
      const createdIds = new Set(createdLayers.map((layer) => layer.id))
      session.document.layers = session.document.layers.filter((layer) => !createdIds.has(layer.id))
      const currentTimeline = ensureAnimationDocument(session.document)
      currentTimeline.cels = currentTimeline.cels.filter((cel) => !createdIds.has(cel.layerId))
    }
  }
  const applyInserted = (): void => {
    const current = ensureAnimationDocument(session.document)
    current.frames.splice(Math.min(insertIndex, current.frames.length), 0, ...insertedFrames.map((frame) => ({ ...frame })))
    current.cels.push(...insertedCels.map((cel) => cloneAnimationCel(cel)))
    current.layerMasks ??= []
    current.layerMasks.push(...insertedLayerMasks.map((entry) => cloneAnimationLayerMask(entry)))
    current.groupMasks ??= []
    current.groupMasks.push(...insertedGroupMasks.map((entry) => cloneAnimationGroupMask(entry)))
    activateAnimationFrame(session.document, insertedFrames[0]?.id ?? current.activeFrameId)
    session.activeLayerMaskId = null
    session.selectedAnimationFrameIds = [...insertedIds]
    session.animationFrameSelectionAnchorId = insertedFrames.at(-1)?.id ?? null
    session.selectedAnimationCellKeys = []
    session.animationCellSelectionExplicit = false
  }
  applyInserted()
  session.history.push({
    label: tr('workspace.history.pasteAnimationFrame'),
    bytes: insertedCels.reduce((sum, cel) => sum + (cel.surface?.pixels.byteLength ?? 0), 0) + insertedFrames.length * 64,
    undo: () => {
      const current = ensureAnimationDocument(session.document)
      current.frames = current.frames.filter((frame) => !insertedIds.has(frame.id))
      current.cels = current.cels.filter((cel) => !insertedIds.has(cel.frameId))
      current.layerMasks = (current.layerMasks ?? []).filter((entry) => !insertedIds.has(entry.frameId))
      current.groupMasks = (current.groupMasks ?? []).filter((entry) => !insertedIds.has(entry.frameId))
      restoreCreatedLayers(false)
      const fallback = current.frames.find((frame) => frame.id === previousActiveFrameId)?.id ?? current.frames[0]?.id
      if (fallback) activateAnimationFrame(session.document, fallback)
      session.selectedAnimationFrameIds = previousSelectedFrameIds
      session.selectedAnimationCellKeys = []
      session.animationCellSelectionExplicit = false
      refreshActiveAnimationFrame(session.document)
    },
    redo: () => {
      restoreCreatedLayers(true)
      applyInserted()
    }
  })
}

const initialColorRoles = loadColorRolePreferences()

async function buildSpriteSheetResult(sourceSession: DocumentSession, options: SpriteSheetExportOptions) {
  const source = sourceSession.document
  const area = resolveSpriteSheetArea(source, options.area, sourceSession.selection)
  const names = {
    document: tr('workspace.spriteSheet.documentName', { name: source.name }),
    layer: tr('workspace.spriteSheet.layerName')
  }
  const targets = createSpriteSheetExportTargets(source, {
    selectedLayerIds: sourceSession.selectedLayerIds,
    selectedGroupIds: sourceSession.selectedGroupIds,
    selectedFrameIds: sourceSession.selectedAnimationFrameIds
  }, options)
  if (targets.length === 0) throw new Error(tr('workspace.spriteSheet.noTargets'))
  const parts = targets.flatMap((target) => {
    try {
      return [createSpriteSheetDocument(source, names, {
        ...options,
        area,
        selection: options.area === 'selection' ? sourceSession.selection : null,
        frameIds: target.frameIds,
        layerIds: target.layerIds
      })]
    } catch (error) {
      if (options.ignoreEmpty && error instanceof EmptySpriteSheetError) return []
      throw error
    }
  })
  const result = stackSpriteSheetDocuments(parts, names)
  return result
}

export const useWorkspace = create<WorkspaceState>((set, get) => ({
  applySmoothBrushStroke(edit, stroke) {
    const session = activeSession(get())
    if (!session || session.animationPlaying || session.activeLayerMaskId) return false
    const layer = activePaintLayer(session)
    if (layer.id !== edit.layerId || layer.kind || isLayerEffectivelyLocked(session.document, layer) || !isLayerEffectivelyVisible(session.document, layer)) return false
    return applySmoothBrush(session.document, layer, edit, stroke, session.selection, session.smoothStrength)
  },
  cancelSmoothBrushStroke(edit) {
    const session = activeSession(get())
    if (session) revertPixelEdit(session.document, edit)
  },
  sessions: [],
  activeId: null,
  sharedPrimaryColor: { ...initialColorRoles.primary },
  sharedSecondaryColor: { ...initialColorRoles.secondary },
  layerStyleClipboard: null,
  message: null,
  saveProgress: null,
  dialog: null,
  recoveryRecords: [],

  async newDocument(name, width, height, colorMode, recordDrawing = false) {
    try {
      const resource = await window.moonSprite.getResourceInfo()
      const check = checkResourceLimit(width, height, 1, colorMode, resource)
      if (!check.allowed) throw new Error(check.reason)
      const document = createDocument(name || tr('workspace.defaultName'), width, height, colorMode, recordDrawing)
      const previousPaletteId = readStoredString(ACTIVE_PALETTE_ID_STORAGE_KEY)
      if (previousPaletteId) {
        try {
          const listing = await window.moonSprite.listPalettes()
          const previousPalette = listing.palettes.find((palette) => palette.id === previousPaletteId)
          if (previousPalette) applyStoredPaletteToNewDocument(document, previousPalette)
        } catch (error) {
          console.warn('Failed to restore the last selected palette for a new document.', error)
        }
      }
      get().addSession(document)
      recordUsageEvent('newProject')
    } catch (error) {
      set({ message: error instanceof Error ? error.message : tr('workspace.canvasCreateError') })
    }
  },

  async exportSpriteSheet(options: SpriteSheetExportOptions, sourceDocumentId?: string) {
    get().commitFloatingPaste()
    const sourceSession = sourceDocumentId
      ? get().sessions.find((session) => session.document.id === sourceDocumentId) ?? null
      : activeSession(get())
    if (!sourceSession) return false
    try {
      if (options.outputFile && typeof Worker !== 'undefined') {
        const names = {
          document: tr('workspace.spriteSheet.documentName', { name: sourceSession.document.name }),
          layer: tr('workspace.spriteSheet.layerName')
        }
        const path = await exportSpriteSheetFile(window.moonSprite, sourceSession.document, options.name, options.directory, {
          onConflict: createExportConflictHandler(get().requestDialog, false)
        }, {
          options,
          selection: {
            selectedLayerIds: sourceSession.selectedLayerIds,
            selectedGroupIds: sourceSession.selectedGroupIds,
            selectedFrameIds: sourceSession.selectedAnimationFrameIds,
            selection: sourceSession.selection
          },
          names
        })
        if (!path) return false
        set({ message: tr('workspace.spriteSheet.exported', { count: 1 }) })
        recordUsageExport('png-sprite-sheet')
        return true
      }
      const result = await buildSpriteSheetResult(sourceSession, options)
      if (options.outputFile) {
        const path = await exportSpriteSheetFile(window.moonSprite, result.document, options.name, options.directory, {
          onConflict: createExportConflictHandler(get().requestDialog, false)
        })
        if (!path) return false
        set({ message: tr('workspace.spriteSheet.exported', { count: 1 }) })
        recordUsageExport('png-sprite-sheet')
      } else {
        result.document.dirty = true
        get().addSession(result.document)
        set({ message: tr('workspace.spriteSheet.created', { count: 1 }) })
      }
      return true
    } catch (error) {
      set({ message: error instanceof Error ? error.message : tr('workspace.spriteSheet.error') })
      return false
    }
  },

  async previewSpriteSheet(sourceDocumentId, options, previousPreviewDocumentIds) {
    const sourceSession = get().sessions.find((session) => session.document.id === sourceDocumentId)
    if (!sourceSession) return null
    if (get().activeId === sourceDocumentId) get().commitFloatingPaste()
    try {
      const result = await buildSpriteSheetResult(sourceSession, options)
      const previousIds = new Set(previousPreviewDocumentIds)
      for (const documentId of previousIds) flushViewPreview(documentId)
      const currentState = get()
      const previousPreviewSession = currentState.sessions.find((session) => (
        session.document.id === currentState.activeId && previousIds.has(session.document.id)
      )) ?? currentState.sessions.find((session) => previousIds.has(session.document.id))
      result.document.dirty = false
      const previewSession = sessionFromDocument(result.document)
      if (previousPreviewSession) {
        previewSession.view = {
          ...previousPreviewSession.view,
          grid: previousPreviewSession.view.grid ? { ...previousPreviewSession.view.grid } : undefined
        }
        previewSession.viewportSize = { ...previousPreviewSession.viewportSize }
      }
      previewSession.primaryColor = { ...currentState.sharedPrimaryColor }
      previewSession.secondaryColor = { ...currentState.sharedSecondaryColor }
      previewSession.recoverySuppressed = true
      for (const session of currentState.sessions) {
        if (previousIds.has(session.document.id)) documentTransactions.cancelDocument(session.document.id, session)
      }
      set((state) => {
        const sessions = [
          ...state.sessions.filter((session) => !previousIds.has(session.document.id)),
          previewSession
        ]
        return { sessions, activeId: previewSession.document.id }
      })
      requestTilesetPanelVisibility(false)
      return [previewSession.document.id]
    } catch (error) {
      set({ message: error instanceof Error ? error.message : tr('workspace.spriteSheet.error') })
      return null
    }
  },

  closeSpriteSheetPreview(documentIds, preferredActiveId) {
    const ids = new Set(documentIds)
    if (ids.size === 0) return
    for (const session of get().sessions) {
      if (ids.has(session.document.id)) documentTransactions.cancelDocument(session.document.id, session)
    }
    set((state) => {
      const sessions = state.sessions.filter((session) => !ids.has(session.document.id))
      if (!ids.has(state.activeId ?? '')) return { sessions }
      const preferred = sessions.find((session) => session.document.id === preferredActiveId)
      return { sessions, activeId: preferred?.document.id ?? sessions.at(-1)?.document.id ?? null }
    })
    const active = activeSession(get())
    requestTilesetPanelVisibility(documentUsesTilesetPanel(active?.document))
  },

  async resizeActiveCanvas(width, height, anchor, offsetX, offsetY, trimOutside = false) {
    const current = activeSession(get())
    if (!current || !Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1) { set({ message: tr('workspace.canvasSizePositive') }); return }
    try {
      const resource = await window.moonSprite.getResourceInfo()
      const check = checkResourceLimit(width, height, current.document.layers.length, current.document.colorMode, resource)
      if (!check.allowed) throw new Error(check.reason)
      get().mutateActive((session) => {
        const horizontal = offsetX ?? (anchor === 'nw' || anchor === 'w' || anchor === 'sw' ? 0 : anchor === 'ne' || anchor === 'e' || anchor === 'se' ? width - session.document.width : Math.floor((width - session.document.width) / 2))
        const vertical = offsetY ?? (anchor === 'nw' || anchor === 'n' || anchor === 'ne' ? 0 : anchor === 'sw' || anchor === 's' || anchor === 'se' ? height - session.document.height : Math.floor((height - session.document.height) / 2))
        commitCanvasResize(session, width, height, horizontal, vertical, trimOutside, tr('canvasResize.title'))
      })
    } catch (error) {
      set({ message: error instanceof Error ? error.message : tr('workspace.canvasResizeError') })
    }
  },

  async cropActiveCanvas() {
    get().commitFloatingPaste()
    const current = activeSession(get())
    const bounds = current?.selection ? clampSelection(current.document, current.selection) : null
    if (!current || !bounds) { set({ message: tr('workspace.crop.selectionRequired') }); return }
    try {
      const resource = await window.moonSprite.getResourceInfo()
      const check = checkResourceLimit(bounds.width, bounds.height, current.document.layers.length, current.document.colorMode, resource)
      if (!check.allowed) throw new Error(check.reason)
      get().mutateActive((session) => {
        commitCanvasResize(session, bounds.width, bounds.height, -bounds.x, -bounds.y, true, tr('workspace.history.cropCanvas'))
      })
    } catch (error) {
      set({ message: error instanceof Error ? error.message : tr('workspace.canvasResizeError') })
    }
  },

  async trimActiveCanvas() {
    get().commitFloatingPaste()
    const current = activeSession(get())
    if (!current) return
    syncActiveAnimationFrame(current.document)
    const bounds = documentVisibleContentBounds(current.document)
    if (!bounds) { set({ message: tr('workspace.trim.empty') }); return }
    if (bounds.x === 0 && bounds.y === 0 && bounds.width === current.document.width && bounds.height === current.document.height) return
    try {
      const resource = await window.moonSprite.getResourceInfo()
      const check = checkResourceLimit(bounds.width, bounds.height, current.document.layers.length, current.document.colorMode, resource)
      if (!check.allowed) throw new Error(check.reason)
      get().mutateActive((session) => {
        commitCanvasResize(session, bounds.width, bounds.height, -bounds.x, -bounds.y, true, tr('workspace.history.trimCanvas'))
      })
    } catch (error) {
      set({ message: error instanceof Error ? error.message : tr('workspace.canvasResizeError') })
    }
  },

  async resizeActiveImage(width, height, interpolation) {
    const current = activeSession(get())
    if (!current || !Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1) { set({ message: tr('workspace.imageSizePositive') }); return }
    if (current.document.width === width && current.document.height === height) return
    try {
      const resource = await window.moonSprite.getResourceInfo()
      const check = checkResourceLimit(width, height, current.document.layers.length, current.document.colorMode, resource)
      if (!check.allowed) throw new Error(check.reason)
      validateFreeTileImageResize(current.document, width, height)
      get().mutateActive((session) => {
        const before = captureDocumentImageResizeSnapshot(session.document)
        const freeTileResize = captureFreeTileImageResizeState(session.document)
        const beforeSelection = session.selection ? { ...session.selection } : null
        const sourceWidth = session.document.width
        const sourceHeight = session.document.height
        const scaleX = width / sourceWidth
        const scaleY = height / sourceHeight
        resizeDocumentImage(session.document, width, height, interpolation)
        resizeFreeTileDocumentImage(session.document, freeTileResize, interpolation)
        synchronizeLinkedLayerContents(session.document)
        if (beforeSelection) {
          const nextX = Math.floor(beforeSelection.x * scaleX)
          const nextY = Math.floor(beforeSelection.y * scaleY)
          const nextWidth = Math.max(1, Math.ceil((beforeSelection.x + beforeSelection.width) * scaleX) - nextX)
          const nextHeight = Math.max(1, Math.ceil((beforeSelection.y + beforeSelection.height) * scaleY) - nextY)
          const mask = beforeSelection.mask ? new Uint8Array(nextWidth * nextHeight) : undefined
          if (mask && beforeSelection.mask) {
            const sourceX = new Int32Array(nextWidth)
            const sourceY = new Int32Array(nextHeight)
            for (let x = 0; x < nextWidth; x += 1) sourceX[x] = Math.floor((nextX + x + 0.5) / scaleX) - beforeSelection.x
            for (let y = 0; y < nextHeight; y += 1) sourceY[y] = Math.floor((nextY + y + 0.5) / scaleY) - beforeSelection.y
            for (let y = 0; y < nextHeight; y += 1) {
              const localY = sourceY[y]
              if (localY < 0 || localY >= beforeSelection.height) continue
              const sourceRow = localY * beforeSelection.width
              const targetRow = y * nextWidth
              for (let x = 0; x < nextWidth; x += 1) {
                const localX = sourceX[x]
                if (localX >= 0 && localX < beforeSelection.width && beforeSelection.mask[sourceRow + localX]) mask[targetRow + x] = 1
              }
            }
          }
          session.selection = { x: nextX, y: nextY, width: nextWidth, height: nextHeight, mask }
        }
        const after = captureDocumentImageResizeSnapshot(session.document)
        const afterSelection = session.selection ? { ...session.selection } : null
        session.history.push({
          label: tr('imageResize.title'),
          bytes: documentImageResizeSnapshotBytes(before) + documentImageResizeSnapshotBytes(after) + (beforeSelection?.mask?.byteLength ?? 0) + (afterSelection?.mask?.byteLength ?? 0),
          undo: () => { restoreDocumentImageResizeSnapshot(session.document, before); synchronizeLinkedLayerContents(session.document); session.selection = beforeSelection ? { ...beforeSelection } : null },
          redo: () => { restoreDocumentImageResizeSnapshot(session.document, after); synchronizeLinkedLayerContents(session.document); session.selection = afterSelection ? { ...afterSelection } : null },
          requiresAnimationSync: false
        })
      }, 'content')
    } catch (error) {
      set({ message: error instanceof Error ? error.message : tr('workspace.imageResizeError') })
    }
  },

  addSession(document, options) {
    const existing = get().sessions.find((session) => session.document.id === document.id)
    if (existing) return
    const session = sessionFromDocument(document)
    configureLocalHistory(session, window.moonSprite)
    normalizeAnimationSelection(session)
    session.recoveryOriginId = options?.recoveryOriginId ?? null
    session.primaryColor = { ...get().sharedPrimaryColor }
    session.secondaryColor = { ...get().sharedSecondaryColor }
    set((state) => ({ sessions: [...state.sessions, session], activeId: document.id, message: null }))
    requestTilesetPanelVisibility(documentUsesTilesetPanel(document))
  },

  reorderSessions(documentIds) {
    set((state) => {
      const byId = new Map(state.sessions.map((session) => [session.document.id, session]))
      const seen = new Set<string>()
      const ordered = documentIds.flatMap((documentId) => {
        const session = byId.get(documentId)
        if (!session || seen.has(documentId)) return []
        seen.add(documentId)
        return [session]
      })
      for (const session of state.sessions) if (!seen.has(session.document.id)) ordered.push(session)
      return { sessions: ordered }
    })
  },

  setActive(id) {
    const switchStartedAt = runtimeDiagnosticsActive() ? performance.now() : 0
    get().commitFloatingPaste()
    const state = get()
    const current = activeSession(state)
    if (current && current.document.id !== id) documentTransactions.cancelDocument(current.document.id, current)
    const target = state.sessions.find((session) => session.document.id === id)
    // Switching tabs only changes the active document. Cloning the complete
    // sessions array here invalidated every canvas host and made each large
    // document redraw synchronously, even though none of their session data
    // changed.
    set({ activeId: id })
    requestTilesetPanelVisibility(documentUsesTilesetPanel(target?.document))
    if (switchStartedAt) recordRuntimeDiagnostic('operation-stage', 'workspace.tab-switch.store', {
      documentId: id,
      durationMs: Math.round((performance.now() - switchStartedAt) * 100) / 100,
      canvasWidth: target?.document.width ?? 0,
      canvasHeight: target?.document.height ?? 0
    })
  },
  syncCanvasToolSettings(documentId) {
    const state = get()
    const source = activeSession(state)
    const target = state.sessions.find((session) => session.document.id === documentId)
    if (!source || !target || source === target) return
    copyCanvasToolSettings(source, target)
    set({ sessions: [...state.sessions] })
  },
  setTool(tool) {
    if (isCanvasToolGestureLocked()) return
    get().commitFloatingPaste()
    const current = activeSession(get())
    if (current && !isToolAvailableForSession(current, tool)) {
      const groupSelected = current.selectedGroupIds.length > 0 || Boolean(current.selectedGroupId)
      set({ message: tr(groupSelected && tool === 'fill' ? 'workspace.group.fillUnavailable' : 'workspace.text.convertToEditPixels') })
      return
    }
    if (current?.textBoxTransform && tool !== 'selection') get().cancelTextBoxTransform()
    get().mutateActive((session) => {
      if (session.tool === tool) return
      if (session.tool === 'liquify' && tool !== 'liquify') {
        session.liquifyGestureActive = false
        session.liquifyResetHistoryPosition = null
        session.liquifyResetHistoryRevision = null
      }
      if (isBrushTool(session.tool)) rememberBrushProfile(session)
      session.tool = tool
      if (tool !== 'selection') {
        session.selectionPropertiesActive = false
        session.selectionAspectRatio = null
        session.freeTransformActive = false
        session.freeTransformQuad = null
      }
      if (isBrushTool(tool)) applyBrushProfile(session, session.brushProfiles[tool])
    }, false)
  },
  setMoveKind(kind) { get().mutateActive((session) => { session.moveKind = kind }, false) },
  setExtensionTool(id, mode) {
    get().setTool('extension')
    get().mutateActive((session) => { session.extensionToolId = id; session.extensionToolMode = mode }, false)
  },
  setExtensionToolMode(mode) { get().mutateActive((session) => { session.extensionToolMode = mode }, false) },
  selectSlice(id, additive = false) {
    get().mutateActive((session) => {
      const valid = id && session.document.slices?.some((slice) => slice.id === id) ? id : null
      if (!additive) {
        session.selectedSliceId = valid
        session.selectedSliceIds = valid ? [valid] : []
        return
      }
      if (!valid) return
      const ids = selectedSliceIds(session)
      if (ids.includes(valid)) {
        session.selectedSliceIds = ids.filter((candidate) => candidate !== valid)
        session.selectedSliceId = session.selectedSliceIds.at(-1) ?? null
      } else {
        session.selectedSliceIds = [...ids, valid]
        session.selectedSliceId = valid
      }
    }, false)
  },
  selectAllSlices() {
    get().mutateActive((session) => {
      const ids = (session.document.slices ?? []).map((slice) => slice.id)
      session.selectedSliceIds = ids
      session.selectedSliceId = ids.at(-1) ?? null
    }, false)
  },
  createSlice(bounds) {
    let createdId: string | null = null
    get().mutateActive((session) => {
      const beforeSlices = cloneSlices(session.document.slices)
      const beforeSelectedSliceId = session.selectedSliceId
      const beforeSelectedSliceIds = selectedSliceIds(session)
      const id = createId('slice')
      const slice = { id, name: tr('workspace.slice.defaultName', { index: beforeSlices.length + 1 }), ...clampSliceRect(bounds, session.document.width, session.document.height) }
      const afterSlices = [...beforeSlices, slice]
      restoreSlices(session, afterSlices, id, [id])
      session.history.push({
        label: tr('workspace.history.createSlice'),
        bytes: (beforeSlices.length + afterSlices.length) * 48,
        undo: () => restoreSlices(session, beforeSlices, beforeSelectedSliceId, beforeSelectedSliceIds),
        redo: () => restoreSlices(session, afterSlices, id, [id]),
        contentChanged: false,
        requiresAnimationSync: false
      })
      createdId = id
    }, 'metadata')
    return createdId
  },
  createSlices(bounds) {
    const createdIds: string[] = []
    get().mutateActive((session) => {
      if (bounds.length === 0) return
      const beforeSlices = cloneSlices(session.document.slices)
      const beforeSelectedSliceId = session.selectedSliceId
      const beforeSelectedSliceIds = selectedSliceIds(session)
      const created = bounds.map((item, index) => {
        const id = createId('slice')
        createdIds.push(id)
        return { id, name: tr('workspace.slice.defaultName', { index: beforeSlices.length + index + 1 }), ...clampSliceRect(item, session.document.width, session.document.height) }
      })
      const afterSlices = [...beforeSlices, ...created]
      const selectedId = createdIds.at(-1) ?? null
      restoreSlices(session, afterSlices, selectedId, createdIds)
      session.history.push({
        label: tr('workspace.history.createSlices'),
        bytes: (beforeSlices.length + afterSlices.length) * 48,
        undo: () => restoreSlices(session, beforeSlices, beforeSelectedSliceId, beforeSelectedSliceIds),
        redo: () => restoreSlices(session, afterSlices, selectedId, createdIds),
        contentChanged: false,
        requiresAnimationSync: false
      })
    }, 'metadata')
    return createdIds
  },
  updateSlice(id, patch) {
    get().mutateActive((session) => {
      const beforeSlices = cloneSlices(session.document.slices)
      const slice = beforeSlices.find((candidate) => candidate.id === id)
      if (!slice) return
      Object.assign(slice, clampSliceRect({ x: patch.x ?? slice.x, y: patch.y ?? slice.y, width: patch.width ?? slice.width, height: patch.height ?? slice.height }, session.document.width, session.document.height))
      if (patch.name !== undefined) slice.name = sanitizeSliceName(patch.name, slice.name)
      const afterSlices = cloneSlices(beforeSlices)
      const currentSlices = cloneSlices(session.document.slices)
      if (slicesEqual(currentSlices, afterSlices)) return
      const selectedSliceId = session.selectedSliceId
      const selectedIds = selectedSliceIds(session)
      restoreSlices(session, afterSlices, selectedSliceId, selectedIds)
      session.history.push({
        label: tr('workspace.history.updateSlice'),
        bytes: (currentSlices.length + afterSlices.length) * 48,
        undo: () => restoreSlices(session, currentSlices, selectedSliceId, selectedIds),
        redo: () => restoreSlices(session, afterSlices, selectedSliceId, selectedIds),
        contentChanged: false,
        requiresAnimationSync: false
      })
    }, 'metadata')
  },
  updateSlices(patches) {
    get().mutateActive((session) => {
      const beforeSlices = cloneSlices(session.document.slices)
      const afterSlices = beforeSlices.map((slice) => patches[slice.id] ? { ...slice, ...clampSliceRect(patches[slice.id], session.document.width, session.document.height) } : slice)
      if (slicesEqual(beforeSlices, afterSlices)) return
      const beforeSelectedSliceId = session.selectedSliceId
      const beforeSelectedSliceIds = selectedSliceIds(session)
      restoreSlices(session, afterSlices, beforeSelectedSliceId, beforeSelectedSliceIds)
      session.history.push({
        label: tr('workspace.history.updateSlice'),
        bytes: (beforeSlices.length + afterSlices.length) * 48,
        undo: () => restoreSlices(session, beforeSlices, beforeSelectedSliceId, beforeSelectedSliceIds),
        redo: () => restoreSlices(session, afterSlices, beforeSelectedSliceId, beforeSelectedSliceIds),
        contentChanged: false,
        requiresAnimationSync: false
      })
    }, 'metadata')
  },
  duplicateSlices(ids, targets) {
    const createdIds: string[] = []
    get().mutateActive((session) => {
      const beforeSlices = cloneSlices(session.document.slices)
      const beforeSelectedSliceId = session.selectedSliceId
      const beforeSelectedSliceIds = selectedSliceIds(session)
      const sources = ids.flatMap((id) => {
        const source = beforeSlices.find((slice) => slice.id === id)
        return source && targets[id] ? [source] : []
      })
      if (sources.length === 0) return
      const copies = sources.map((source) => {
        const id = createId('slice')
        createdIds.push(id)
        return { ...source, id, ...clampSliceRect(targets[source.id], session.document.width, session.document.height) }
      })
      const afterSlices = [...beforeSlices, ...copies]
      restoreSlices(session, afterSlices, createdIds.at(-1) ?? null, createdIds)
      session.history.push({
        label: tr('workspace.history.duplicateSlice'),
        bytes: (beforeSlices.length + afterSlices.length) * 48,
        undo: () => restoreSlices(session, beforeSlices, beforeSelectedSliceId, beforeSelectedSliceIds),
        redo: () => restoreSlices(session, afterSlices, createdIds.at(-1) ?? null, createdIds),
        contentChanged: false,
        requiresAnimationSync: false
      })
    }, 'metadata')
    return createdIds
  },
  deleteSlice(id) { get().deleteSlices([id]) },
  deleteSlices(ids) {
    get().mutateActive((session) => {
      const deleteIds = new Set(ids)
      const beforeSlices = cloneSlices(session.document.slices)
      if (!beforeSlices.some((slice) => deleteIds.has(slice.id))) return
      const beforeSelectedSliceId = session.selectedSliceId
      const beforeSelectedSliceIds = selectedSliceIds(session)
      const afterSlices = beforeSlices.filter((slice) => !deleteIds.has(slice.id))
      const afterSelectedIds = beforeSelectedSliceIds.filter((id) => !deleteIds.has(id))
      const afterSelectedId = deleteIds.has(beforeSelectedSliceId ?? '') ? afterSelectedIds.at(-1) ?? null : beforeSelectedSliceId
      restoreSlices(session, afterSlices, afterSelectedId, afterSelectedIds)
      session.history.push({
        label: tr('workspace.history.deleteSlice'),
        bytes: (beforeSlices.length + afterSlices.length) * 48,
        undo: () => restoreSlices(session, beforeSlices, beforeSelectedSliceId, beforeSelectedSliceIds),
        redo: () => restoreSlices(session, afterSlices, afterSelectedId, afterSelectedIds),
        contentChanged: false,
        requiresAnimationSync: false
      })
    }, 'metadata')
  },
  setBrushSize(size) { get().mutateActive((session) => { if (session.tool !== 'smooth' && session.brushImage?.intrinsicSize) return; session.brushSize = Math.max(1, Math.min(128, Math.round(size))); rememberBrushProfile(session); persistToolSettings(session) }, false) },
  setBrushAngle(angle) { get().mutateActive((session) => { session.brushAngle = Math.max(-180, Math.min(180, Math.round(angle))); rememberBrushProfile(session); persistToolSettings(session) }, false) },
  setAirbrushParticleRadius(radius) { get().mutateActive((session) => { session.airbrushParticleRadius = Math.max(1, Math.min(16, Math.round(radius))); persistToolSettings(session) }, false) },
  setAirbrushParticleAngle(angle) { get().mutateActive((session) => { session.airbrushParticleAngle = Math.max(-180, Math.min(180, Math.round(angle))); persistToolSettings(session) }, false) },
  setAirbrushParticleShape(shape) { get().mutateActive((session) => { session.airbrushParticleShape = shape; persistToolSettings(session) }, false) },
  setAirbrushScatterRadius(radius) { get().mutateActive((session) => { session.airbrushScatterRadius = Math.max(1, Math.min(64, Math.round(radius))); persistToolSettings(session) }, false) },
  setAirbrushDensity(density) { get().mutateActive((session) => { session.airbrushDensity = Math.max(1, Math.min(128, Math.round(density))); persistToolSettings(session) }, false) },
  setAirbrushIntervalMs(intervalMs) { get().mutateActive((session) => { session.airbrushIntervalMs = Math.max(16, Math.min(1000, Math.round(intervalMs))); persistToolSettings(session) }, false) },
  setLiquifyMode(mode: LiquifyMode) { get().mutateActive((session) => { session.liquifyMode = mode; persistToolSettings(session) }, false) },
  setLiquifyRadius(radius) { get().mutateActive((session) => { session.liquifyRadius = Math.max(1, Math.min(128, Math.round(radius))); persistToolSettings(session) }, false) },
  setLiquifyStrength(strength) { get().mutateActive((session) => { session.liquifyStrength = Math.max(1, Math.min(100, Math.round(strength))); persistToolSettings(session) }, false) },
  setLiquifySmoothing(enabled) { get().mutateActive((session) => { session.liquifySmoothing = enabled; persistToolSettings(session) }, false) },
  setLiquifySmoothingStrength(strength) { if (!Number.isFinite(strength)) return; get().mutateActive((session) => { session.liquifySmoothingStrength = Math.max(0, Math.min(100, Math.round(strength))); persistToolSettings(session) }, false) },
  setSmoothStrength(strength) { if (!Number.isFinite(strength)) return; get().mutateActive((session) => { session.smoothStrength = Math.max(0, Math.min(100, Math.round(strength))); persistToolSettings(session) }, false) },
  setLiquifyGestureActive(active) { get().mutateActive((session) => { session.liquifyGestureActive = active }, false) },
  setLiquifyResetHistoryPosition(position, revision) { get().mutateActive((session) => { session.liquifyResetHistoryPosition = position; session.liquifyResetHistoryRevision = revision }, false) },
  resetLiquify() {
    const session = activeSession(get())
    if (!session || session.tool !== 'liquify' || session.liquifyResetHistoryPosition == null) return false
    const position = session.liquifyResetHistoryPosition
    if (session.history.position <= position) return false
    get().setHistoryPosition(position)
    get().mutateActive((current) => {
      current.liquifyResetHistoryPosition = current.history.position
      current.liquifyResetHistoryRevision = current.history.revision
    }, false)
    return true
  },
  setBrushShape(shape) { get().mutateActive((session) => { session.brushShape = shape; rememberBrushProfile(session); persistToolSettings(session) }, false) },
  setBrushDither(settings: BrushDitherSettings) { get().mutateActive((session) => { session.brushDither = normalizeBrushDitherSettings(settings, session.brushDither ?? defaultToolSettings.brushDither); rememberBrushProfile(session); persistToolSettings(session) }, false) },
  setBrushTexture(texture) { get().mutateActive((session) => { session.brushTexture = texture; rememberBrushProfile(session); persistToolSettings(session) }, false) },
  setBrushTextureScale(scale) { get().mutateActive((session) => { session.brushTextureScale = Math.max(1, Math.min(16, Math.round(scale))); rememberBrushProfile(session); persistToolSettings(session) }, false) },
  setBrushPaintMode(mode) { get().mutateActive((session) => { session.brushPaintMode = mode; rememberBrushProfile(session); persistToolSettings(session) }, false) },
  setInkMode(mode: InkMode) { get().mutateActive((session) => { session.inkMode = mode; if (session.syncInkAcrossTools) for (const tool of Object.keys(session.brushProfiles) as Array<keyof typeof session.brushProfiles>) session.brushProfiles[tool].inkMode = mode; else rememberBrushProfile(session); persistToolSettings(session) }, false) },
  setSyncInkAcrossTools(enabled: boolean) { get().mutateActive((session) => { session.syncInkAcrossTools = enabled; if (enabled) for (const tool of Object.keys(session.brushProfiles) as Array<keyof typeof session.brushProfiles>) session.brushProfiles[tool].inkMode = session.inkMode; persistToolSettings(session) }, false) },
  setBrushDynamicsMapping(effect, patch) {
    let shouldEnableBrushPreview = false
    get().mutateActive((session) => {
      if (session.tool !== 'pencil' && session.tool !== 'eraser') return
      const wasEnabled = brushDynamicsEnabled(session)
      session.brushDynamics = patchBrushDynamicsMapping(session.brushDynamics, effect, patch)
      session.brushPressure = brushPressureFromDynamics(session.brushDynamics)
      shouldEnableBrushPreview = !wasEnabled && brushDynamicsEnabled(session)
      rememberBrushProfile(session)
      persistToolSettings(session)
    }, false)
    if (shouldEnableBrushPreview) enableBrushDynamicsPreview()
  },
  setBrushDynamicsGradientDither(dither) {
    get().mutateActive((session) => {
      if (session.tool !== 'pencil' && session.tool !== 'eraser') return
      session.brushDynamics = patchBrushDynamicsGradientDither(session.brushDynamics, dither)
      rememberBrushProfile(session)
      persistToolSettings(session)
    }, false)
  },
  setBrushPressure(settings) {
    let shouldEnableBrushPreview = false
    get().mutateActive((session) => {
      if (session.tool !== 'pencil' && session.tool !== 'eraser') return
      const wasEnabled = brushDynamicsEnabled(session)
      session.brushPressure = normalizeBrushPressureSettings(settings, session.brushPressure)
      session.brushDynamics = migrateBrushPressureSettings(session.brushPressure)
      shouldEnableBrushPreview = !wasEnabled && brushDynamicsEnabled(session)
      rememberBrushProfile(session)
      persistToolSettings(session)
    }, false)
    if (shouldEnableBrushPreview) enableBrushDynamicsPreview()
  },
  setBrushImage(brush) {
    get().mutateActive((session) => {
      session.brushImage = brush && isProceduralBrushId(brush.id)
        ? createProceduralBrush(brush.id, session.proceduralBrushSettings[brush.id])
        : clearSelectionBrushPaintColors(brush)
      session.brushImageId = brush?.id ?? null
      session.brushImageTemporary = false
      rememberBrushProfile(session)
      persistToolSettings(session)
    }, false)
  },
  setTemporaryBrush(brush) {
    if (isCanvasToolGestureLocked()) return
    get().mutateActive((session) => {
      session.brushImage = { ...brush, colors: brush.colors?.slice(), paintColors: undefined }
      session.brushImageId = brush.id
      session.brushImageTemporary = true
      session.brushPaintMode = 'paint'
      session.selection = null
      session.selectionPivot = null
      session.tool = 'pencil'
      session.brushProfiles.pencil = brushProfileFromSession(session)
    }, false)
  },
  deleteProjectBrush(id) {
    get().mutateActive((session) => {
      const before = session.document.customBrushes ?? []
      if (!before.some((brush) => brush.id === id)) return
      session.document.customBrushes = before.filter((brush) => brush.id !== id)
      if (session.brushImageId === id) {
        session.brushImageId = null
        session.brushImage = null
      }
      rememberBrushProfile(session)
    })
  },
  async createBrushFromSelection() {
    get().commitFloatingPaste()
    const session = activeSession(get())
    if (!session?.selection) { set({ message: tr('workspace.selectionRequired') }); return }
    const documentId = session.document.id
    let brush: ImageBrush | null
    try {
      brush = createSelectionBrush(session.document, session.selection, `temporary-brush-${createId('brush')}`, tr('brush.defaultName'))
    } catch (error) {
      set({ message: error instanceof Error ? error.message : tr('brush.saveError') })
      return
    }
    if (!brush) { set({ message: tr('workspace.brushEmpty') }); return }
    try {
      const stored = await window.moonSprite.saveBrush(brush.name, encodeBrushPng(brush), true, brush.sourceX, brush.sourceY, brushLibraryLocation.getSnapshot())
      publishBrushLibraryChanged()
      if (get().activeId === documentId) {
        get().setTemporaryBrush(brush)
        get().setBrushImage({ ...brush, id: stored.id, name: stored.name, intrinsicSize: true })
      }
      set({ message: tr('workspace.brushSaved') })
    } catch (error) {
      set({ message: error instanceof Error ? error.message : tr('brush.saveError') })
    }
  },
  async createBackgroundPresetFromSelection() {
    get().commitFloatingPaste()
    const session = activeSession(get())
    if (!session?.selection) { set({ message: tr('workspace.selectionRequired') }); return }
    let data: Uint8Array | null
    try {
      data = encodeSelectionBackgroundPreset(session.document, session.selection)
    } catch (error) {
      set({ message: error instanceof Error ? error.message : tr('workspace.backgroundPresetSaveError') })
      return
    }
    if (!data) { set({ message: tr('workspace.backgroundPresetEmpty') }); return }
    try {
      await window.moonSprite.saveBackgroundPreset(tr('backgroundPreset.selectionName'), data)
      set({ message: tr('workspace.backgroundPresetSaved') })
    } catch (error) {
      set({ message: error instanceof Error ? error.message : tr('workspace.backgroundPresetSaveError') })
    }
  },
  setBrushImageSettings(settings) {
    get().mutateActive((session) => {
      const next = { ...session.brushImageSettings, ...settings }
      next.threshold = Math.max(0, Math.min(255, Math.round(next.threshold)))
      next.blackPoint = Math.max(0, Math.min(254, Math.round(next.blackPoint)))
      next.whitePoint = Math.max(next.blackPoint + 1, Math.min(255, Math.round(next.whitePoint)))
      session.brushImageSettings = next
      rememberBrushProfile(session)
      persistToolSettings(session)
    }, false)
  },
  setProceduralBrushSettings(settings) {
    get().mutateActive((session) => {
      const brushId = session.brushImage?.id
      if (!brushId || !isProceduralBrushId(brushId)) return
      const next = normalizeProceduralBrushSettings(brushId, { ...session.proceduralBrushSettings[brushId], ...settings })
      session.proceduralBrushSettings = { ...session.proceduralBrushSettings, [brushId]: next }
      session.brushImage = createProceduralBrush(brushId, next)
      rememberBrushProfile(session)
      persistToolSettings(session)
    }, false)
  },
  setProceduralAntialias(enabled) { get().mutateActive((session) => { session.proceduralAntialias = enabled; rememberBrushProfile(session); persistToolSettings(session) }, false) },
  setProceduralAntialiasStrength(strength) { get().mutateActive((session) => { session.proceduralAntialiasStrength = Math.max(1, Math.min(100, Math.round(strength))); rememberBrushProfile(session); persistToolSettings(session) }, false) },
  setShapeKind(kind) { get().mutateActive((session) => { session.shapeKind = kind; persistToolSettings(session) }, false) },
  setLineKind(kind) { get().mutateActive((session) => { session.lineKind = kind; persistToolSettings(session) }, false) },
  setCurveAnchorCount(count) { get().mutateActive((session) => { session.curveAnchorCount = Math.max(1, Math.min(8, Math.round(count) || 1)); persistToolSettings(session) }, false) },
  setShapeRatio(ratio) {
    get().mutateActive((session) => {
      session.shapeRatio = ratio === null ? null : {
        width: Math.round(Math.max(0.1, Math.min(100, ratio.width)) * 10) / 10,
        height: Math.round(Math.max(0.1, Math.min(100, ratio.height)) * 10) / 10
      }
      persistToolSettings(session)
    }, false)
  },
  setShapeRounded(enabled) { get().mutateActive((session) => { session.shapeRounded = enabled; persistToolSettings(session) }, false) },
  setShapeCornerRadius(radius) { get().mutateActive((session) => { session.shapeCornerRadius = Math.max(0, Math.min(256, Math.round(radius) || 0)); persistToolSettings(session) }, false) },
  setFillMode(mode) {
    get().mutateActive((session) => {
      session.fillMode = mode === 'contiguous' && session.fillMode === 'contiguous' ? 'global' : mode
      persistToolSettings(session)
    }, false)
  },
  setFillKind(kind) { get().mutateActive((session) => { session.fillKind = kind; persistToolSettings(session) }, false) },
  setFillTolerance(tolerance) { get().mutateActive((session) => { session.fillTolerance = Math.max(0, Math.min(255, Math.round(tolerance) || 0)); persistToolSettings(session) }, false) },
  setFillGapClosing(enabled) { get().mutateActive((session) => { session.fillGapClosing = enabled; persistToolSettings(session) }, false) },
  setFillGapThreshold(threshold) { get().mutateActive((session) => { session.fillGapThreshold = normalizeGapClosingThreshold(threshold); persistToolSettings(session) }, false) },
  setFillReference(reference) { get().mutateActive((session) => { session.fillReference = reference; persistToolSettings(session) }, false) },
  setFillConnectivity(connectivity) { get().mutateActive((session) => { session.fillConnectivity = connectivity; persistToolSettings(session) }, false) },
  setGradientTolerance(tolerance) { get().mutateActive((session) => { session.gradientTolerance = Math.max(0, Math.min(255, Math.round(tolerance) || 0)); persistToolSettings(session) }, false) },
  setGradientContiguous(contiguous) { get().mutateActive((session) => { session.gradientContiguous = contiguous; persistToolSettings(session) }, false) },
  setGradientType(type) { get().mutateActive((session) => { session.gradientType = type; persistToolSettings(session) }, false) },
  setGradientDither(dither) { get().mutateActive((session) => { session.gradientDither = dither; persistToolSettings(session) }, false) },
  setGradientFreeform(enabled) { get().mutateActive((session) => { session.gradientFreeform = enabled; if (session.gradientFreeform) session.gradientStops = [{ position: 0, color: { ...session.primaryColor } }, { position: 1, color: { ...session.secondaryColor } }]; persistToolSettings(session) }, false) },
  setGradientStops(stops: GradientStop[]) { get().mutateActive((session) => { session.gradientStops = stops.map((stop) => ({ position: Math.max(0, Math.min(1, stop.position)), color: { ...stop.color } })); persistToolSettings(session) }, false) },
  setMoveAutoSelect(enabled) { get().mutateActive((session) => { session.moveAutoSelect = enabled; persistToolSettings(session) }, false) },
  setPrimaryColor(color) {
    const state = get()
    for (const session of state.sessions) {
      const previous = { ...session.primaryColor }
      const paletteId = session.paletteSelectionId
      const paletteEntry = paletteId === null ? null : session.document.palette.find((entry) => entry.id === paletteId)
      const editLocked = paletteEditSynchronizationLocked()
      const paletteChanged = paletteId !== null && paletteEntry && !editLocked && colorEquals(paletteEntry.color, previous)
        ? updatePaletteColorWithSynchronization(session, paletteId, color)
        : false
      session.primaryColor = { ...color }
      if (session.brushImage?.intrinsicSize) session.brushImage = remapSelectionBrushColors(session.brushImage, session.primaryColor, session.secondaryColor)
      if (paletteChanged && paletteColorSynchronizationEnabled()) {
        touch(session, true, { kind: 'full' })
        recordDocumentOperation(session)
      }
      if (!editLocked) continue
      const matching = paletteEntry && colorEquals(paletteEntry.color, color)
        ? paletteEntry
        : session.document.palette.find((entry) => session.document.paletteOrder.includes(entry.id) && colorEquals(entry.color, color))
      session.paletteSelectionId = matching?.id ?? null
      session.selectedPaletteIds = matching
        ? session.selectedPaletteIds.includes(matching.id) ? session.selectedPaletteIds : [matching.id]
        : []
    }
    persistColorRolePreferences(color, state.sharedSecondaryColor)
    set({ sharedPrimaryColor: { ...color }, sessions: [...state.sessions] })
  },
  setSecondaryColor(color) {
    const state = get()
    for (const session of state.sessions) {
      const previous = { ...session.secondaryColor }
      const paletteId = session.paletteSecondarySelectionId
      const paletteEntry = paletteId === null ? null : session.document.palette.find((entry) => entry.id === paletteId)
      const editLocked = paletteEditSynchronizationLocked()
      const paletteChanged = paletteId !== null && paletteEntry && !editLocked && colorEquals(paletteEntry.color, previous)
        ? updatePaletteColorWithSynchronization(session, paletteId, color)
        : false
      session.secondaryColor = { ...color }
      if (session.brushImage?.intrinsicSize) session.brushImage = remapSelectionBrushColors(session.brushImage, session.primaryColor, session.secondaryColor)
      if (paletteChanged && paletteColorSynchronizationEnabled()) {
        touch(session, true, { kind: 'full' })
        recordDocumentOperation(session)
      }
      if (!editLocked) continue
      const matching = paletteEntry && colorEquals(paletteEntry.color, color)
        ? paletteEntry
        : session.document.palette.find((entry) => session.document.paletteOrder.includes(entry.id) && colorEquals(entry.color, color))
      session.paletteSecondarySelectionId = matching?.id ?? null
    }
    persistColorRolePreferences(state.sharedPrimaryColor, color)
    set({ sharedSecondaryColor: { ...color }, sessions: [...state.sessions] })
  },
  replaceColor(target, sourceColor, replacementColor) {
    const state = get()
    const session = activeSession(state)
    if (!session) return
    if (colorEquals(sourceColor, replacementColor)) {
      set({ message: tr('workspace.colorReplace.sameColor') })
      return
    }
    const beforePalette = cloneColorReplacementPalette(session.document.palette)
    const beforeNextColorId = session.document.nextColorId
    const beforePrimaryColor = { ...session.primaryColor }
    const beforeSecondaryColor = { ...session.secondaryColor }
    const result = applyColorReplacementTarget(session, target, sourceColor, replacementColor)
    const labels: Record<Exclude<ColorReplacementTarget, `loop-section:${string}`>, string> = {
      layer: tr('workspace.history.replaceColorLayer'),
      document: tr('workspace.history.replaceColorDocument'),
      selection: tr('workspace.history.replaceColorSelection'),
      layers: tr('workspace.history.replaceColorLayers'),
      frames: tr('workspace.history.replaceColorFrames'),
      cells: tr('workspace.history.replaceColorCells'),
      palette: tr('workspace.history.replaceColorPalette')
    }
    const label = target.startsWith('loop-section:') ? tr('workspace.history.replaceColorFrames') : labels[target as Exclude<ColorReplacementTarget, `loop-section:${string}`>]
    const entries = result.edits.map((edit) => commitPixelEdit(session.document, edit, label)).filter((entry): entry is HistoryEntry => Boolean(entry))
    const afterPalette = cloneColorReplacementPalette(session.document.palette)
    const afterNextColorId = session.document.nextColorId
    const afterPrimaryColor = { ...session.primaryColor }
    const afterSecondaryColor = { ...session.secondaryColor }
    const paletteChanged = beforeNextColorId !== afterNextColorId || !colorReplacementPalettesEqual(beforePalette, afterPalette)
    if (entries.length === 0 && !paletteChanged) {
      set({ message: tr(result.lockedCount > 0 ? 'workspace.colorReplace.locked' : 'workspace.colorReplace.noMatch') })
      return
    }
    session.history.push({
      label,
      bytes: entries.reduce((sum, entry) => sum + entry.bytes, 0) + (beforePalette.length + afterPalette.length) * 24,
      undo: () => {
        for (let index = entries.length - 1; index >= 0; index -= 1) entries[index].undo()
        session.document.palette = cloneColorReplacementPalette(beforePalette)
        session.document.nextColorId = beforeNextColorId
        session.primaryColor = { ...beforePrimaryColor }
        session.secondaryColor = { ...beforeSecondaryColor }
      },
      redo: () => {
        session.document.palette = cloneColorReplacementPalette(afterPalette)
        session.document.nextColorId = afterNextColorId
        session.primaryColor = { ...afterPrimaryColor }
        session.secondaryColor = { ...afterSecondaryColor }
        for (const entry of entries) entry.redo()
      },
      invalidation: { kind: 'full' }
    })
    syncActiveAnimationFrame(session.document)
    touch(session, true, { kind: 'full' })
    recordDocumentOperation(session)
    set({ sessions: [...state.sessions], message: tr('workspace.colorReplace.done', { count: result.pixelCount + result.paletteCount }) })
  },
  previewColorReplacement(target, sourceColor, replacementColor, previous = null) {
    const state = get()
    const changedSessions = new Set<DocumentSession>()
    if (previous) {
      const previousSession = state.sessions.find((candidate) => candidate.document.id === previous.documentId)
      if (previousSession) {
        restoreColorReplacementPreviewState(previousSession, previous)
        changedSessions.add(previousSession)
      }
    }
    const session = activeSession(state)
    if (!session || colorEquals(sourceColor, replacementColor)) {
      for (const changed of changedSessions) invalidateColorReplacementPreview(changed)
      if (changedSessions.size > 0) set({ sessions: [...state.sessions] })
      return null
    }
    const preview: ColorReplacementPreview = {
      documentId: session.document.id,
      edits: [],
      palette: cloneColorReplacementPalette(session.document.palette),
      nextColorId: session.document.nextColorId,
      primaryColor: { ...session.primaryColor },
      secondaryColor: { ...session.secondaryColor }
    }
    const result = applyColorReplacementTarget(session, target, sourceColor, replacementColor)
    preview.edits = result.edits
    const paletteChanged = preview.nextColorId !== session.document.nextColorId || !colorReplacementPalettesEqual(preview.palette, session.document.palette)
    if (result.edits.length === 0 && !paletteChanged) {
      for (const changed of changedSessions) invalidateColorReplacementPreview(changed)
      if (changedSessions.size > 0) set({ sessions: [...state.sessions] })
      return null
    }
    syncActiveAnimationFrame(session.document)
    changedSessions.add(session)
    for (const changed of changedSessions) invalidateColorReplacementPreview(changed)
    set({ sessions: [...state.sessions] })
    return preview
  },
  restoreColorReplacementPreview(preview) {
    if (!preview) return
    const state = get()
    const session = state.sessions.find((candidate) => candidate.document.id === preview.documentId)
    if (!session) return
    restoreColorReplacementPreviewState(session, preview)
    invalidateColorReplacementPreview(session)
    set({ sessions: [...state.sessions] })
  },
  selectSecondaryPaletteColor(id) {
    get().mutateActive((session) => {
      const entry = session.document.palette.find((candidate) => candidate.id === id)
      if (!entry) return
      session.paletteSecondarySelectionId = id
      session.secondaryColor = { ...entry.color }
    }, false)
    const session = activeSession(get())
    if (session) {
      persistColorRolePreferences(get().sharedPrimaryColor, session.secondaryColor)
      set({ sharedSecondaryColor: { ...session.secondaryColor } })
    }
  },
  swapPrimarySecondaryColors() {
    const state = get()
    const primary = { ...state.sharedPrimaryColor }
    const secondary = { ...state.sharedSecondaryColor }
    for (const session of state.sessions) {
      session.primaryColor = { ...secondary }
      session.secondaryColor = { ...primary }
      const previousPrimaryId = session.paletteSelectionId
      session.paletteSecondarySelectionId = previousPrimaryId
      if (session.brushImage?.intrinsicSize) session.brushImage = remapSelectionBrushColors(session.brushImage, session.primaryColor, session.secondaryColor)
      const matching = session.document.palette.find((entry) => session.document.paletteOrder.includes(entry.id) && colorEquals(entry.color, session.primaryColor))
      session.paletteSelectionId = matching?.id ?? null
      session.selectedPaletteIds = matching
        ? session.selectedPaletteIds.includes(matching.id) ? session.selectedPaletteIds : [matching.id]
        : []
    }
    persistColorRolePreferences(secondary, primary)
    set({ sharedPrimaryColor: secondary, sharedSecondaryColor: primary, sessions: [...state.sessions] })
  },
  setView(view) {
    const state = get()
    const session = activeSession(state)
    if (!session) return
    Object.assign(session.view, view)
    saveDocumentViewState(session.document, session.view, session.symmetryCenter)
    if (persistDisplaySettings(session, view)) touch(session)
    set({ sessions: [...state.sessions] })
  },
  setViewForDocument(documentId, view) {
    const state = get()
    const session = state.sessions.find((item) => item.document.id === documentId)
    if (!session) return
    Object.assign(session.view, view)
    saveDocumentViewState(session.document, session.view, session.symmetryCenter)
    if (persistDisplaySettings(session, view)) touch(session)
    set({ sessions: [...state.sessions] })
  },
  setViewportSize(size) {
    get().mutateActive((session) => {
      session.viewportSize = { width: Math.max(0, size.width), height: Math.max(0, size.height) }
    }, false)
  },
  setViewportSizeForDocument(documentId, size) {
    const state = get()
    const session = state.sessions.find((item) => item.document.id === documentId)
    if (!session) return
    session.viewportSize = { width: Math.max(0, size.width), height: Math.max(0, size.height) }
    set({ sessions: [...state.sessions] })
  },
  setTileRepeatMode(mode) {
    const state = get()
    const session = activeSession(state)
    if (!session) return
    session.view.tileRepeatMode = mode
    if (mode !== 'off') {
      session.view.zoom = tileRepeatFitZoom(
        session.viewportSize.width,
        session.viewportSize.height,
        session.document.width,
        session.document.height,
        mode,
        session.view.rotation
      )
      session.view.panX = 0
      session.view.panY = 0
    }
    set({ sessions: [...state.sessions] })
  },
  setSelection(selection) { get().mutateActive((session) => { session.selection = selection ? { ...selection, mask: selection.mask?.slice() } : null; session.selectionPropertiesActive = false; session.selectionAspectRatio = null; session.selectionAngle = 0; session.selectionPivot = null; session.freeTransformActive = false; session.freeTransformQuad = null }, false) },
  setSelectionPropertiesActive(active) { get().mutateActive((session) => { session.selectionPropertiesActive = Boolean(active); if (!active) session.selectionAspectRatio = null }, false) },
  setSelectionAspectRatio(ratio) { get().mutateActive((session) => { session.selectionAspectRatio = session.freeTransformActive ? null : (typeof ratio === 'number' && Number.isFinite(ratio) && ratio > 0 ? ratio : null) }, false) },
  setSelectionRotationAlgorithm(algorithm: 'fast' | 'rotsprite') { get().mutateActive((session) => { session.selectionRotationAlgorithm = algorithm === 'rotsprite' ? 'rotsprite' : 'fast'; persistToolSettings(session) }, false) },
  updateSelectionProperties(patch) {
    const current = activeSession(get())
    if (!current?.selection) return
    const layer = activePaintLayer(current)
    const pending = current.pendingPaste
    if (layer.kind || isLayerEffectivelyLocked(current.document, layer) || pending?.freeTile) return

    const before = pending?.beforeSelection ? cloneSelectionMask(pending.beforeSelection) : cloneSelectionMask(current.selection)
    const selectedLayers = selectedTransformLayersForSession(current)
    const animationSelectionActive = current.selectedAnimationFrameIds.length > 0 || current.selectedAnimationCellKeys.length > 0
    const states = pending?.layers?.length
      ? pending.layers
      : animationSelectionActive
        ? before
          ? captureAnimationFrameSelectionTransformStates(
              current.document,
              current.selectedAnimationFrameIds,
              selectedLayers.map((candidate) => candidate.id),
              before,
              current.selectedAnimationCellKeys
            )
          : []
        : selectedLayers.length > 1 && before
          ? selectedLayers.flatMap((candidate) => {
              const source = captureSelectionTransform(current.document, before, candidate)
              return source ? [{ layerId: candidate.id, source, previewEdit: null, translationPreview: null }] : []
            })
          : []
    const source = states[0]?.source ?? pending?.source ?? (before ? captureSelectionTransform(current.document, before, layer) : null)
    if (!before || !source) return
    if (states.length > 0 && states.some((state) => {
      const targetLayer = selectionTransformLayerForState(current.document, state)
      return !targetLayer || targetLayer.kind || !isLayerEffectivelyVisible(current.document, targetLayer) || isLayerEffectivelyLocked(current.document, targetLayer)
    })) return
    const currentTarget = pending?.transformTarget ?? {
      x: current.selection.x,
      y: current.selection.y,
      width: current.selection.width,
      height: current.selection.height
    }
    let target = {
      x: Number.isFinite(patch.x) ? Math.round(patch.x!) : currentTarget.x,
      y: Number.isFinite(patch.y) ? Math.round(patch.y!) : currentTarget.y,
      width: Number.isFinite(patch.width) ? Math.max(1, Math.round(patch.width!)) : currentTarget.width,
      height: Number.isFinite(patch.height) ? Math.max(1, Math.round(patch.height!)) : currentTarget.height
    }
    const currentAngle = pending?.transformAngle ?? current.selectionAngle ?? 0
    const currentShear = pending?.transformShear
    const pivot = current.selectionPivot ?? transformedSelectionPivotPreset(currentTarget, 'center', currentAngle, currentShear)
    const hasAnglePatch = Number.isFinite(patch.angle)
    const angle = hasAnglePatch ? Math.round(patch.angle! * 10) / 10 : currentAngle
    if (hasAnglePatch) target = rotateSelectionTargetAroundPivot(target, pivot, angle - currentAngle)
    const nextShearAngle = Number.isFinite(patch.shearAngle)
      ? Math.round(patch.shearAngle! * 10) / 10
      : selectionShearAngle(currentTarget, currentShear)
    let shear = selectionShearForAngle(target, nextShearAngle)
    if (Number.isFinite(patch.shearAngle)) {
      const desiredAmount = shear?.amount ?? 0
      const currentAmount = currentShear?.axis === 'x' ? currentShear.amount : 0
      const points = transformedSelectionControlPoints(target, angle, currentShear)
      const horizontalAxis = { x: points[2].x - points[0].x, y: points[2].y - points[0].y }
      const verticalAxis = { x: points[5].x - points[0].x, y: points[5].y - points[0].y }
      const determinant = horizontalAxis.x * verticalAxis.y - horizontalAxis.y * verticalAxis.x
      const pivotOffset = { x: pivot.x - points[0].x, y: pivot.y - points[0].y }
      const pivotCoordinate = Math.abs(determinant) < 1e-9
        ? 0.5
        : (horizontalAxis.x * pivotOffset.y - horizontalAxis.y * pivotOffset.x) / determinant
      const edge = pivotCoordinate <= 0.5 ? 's' : 'n'
      const edgeDistance = (edge === 's' ? 1 : 0) - pivotCoordinate
      const transformed = Math.abs(edgeDistance) < 1e-9
        ? { target, angle, shear }
        : shearTransformedSelection(target, angle, currentShear, edge, (desiredAmount - currentAmount) * edgeDistance, pivot)
      target = transformed.target
      // shearTransformedSelection derives the final angle from the transformed
      // geometry, so keep the representation and the raster transform aligned.
      if (transformed.angle !== angle) {
        // The selection shear path should preserve the current rotation. This
        // fallback only protects against sub-pixel rounding drift.
        target = rotateSelectionTargetAroundPivot(target, pivot, angle - transformed.angle)
      }
      shear = transformed.shear
    }
    const after = transformSelectionMask(source.selection, target, current.document.width, current.document.height, angle, shear, true)
    if (!after) return
    const same = selectionMasksEqual(current.selection, after)
      && (pending?.transformTarget
        ? pending.transformTarget.x === target.x && pending.transformTarget.y === target.y && pending.transformTarget.width === target.width && pending.transformTarget.height === target.height
        : current.selection.x === target.x && current.selection.y === target.y && current.selection.width === target.width && current.selection.height === target.height)
      && (pending?.transformAngle ?? 0) === angle
      && selectionShearAngle(currentTarget, pending?.transformShear) === nextShearAngle
    if (same) return

    if (pending) restoreFloatingPreview(current)
    if (states.length > 0) {
      const edits = states.flatMap((state) => {
        const edit = applySelectionTransformLayerState(current.document, state, target, angle, false, shear, undefined, undefined, undefined, undefined, current.selectionRotationAlgorithm === 'rotsprite')
        return edit ? [edit] : []
      })
      const primaryEdit = edits[0] ?? null
      if (pending) {
        get().updateFloatingPastePreview(primaryEdit, after, null, target, angle, shear, false, states)
      } else {
        get().beginFloatingSelectionTransform(source, primaryEdit, before, after, false, tr('workspace.history.transformSelectionContent'), null, target, angle, shear, false, undefined, states)
      }
      get().mutateActive((session) => { session.selectionPropertiesActive = true }, false)
      return
    }
    const edit = applySelectionTransform(current.document, source, target, angle, false, shear, undefined, undefined, layer, undefined, undefined, true, current.selectionRotationAlgorithm === 'rotsprite')
    if (pending) {
      get().updateFloatingPastePreview(edit, after, null, target, angle, shear, false)
    } else {
      get().beginFloatingSelectionTransform(source, edit, before, after, false, tr('workspace.history.transformSelectionContent'), null, target, angle, shear, false)
    }
    get().mutateActive((session) => { session.selectionPropertiesActive = true }, false)
  },
  shrinkSelectionToContent() {
    get().commitFloatingPaste()
    const current = activeSession(get())
    if (!current?.selection) { set({ message: tr('workspace.selectionRequired') }); return }
    const layer = activePaintLayer(current)
    const content = layer.kind === 'tilemap' || layer.kind === 'free-tile'
      ? documentVisibleContentBounds(current.document)
      : visibleLayerContentBoundsWithinSelection(current.document, layer, current.selection)
    const next = content ? intersectSelectionRects(current.selection, content) : null
    if (!next) { set({ message: tr('workspace.trim.empty') }); return }
    const after = layer.kind === 'tilemap' || layer.kind === 'free-tile'
      ? rectangularSelection(next)
      : content
    if (selectionMasksEqual(current.selection, after)) return
    get().mutateActive((session) => {
      const before = cloneSelectionMask(session.selection)
      const afterSnapshot = cloneSelectionMask(after)!
      session.selection = afterSnapshot
      session.selectionPropertiesActive = true
      session.selectionAngle = 0
      session.selectionPivot = null
      session.history.push({
        label: tr('toolOptions.shrinkSelection'),
        bytes: 48 + (before?.mask?.byteLength ?? 0),
        undo: () => { session.selection = cloneSelectionMask(before); session.selectionPropertiesActive = true },
        redo: () => { session.selection = cloneSelectionMask(afterSnapshot); session.selectionPropertiesActive = true },
        documentChanged: false,
        contentChanged: false,
        requiresAnimationSync: false
      })
    }, false)
  },
  setSelectionPivot(pivot) { get().mutateActive((session) => { session.selectionPivot = pivot ? { ...pivot } : null }, false) },
  invertSelection() {
    const session = activeSession(get())
    if (!session?.selection) { set({ message: tr('workspace.selectionRequired') }); return }
    const before = cloneSelectionMask(session.selection)
    const after = invertSelectionMask(session.selection, session.document.width, session.document.height)
    get().commitSelectionChange(before, after, tr('app.menu.edit.invertSelection'))
  },
  toggleSelectionOutline() {
    get().mutateActive((session) => {
      session.view.showSelectionOutline = session.view.showSelectionOutline === false
      // 选区描边是视图状态，但切换时必须让合成缓存重新读取浮动粘贴的当前像素。
      session.revision += 1
    }, false)
  },
  beginLayerTransform() {
    if (isCanvasToolGestureLocked()) return
    get().commitFloatingPaste()
    get().cancelTextBoxTransform()
    const session = activeSession(get())
    if (!session) return
    if (activePaintLayer(session).kind === 'free-tile' && session.freeTileMode === 'paint') return
    const layers = selectedTransformLayersForSession(session)
    if (layers.length === 0) {
      set({ message: tr('workspace.transform.selectLayer') })
      return
    }
    if (layers.length > 1 && layers.some((layer) => layer.kind)) {
      set({ message: tr('workspace.transform.multipleUnsupported') })
      return
    }
    if (layers.some((layer) => !isLayerEffectivelyVisible(session.document, layer))) {
      set({ message: tr('workspace.transform.hidden') })
      return
    }
    if (layers.some((layer) => isLayerEffectivelyLocked(session.document, layer))) {
      set({ message: tr('workspace.transform.locked') })
      return
    }
    const layer = layers[0]
    const timeline = ensureAnimationDocument(session.document)
    const textCel = layers.length === 1 && layer.kind === 'text' ? timeline.cels.find((cel) => cel.layerId === layer.id && cel.frameId === timeline.activeFrameId) : null
    const textSource = textCel ? resolveAnimationCel(timeline, textCel) ?? textCel : null
    if (textCel && textSource?.text?.boxWidth && textSource.text.boxHeight && textSource.surface) {
      // Boxed text already exposes its resize handles while selected. Ctrl+T
      // must not create a second transform mode around the same text area.
      return
    }
    const selectedFreeTileInstanceBounds = layers.length === 1
      && layer.kind === 'free-tile'
      && session.freeTileInstanceLayerId === layer.id
      && session.selectedFreeTileInstanceId
      ? (() => {
          const target = activeFreeTileCelTarget(session.document)
          const instance = target?.layer.id === layer.id
            ? target.freeTiles.instances.find((candidate) => candidate.id === session.selectedFreeTileInstanceId) ?? null
            : null
          return target && instance
            ? freeTileInstanceBounds(instance, target.sources, target.surface.offsetX, target.surface.offsetY)
            : null
        })()
      : null
    const contentBounds = selectedFreeTileInstanceBounds ?? layers.reduce<SelectionRect | null>((bounds, candidate) => {
      const candidateBounds = layerContentBounds(session.document, candidate)
      return candidateBounds ? bounds ? unionRects(bounds, candidateBounds) : candidateBounds : bounds
    }, null)
    if (!contentBounds) {
      set({ message: tr('workspace.transform.empty') })
      return
    }
    const visibleBounds = clampSelection(session.document, contentBounds)
    if (!visibleBounds) {
      set({ message: tr('workspace.transform.outside') })
      return
    }
    get().mutateActive((active) => {
      if (isBrushTool(active.tool)) rememberBrushProfile(active)
      active.tool = 'selection'
      active.selection = visibleBounds
      active.selectionKind = 'rectangle'
      active.selectionMode = 'replace'
      active.freeTransformActive = false
      active.freeTransformQuad = null
    }, false)
    set({ message: tr('workspace.transform.started') })
  },
  beginFreeTransform() {
    if (isCanvasToolGestureLocked()) return
    get().commitFloatingPaste()
    get().cancelTextBoxTransform()
    const session = activeSession(get())
    if (!session?.selection) {
      set({ message: tr('workspace.selectionRequired') })
      return
    }
    if (activePaintLayer(session).kind === 'free-tile' && session.freeTileMode === 'paint') return
    const layer = activePaintLayer(session)
    if (!isLayerEffectivelyVisible(session.document, layer)) {
      set({ message: tr('workspace.transform.hidden') })
      return
    }
    if (isLayerEffectivelyLocked(session.document, layer)) {
      set({ message: tr('workspace.transform.locked') })
      return
    }
    get().mutateActive((active) => {
      active.tool = 'selection'
      active.freeTransformActive = true
      active.selectionAspectRatio = null
      active.freeTransformQuad = selectionQuadFromRect(active.selection!)
    }, false)
    set({ message: tr('workspace.transform.freeStarted') })
  },
  beginSelectedTextBoxTransform() {
    const session = activeSession(get())
    if (!session || session.selectedGroupId || session.selectedGroupIds.length > 0 || session.selectedLayerIds.length !== 1) return
    const layer = session.document.layers.find((candidate) => candidate.id === session.selectedLayerIds[0] && candidate.kind === 'text')
    if (!layer || !isLayerEffectivelyVisible(session.document, layer) || isLayerEffectivelyLocked(session.document, layer)) return
    const timeline = ensureAnimationDocument(session.document)
    const cel = timeline.cels.find((candidate) => candidate.layerId === layer.id && candidate.frameId === timeline.activeFrameId)
    const source = resolveAnimationCel(timeline, cel ?? null) ?? cel
    if (!cel || !source?.text?.boxWidth || !source.text.boxHeight || !source.surface) return
    get().mutateActive((active) => {
      active.textBoxTransform = {
        layerId: layer.id,
        frameId: timeline.activeFrameId,
        bounds: {
          x: source.text!.originX ?? source.surface!.offsetX ?? layer.offsetX,
          y: source.text!.originY ?? source.surface!.offsetY ?? layer.offsetY,
          width: source.text!.boxWidth!,
          height: source.text!.boxHeight!
        },
        originalText: cloneTextCelData(source.text!),
        originalSurface: cloneAnimationCelSurface(source.surface!)
      }
    }, false)
  },
  previewTextBoxTransform(bounds) {
    get().mutateActive((session) => {
      const transform = session.textBoxTransform
      if (!transform) return
      const layer = session.document.layers.find((candidate) => candidate.id === transform.layerId && candidate.kind === 'text')
      const timeline = ensureAnimationDocument(session.document)
      const cel = timeline.cels.find((candidate) => candidate.layerId === transform.layerId && candidate.frameId === transform.frameId)
      const source = resolveAnimationCel(timeline, cel ?? null) ?? cel
      if (!layer || !cel || !source?.text) return
      const target = normalizeTextBoxBounds(bounds)
      const rendered = renderTextAtCurrentSurface(session.document, {
        ...source.text,
        originX: target.x,
        originY: target.y,
        boxWidth: target.width,
        boxHeight: target.height
      }, target.x, target.y)
      const surface = convertTextSurface(rendered.rgba, session.document.colorMode, session.document.palette, (color) => paletteColorIdForCanvas(session.document, color))
      applyTextSurface(session.document, layer, source, cel, rendered.data, surface)
      session.textBoxTransform = { ...transform, bounds: target }
      if (timeline.activeFrameId === transform.frameId) refreshActiveAnimationFrame(session.document)
    }, false)
  },
  commitTextBoxTransform(bounds) {
    const current = activeSession(get())
    const transform = current?.textBoxTransform
    if (!current || !transform) return
    const layer = current.document.layers.find((candidate) => candidate.id === transform.layerId && candidate.kind === 'text')
    const timeline = ensureAnimationDocument(current.document)
    const cel = timeline.cels.find((candidate) => candidate.layerId === transform.layerId && candidate.frameId === transform.frameId)
    const source = resolveAnimationCel(timeline, cel ?? null) ?? cel
    if (!layer || !cel || !source?.text || !source.surface) return
    const beforeText = cloneTextCelData(transform.originalText)
    const beforeSurface = cloneAnimationCelSurface(transform.originalSurface)
    const target = normalizeTextBoxBounds(bounds)
    get().previewTextBoxTransform(target)
    get().mutateActive((session) => {
      const activeTransform = session.textBoxTransform
      if (!activeTransform) return
      const activeLayer = session.document.layers.find((candidate) => candidate.id === activeTransform.layerId && candidate.kind === 'text')
      const activeTimeline = ensureAnimationDocument(session.document)
      const activeCel = activeTimeline.cels.find((candidate) => candidate.layerId === activeTransform.layerId && candidate.frameId === activeTransform.frameId)
      const activeSource = resolveAnimationCel(activeTimeline, activeCel ?? null) ?? activeCel
      if (!activeLayer || !activeCel || !activeSource?.text || !activeSource.surface) return
      const afterText = cloneTextCelData(activeSource.text)
      const afterSurface = cloneAnimationCelSurface(activeSource.surface)
      const restore = (text: TextCelData, surface: AnimationCelSurface): void => {
        applyTextSurface(session.document, activeLayer, activeSource, activeCel, cloneTextCelData(text), cloneAnimationCelSurface(surface))
        if (activeTimeline.activeFrameId === activeTransform.frameId) refreshActiveAnimationFrame(session.document)
      }
      session.textBoxTransform = null
      session.history.push({
        label: tr('workspace.history.transformSelectionContent'),
        bytes: beforeSurface.pixels.byteLength + afterSurface.pixels.byteLength + 128,
        undo: () => restore(beforeText, beforeSurface),
        redo: () => restore(afterText, afterSurface)
      })
    })
  },
  cancelTextBoxTransform() {
    get().mutateActive((session) => {
      const transform = session.textBoxTransform
      if (!transform) return
      const layer = session.document.layers.find((candidate) => candidate.id === transform.layerId && candidate.kind === 'text')
      const timeline = ensureAnimationDocument(session.document)
      const cel = timeline.cels.find((candidate) => candidate.layerId === transform.layerId && candidate.frameId === transform.frameId)
      const source = resolveAnimationCel(timeline, cel ?? null) ?? cel
      if (layer && cel && source) {
        applyTextSurface(session.document, layer, source, cel, cloneTextCelData(transform.originalText), cloneAnimationCelSurface(transform.originalSurface))
        if (timeline.activeFrameId === transform.frameId) refreshActiveAnimationFrame(session.document)
      }
      session.textBoxTransform = null
    }, false)
  },
  setSelectionKind(kind) { get().mutateActive((session) => { session.selectionKind = kind; persistToolSettings(session) }, false) },
  setSelectionMode(mode) { get().mutateActive((session) => { session.selectionMode = mode; persistToolSettings(session) }, false) },
  setSelectionRounded(enabled) { get().mutateActive((session) => { session.selectionRounded = enabled; persistToolSettings(session) }, false) },
  setSelectionCornerRadius(radius) { get().mutateActive((session) => { session.selectionCornerRadius = Math.max(0, Math.min(256, Math.round(radius) || 0)); persistToolSettings(session) }, false) },
  setWandTolerance(tolerance) { get().mutateActive((session) => { session.wandTolerance = Math.max(0, Math.min(255, Math.round(tolerance) || 0)); persistToolSettings(session) }, false) },
  setWandContiguous(contiguous) { get().mutateActive((session) => { session.wandContiguous = contiguous; persistToolSettings(session) }, false) },
  setWandGapClosing(enabled) { get().mutateActive((session) => { session.wandGapClosing = enabled; persistToolSettings(session) }, false) },
  setWandGapThreshold(threshold) { get().mutateActive((session) => { session.wandGapThreshold = normalizeGapClosingThreshold(threshold); persistToolSettings(session) }, false) },
  setPerfectPixels(enabled) { get().mutateActive((session) => { session.perfectPixels = enabled; persistToolSettings(session) }, false) },
  setSymmetryAxis(axis, enabled) {
    get().mutateActive((session) => {
      const initialized = session.symmetryAxesInitialized ?? {
        horizontal: Boolean(session.symmetryAxes.horizontal),
        vertical: Boolean(session.symmetryAxes.vertical),
        diagonalUp: Boolean(session.symmetryAxes.diagonalUp),
        diagonalDown: Boolean(session.symmetryAxes.diagonalDown),
        rotational: Boolean(session.symmetryAxes.rotational)
      }
      if (enabled && !session.symmetryAxes[axis] && !initialized[axis] && !Object.values(session.symmetryAxes).some(Boolean)) {
        session.symmetryCenter = defaultSymmetryCenter(session.document.width, session.document.height)
      }
      session.symmetryAxesInitialized = { ...initialized, [axis]: initialized[axis] || enabled }
      session.symmetryAxes = { ...session.symmetryAxes, [axis]: enabled }
      saveDocumentViewState(session.document, session.view, session.symmetryCenter)
      persistToolSettings(session)
    }, false)
  },
  setSymmetryCenter(center) { get().mutateActive((session) => { session.symmetryCenter = { ...center }; saveDocumentViewState(session.document, session.view, session.symmetryCenter) }, false) },
  resetSymmetryCenter() { get().mutateActive((session) => { session.symmetryCenter = { x: session.document.width / 2, y: session.document.height / 2 }; saveDocumentViewState(session.document, session.view, session.symmetryCenter) }, false) },
  setLastPencilPoint(point) { get().mutateActive((session) => { session.lastPencilPoint = point ? { ...point } : null }, false) },
  setLastEraserPoint(point) { get().mutateActive((session) => { session.lastEraserPoint = point ? { ...point } : null }, false) },
  setCanvasResizePreview(preview) {
    const session = activeSession(get())
    const current = session?.canvasResizePreview
    if (current?.width === preview?.width && current?.height === preview?.height && current?.offsetX === preview?.offsetX && current?.offsetY === preview?.offsetY) return
    get().mutateActive((active) => { active.canvasResizePreview = preview ? { ...preview } : null }, false)
  },
  setOutlinePreview(preview) {
    get().mutateActive((session) => { session.outlinePreview = preview ? { ...preview, color: { ...preview.color }, backgroundColor: { ...preview.backgroundColor }, directions: { ...preview.directions } } : null }, false)
  },
  commitSelectionChange(before, after, label, options = {}) {
    const selectionCommitStartedAt = typeof window !== 'undefined' && window.__moonSpriteCanvasProbe?.recordOperationStage ? performance.now() : 0
    const sameMask = before?.mask === after?.mask
      || (before?.mask?.length === after?.mask?.length
        && (before?.mask?.length ?? 0) < 1_000_000
        && before?.mask?.every((value, index) => value === after?.mask?.[index]))
    const same = before?.x === after?.x && before?.y === after?.y && before?.width === after?.width && before?.height === after?.height && sameMask
    if (same || (!before && !after)) {
      if (selectionCommitStartedAt) window.__moonSpriteCanvasProbe?.recordOperationStage?.('selection.commit-skip', performance.now() - selectionCommitStartedAt)
      return
    }
    get().mutateActive((session) => {
      const resetTimelineSelection = options.resetTimelineSelection === true
        && !session.activeLayerMaskId
        && (session.selectedAnimationFrameIds.length > 0
          || session.selectedAnimationCellKeys.length > 0
          || session.selectedAnimationMaskCellKeys.length > 0
          || session.selectedAnimationMaskRowKeys.length > 0
          || session.selectedLayerIds.length > 1
          || session.selectedGroupIds.length > 0
          || session.selectedGroupId !== null)
      const snapshot = (value: SelectionMask | null): SelectionMask | null => value ? { ...value } : null
      const beforeSnapshot = snapshot(before)
      const afterSnapshot = snapshot(after)
      session.selection = afterSnapshot
      session.selectionPropertiesActive = false
      session.selectionAspectRatio = null
      session.selectionAngle = 0
      session.selectionPivot = null
      session.freeTransformActive = false
      session.freeTransformQuad = null
      if (resetTimelineSelection) {
        const activeLayerId = session.document.activeLayerId
        clearAnimationItemSelection(session)
        session.selectedGroupId = null
        session.selectedGroupIds = []
        session.selectedLayerIds = activeLayerId ? [activeLayerId] : []
        session.layerSelectionExplicit = false
        session.layerSelectionAnchorId = activeLayerId
        session.selectionGuidesPreservedAtContentRevision = undefined
      }
      const entry: HistoryEntry = {
        label,
        bytes: 48 + (before?.mask?.byteLength ?? 0) + (after?.mask?.byteLength ?? 0),
        undo: () => { session.selection = snapshot(beforeSnapshot); session.selectionPivot = null },
        redo: () => { session.selection = snapshot(afterSnapshot); session.selectionPivot = null },
        documentChanged: false,
        contentChanged: false,
        requiresAnimationSync: false
      }
      // Timeline selection is intentionally not part of this deselect history.
      // Once Ctrl+D has ended a transformed multi-selection, undoing the canvas
      // selection must not resurrect the stale multi-target editing context.
      session.history.push(entry)
    }, false)
    if (selectionCommitStartedAt) window.__moonSpriteCanvasProbe?.recordOperationStage?.('selection.commit-total', performance.now() - selectionCommitStartedAt, {
      beforeBytes: before?.mask?.byteLength ?? 0,
      afterBytes: after?.mask?.byteLength ?? 0
    })
  },
  commitFloatingSelectionBoxMove(before, after, beforePivot, afterPivot) {
    if (selectionMasksEqual(before, after) && beforePivot?.x === afterPivot?.x && beforePivot?.y === afterPivot?.y) return
    get().mutateActive((session) => {
      const pending = session.pendingPaste
      if (!pending || pending.source.origin !== 'clipboard') return
      recordFloatingSelectionBoxMove(session, pending, before, after, beforePivot, afterPivot)
    }, false)
  },
  commitTilemapSelectionMove(edit, before, after, label) {
    const session = activeSession(get())
    if (!session || edit.before.size === 0 || edit.after.size === 0) return
    const beforeSelection = cloneSelectionMask(before)
    const afterSelection = cloneSelectionMask(after)
    session.selection = cloneSelectionMask(afterSelection)
    const invalidation: ContentInvalidationHint = edit.dirtyRect
      ? { kind: 'region', frameId: edit.frameId, rect: { ...edit.dirtyRect } }
      : { kind: 'full' }
    get().pushHistory({
      label,
      bytes: tilemapEditBytes(edit) + (beforeSelection?.mask?.byteLength ?? 0) + (afterSelection?.mask?.byteLength ?? 0) + 64,
      undo: () => {
        applyTilemapDocumentEdit(session.document, edit, 'before')
        session.selection = cloneSelectionMask(beforeSelection)
      },
      redo: () => {
        applyTilemapDocumentEdit(session.document, edit, 'after')
        session.selection = cloneSelectionMask(afterSelection)
      },
      invalidation,
      affectedLayerIds: [edit.layerId],
      contentChanged: true,
      requiresAnimationSync: false
    })
  },
  togglePixelGrid() {
    const session = activeSession(get())
    if (session) get().setView({ showPixelGrid: !session.view.showPixelGrid })
  },
  toggleGrid() {
    const session = activeSession(get())
    if (session) get().setView({ showGrid: !session.view.showGrid })
  },
  selectPaletteColor(id, additive = false) {
    get().mutateActive((session) => selectPaletteColorCommand(session, id, additive), false)
    const session = activeSession(get())
    if (session && session.paletteSelectionId !== null) get().setPrimaryColor(session.primaryColor)
  },
  selectPaletteColors(ids, primaryId) {
    get().mutateActive((session) => selectPaletteColorsCommand(session, ids, primaryId), false)
    const session = activeSession(get())
    if (session && session.paletteSelectionId !== null) get().setPrimaryColor(session.primaryColor)
  },
  addPaletteColor(color) {
    let addedId: number | null = null
    get().mutateActive((session) => {
      addedId = addPaletteColorCommand(session, color, paletteEditSynchronizationLocked())
    })
    return addedId
  },
  updatePaletteColor(id, color) {
    get().mutateActive((session) => updatePaletteColorWithSynchronization(session, id, color))
  },
  applyPalette(colors, layout) {
    get().mutateActive((session) => applyPaletteCommand(session, colors, layout))
  },
  deletePaletteColor(id) {
    get().deletePaletteColors([id])
  },
  deletePaletteColors(ids) {
    get().mutateActive((session) => deletePaletteColorsCommand(session, ids))
  },
  movePaletteColor(direction) {
    get().mutateActive((session) => movePaletteColorCommand(session, direction))
  },
  reorderPaletteColors(ids, targetSlots, targetColumns) {
    get().mutateActive((session) => reorderPaletteColorsCommand(session, ids, targetSlots, targetColumns))
  },
  reversePaletteColors() {
    get().mutateActive((session) => reversePaletteColorsCommand(session))
  },
  gradientPaletteColors(byHue) {
    get().mutateActive((session) => gradientPaletteColorsCommand(session, byHue))
  },
  gradientPaletteSlots(slotIndices, sourceSlots, columns, byHue) {
    get().mutateActive((session) => gradientPaletteSlotsCommand(session, slotIndices, sourceSlots, columns, byHue))
  },
  sortPaletteColors(mode, direction) {
    get().mutateActive((session) => sortPaletteColorsCommand(session, mode, direction))
  },

  mutateActive(mutator, dirty = true, normalizeSelection = false, markSelectionNormalizationHistory = normalizeSelection, invalidation?: ContentInvalidationHint) {
    const state = get()
    const session = activeSession(state)
    if (!session) return
    const historyNormalization = session.history
    historyNormalization.setAnimationSelectionNormalizationRequested(markSelectionNormalizationHistory)
    try {
      mutator(session)
    } finally {
      historyNormalization.setAnimationSelectionNormalizationRequested(false)
    }
    const freeTileInstanceLayer = session.freeTileInstanceLayerId
      ? session.document.layers.find((layer) => layer.id === session.freeTileInstanceLayerId && layer.kind === 'free-tile')
      : null
    if (session.freeTileInstanceLayerId && (!freeTileInstanceLayer || session.document.activeLayerId !== freeTileInstanceLayer.id)) {
      session.freeTileInstanceLayerId = null
      clearFreeTileInstanceSelection(session)
    }
    if (session.activeLayerMaskId && !findLayerMask(session.document, session.activeLayerMaskId)) session.activeLayerMaskId = null
    if (dirty === true) syncActiveAnimationFrame(session.document)
    ensureLayerSelection(session)
    if (normalizeSelection) normalizeAnimationSelection(session, { preserveEmptyCelSlots: dirty === false })
    ensureTimelineActiveContext(session)
    persistProjectLayerPanelState(session)
    if (dirty === 'metadata') touchMetadata(session)
    else touch(session, dirty === true || dirty === 'content', invalidation)
    if (dirty === true || dirty === 'content' || dirty === 'metadata') recordDocumentOperation(session, undefined, dirty !== 'metadata')
    set({ sessions: [...state.sessions] })
  },

  beginLiquifyStroke(layerId) {
    let compound = false
    get().mutateActive((session) => {
      const timeline = session.document.animation
      if (!timeline) return
      if (session.liquifyResetHistoryPosition == null || session.liquifyResetHistoryRevision !== session.history.revision) {
        session.liquifyResetHistoryPosition = session.history.position
        session.liquifyResetHistoryRevision = session.history.revision
      }
      const cel = timeline.cels.find((candidate) => candidate.layerId === layerId && candidate.frameId === timeline.activeFrameId)
      if (!cel) return
      syncActiveAnimationFrame(session.document)
      const before = timeline.cels.map(cloneAnimationCel)
      session.history.beginCompound()
      if (!disconnectAnimationCels(session.document, [cel.id])) {
        session.history.abortCompound()
        return
      }
      const after = ensureAnimationDocument(session.document).cels.map(cloneAnimationCel)
      const restore = (snapshot: AnimationCel[]): void => {
        restoreAnimationCels(session.document, snapshot)
        refreshActiveAnimationFrame(session.document)
      }
      session.history.push({
        label: tr('workspace.history.animationCelUnlink'),
        bytes: [...before, ...after].reduce((sum, item) => sum + (item.surface?.pixels.byteLength ?? 0) + 24, 0),
        undo: () => restore(before),
        redo: () => restore(after),
        invalidation: { kind: 'full' },
        affectedLayerIds: [layerId],
        requiresAnimationSync: false
      })
      compound = true
    }, false)
    return compound
  },

  cancelLiquifyStroke(edit, compound) {
    get().mutateActive((session) => {
      const changed = pixelEditHasChanges(edit) || compound
      revertPixelEdit(session.document, edit)
      if (compound) session.history.abortCompound()
      if (changed) invalidateSessionContent(session)
    }, false)
  },

  commitLiquifyStroke(edit, label, compound, activity, push = false) {
    const current = activeSession(get())
    if (push && current?.liquifySmoothing) {
      const layer = current.document.layers.find((candidate) => candidate.id === edit.layerId)
      if (layer && !layer.kind) smoothChangedLiquifyPixels(current.document, layer, edit, current.selection, current.liquifySmoothingStrength)
    }
    const entry = get().commitPixelEdit(edit, label, activity)
    if (compound) get().mutateActive((session) => {
      if (entry) session.history.endCompound(label)
      else session.history.abortCompound()
      if (entry) session.liquifyResetHistoryRevision = session.history.revision
    }, false)
    else if (entry) get().mutateActive((session) => { session.liquifyResetHistoryRevision = session.history.revision }, false)
    return entry
  },

  commitPixelEdit(edit, label, activity) {
    let committed: HistoryEntry | null = null
    const current = activeSession(get())
    const beforeSelection = current ? captureAnimationSelectionHistory(current) : null
    get().mutateActive((session) => {
      const editedLayer = session.document.layers.find((layer) => layer.id === edit.layerId)
      const layerKind = editedLayer?.kind
      if (layerKind === 'text') {
        revertPixelEdit(session.document, edit)
        set({ message: tr('workspace.text.convertToEditPixels') })
        return
      }
      if (editedLayer?.kind === 'tilemap') {
        if (session.tilemapMode === 'paint') {
          revertPixelEdit(session.document, edit)
          set({ message: tr('workspace.tilemap.convertToEditPixels') })
          return
        }
        const tilesetId = editedLayer.tilemapTilesetId ?? session.selectedTilesetId
        if (!tilesetId) {
          revertPixelEdit(session.document, edit)
          return
        }
        const tilemapEdit = convertTilemapPixelEdit(session.document, edit, session.tilemapMode, tilesetId, () => createId('tile'))
        if (!tilemapEdit || !tilemapTilesetEditHasChanges(tilemapEdit)) return
        const entry: HistoryEntry = {
          label,
          bytes: tilemapTilesetEditBytes(tilemapEdit),
          undo: () => { applyTilemapTilesetDocumentEdit(session.document, tilemapEdit, 'before') },
          redo: () => { applyTilemapTilesetDocumentEdit(session.document, tilemapEdit, 'after') },
          invalidation: { kind: 'full' },
          affectedLayerIds: [edit.layerId],
          contentChanged: true,
          requiresAnimationSync: false
        }
        const afterSelection = beforeSelection ? captureAnimationSelectionHistory(session) : null
        const historyEntry = beforeSelection && afterSelection
          ? historyEntryWithAnimationSelection(session, entry, beforeSelection, afterSelection)
          : entry
        session.history.push(historyEntry)
        const selectedTileId = tilemapEdit.changedTileIds.at(-1)
        if (selectedTileId) {
          session.selectedTilesetId = tilemapEdit.tilesetId
          session.selectedTileId = selectedTileId
          session.secondaryTileId = session.document.tilesets?.find((tileset) => tileset.id === tilemapEdit.tilesetId)?.tileIds.includes(session.secondaryTileId ?? '')
            ? session.secondaryTileId
            : selectedTileId
        }
        touch(session, true, { kind: 'full' })
        recordDocumentOperation(session, activity)
        committed = historyEntry
        return
      }
      const operationProbe = window.__moonSpriteCanvasProbe
      const historyStartedAt = operationProbe?.recordOperationStage ? performance.now() : 0
      const entry = commitPixelEdit(session.document, edit, label, Boolean(session.localHistory) && loadEditorPreferences().localHistoryEnabled)
      operationProbe?.recordOperationStage?.('commit.history-record', performance.now() - historyStartedAt, {
        points: edit.before.size + (edit.points?.count ?? 0),
        runs: edit.runs?.length ?? 0,
        densePixels: edit.denseRegion?.count ?? 0
      })
      if (entry) {
        const afterSelection = beforeSelection ? captureAnimationSelectionHistory(session) : null
        const historyEntry = beforeSelection && afterSelection
          ? historyEntryWithAnimationSelection(session, entry, beforeSelection, afterSelection)
          : entry
        committed = historyEntry
        const historyPushStartedAt = operationProbe?.recordOperationStage ? performance.now() : 0
        inheritCommittedPixelChanges(entry, historyEntry)
        session.history.push(historyEntry)
        operationProbe?.recordOperationStage?.('commit.history-push', performance.now() - historyPushStartedAt)
        const animationSyncStartedAt = operationProbe?.recordOperationStage ? performance.now() : 0
        syncActiveAnimationLayer(session.document, edit.layerId)
        operationProbe?.recordOperationStage?.('commit.animation-sync', performance.now() - animationSyncStartedAt)
        const invalidationStartedAt = operationProbe?.recordOperationStage ? performance.now() : 0
        // Style proxies add pixels outside the edited source rect. A flipped
        // pasted selection can therefore leave the style-expanded cache
        // partially stale if we invalidate only the raw pixel region.
        const styledLayerEdit = hasEnabledLayerStyles(editedLayer?.layerStyles)
        touch(session, true, styledLayerEdit ? { kind: 'full' } : entry.invalidation)
        operationProbe?.recordOperationStage?.('commit.cache-invalidation', performance.now() - invalidationStartedAt, {
          dirtyPixels: edit.dirtyRect ? edit.dirtyRect.width * edit.dirtyRect.height : 0,
          dirtyWidth: edit.dirtyRect?.width ?? 0,
          dirtyHeight: edit.dirtyRect?.height ?? 0
        })
        const documentRecordStartedAt = operationProbe?.recordOperationStage ? performance.now() : 0
        recordDocumentOperation(session, activity)
        operationProbe?.recordOperationStage?.('commit.document-record', performance.now() - documentRecordStartedAt)
      }
    }, false)
    return committed
  },

  commitTilemapEdit(edit, label, activity) {
    let committed: HistoryEntry | null = null
    get().mutateActive((session) => {
      if (edit.before.size === 0 || edit.after.size === 0) return
      const target = activeTilemapCelTarget(session.document)
      if (!target || target.layer.id !== edit.layerId || target.cel.frameId !== edit.frameId) return
      const invalidation: ContentInvalidationHint = edit.dirtyRect
        ? { kind: 'region', frameId: edit.frameId, rect: { ...edit.dirtyRect } }
        : { kind: 'full' }
      const entry: HistoryEntry = {
        label,
        bytes: tilemapEditBytes(edit),
        undo: () => { applyTilemapDocumentEdit(session.document, edit, 'before') },
        redo: () => { applyTilemapDocumentEdit(session.document, edit, 'after') },
        invalidation,
        affectedLayerIds: [edit.layerId],
        contentChanged: true,
        requiresAnimationSync: false
      }
      session.history.push(entry)
      touch(session, true, invalidation)
      recordDocumentOperation(session, activity)
      committed = entry
    }, false)
    return committed
  },

  commitTilemapTilesetEdit(edit, label, activity) {
    if (!tilemapTilesetEditHasChanges(edit)) return null
    let committed: HistoryEntry | null = null
    get().mutateActive((session) => {
      const target = activeTilemapCelTarget(session.document)
      if (!target || target.layer.id !== edit.tilemapEdit.layerId || target.cel.frameId !== edit.tilemapEdit.frameId) return
      const entry: HistoryEntry = {
        label,
        bytes: tilemapTilesetEditBytes(edit),
        undo: () => { applyTilemapTilesetDocumentEdit(session.document, edit, 'before') },
        redo: () => { applyTilemapTilesetDocumentEdit(session.document, edit, 'after') },
        invalidation: { kind: 'full' },
        affectedLayerIds: [edit.tilemapEdit.layerId],
        contentChanged: true,
        requiresAnimationSync: false
      }
      session.history.push(entry)
      touch(session, true, { kind: 'full' })
      recordDocumentOperation(session, activity)
      committed = entry
    }, false)
    return committed
  },

  setTilemapMode(mode) {
    get().mutateActive((session) => {
      session.tilemapMode = mode
    }, false)
  },

  activateTilemapLayerForDrawing(layerId) {
    get().mutateActive((session) => {
      if (session.tilemapMode !== 'paint') return
      const requestedOwner = layerId
        ? session.document.layers.find((layer) => layer.id === layerId && layer.kind === 'tilemap')
        : undefined
      const owner = requestedOwner
        ?? (session.selectedTilesetId ? ownerLayerForTileset(session, session.selectedTilesetId) : undefined)
      if (owner?.kind !== 'tilemap') return
      const activeLayer = session.document.layers.find((layer) => layer.id === session.document.activeLayerId)
      // A shared tileset is intentionally not an implicit layer switch. For
      // a concrete edit target, however, the target layer is authoritative;
      // this prevents pointer-up from restoring the layer that was active
      // before the stroke began.
      if (activeLayer?.kind === 'tilemap' && activeLayer.tilemapTilesetId === owner.tilemapTilesetId) {
        const frameId = session.document.animation?.activeFrameId ?? null
        setTimelineActiveContext(session, { kind: 'layer', ownerKind: 'layer', ownerId: activeLayer.id }, frameId, null)
        return
      }
      // Drawing with another layer's tileset changes the active paint target,
      // but it must not replace the user's layer selection. Selection visuals
      // and active-row visuals are separate timeline states.
      session.document.activeLayerId = owner.id
      // Keep the timeline focus in the same transition as the active paint
      // target; otherwise the old layer can reappear after pointer-up.
      const frameId = session.document.animation?.activeFrameId ?? null
      setTimelineActiveContext(session, { kind: 'layer', ownerKind: 'layer', ownerId: owner.id }, frameId, null)
    }, false)
  },

  setFreeTileMode(mode) {
    get().mutateActive((session) => {
      if (mode === 'paint') {
        clearFreeTileInstanceSelection(session)
        session.freeTileMode = mode
        return
      }
      const target = activeFreeTileCelTarget(session.document)
      const editableInstances = target?.freeTiles.instances.filter((instance) => {
        if (instance.visible === false || instance.locked === true) return false
        const source = target.sources.find((candidate) => candidate.id === instance.sourceId || candidate.tileset.id === instance.sourceId)
        const sourceLayer = source ? target.layer.freeTileSources?.find((candidate) => candidate.id === source.id) : null
        return Boolean(source && sourceLayer?.visible !== false && sourceLayer?.locked !== true)
      }) ?? []
      const preferred = editableInstances.find((instance) => instance.id === session.selectedFreeTileInstanceId)
        ?? editableInstances.find((instance) => instance.sourceId === session.selectedTilesetId
          || target?.sources.find((source) => source.id === instance.sourceId)?.tileset.id === session.selectedTilesetId)
        ?? editableInstances[0]
      if (preferred && syncFreeTileInstanceSourceSelection(session, preferred.id)) setFreeTileInstanceSelectionState(session, [preferred.id], preferred.id)
      else clearFreeTileInstanceSelection(session)
      session.freeTileMode = mode
    }, false)
  },

  setFreeTileInstanceLayerView(layerId) {
    get().mutateActive((session) => {
      if (!layerId) {
        session.freeTileInstanceLayerId = null
        clearFreeTileInstanceSelection(session)
        return
      }
      const layer = session.document.layers.find((candidate) => candidate.id === layerId && candidate.kind === 'free-tile')
      session.freeTileInstanceLayerId = layer ? layer.id : null
      if (layer) {
        // Instance editing is scoped to its owning free-tile layer. Keep the
        // document activity in that layer so canvas move/edit hit testing does
        // not fall back to a previously active raster layer.
        session.document.activeLayerId = layer.id
        session.selectedLayerIds = [layer.id]
        session.selectedGroupId = null
        session.selectedGroupIds = []
      }
      if (!session.freeTileInstanceLayerId) clearFreeTileInstanceSelection(session)
    }, false)
  },

  setSelectedFreeTileInstance(instanceId, mode, role = 'primary') {
    get().mutateActive((session) => {
      if (!instanceId) {
        clearFreeTileInstanceSelection(session)
        return
      }
      if (session.freeTileMode === 'paint' && mode !== 'edit') {
        clearFreeTileInstanceSelection(session)
        return
      }
      if (!syncFreeTileInstanceSourceSelection(session, instanceId, role)) {
        clearFreeTileInstanceSelection(session)
        return
      }
      const target = activeFreeTileCelTarget(session.document)
      if (target) {
        session.document.activeLayerId = target.layer.id
        session.freeTileInstanceLayerId = target.layer.id
        session.selectedLayerIds = [target.layer.id]
        session.selectedGroupId = null
        session.selectedGroupIds = []
      }
      setFreeTileInstanceSelectionState(session, [instanceId], instanceId)
      if (mode) session.freeTileMode = mode
    }, false)
  },

  selectFreeTileInstanceRow(instanceId, mode = 'replace', orderedInstanceIds = []) {
    get().mutateActive((session) => {
      const target = activeFreeTileCelTarget(session.document)
      if (!target || !target.freeTiles.instances.some((instance) => instance.id === instanceId)) {
        clearFreeTileInstanceSelection(session)
        return
      }
      // Instance row selection is always scoped to its owning free-tile layer.
      // Keep the document/session activity aligned before applying replace,
      // toggle, or range semantics so a stale paint-layer selection cannot
      // steal the interaction context.
      session.document.activeLayerId = target.layer.id
      session.freeTileInstanceLayerId = target.layer.id
      session.selectedLayerIds = [target.layer.id]
      session.selectedGroupId = null
      session.selectedGroupIds = []
      ensureFreeTileInstanceSelection(session)
      const validIds = new Set(target.freeTiles.instances.map((instance) => instance.id))
      const displayOrder = [...new Set(orderedInstanceIds)].filter((id) => validIds.has(id))
      const orderedIds = displayOrder.length > 0
        ? displayOrder
        : target.freeTiles.instances.map((instance) => instance.id).reverse()
      const currentIds = session.selectedFreeTileInstanceIds.filter((id) => validIds.has(id))
      if (mode === 'range') {
        const anchorId = session.freeTileInstanceSelectionAnchorId && validIds.has(session.freeTileInstanceSelectionAnchorId)
          ? session.freeTileInstanceSelectionAnchorId
          : currentIds.find((id) => validIds.has(id)) ?? instanceId
        const anchorIndex = orderedIds.indexOf(anchorId)
        const targetIndex = orderedIds.indexOf(instanceId)
        const rangeIds = anchorIndex >= 0 && targetIndex >= 0
          ? orderedIds.slice(Math.min(anchorIndex, targetIndex), Math.max(anchorIndex, targetIndex) + 1)
          : [instanceId]
        setFreeTileInstanceSelectionState(session, rangeIds, instanceId, anchorId)
      } else if (mode === 'toggle') {
        const selectedIds = currentIds.includes(instanceId)
          ? currentIds.filter((id) => id !== instanceId)
          : [...currentIds, instanceId]
        const nextIds = selectedIds.length > 0 ? selectedIds : [instanceId]
        setFreeTileInstanceSelectionState(session, nextIds, nextIds.includes(instanceId) ? instanceId : nextIds.at(-1) ?? null, instanceId)
      } else {
        setFreeTileInstanceSelectionState(session, [instanceId], instanceId)
      }
      if (session.selectedFreeTileInstanceId && syncFreeTileInstanceSourceSelection(session, session.selectedFreeTileInstanceId)) {
        session.freeTileMode = 'edit'
      }
    }, false)
  },

  addFreeTileSource(layerId) {
    let addedSourceId: string | null = null
    get().mutateActive((session) => {
      const layer = session.document.layers.find((candidate) => candidate.id === (layerId ?? session.document.activeLayerId) && candidate.kind === 'free-tile')
      if (!layer) return
      ensureFreeTileTilesetOwnership(session.document)
      const beforeSources = (layer.freeTileSources ?? []).map(cloneFreeTileSourceLayer)
      const beforeSelection = { tilesetId: session.selectedTilesetId, tileId: session.selectedTileId, secondaryTileId: session.secondaryTileId, mode: session.freeTileMode }
      const sourceId = createId('free-tile-source')
      const nextSourceIndex = (() => {
        let index = 1
        while (beforeSources.some((candidate) => candidate.name === tr('workspace.freeTile.sourceName', { index }))) index += 1
        return index
      })()
      const name = tr('workspace.freeTile.sourceName', { index: nextSourceIndex })
      const tileset = createBlankTileset(createId('tileset'), name, 1, 1, createId('tile'), 1)
      const source: FreeTileSourceLayer = { id: sourceId, name, tilesetId: tileset.id, displayColor: defaultFreeTileSourceDisplayColor(beforeSources.length), visible: true, locked: false, opacity: 1, blendMode: 'normal', offsetX: 0, offsetY: 0 }
      const afterSources = [...beforeSources, source]
      const afterSelection = { tilesetId: tileset.id, tileId: tileset.tileIds[0] ?? null, secondaryTileId: tileset.tileIds[0] ?? null, mode: 'edit' as FreeTileDrawingMode }
      const apply = (sources: readonly FreeTileSourceLayer[], includeTileset: boolean, selection: typeof beforeSelection): void => {
        replaceFreeTileSetSources(session.document, layer, sources)
        if (includeTileset) {
          if (!session.document.tilesets?.some((candidate) => candidate.id === tileset.id)) session.document.tilesets = [...(session.document.tilesets ?? []), cloneTileset(tileset)]
        } else session.document.tilesets = (session.document.tilesets ?? []).filter((candidate) => candidate.id !== tileset.id)
        session.selectedTilesetId = selection.tilesetId
        session.selectedTileId = selection.tileId
        session.secondaryTileId = selection.secondaryTileId
        clearFreeTileInstanceSelection(session)
        session.freeTileMode = selection.mode
      }
      apply(afterSources, true, afterSelection)
      session.history.push({
        label: tr('workspace.history.addTilesetTile'),
        bytes: tilemapTilesetBytes(tileset) + (beforeSources.length + afterSources.length) * 96,
        undo: () => apply(beforeSources, false, beforeSelection),
        redo: () => apply(afterSources, true, afterSelection),
        invalidation: { kind: 'full' },
        affectedLayerIds: freeTileLayersForSet(session.document, freeTileSetIdForLayer(layer)).map((candidate) => candidate.id),
        contentChanged: true,
        requiresAnimationSync: false
      })
      touch(session, true, { kind: 'full' })
      recordDocumentOperation(session)
      addedSourceId = sourceId
    }, false)
    if (addedSourceId) requestTilesetPanelVisibility(true)
    return addedSourceId
  },

  deleteFreeTileSource(sourceId) {
    let deleted = false
    get().mutateActive((session) => {
      const owner = freeTileSourceOwnerForId(session.document, sourceId)
      if (!owner || (owner.layer.freeTileSources?.length ?? 0) <= 1) return
      const sourceIndex = owner.layer.freeTileSources!.findIndex((source) => source.id === owner.source.id)
      const tilesetIndex = (session.document.tilesets ?? []).findIndex((tileset) => tileset.id === owner.tileset.id)
      if (sourceIndex < 0 || tilesetIndex < 0) return
      const source = cloneFreeTileSourceLayer(owner.source)
      const tileset = cloneTileset(owner.tileset)
      const references = captureFreeTileSourceReferences(session.document, owner.source.id)
      const affectedLayerIds = freeTileLayerIdsForSource(session.document, owner.source.id)
      const beforeSelection = { tilesetId: session.selectedTilesetId, tileId: session.selectedTileId, secondaryTileId: session.secondaryTileId }
      const remaining = owner.layer.freeTileSources!.filter((candidate) => candidate.id !== owner.source.id)
      const fallback = remaining[Math.min(sourceIndex, remaining.length - 1)]
      const fallbackTileset = fallback ? session.document.tilesets?.find((candidate) => candidate.id === fallback.tilesetId) : undefined
      const afterSelection = session.selectedTilesetId === owner.tileset.id
        ? { tilesetId: fallbackTileset?.id ?? null, tileId: fallbackTileset?.tileIds[0] ?? null, secondaryTileId: fallbackTileset?.tileIds[0] ?? null }
        : beforeSelection
      const applySelection = (selection: typeof beforeSelection): void => {
        session.selectedTilesetId = selection.tilesetId
        session.selectedTileId = selection.tileId
        session.secondaryTileId = selection.secondaryTileId
      }
      const remove = (): void => {
        replaceFreeTileSetSources(session.document, owner.layer, (owner.layer.freeTileSources ?? []).filter((candidate) => candidate.id !== source.id))
        session.document.tilesets = (session.document.tilesets ?? []).filter((candidate) => candidate.id !== tileset.id)
        applyFreeTileReferences(session.document, references, 'clear')
        clearFreeTileInstanceSelection(session)
        applySelection(afterSelection)
      }
      const restore = (): void => {
        const sources = [...(owner.layer.freeTileSources ?? [])]
        if (!sources.some((candidate) => candidate.id === source.id)) sources.splice(Math.min(sourceIndex, sources.length), 0, cloneFreeTileSourceLayer(source))
        replaceFreeTileSetSources(session.document, owner.layer, sources)
        const tilesets = [...(session.document.tilesets ?? [])]
        if (!tilesets.some((candidate) => candidate.id === tileset.id)) tilesets.splice(Math.min(tilesetIndex, tilesets.length), 0, cloneTileset(tileset))
        session.document.tilesets = tilesets
        applyFreeTileReferences(session.document, references, 'restore')
        rerenderFreeTileSourceReferences(session.document, source.id)
        applySelection(beforeSelection)
      }
      remove()
      session.history.push({
        label: tr('workspace.history.deleteTilesetTile'),
        bytes: tilemapTilesetBytes(tileset) + references.length * 72 + 128,
        undo: restore,
        redo: remove,
        invalidation: { kind: 'full' },
        affectedLayerIds,
        contentChanged: true,
        requiresAnimationSync: false
      })
      touch(session, true, { kind: 'full' })
      recordDocumentOperation(session)
      deleted = true
    }, false)
    return deleted
  },

  deleteFreeTileInstance(instanceId) {
    return get().deleteFreeTileInstances([instanceId])
  },

  deleteFreeTileInstances(instanceIds) {
    let deleted = false
    get().mutateActive((session) => {
      const target = activeFreeTileCelTarget(session.document)
      if (!target) return
      const requestedIds = new Set(instanceIds)
      const removed = target.freeTiles.instances.filter((instance) => requestedIds.has(instance.id))
      if (removed.length === 0 || removed.some((instance) => instance.locked === true)) return
      const removedIds = new Set(removed.map((instance) => instance.id))
      const before = cloneFreeTileCelData(target.freeTiles)
      const after = { instances: before.instances.filter((instance) => !removedIds.has(instance.id)) }
      const displayedBefore = [...before.instances].reverse()
      const primaryBefore = session.selectedFreeTileInstanceId && removedIds.has(session.selectedFreeTileInstanceId)
        ? session.selectedFreeTileInstanceId
        : removed[0]?.id ?? null
      const removedDisplayIndex = primaryBefore ? displayedBefore.findIndex((instance) => instance.id === primaryBefore) : -1
      const displayedAfter = [...after.instances].reverse()
      const fallbackInstance = displayedAfter.length > 0
        ? displayedAfter[Math.min(Math.max(removedDisplayIndex, 0), displayedAfter.length - 1)]
        : null
      const edit: FreeTilePlacementEdit = { layerId: target.layer.id, frameId: target.cel.frameId, before, after, dirtyRect: null }
      applyFreeTilePlacementEdit(session.document, edit, 'after')
      const remainingSelectedIds = session.selectedFreeTileInstanceIds.filter((id) => !removedIds.has(id))
      const retainedPrimaryId = session.selectedFreeTileInstanceId && !removedIds.has(session.selectedFreeTileInstanceId)
        ? session.selectedFreeTileInstanceId
        : null
      const nextPrimaryId = retainedPrimaryId ?? fallbackInstance?.id ?? null
      setFreeTileInstanceSelectionState(session, remainingSelectedIds.length > 0 ? remainingSelectedIds : nextPrimaryId ? [nextPrimaryId] : [], nextPrimaryId)
      if (nextPrimaryId) syncFreeTileInstanceSourceSelection(session, nextPrimaryId)
      else if (after.instances.length === 0) session.freeTileMode = 'paint'
      session.history.push({
        label: tr('canvas.history.eraseFreeTiles'),
        bytes: (before.instances.length + after.instances.length) * 72,
        undo: () => { applyFreeTilePlacementEdit(session.document, edit, 'before') },
        redo: () => { applyFreeTilePlacementEdit(session.document, edit, 'after') },
        invalidation: { kind: 'full' },
        affectedLayerIds: [target.layer.id],
        contentChanged: true,
        requiresAnimationSync: false
      })
      touch(session, true, { kind: 'full' })
      recordDocumentOperation(session)
      deleted = true
    }, false)
    return deleted
  },

  showOnlyFreeTileInstance(instanceId) {
    let changed = false
    get().mutateActive((session) => {
      const target = activeFreeTileCelTarget(session.document)
      if (!target || !target.freeTiles.instances.some((instance) => instance.id === instanceId)) return
      const before = cloneFreeTileCelData(target.freeTiles)
      const after: FreeTileCelData = {
        instances: before.instances.map((instance) => ({ ...instance, visible: instance.id === instanceId }))
      }
      if (freeTileCelDataEqual(before, after)) return
      const edit: FreeTilePlacementEdit = { layerId: target.layer.id, frameId: target.cel.frameId, before, after, dirtyRect: null }
      applyFreeTilePlacementEdit(session.document, edit, 'after')
      setFreeTileInstanceSelectionState(session, [instanceId], instanceId)
      session.history.push({
        label: tr('workspace.history.showOnlyFreeTileInstance'),
        bytes: (before.instances.length + after.instances.length) * 72,
        undo: () => { applyFreeTilePlacementEdit(session.document, edit, 'before') },
        redo: () => { applyFreeTilePlacementEdit(session.document, edit, 'after') },
        invalidation: { kind: 'full' },
        affectedLayerIds: [target.layer.id],
        contentChanged: true,
        requiresAnimationSync: false
      })
      touch(session, true, { kind: 'full' })
      recordDocumentOperation(session)
      changed = true
    }, false)
    return changed
  },

  setFreeTileInstanceProperties(instanceId, changes: FreeTileInstancePropertyChanges, selectInstance = true) {
    let changed = false
    get().mutateActive((session) => {
      const target = activeFreeTileCelTarget(session.document)
      if (!target) return
      const current = target.freeTiles.instances.find((instance) => instance.id === instanceId)
      if (!current) return
      const source = freeTileSourceForInstance(target.sources, current)
      if (!source) return
      const before = cloneFreeTileCelData(target.freeTiles)
      const after = cloneFreeTileCelData(target.freeTiles)
      const next = after.instances.find((instance) => instance.id === instanceId)
      if (!next) return
      if (current.locked !== true) {
        const currentBounds = freeTileInstanceBounds(current, target.sources, target.surface.offsetX, target.surface.offsetY)
        if (changes.rotation !== undefined && (changes.rotation === 0 || changes.rotation === 1 || changes.rotation === 2 || changes.rotation === 3)) {
          if (changes.rotation === 0) delete next.rotation
          else next.rotation = changes.rotation
        }
        if (changes.flipHorizontal !== undefined) {
          if (changes.flipHorizontal) next.flipHorizontal = true
          else delete next.flipHorizontal
        }
        if (changes.flipVertical !== undefined) {
          if (changes.flipVertical) next.flipVertical = true
          else delete next.flipVertical
        }
        const transformedBounds = freeTileInstanceBounds(next, target.sources, target.surface.offsetX, target.surface.offsetY)
        const desiredX = changes.x !== undefined && Number.isFinite(changes.x) ? Math.trunc(changes.x) : currentBounds.x
        const desiredY = changes.y !== undefined && Number.isFinite(changes.y) ? Math.trunc(changes.y) : currentBounds.y
        next.x += desiredX - transformedBounds.x
        next.y += desiredY - transformedBounds.y
      }
      if (changes.visible !== undefined) next.visible = changes.visible
      if (changes.locked !== undefined) next.locked = changes.locked
      if (changes.opacity !== undefined && Number.isFinite(changes.opacity)) next.opacity = Math.max(0, Math.min(1, changes.opacity))
      if (changes.blendMode !== undefined) next.blendMode = changes.blendMode
      if (freeTileCelDataEqual(before, after)) return
      const edit: FreeTilePlacementEdit = { layerId: target.layer.id, frameId: target.cel.frameId, before, after, dirtyRect: null }
      applyFreeTilePlacementEdit(session.document, edit, 'after')
      if (selectInstance) setFreeTileInstanceSelectionState(session, [instanceId], instanceId)
      session.history.push({
        label: tr('workspace.history.freeTileInstanceProperties'),
        bytes: (before.instances.length + after.instances.length) * 72,
        undo: () => { applyFreeTilePlacementEdit(session.document, edit, 'before') },
        redo: () => { applyFreeTilePlacementEdit(session.document, edit, 'after') },
        invalidation: { kind: 'full' },
        affectedLayerIds: [target.layer.id],
        contentChanged: true,
        requiresAnimationSync: false
      })
      touch(session, true, { kind: 'full' })
      recordDocumentOperation(session)
      changed = true
    }, false)
    return changed
  },

  beginFreeTileInstancePropertiesTransaction(instanceIds) {
    let id: string | null = null
    get().mutateActive((session) => {
      id = beginFreeTileInstancePropertiesTransactionCommand(documentTransactions, session, instanceIds)
    }, false)
    return id
  },

  previewFreeTileInstancePropertiesTransaction(id, changes) {
    let changed = false
    get().mutateActive((session) => {
      changed = previewFreeTileInstancePropertiesTransactionCommand(documentTransactions, session, id, changes)
    }, false)
    return changed
  },

  commitFreeTileInstancePropertiesTransaction(id, changes) {
    let changed = false
    get().mutateActive((session) => {
      changed = commitFreeTileInstancePropertiesTransactionCommand(documentTransactions, session, id, changes)
      if (!changed) return
      touch(session, true, { kind: 'full' })
      recordDocumentOperation(session)
    }, false)
    return changed
  },

  cancelFreeTileInstancePropertiesTransaction(id) {
    let canceled = false
    get().mutateActive((session) => {
      canceled = cancelFreeTileInstancePropertiesTransactionCommand(documentTransactions, session, id)
    }, false)
    return canceled
  },

  reorderFreeTileInstance(instanceId, targetInstanceId, position) {
    let changed = false
    get().mutateActive((session) => {
      const target = activeFreeTileCelTarget(session.document)
      if (!target || instanceId === targetInstanceId) return
      const before = cloneFreeTileCelData(target.freeTiles)
      const fromIndex = before.instances.findIndex((instance) => instance.id === instanceId)
      if (fromIndex < 0 || before.instances[fromIndex].locked === true || !before.instances.some((instance) => instance.id === targetInstanceId)) return
      const instances = before.instances.filter((instance) => instance.id !== instanceId)
      const targetIndex = instances.findIndex((instance) => instance.id === targetInstanceId)
      if (targetIndex < 0) return
      const insertIndex = position === 'before' ? targetIndex + 1 : targetIndex
      instances.splice(insertIndex, 0, before.instances[fromIndex])
      const after: FreeTileCelData = { instances }
      if (freeTileCelDataEqual(before, after)) return
      const edit: FreeTilePlacementEdit = { layerId: target.layer.id, frameId: target.cel.frameId, before, after, dirtyRect: null }
      applyFreeTilePlacementEdit(session.document, edit, 'after')
      const selectedIds = session.selectedFreeTileInstanceIds.includes(instanceId)
        ? session.selectedFreeTileInstanceIds
        : [instanceId]
      setFreeTileInstanceSelectionState(session, selectedIds, instanceId, session.freeTileInstanceSelectionAnchorId)
      session.history.push({
        label: tr('workspace.history.reorderFreeTileInstance'),
        bytes: (before.instances.length + after.instances.length) * 72,
        undo: () => { applyFreeTilePlacementEdit(session.document, edit, 'before') },
        redo: () => { applyFreeTilePlacementEdit(session.document, edit, 'after') },
        invalidation: { kind: 'full' },
        affectedLayerIds: [target.layer.id],
        contentChanged: true,
        requiresAnimationSync: false
      })
      touch(session, true, { kind: 'full' })
      recordDocumentOperation(session)
      changed = true
    }, false)
    return changed
  },

  setFreeTileSourceProperties(sourceId, changes) {
    let changed = false
    get().mutateActive((session) => {
      const owner = freeTileSourceOwnerForId(session.document, sourceId)
      if (!owner) return
      const before = cloneFreeTileSourceLayer(owner.source)
      const after = cloneFreeTileSourceLayer(owner.source)
      if (changes.name !== undefined) after.name = changes.name.trim() || before.name
      if (changes.description !== undefined) after.description = changes.description
      if ('displayColor' in changes) after.displayColor = changes.displayColor ? { ...changes.displayColor } : undefined
       if (changes.visible !== undefined) after.visible = changes.visible
       if (changes.locked !== undefined) after.locked = changes.locked
      if (changes.offsetX !== undefined) after.offsetX = Math.trunc(changes.offsetX)
      if (changes.offsetY !== undefined) after.offsetY = Math.trunc(changes.offsetY)
      if (freeTileSourceLayerEqual(before, after)) return
      const apply = (snapshot: FreeTileSourceLayer): void => {
        applyFreeTileSourceLayerSnapshot(session.document, snapshot)
      }
      apply(after)
      session.history.push({
        label: tr('workspace.history.layerProperties'),
        bytes: 256,
        undo: () => apply(before),
        redo: () => apply(after),
        invalidation: { kind: 'full' },
        affectedLayerIds: freeTileLayerIdsForSource(session.document, owner.source.id),
        contentChanged: true,
        requiresAnimationSync: false
      })
      touch(session, true, { kind: 'full' })
      recordDocumentOperation(session)
      changed = true
    }, false)
    return changed
  },

  beginFreeTileSourcePropertiesTransaction(sourceId) {
    let id: string | null = null
    get().mutateActive((session) => {
      id = beginFreeTileSourcePropertiesTransactionCommand(documentTransactions, session, sourceId)
    }, false)
    return id
  },

  previewFreeTileSourcePropertiesTransaction(id, changes) {
    let changed = false
    get().mutateActive((session) => {
      changed = previewFreeTileSourcePropertiesTransactionCommand(documentTransactions, session, id, changes)
    }, false)
    return changed
  },

  commitFreeTileSourcePropertiesTransaction(id, changes) {
    let changed = false
    get().mutateActive((session) => {
      changed = commitFreeTileSourcePropertiesTransactionCommand(documentTransactions, session, id, changes)
      if (!changed) return
      touch(session, true, { kind: 'full' })
      recordDocumentOperation(session)
    }, false)
    return changed
  },

  cancelFreeTileSourcePropertiesTransaction(id) {
    let canceled = false
    get().mutateActive((session) => {
      canceled = cancelFreeTileSourcePropertiesTransactionCommand(documentTransactions, session, id)
    }, false)
    return canceled
  },

  previewFreeTileSource(sourceId, width, height, pixels, offsetX, offsetY) {
    let changed = false
    get().mutateActive((session) => {
      const before = captureFreeTileSourceSnapshot(session.document, sourceId)
      if (!before) return
      changed = applyFreeTileSourceSnapshot(session.document, {
        sourceId: before.sourceId,
        tilesetId: before.tilesetId,
        width,
        height,
        pixels,
        offsetX,
        offsetY
      })
      if (changed) {
        const fromRevision = session.contentRevision
        session.revision += 1
        session.contentRevision += 1
        session.layersPanelRevision += 1
        session.contentInvalidation = { kind: 'full', fromRevision, revision: session.contentRevision }
      }
    }, false)
    return changed
  },

  commitFreeTileSourceEdit(sourceId, before, after, label, placementEdit, selectionEdit) {
    let committed: HistoryEntry | null = null
    get().mutateActive((session) => {
      committed = commitFreeTileSourceEditInSession(session, sourceId, before, after, label, placementEdit, selectionEdit)
    }, false)
    return committed
  },

  beginFreeTilePlacement() {
    const session = activeSession(get())
    let target = session ? activeFreeTileCelTarget(session.document) : null
    if (session && !target) {
      const timeline = ensureAnimationDocument(session.document)
      const layer = session.document.layers.find((candidate) => candidate.id === session.document.activeLayerId && candidate.kind === 'free-tile')
      const frameId = timeline.activeFrameId
      if (layer && timeline.frames.some((frame) => frame.id === frameId)) {
        ensureAnimationCelSlot(session.document, layer.id, frameId)
        target = activeFreeTileCelTarget(session.document)
      }
    }
    return target ? {
      layerId: target.layer.id,
      frameId: target.cel.frameId,
      before: cloneFreeTileCelData(target.freeTiles),
      after: cloneFreeTileCelData(target.freeTiles),
      dirtyRect: null
    } : null
  },

  previewFreeTilePlacement(edit) {
    let changed = false
    get().mutateActive((session) => {
      const target = activeFreeTileCelTarget(session.document)
      if (!target || target.layer.id !== edit.layerId || target.cel.frameId !== edit.frameId) return
      changed = applyFreeTilePlacementEdit(session.document, edit, 'after')
      if (changed) {
        const fromRevision = session.contentRevision
        session.revision += 1
        session.contentRevision += 1
        session.contentInvalidation = { kind: 'full', fromRevision, revision: session.contentRevision }
      }
    }, false)
    return changed
  },

  commitFreeTilePlacement(edit, label, selectionEdit) {
    const placementChanged = !freeTileCelDataEqual(edit.before, edit.after)
    const beforeSelection = cloneSelectionMask(selectionEdit?.before ?? null)
    const afterSelection = cloneSelectionMask(selectionEdit?.after ?? null)
    const beforeSelectionPivot = selectionEdit?.beforePivot ? { ...selectionEdit.beforePivot } : null
    const afterSelectionPivot = selectionEdit?.afterPivot ? { ...selectionEdit.afterPivot } : null
    const selectionChanged = Boolean(selectionEdit && (
      !selectionMasksEqual(beforeSelection, afterSelection)
      || beforeSelectionPivot?.x !== afterSelectionPivot?.x
      || beforeSelectionPivot?.y !== afterSelectionPivot?.y
    ))
    if (!placementChanged && !selectionChanged) return null
    let committed: HistoryEntry | null = null
    get().mutateActive((session) => {
      const target = activeFreeTileCelTarget(session.document)
      if (!target || target.layer.id !== edit.layerId || target.cel.frameId !== edit.frameId) return
      const applyBefore = (): void => {
        if (placementChanged) applyFreeTilePlacementEdit(session.document, edit, 'before')
        if (selectionEdit) {
          session.selection = cloneSelectionMask(beforeSelection)
          session.selectionPivot = beforeSelectionPivot ? { ...beforeSelectionPivot } : null
        }
      }
      const applyAfter = (): void => {
        if (placementChanged) applyFreeTilePlacementEdit(session.document, edit, 'after')
        if (selectionEdit) {
          session.selection = cloneSelectionMask(afterSelection)
          session.selectionPivot = afterSelectionPivot ? { ...afterSelectionPivot } : null
        }
      }
      applyAfter()
      const entry: HistoryEntry = {
        label,
        bytes: (placementChanged ? (edit.before.instances.length + edit.after.instances.length) * 72 : 0)
          + (beforeSelection?.mask?.byteLength ?? 0)
          + (afterSelection?.mask?.byteLength ?? 0)
          + (selectionEdit ? 64 : 0),
        undo: applyBefore,
        redo: applyAfter,
        ...(placementChanged ? { invalidation: { kind: 'full' as const }, affectedLayerIds: [edit.layerId] } : {}),
        documentChanged: placementChanged,
        contentChanged: placementChanged,
        requiresAnimationSync: false
      }
      session.history.push(entry)
      if (placementChanged) {
        touch(session, true, { kind: 'full' })
        recordDocumentOperation(session, { stroke: true })
      }
      committed = entry
    }, false)
    return committed
  },

  cancelFreeTilePlacement(edit) {
    get().mutateActive((session) => {
      applyFreeTilePlacementEdit(session.document, edit, 'before')
    }, false)
  },

  setSelectedTileset(id) {
    get().mutateActive((session) => {
      const tileset = session.document.tilesets?.find((candidate) => candidate.id === id)
      if (!tileset) return
      session.selectedTilesetId = tileset.id
      clearFreeTileInstanceSelection(session)
      session.selectedTileId = tileset.tileIds.includes(session.selectedTileId ?? '') ? session.selectedTileId : tileset.tileIds[0] ?? null
      session.secondaryTileId = tileset.tileIds.includes(session.secondaryTileId ?? '') ? session.secondaryTileId : tileset.tileIds[0] ?? null
    }, false)
  },

  setSelectedTile(tilesetId, tileId, role = 'primary') {
    get().mutateActive((session) => {
      const tileset = session.document.tilesets?.find((candidate) => candidate.id === tilesetId)
      if (!tileset?.tileIds.includes(tileId)) return
      session.selectedTilesetId = tileset.id
      clearFreeTileInstanceSelection(session)
      if (role === 'secondary') session.secondaryTileId = tileId
      else session.selectedTileId = tileId
      session.selectedTileId = tileset.tileIds.includes(session.selectedTileId ?? '') ? session.selectedTileId : tileset.tileIds[0] ?? null
      session.secondaryTileId = tileset.tileIds.includes(session.secondaryTileId ?? '') ? session.secondaryTileId : tileset.tileIds[0] ?? null
    }, false)
  },

  reorderTilesetTiles(tilesetId, orderedTileIds) {
    let reordered = false
    get().mutateActive((session) => {
      const tileset = session.document.tilesets?.find((candidate) => candidate.id === tilesetId)
      if (!tileset) return
      const before = cloneTileset(tileset)
      const after = reorderTilesetTilesData(tileset, orderedTileIds)
      if (!after) return
      const replace = (snapshot: Tileset): void => {
        const replacement = cloneTileset(snapshot)
        session.document.tilesets = (session.document.tilesets ?? []).map((candidate) => candidate.id === tilesetId ? replacement : candidate)
        markRasterStorageContentChanged(replacement.pixels)
        rerenderTilesetReferences(session.document, tilesetId)
        rerenderFreeTileReferences(session.document, tilesetId)
      }
      replace(after)
      session.history.push({
        label: tr('workspace.history.reorderTilesetTiles'),
        bytes: before.pixels.byteLength + after.pixels.byteLength + (before.tileIds.length + after.tileIds.length) * 32,
        undo: () => replace(before),
        redo: () => replace(after),
        invalidation: { kind: 'full' },
        affectedLayerIds: session.document.layers.flatMap((layer) => (layer.kind === 'tilemap' && layer.tilemapTilesetId === tilesetId) || (layer.kind === 'free-tile' && layer.freeTileSources?.some((source) => source.tilesetId === tilesetId)) ? [layer.id] : []),
        requiresAnimationSync: false
      })
      touch(session, true, { kind: 'full' })
      recordDocumentOperation(session)
      reordered = true
    }, false)
    return reordered
  },

  setTilesetTileSlots(tilesetId, requestedSlots) {
    let repositioned = false
    get().mutateActive((session) => {
      const tileset = session.document.tilesets?.find((candidate) => candidate.id === tilesetId)
      if (!tileset) return
      const before = compactTilesetTileSlots(tileset.tileIds, tileset.tileSlots)
      const after = setTilesetTileSlotsData(tileset, requestedSlots)
      if (!after?.tileSlots) return
      const afterSlots = [...after.tileSlots]
      const apply = (tileSlots: Array<string | null>): void => {
        const current = session.document.tilesets?.find((candidate) => candidate.id === tilesetId)
        if (current) current.tileSlots = [...tileSlots]
      }
      apply(afterSlots)
      session.history.push({
        label: tr('workspace.history.reorderTilesetTiles'),
        bytes: (before.length + afterSlots.length) * 24,
        undo: () => apply(before),
        redo: () => apply(afterSlots),
        invalidation: { kind: 'full' },
        requiresAnimationSync: false
      })
      touch(session, true, { kind: 'full' })
      recordDocumentOperation(session)
      repositioned = true
    }, false)
    return repositioned
  },

  addTilesetTile(tilesetId) {
    let addedTileId: string | null = null
    get().mutateActive((session) => {
      const tileset = session.document.tilesets?.find((candidate) => candidate.id === tilesetId)
      if (!tileset) return
      const before = cloneTileset(tileset)
      const beforeSelection = { tilesetId: session.selectedTilesetId, tileId: session.selectedTileId, secondaryTileId: session.secondaryTileId }
      const tileId = createId('tile')
      const after = appendBlankTilesetTile(tileset, tileId)
      const replace = (snapshot: Tileset): void => {
        const replacement = cloneTileset(snapshot)
        session.document.tilesets = (session.document.tilesets ?? []).map((candidate) => candidate.id === tilesetId ? replacement : candidate)
        markRasterStorageContentChanged(replacement.pixels)
      }
      replace(after)
      session.selectedTilesetId = tilesetId
      session.selectedTileId = tileId
      const afterSelection = { tilesetId: session.selectedTilesetId, tileId: session.selectedTileId, secondaryTileId: session.secondaryTileId }
      session.history.push({
        label: tr('workspace.history.addTilesetTile'),
        bytes: before.pixels.byteLength + after.pixels.byteLength + (before.tileIds.length + after.tileIds.length) * 32,
        undo: () => { replace(before); session.selectedTilesetId = beforeSelection.tilesetId; session.selectedTileId = beforeSelection.tileId; session.secondaryTileId = beforeSelection.secondaryTileId },
        redo: () => { replace(after); session.selectedTilesetId = afterSelection.tilesetId; session.selectedTileId = afterSelection.tileId; session.secondaryTileId = afterSelection.secondaryTileId },
        invalidation: { kind: 'full' },
        requiresAnimationSync: false
      })
      touch(session, true, { kind: 'full' })
      recordDocumentOperation(session)
      addedTileId = tileId
    }, false)
    return addedTileId
  },

  deleteTilesetTile(tilesetId, tileId) {
    return get().deleteTilesetTiles(tilesetId, [tileId])
  },

  deleteTilesetTiles(tilesetId, tileIds) {
    let deleted = false
    get().mutateActive((session) => {
      const tileset = session.document.tilesets?.find((candidate) => candidate.id === tilesetId)
      if (!tileset) return
      const after = deleteTilesetTilesData(tileset, tileIds)
      if (!after) return
      const before = cloneTileset(tileset)
      const retainedTileIds = new Set(after.tileIds)
      const deletedTileIds = before.tileIds.filter((tileId) => !retainedTileIds.has(tileId))
      const references = deletedTileIds.flatMap((tileId) => captureTilesetTileReferences(session.document, tilesetId, tileId))
      const freeTileReferences = deletedTileIds.flatMap((tileId) => captureFreeTileReferences(session.document, tilesetId, tileId))
      const beforeSelection = { tilesetId: session.selectedTilesetId, tileId: session.selectedTileId, secondaryTileId: session.secondaryTileId }
      const replace = (snapshot: Tileset): void => {
        const replacement = cloneTileset(snapshot)
        session.document.tilesets = (session.document.tilesets ?? []).map((candidate) => candidate.id === tilesetId ? replacement : candidate)
        markRasterStorageContentChanged(replacement.pixels)
      }
      replace(after)
      applyTilesetTileReferences(session.document, references, 'clear')
      applyFreeTileReferences(session.document, freeTileReferences, 'clear')
      session.selectedTilesetId = tilesetId
      const firstDeletedIndex = Math.min(...deletedTileIds.map((tileId) => before.tileIds.indexOf(tileId)))
      const fallbackTileId = after.tileIds[Math.min(firstDeletedIndex, after.tileIds.length - 1)] ?? after.tileIds[0] ?? null
      session.selectedTileId = after.tileIds.includes(session.selectedTileId ?? '') ? session.selectedTileId : fallbackTileId
      session.secondaryTileId = after.tileIds.includes(session.secondaryTileId ?? '') ? session.secondaryTileId : fallbackTileId
      const afterSelection = { tilesetId: session.selectedTilesetId, tileId: session.selectedTileId, secondaryTileId: session.secondaryTileId }
      session.history.push({
        label: tr('workspace.history.deleteTilesetTile'),
        bytes: before.pixels.byteLength + after.pixels.byteLength + references.length * 96 + freeTileReferences.length * 72,
        undo: () => {
          replace(before)
          applyTilesetTileReferences(session.document, references, 'restore')
          applyFreeTileReferences(session.document, freeTileReferences, 'restore')
          session.selectedTilesetId = beforeSelection.tilesetId
          session.selectedTileId = beforeSelection.tileId
          session.secondaryTileId = beforeSelection.secondaryTileId
        },
        redo: () => {
          replace(after)
          applyTilesetTileReferences(session.document, references, 'clear')
          applyFreeTileReferences(session.document, freeTileReferences, 'clear')
          session.selectedTilesetId = afterSelection.tilesetId
          session.selectedTileId = afterSelection.tileId
          session.secondaryTileId = afterSelection.secondaryTileId
        },
        invalidation: { kind: 'full' },
        requiresAnimationSync: false
      })
      touch(session, true, { kind: 'full' })
      recordDocumentOperation(session)
      deleted = true
    }, false)
    return deleted
  },

  previewTilesetTilePixels(tilesetId, tileId, pixels) {
    let changed = false
    get().mutateActive((session) => {
      const tileset = session.document.tilesets?.find((candidate) => candidate.id === tilesetId)
      if (!tileset || !writeTilesetTilePixels(tileset, tileId, pixels)) return
      markRasterStorageContentChanged(tileset.pixels)
      rerenderTilesetTileReferences(session.document, tilesetId, tileId)
      rerenderFreeTileReferences(session.document, tilesetId, tileId)
      changed = true
    }, false)
    return changed
  },

  commitTilesetTileEdit(tilesetId, tileId, before, after) {
    if (before.length !== after.length || before.every((value, index) => value === after[index])) return false
    let committed = false
    get().mutateActive((session) => {
      const tileset = session.document.tilesets?.find((candidate) => candidate.id === tilesetId)
      if (!tileset || before.length !== tileset.tileWidth * tileset.tileHeight * 4) return
      const beforePixels = before.slice()
      const afterPixels = after.slice()
      const apply = (pixels: Uint8ClampedArray): void => {
        const current = session.document.tilesets?.find((candidate) => candidate.id === tilesetId)
        if (!current || !writeTilesetTilePixels(current, tileId, pixels)) return
        markRasterStorageContentChanged(current.pixels)
        rerenderTilesetTileReferences(session.document, tilesetId, tileId)
        rerenderFreeTileReferences(session.document, tilesetId, tileId)
      }
      apply(afterPixels)
      session.history.push({
        label: tr('workspace.history.editTilesetTile'),
        bytes: beforePixels.byteLength + afterPixels.byteLength,
        undo: () => apply(beforePixels),
        redo: () => apply(afterPixels),
        invalidation: { kind: 'full' },
        requiresAnimationSync: false
      })
      touch(session, true, { kind: 'full' })
      recordDocumentOperation(session)
      committed = true
    }, false)
    return committed
  },

  setTimelapseSettings(settings) {
    const state = get()
    const session = activeSession(state)
    if (!session) return
    const current = normalizeTimelapseSettings(session.document.timelapse, session.document.timelapse?.snapshots ?? [])
    const next = normalizeTimelapseSettings({ ...current, ...settings }, current.snapshots)
    session.document.timelapse = next
    if (current.mode !== next.mode || !next.enabled) {
      const cache = timelapseCaptureCaches.get(session.document)
      if (cache) resetTimelapseSmartCapture(cache)
    }
    if (current.mode !== next.mode || !next.enabled) timelapseCaptureGenerations.set(session.document, (timelapseCaptureGenerations.get(session.document) ?? 0) + 1)
    touch(session)
    set({ sessions: [...state.sessions] })
  },

  clearTimelapse() {
    const state = get()
    const session = activeSession(state)
    if (!session) return
    timelapseCaptureGenerations.set(session.document, (timelapseCaptureGenerations.get(session.document) ?? 0) + 1)
    const cache = timelapseCaptureCaches.get(session.document)
    if (cache) resetTimelapseSmartCapture(cache)
    session.document.timelapse = { ...normalizeTimelapseSettings(session.document.timelapse), snapshots: [] }
    touch(session)
    set({ sessions: [...state.sessions] })
  },

  async exportTimelapse(format, options) {
    const session = activeSession(get())
    if (!session) return false
    await flushTimelapseCapture(session)
    let progressStarted = false
    let exportTaskCurrent = 1
    let exportTaskTotal = 1
    let canceled = false
    let nativeCancel: (() => void) | null = null
    const cancel = (): void => {
      if (canceled) return
      canceled = true
      nativeCancel?.()
      if (get().saveProgress) set({ saveProgress: null })
    }
    const onCancelReady = (nextCancel: () => void): void => {
      nativeCancel = nextCancel
      if (canceled) nextCancel()
    }
    activeExportCancellation = cancel
    const exportProgressTitle = (): string => exportTaskTotal > 1
      ? `${tr('workspace.export.progressTitle')} (${exportTaskCurrent}/${exportTaskTotal})`
      : tr('workspace.export.progressTitle')
    const updateProgress = (value: number, label: string): void => {
      if (progressStarted && !get().saveProgress) return
      progressStarted = true
      set({ saveProgress: { title: exportProgressTitle(), value: Math.max(0, Math.min(100, Math.round(value))), label } })
    }
    try {
      const videoExport = isTimelapseVideoFormat(format)
      exportTaskTotal = videoExport ? 1 : normalizeTimelapseSettings(session.document.timelapse, session.document.timelapse?.snapshots ?? []).snapshots.length
      const encodingLabel = tr(videoExport ? 'workspace.export.videoEncoding' : 'workspace.export.encoding')
      const message = await exportTimelapseFile(window.moonSprite, session.document, format, options, {
        onEncodeStart: () => updateProgress(8, encodingLabel),
        onEncodeProgress: (value) => updateProgress(8 + value * (videoExport ? 0.7 : 0.84), encodingLabel),
        onWriteStart: () => updateProgress(82, tr('workspace.save.writing')),
        onExportTaskStart: (current, total) => {
          exportTaskCurrent = current
          exportTaskTotal = total
          const progress = get().saveProgress
          if (progress) set({ saveProgress: { ...progress, title: exportProgressTitle() } })
        },
        onConflict: createExportConflictHandler(get().requestDialog, exportTaskTotal > 1),
        onCancelReady,
        isCanceled: () => canceled
      })
      if (!message) return false
      set({ message, saveProgress: progressStarted ? { title: exportProgressTitle(), value: 100, label: tr('workspace.export.done'), requiresConfirmation: true } : null })
      recordUsageExport(format)
      return true
    } catch (error) {
      if (canceled) {
        set({ saveProgress: null })
        return false
      }
      set({ message: error instanceof Error ? error.message : tr('timelapse.exportFailed'), ...(progressStarted ? { saveProgress: null } : {}) })
      return false
    } finally {
      if (activeExportCancellation === cancel) activeExportCancellation = null
    }
  },

  pushHistory(entry) {
    const state = get()
    const session = activeSession(state)
    if (!session) return
    session.history.push(entry)
    if (session.activeLayerMaskId && !findLayerMask(session.document, session.activeLayerMaskId)) session.activeLayerMaskId = null
    if (entry.documentChanged !== false && entry.requiresAnimationSync !== false) {
      if (entry.affectedLayerIds?.length) for (const layerId of entry.affectedLayerIds) syncActiveAnimationLayer(session.document, layerId)
      else syncActiveAnimationFrame(session.document)
    }
    ensureLayerSelection(session)
    if (entry.requiresAnimationSelectionNormalization === true) normalizeAnimationSelection(session)
    persistProjectLayerPanelState(session)
    if (entry.documentChanged !== false) {
      if (entry.contentChanged === false) touchMetadata(session)
      else touch(session, true, entry.invalidation)
      recordDocumentOperation(session, undefined, entry.contentChanged !== false)
    }
    set({ sessions: [...state.sessions] })
  },

  undo() {
    let session = activeSession(get())
    if (session && isCanvasToolGestureLocked()) {
      const documentId = session.document.id
      deferCanvasShortcut(() => { if (get().activeId === documentId) get().undo() })
      return
    }
    if (session) flushViewPreview(session.document.id)
    session = activeSession(get())
    if (session && consumeCanvasResizePreviewHistory(session.document.id, 'undo')) return
    if (session && consumePendingCanvasGestureHistory(session.document.id, 'undo')) return
    if (session?.pendingPaste) {
      if (undoFloatingSelectionBoxMove(session)) {
        set((state) => ({ sessions: [...state.sessions] }))
        return
      }
      if (restoreMovedClipboardPaste(session)) {
        set((state) => ({ sessions: [...state.sessions] }))
        return
      }
      get().cancelFloatingPaste()
      return
    }
    if (session?.textBoxTransform) get().cancelTextBoxTransform()
    if (!session?.history.canUndo) return
    const showsRollbackProgress = isProjectRollbackHistoryEntry(session.history.latestUndoEntry)
    if (showsRollbackProgress && !isApplyingDeferredProjectRollbackHistory) {
      const documentId = session.document.id
      deferProjectRollbackHistoryChange(() => {
        if (activeSession(get())?.document.id === documentId) get().undo()
      })
      return
    }
    const hadTilesetPanelContent = documentUsesTilesetPanel(session.document)
    get().mutateActive((session) => {
      // History entries for drawing retain the layer/frame activity from the
      // edit. Stop the playhead first so restoring that snapshot returns to
      // the edited cel instead of letting playback immediately advance again.
      if (session.animationPlaying) {
        session.animationPlaying = false
        session.animationPlaybackStartFrameId = null
        clearAnimationLoopPlayback(session)
      }
      const view = { ...session.view }
      const entry = session.history.undo()
      Object.assign(session.view, view)
      if (!entry) return
      session.liquifyResetHistoryPosition = null
      session.liquifyResetHistoryRevision = null
      if (session.activeLayerMaskId && !findLayerMask(session.document, session.activeLayerMaskId)) session.activeLayerMaskId = null
      if (entry.documentChanged !== false && entry.requiresAnimationSync !== false) {
        if (entry.affectedLayerIds?.length) for (const layerId of entry.affectedLayerIds) syncActiveAnimationLayer(session.document, layerId)
        else syncActiveAnimationFrame(session.document)
      }
      if (entry.requiresAnimationSelectionNormalization === true) normalizeAnimationSelection(session)
      if (entry.documentChanged !== false) {
        if (entry.contentChanged === false) touchMetadata(session)
        else touch(session, true, entry.invalidation)
        recordDocumentOperation(session, undefined, entry.contentChanged !== false && shouldCaptureTimelapseHistoryStep(session))
      }
    }, false)
    const hasTilesetPanelContent = documentUsesTilesetPanel(activeSession(get())?.document)
    if (hadTilesetPanelContent !== hasTilesetPanelContent) requestTilesetPanelVisibility(hasTilesetPanelContent)
  },

  redo() {
    let session = activeSession(get())
    if (session && isCanvasToolGestureLocked()) {
      const documentId = session.document.id
      deferCanvasShortcut(() => { if (get().activeId === documentId) get().redo() })
      return
    }
    if (session) flushViewPreview(session.document.id)
    session = activeSession(get())
    if (session && consumeCanvasResizePreviewHistory(session.document.id, 'redo')) return
    if (session?.textBoxTransform) get().cancelTextBoxTransform()
    session = activeSession(get())
    if (session && consumePendingCanvasGestureHistory(session.document.id, 'redo')) return
    if (session?.pendingPaste && redoFloatingSelectionBoxMove(session)) {
      set((state) => ({ sessions: [...state.sessions] }))
      return
    }
    if (!session?.history.canRedo) return
    const showsRollbackProgress = session.history.timeline.entries[session.history.position]?.label === PROJECT_ROLLBACK_HISTORY_LABEL
    if (showsRollbackProgress && !isApplyingDeferredProjectRollbackHistory) {
      const documentId = session.document.id
      deferProjectRollbackHistoryChange(() => {
        if (activeSession(get())?.document.id === documentId) get().redo()
      })
      return
    }
    const hadTilesetPanelContent = documentUsesTilesetPanel(session.document)
    get().mutateActive((session) => {
      const view = { ...session.view }
      const entry = session.history.redo()
      Object.assign(session.view, view)
      if (!entry) return
      session.liquifyResetHistoryPosition = null
      session.liquifyResetHistoryRevision = null
      if (session.activeLayerMaskId && !findLayerMask(session.document, session.activeLayerMaskId)) session.activeLayerMaskId = null
      if (entry.documentChanged !== false && entry.requiresAnimationSync !== false) {
        if (entry.affectedLayerIds?.length) for (const layerId of entry.affectedLayerIds) syncActiveAnimationLayer(session.document, layerId)
        else syncActiveAnimationFrame(session.document)
      }
      if (entry.requiresAnimationSelectionNormalization === true) normalizeAnimationSelection(session)
      if (entry.documentChanged !== false) {
        if (entry.contentChanged === false) touchMetadata(session)
        else touch(session, true, entry.invalidation)
        recordDocumentOperation(session, undefined, entry.contentChanged !== false && shouldCaptureTimelapseHistoryStep(session))
      }
    }, false)
    const hasTilesetPanelContent = documentUsesTilesetPanel(activeSession(get())?.document)
    if (hadTilesetPanelContent !== hasTilesetPanelContent) requestTilesetPanelVisibility(hasTilesetPanelContent)
  },

  setHistoryPosition(position) {
    const initial = activeSession(get())
    if (!initial || !Number.isFinite(position)) return
    if (isCanvasToolGestureLocked()) {
      const documentId = initial.document.id
      deferCanvasShortcut(() => { if (get().activeId === documentId) get().setHistoryPosition(position) })
      return
    }
    if (consumeCanvasResizePreviewHistory(initial.document.id, position < initial.history.position ? 'undo' : 'redo')) return
    const documentId = initial.document.id
    const target = Math.max(0, Math.min(initial.history.length, Math.trunc(position)))
    if (!isApplyingDeferredProjectRollbackHistory && historyPositionIncludesProjectRollback(initial.history.timeline.entries, initial.history.position, target)) {
      deferProjectRollbackHistoryChange(() => {
        if (activeSession(get())?.document.id === documentId) get().setHistoryPosition(target)
      })
      return
    }
    const maximumSteps = Math.abs(initial.history.position - target) + 16
    for (let step = 0; step < maximumSteps; step += 1) {
      const session = activeSession(get())
      if (!session || session.document.id !== documentId || session.history.position === target) return
      if (session.history.position > target) get().undo()
      else get().redo()
    }
  },

  setActiveAnimationFrame(frameId) {
    get().commitFloatingPaste()
    get().mutateActive((session) => {
      // Frame focus is a session/UI interaction. Do not normalize a sparse
      // timeline or materialize blank cels merely because the user clicked a
      // frame; editing commands explicitly use the materializing path.
      if (!activateAnimationFrame(session.document, frameId, false)) return
      // When tag playback is already running, changing the active frame from
      // a cel/group-cel interaction must retarget playback to the tag that
      // owns that frame, just like clicking a frame header does. Keep this in
      // the shared active-frame boundary so every timeline cell surface gets
      // the same behavior without coupling the panel's transient group state
      // to playback.
      retargetAnimationLoopPlaybackAtFrame(session, frameId)
      const preserveMaskContext = (session.selectedAnimationMaskRowKeys?.length ?? 0) > 0
        || (session.selectedAnimationMaskCellKeys?.length ?? 0) > 0
        || session.activeLayerMaskId !== null
      if (!preserveMaskContext) {
        session.activeLayerMaskId = null
        session.layerMaskIsolatedView = false
      }
      session.lastPencilPoint = null
      session.lastEraserPoint = null
      if (!session.animationPlaying) setTimelineActiveFrame(session, frameId)
      session.revision += 1
    }, false)
  },

  stepAnimationFrame(delta) {
    // Frame stepping has the same transaction boundary as clicking a frame:
    // finish the floating transform on its originating frame first, while
    // retaining the resulting selection mask for the destination frame.
    get().commitFloatingPaste()
    const session = activeSession(get())
    if (!session) return
    const timeline = ensureAnimationDocument(session.document)
    if (timeline.frames.length < 2 || Math.sign(delta) === 0) return
    const current = timeline.frames.findIndex((frame) => frame.id === timeline.activeFrameId)
    const direction = Math.sign(delta)
    const skipDisabledFrames = loadEditorPreferences().skipDisabledFrames
    const activeLoopSection = animationLoopSectionAtFrame(timeline, timeline.activeFrameId)
    const loopSectionFrameId = activeLoopSection
      ? stepAnimationLoopSectionFrameId(timeline, activeLoopSection, timeline.activeFrameId, direction > 0 ? 1 : -1, skipDisabledFrames)
      : null
    const frameId = skipDisabledFrames
      ? activeLoopSection
        ? loopSectionFrameId
        : stepAnimationFrameId(timeline, current < 0 ? '' : timeline.activeFrameId, direction > 0 ? 1 : -1)
      : null
    const frame = skipDisabledFrames
      ? frameId ? timeline.frames.find((candidate) => candidate.id === frameId) : null
      : activeLoopSection
        ? timeline.frames.find((candidate) => candidate.id === (loopSectionFrameId ?? ''))
        : timeline.frames[current < 0
          ? direction > 0 ? 0 : timeline.frames.length - 1
          : (current + direction + timeline.frames.length) % timeline.frames.length]
    if (!frame || frame.id === timeline.activeFrameId) return
    if (session.selectedAnimationFrameIds.length > 0) {
      get().selectAnimationFrame(frame.id)
      return
    }
    // Keep implicit timeline navigation free of selection normalization. The
    // generic setActiveAnimationFrame command intentionally repairs layer
    // selection, but arrow-key active-only navigation must not synthesize
    // selected layer/group/cel state as a side effect.
    const state = get()
    const currentSession = activeSession(state)
    const preserveMaskContext = Boolean(currentSession
      && ((currentSession.selectedAnimationMaskRowKeys?.length ?? 0) > 0
        || (currentSession.selectedAnimationMaskCellKeys?.length ?? 0) > 0
        || currentSession.activeLayerMaskId !== null))
    if (!currentSession || !activateAnimationFrame(currentSession.document, frame.id)) return
    if (!preserveMaskContext) {
      currentSession.activeLayerMaskId = null
      currentSession.layerMaskIsolatedView = false
    }
    currentSession.lastPencilPoint = null
    currentSession.lastEraserPoint = null
    setTimelineActiveFrame(currentSession, frame.id)
    currentSession.revision += 1
    set({ sessions: [...state.sessions] })
  },

  stepLayerSelection(delta) {
    const session = activeSession(get())
    const direction = Math.sign(delta)
    if (!session || direction === 0) return
    const nodes = buildLayerPanelTree({
      layers: session.document.layers,
      groups: session.document.groups,
      collapsedGroupIds: session.collapsedGroupIds
    })
    if (nodes.length === 0) return
    const focusId = session.layerSelectionAnchorId ?? session.selectedGroupId ?? session.document.activeLayerId
    let index = nodes.findIndex((node) => node.id === focusId)
    if (index < 0) index = nodes.findIndex((node) => node.kind === 'layer' && node.id === session.document.activeLayerId)
    if (index < 0) index = direction > 0 ? -1 : nodes.length
    for (let next = index + direction; next >= 0 && next < nodes.length; next += direction) {
      const node = nodes[next]
      if (node.kind !== 'layer') continue
      const hasExplicitLayerSelection = session.layerSelectionExplicit === true
        || session.selectedGroupId !== null
        || session.selectedGroupIds.length > 0
      if (hasExplicitLayerSelection) get().selectLayer(node.id)
      else {
        // Active-only navigation is intentionally kept outside mutateActive:
        // its normalization boundary would repopulate selectedLayerIds from
        // the active layer and turn implicit focus into an explicit selection.
        const state = get()
        const current = activeSession(state)
        if (!current) return
        current.document.activeLayerId = node.id
        current.selectedLayerIds = []
        current.selectedGroupIds = []
        current.selectedGroupId = null
        current.layerSelectionAnchorId = node.id
        current.activeLayerMaskId = null
        current.layerMaskIsolatedView = false
        set({ sessions: [...state.sessions] })
      }
      return
    }
  },

  selectAnimationFrame(frameId, mode = 'replace') {
    const playbackSession = activeSession(get())
    const preservePlaybackFrame = playbackSession?.animationPlaying === true
    const retargetLoopPlayback = preservePlaybackFrame && playbackSession?.animationPlaybackMode === 'tag'
    get().mutateActive((session) => {
      const timeline = session.document.animation
      if (!timeline) return
      if (!timeline.frames.some((frame) => frame.id === frameId)) return
      // During playback the timeline playhead is independent from the frame
      // being selected for an action such as disabling or copying. Changing
      // activeFrameId here would make the playhead jump to the context-menu
      // target and can drop the highlight from the frame actually playing.
      const selectedMaskCellOwnerKeys = [...new Set(session.selectedAnimationMaskCellKeys.flatMap((key) => {
        const target = parseAnimationCelKey(key)
        if (!target) return []
        if (session.document.layers.some((layer) => layer.id === target.layerId)) return [`layer:${target.layerId}`]
        if (session.document.groups.some((group) => group.id === target.layerId)) return [`group:${target.layerId}`]
        return []
      }))]
      const preserveMaskContext = session.selectedAnimationMaskRowKeys.length > 0
        || selectedMaskCellOwnerKeys.length > 0
        || session.activeLayerMaskId !== null
      if (preserveMaskContext && !preservePlaybackFrame) activateAnimationFrame(session.document, frameId, false)
      session.selectedAnimationCellKeys = []
      session.animationCellSelectionAnchorKey = null
      session.animationCellSelectionExplicit = false
      session.selectedAnimationMaskCellKeys = []
      const preservedMaskRowKeys = preserveMaskContext
        ? [...new Set([...session.selectedAnimationMaskRowKeys, ...selectedMaskCellOwnerKeys])]
        : []
      const preservedActiveMaskId = preserveMaskContext ? session.activeLayerMaskId : null
      session.selectedAnimationMaskRowKeys = preservedMaskRowKeys
      session.animationMaskCellSelectionAnchorKey = null
      session.activeLayerMaskId = preservedActiveMaskId
      if (!preserveMaskContext) session.layerMaskIsolatedView = false
      const preserveExplicitLayerContext = session.layerSelectionExplicit === true
        && session.selectedLayerIds.length > 0
        && session.selectedGroupIds.length === 0
        && session.selectedGroupId === null
      // Animation frame selection is mutually exclusive with layer/group
      // selection. Keep layerSelectionAnchorId as a non-selecting context
      // hint so the timeline can retain the previous group as active context
      // without leaving descendant layers formally selected.
      if (preserveMaskContext) session.selectedLayerIds = []
      session.selectedGroupIds = []
      session.selectedGroupId = null
      session.layerSelectionExplicit = preserveMaskContext ? false : preserveExplicitLayerContext
      const current = new Set(session.selectedAnimationFrameIds)
      if (mode === 'range' && session.animationFrameSelectionAnchorId) {
        const start = timeline.frames.findIndex((frame) => frame.id === session.animationFrameSelectionAnchorId)
        const end = timeline.frames.findIndex((frame) => frame.id === frameId)
        if (start >= 0 && end >= 0) {
          const [from, to] = start <= end ? [start, end] : [end, start]
          session.selectedAnimationFrameIds = timeline.frames.slice(from, to + 1).map((frame) => frame.id)
        }
      } else if (mode === 'toggle') {
        if (current.has(frameId)) current.delete(frameId)
        else current.add(frameId)
        session.selectedAnimationFrameIds = timeline.frames.map((frame) => frame.id).filter((id) => current.has(id))
      } else {
        session.selectedAnimationFrameIds = [frameId]
      }
      if (mode !== 'toggle' || session.animationFrameSelectionAnchorId === null) session.animationFrameSelectionAnchorId = frameId
      if (!preservePlaybackFrame || retargetLoopPlayback) setTimelineActiveFrame(session, frameId)
    }, false)
    if (!preservePlaybackFrame || retargetLoopPlayback) get().setActiveAnimationFrame(frameId)
  },

  selectAnimationCell(key, mode = 'replace') {
    get().mutateActive((session) => {
      const target = parseAnimationCelKey(key)
      const timeline = session.document.animation
      if (!target || !timeline || !timeline.frames.some((frame) => frame.id === target.frameId) || !session.document.layers.some((layer) => layer.id === target.layerId)) return
      const implicitAnchorKey = mode !== 'replace' && session.selectedAnimationCellKeys.length === 0
        ? animationCelKey(session.document.activeLayerId, timeline.activeFrameId)
        : null
      session.selectedAnimationFrameIds = []
      session.animationFrameSelectionAnchorId = null
      session.selectedAnimationMaskCellKeys = []
      session.selectedAnimationMaskRowKeys = []
      session.animationMaskCellSelectionAnchorKey = null
      session.document.activeLayerId = target.layerId
      session.activeLayerMaskId = null
      session.layerMaskIsolatedView = false
      setTimelineActiveContext(session, { kind: 'layer', ownerKind: 'layer', ownerId: target.layerId }, target.frameId, null)
      // A plain cel click replaces the previous layer selection. Otherwise
      // the old selected layer ids remain visible after switching to one cel.
      if (mode === 'replace') {
        session.selectedLayerIds = []
        session.selectedGroupIds = []
        session.selectedGroupId = null
        session.layerSelectionExplicit = false
      }
      const current = new Set(session.selectedAnimationCellKeys)
      if (implicitAnchorKey) current.add(implicitAnchorKey)
      if (mode === 'toggle') {
        if (current.has(key)) current.delete(key)
        else current.add(key)
      } else if (mode === 'range') {
        const anchor = session.animationCellSelectionAnchorKey ?? session.selectedAnimationCellKeys.at(-1) ?? implicitAnchorKey
        const parsedAnchor = anchor ? parseAnimationCelKey(anchor) : null
        if (parsedAnchor) {
          const frames = timeline.frames
          const layers = session.document.layers
          const startFrame = frames.findIndex((frame) => frame.id === parsedAnchor.frameId)
          const endFrame = frames.findIndex((frame) => frame.id === target.frameId)
          const startLayer = layers.findIndex((layer) => layer.id === parsedAnchor.layerId)
          const endLayer = layers.findIndex((layer) => layer.id === target.layerId)
          if (startFrame >= 0 && endFrame >= 0 && startLayer >= 0 && endLayer >= 0) {
            const [fromFrame, toFrame] = startFrame <= endFrame ? [startFrame, endFrame] : [endFrame, startFrame]
            const [fromLayer, toLayer] = startLayer <= endLayer ? [startLayer, endLayer] : [endLayer, startLayer]
            for (const layer of layers.slice(fromLayer, toLayer + 1)) for (const frame of frames.slice(fromFrame, toFrame + 1)) current.add(animationCelKey(layer.id, frame.id))
          } else current.add(key)
        } else current.add(key)
      } else {
        current.clear()
        current.add(key)
      }
      session.selectedAnimationCellKeys = [...current]
      session.animationCellSelectionExplicit = current.size > 0
      const focusKey = current.has(key) ? key : session.selectedAnimationCellKeys.at(-1)
      const focus = focusKey ? parseAnimationCelKey(focusKey) : null
      if (focus) session.document.activeLayerId = focus.layerId
      if (session.selectedLayerIds.length === 0 && session.selectedGroupIds.length === 0 && session.selectedGroupId === null) {
        session.selectedLayerIds = [target.layerId]
      }
      session.animationCellSelectionAnchorKey = current.has(key) ? key : session.selectedAnimationCellKeys.at(-1) ?? null
    }, false, false)
    const parsed = parseAnimationCelKey(key)
    const current = activeSession(get())
    if (parsed && current) requestTilesetPanelForLayer(current.document, parsed.layerId)
    if (parsed) get().setActiveAnimationFrame(parsed.frameId)
  },

  selectAnimationMaskCell(key, mode = 'replace') {
    // Mask cells activate their frame directly instead of going through
    // setActiveAnimationFrame(), so they must close a floating transform here
    // before switching the document surface.
    get().commitFloatingPaste()
    const current = activeSession(get())
    const parsed = parseAnimationCelKey(key)
    const timeline = current ? ensureAnimationDocument(current.document) : null
    const mask = timeline && parsed ? animationMaskAt(timeline, parsed.layerId, parsed.frameId) : null
    const ownerKind = current?.document.layers.some((layer) => layer.id === parsed?.layerId)
      ? 'layer'
      : current?.document.groups.some((group) => group.id === parsed?.layerId) ? 'group' : null
    const ownerHasMask = ownerKind === 'layer'
      ? timeline?.layerMasks?.some((entry) => entry.layerId === parsed?.layerId)
      : ownerKind === 'group' ? timeline?.groupMasks?.some((entry) => entry.groupId === parsed?.layerId) : false
    if (!current || !parsed || !timeline?.frames.some((frame) => frame.id === parsed.frameId) || !ownerKind || !ownerHasMask) return
    get().mutateActive((session) => {
      const target = parseAnimationCelKey(key)
      const timeline = ensureAnimationDocument(session.document)
      const cel = target
        ? timeline.cels.find((candidate) => candidate.layerId === target.layerId && candidate.frameId === target.frameId)
        : null
      const ownerKind = session.document.layers.some((layer) => layer.id === target?.layerId)
        ? 'layer'
        : session.document.groups.some((group) => group.id === target?.layerId) ? 'group' : null
      if (!target || !ownerKind || !timeline.frames.some((frame) => frame.id === target.frameId)) return
      const mask = animationMaskAt(timeline, target.layerId, target.frameId)
      session.selectedAnimationFrameIds = []
      session.animationFrameSelectionAnchorId = null
      session.selectedAnimationCellKeys = []
      session.animationCellSelectionAnchorKey = null
      session.animationCellSelectionExplicit = false
      // Mask-cell selection is its own visual mode; do not mirror the owner
      // layer/group into row selection state.
      session.selectedLayerIds = []
      session.selectedGroupIds = []
      session.selectedGroupId = null
      session.selectedLayerIds = []
      session.layerSelectionExplicit = false
      session.selectedAnimationMaskRowKeys = []
      const current = new Set(session.selectedAnimationMaskCellKeys)
      if (mode === 'toggle') {
        if (current.has(key)) current.delete(key)
        else current.add(key)
      } else if (mode === 'range') {
        const anchor = session.animationMaskCellSelectionAnchorKey ?? session.selectedAnimationMaskCellKeys.at(-1)
        const parsedAnchor = anchor ? parseAnimationCelKey(anchor) : null
        if (parsedAnchor) {
          const frames = timeline.frames
          const owners = ownerKind === 'layer' ? session.document.layers : session.document.groups
          const startFrame = frames.findIndex((frame) => frame.id === parsedAnchor.frameId)
          const endFrame = frames.findIndex((frame) => frame.id === target.frameId)
          const startLayer = owners.findIndex((owner) => owner.id === parsedAnchor.layerId)
          const endLayer = owners.findIndex((owner) => owner.id === target.layerId)
          if (startFrame >= 0 && endFrame >= 0 && startLayer >= 0 && endLayer >= 0) {
            const [fromFrame, toFrame] = startFrame <= endFrame ? [startFrame, endFrame] : [endFrame, startFrame]
            const [fromLayer, toLayer] = startLayer <= endLayer ? [startLayer, endLayer] : [endLayer, startLayer]
            const selectableOwnerIds = new Set(ownerKind === 'layer'
              ? (timeline.layerMasks ?? []).map((entry) => entry.layerId)
              : (timeline.groupMasks ?? []).map((entry) => entry.groupId))
            for (const owner of owners.slice(fromLayer, toLayer + 1)) for (const frame of frames.slice(fromFrame, toFrame + 1)) {
              const candidateKey = animationCelKey(owner.id, frame.id)
              if (selectableOwnerIds.has(owner.id)) current.add(candidateKey)
            }
          } else current.add(key)
        } else current.add(key)
      } else {
        current.clear()
        current.add(key)
      }
      session.selectedAnimationMaskCellKeys = [...current]
      session.animationMaskCellSelectionAnchorKey = key
      // The pointer target is the active cursor. Multi-selection membership
      // must not move activity back to the first selected frame.
      activateAnimationFrame(session.document, target.frameId)
      retargetAnimationLoopPlaybackAtFrame(session, target.frameId)
      session.activeLayerMaskId = current.has(key) && mask ? mask.id : null
      if (current.has(key) && mask) enterLayerMaskEditing(session)
      else exitLayerMaskEditing(session)
      session.layerMaskIsolatedView = false
      setTimelineActiveContext(
        session,
        { kind: 'mask', ownerKind, ownerId: target.layerId },
        target.frameId,
        session.activeLayerMaskId
      )
    }, false, true)
  },

  selectAnimationMaskRow(ownerKind, ownerId, mode = 'replace') {
    get().mutateActive((session) => {
      const timeline = ensureAnimationDocument(session.document)
      const hasMask = ((timeline.layerMasks ?? []).some((entry) => entry.layerId === ownerId)
        || (timeline.groupMasks ?? []).some((entry) => entry.groupId === ownerId))
      if (!hasMask || (ownerKind === 'layer' ? !session.document.layers.some((layer) => layer.id === ownerId) : !session.document.groups.some((group) => group.id === ownerId))) return
      const selectionMode = mode
      const maskRowKey = `${ownerKind}:${ownerId}`
      if (selectionMode === 'range') {
        const rows = animationLayerPanelSelectionRows(session)
        const targetIndex = rows.findIndex((row) => row.kind === 'mask' && row.ownerKind === ownerKind && row.id === ownerId)
        const selectedMaskKey = session.selectedAnimationMaskRowKeys.at(-1)
        const selectedMaskSeparator = selectedMaskKey?.indexOf(':') ?? -1
        const selectedMaskOwnerKind = selectedMaskSeparator > 0 ? selectedMaskKey!.slice(0, selectedMaskSeparator) : null
        const selectedMaskOwnerId = selectedMaskSeparator > 0 ? selectedMaskKey!.slice(selectedMaskSeparator + 1) : null
        const anchorIndex = selectedMaskOwnerKind && selectedMaskOwnerId
          ? rows.findIndex((row) => row.kind === 'mask' && row.ownerKind === selectedMaskOwnerKind && row.id === selectedMaskOwnerId)
          : rows.findIndex((row) => (row.kind === 'layer' || row.kind === 'group') && row.id === session.layerSelectionAnchorId)
        const selectedRows = targetIndex >= 0 && anchorIndex >= 0
          ? rows.slice(Math.min(anchorIndex, targetIndex), Math.max(anchorIndex, targetIndex) + 1)
          : [{ kind: 'mask' as const, ownerKind, id: ownerId }]
        const selectedLayers = selectedRows.filter((row): row is Extract<AnimationLayerPanelSelectionRow, { kind: 'layer' }> => row.kind === 'layer').map((row) => row.id)
        const selectedGroups = selectedRows.filter((row): row is Extract<AnimationLayerPanelSelectionRow, { kind: 'group' }> => row.kind === 'group').map((row) => row.id)
        session.selectedAnimationMaskRowKeys = selectedRows
          .filter((row): row is Extract<AnimationLayerPanelSelectionRow, { kind: 'mask' }> => row.kind === 'mask')
          .map((row) => `${row.ownerKind}:${row.id}`)
        session.selectedLayerIds = [...new Set(selectedLayers)]
        session.selectedGroupIds = [...new Set(selectedGroups)]
        session.selectedGroupId = session.selectedGroupIds.length === 1 && session.selectedLayerIds.length === 0
          ? session.selectedGroupIds[0]
          : null
        session.layerSelectionExplicit = session.selectedLayerIds.length > 0 || session.selectedGroupIds.length > 0
        session.activeLayerMaskId = null
        session.layerMaskIsolatedView = false
        exitLayerMaskEditing(session)
        if (ownerKind === 'layer') session.document.activeLayerId = ownerId
        session.layerSelectionAnchorId = ownerId
        setTimelineActiveContext(session, { kind: 'mask', ownerKind, ownerId }, timeline.activeFrameId, null)
        return
      }
      const preserveLayerSelection = selectionMode === 'toggle'
        && (session.selectedLayerIds.length > 0 || session.selectedGroupIds.length > 0 || session.selectedGroupId !== null)
      session.selectedAnimationFrameIds = []
      session.animationFrameSelectionAnchorId = null
      session.selectedAnimationCellKeys = []
      session.animationCellSelectionAnchorKey = null
      session.animationCellSelectionExplicit = false
      session.selectedAnimationMaskCellKeys = []
      session.animationMaskCellSelectionAnchorKey = null
      if (selectionMode === 'toggle') {
        const current = new Set(session.selectedAnimationMaskRowKeys)
        if (current.has(maskRowKey)) current.delete(maskRowKey)
        else current.add(maskRowKey)
        session.selectedAnimationMaskRowKeys = [...current]
        if (!preserveLayerSelection) {
          session.selectedLayerIds = []
          session.selectedGroupIds = []
          session.selectedGroupId = null
        }
        session.layerSelectionExplicit = preserveLayerSelection
      } else {
        session.selectedAnimationMaskRowKeys = [maskRowKey]
        session.selectedLayerIds = []
        session.selectedGroupIds = []
        session.selectedGroupId = null
        session.layerSelectionExplicit = false
      }
      session.activeLayerMaskId = null
      session.layerMaskIsolatedView = false
      exitLayerMaskEditing(session)
      if (ownerKind === 'layer') session.document.activeLayerId = ownerId
      session.layerSelectionAnchorId = ownerId
      setTimelineActiveContext(session, { kind: 'mask', ownerKind, ownerId }, timeline.activeFrameId, null)
    }, false, true)
  },

  selectAnimationCelContent(key, additive = false) {
    get().commitFloatingPaste()
    const current = activeSession(get())
    const target = parseAnimationCelKey(key)
    if (!current || !target) return
    const timeline = ensureAnimationDocument(current.document)
    if (!timeline.frames.some((frame) => frame.id === target.frameId) || !current.document.layers.some((layer) => layer.id === target.layerId)) return
    const before = cloneSelectionMask(current.selection)
    const cel = resolveAnimationCel(timeline, timeline.cels.find((candidate) => candidate.layerId === target.layerId && candidate.frameId === target.frameId) ?? null)
    const incoming = animationCelContentSelection(cel, current.document.palette, current.document.width, current.document.height)
    const after = combineSelection(before, incoming, additive ? 'add' : 'replace')
    get().selectAnimationCell(key)
    get().mutateActive((session) => { session.selection = cloneSelectionMask(before) }, false)
    get().commitSelectionChange(before, after, tr('canvas.history.createSelection'))
  },

  clearAnimationSelection(preserveActiveContext = false) {
    get().mutateActive((session) => {
      if (preserveActiveContext) {
        session.selectedAnimationFrameIds = []
        session.animationFrameSelectionAnchorId = null
        session.selectedAnimationCellKeys = []
        session.animationCellSelectionAnchorKey = null
        session.animationCellSelectionExplicit = false
        session.selectedAnimationMaskCellKeys = []
        session.animationMaskCellSelectionAnchorKey = null
        session.selectedAnimationMaskRowKeys = []
        session.selectedGroupId = null
        session.selectedGroupIds = []
        session.layerSelectionExplicit = false
        session.selectedLayerIds = session.timelineActiveContext.row?.kind === 'layer'
          ? [session.timelineActiveContext.row.ownerId]
          : []
        return
      }
      clearAnimationItemSelection(session)
      session.activeLayerMaskId = null
      session.layerMaskIsolatedView = false
    }, false, true)
  },

  setAnimationCelOpacity(layerId, frameId, opacity) {
    get().mutateActive((session) => {
      const timeline = ensureAnimationDocument(session.document)
      const cel = timeline.cels.find((candidate) => candidate.layerId === layerId && candidate.frameId === frameId)
      const source = resolveAnimationCel(timeline, cel ?? null)
      if (!cel || !source) return
      const linked = timeline.cels.filter((candidate) => resolveAnimationCel(timeline, candidate)?.id === source.id)
      const before = source.opacity ?? 1
      const after = Math.max(0, Math.min(1, opacity))
      if (before === after) return
      const apply = (value: number): void => {
        for (const candidate of linked) candidate.opacity = value
        if (timeline.activeFrameId === cel.frameId) {
          const layer = session.document.layers.find((candidate) => candidate.id === cel.layerId)
          if (layer) layer.opacity = value
        }
      }
      apply(after)
      session.history.push({ label: tr('workspace.history.animationCelOpacity'), bytes: 16, undo: () => apply(before), redo: () => apply(after) })
    })
  },

  setAnimationCelProperties(layerId, frameId, properties, targetKeys) {
    get().mutateActive((session) => {
      const timeline = ensureAnimationDocument(session.document)
      const cel = timeline.cels.find((candidate) => candidate.layerId === layerId && candidate.frameId === frameId)
      if (!cel) return
      const requested = new Set(targetKeys?.length ? targetKeys : [animationCelKey(layerId, frameId)])
      const sourceById = new Map<string, AnimationCel>()
      for (const candidate of timeline.cels) {
        if (!requested.has(animationCelKey(candidate.layerId, candidate.frameId))) continue
        const source = resolveAnimationCel(timeline, candidate) ?? candidate
        sourceById.set(source.id, source)
      }
      if (sourceById.size === 0) return
      const groups = [...sourceById.values()].map((source) => ({
        source,
        members: timeline.cels.filter((candidate) => (resolveAnimationCel(timeline, candidate) ?? candidate).id === source.id)
      }))
      const before = new Map(groups.map(({ source }) => [source.id, { opacity: source.opacity ?? 1, zIndex: normalizeAnimationCelZIndex(source.zIndex) }]))
      const after = { opacity: Math.max(0, Math.min(1, properties.opacity)), zIndex: normalizeAnimationCelZIndex(properties.zIndex) }
      if ([...before.values()].every((value) => value.opacity === after.opacity && value.zIndex === after.zIndex)) return
      const apply = (values: ReadonlyMap<string, typeof after> | typeof after): void => {
        for (const { source, members } of groups) {
          const value = values instanceof Map ? values.get(source.id) : values
          if (!value) continue
          for (const candidate of members) {
            candidate.opacity = value.opacity
            candidate.zIndex = value.zIndex
          }
        }
        for (const activeCel of timeline.cels) {
          if (activeCel.frameId !== timeline.activeFrameId) continue
          const activeSource = resolveAnimationCel(timeline, activeCel) ?? activeCel
          const layer = session.document.layers.find((candidate) => candidate.id === activeCel.layerId)
          if (layer && Number.isFinite(activeSource.opacity)) layer.opacity = Math.max(0, Math.min(1, activeSource.opacity!))
        }
      }
      apply(after)
      session.history.push({ label: tr('workspace.history.animationCelProperties'), bytes: groups.length * 32, undo: () => apply(before), redo: () => apply(after), affectedLayerIds: [...new Set(groups.map(({ source }) => source.layerId))], invalidation: { kind: 'full' } })
      // Cel properties are an explicit timeline-panel operation. Preserve the
      // user's multi-cel highlight after the resulting content revision.
      session.selectionGuidesPreservedAtContentRevision = session.contentRevision + 1
    })
  },

  connectSelectedAnimationCels() {
    get().mutateActive((session) => {
      const timeline = ensureAnimationDocument(session.document)
      const selected = new Set(session.selectedAnimationCellKeys)
      const targets = timeline.cels.filter((cel) => selected.has(animationCelKey(cel.layerId, cel.frameId)))
      const layerCounts = new Map<string, number>()
      for (const cel of targets) layerCounts.set(cel.layerId, (layerCounts.get(cel.layerId) ?? 0) + 1)
      if (![...layerCounts.values()].some((count) => count > 1)) return
      syncActiveAnimationFrame(session.document)
      const before = timeline.cels.map(cloneAnimationCel)
      if (!connectAnimationCels(session.document, targets.map((cel) => cel.id))) return
      const after = ensureAnimationDocument(session.document).cels.map(cloneAnimationCel)
      const restore = (snapshot: AnimationCel[]): void => {
        restoreAnimationCels(session.document, snapshot)
        refreshActiveAnimationFrame(session.document)
      }
      session.history.push({
        label: tr('workspace.history.animationCelLink'),
        bytes: [...before, ...after].reduce((sum, cel) => sum + (cel.surface?.pixels.byteLength ?? 0) + 24, 0),
        undo: () => restore(before),
        redo: () => restore(after)
      })
    }, true, true)
  },

  disconnectSelectedAnimationCels() {
    get().mutateActive((session) => {
      const timeline = ensureAnimationDocument(session.document)
      const selected = new Set(session.selectedAnimationCellKeys)
      const targets = timeline.cels.filter((cel) => selected.has(animationCelKey(cel.layerId, cel.frameId)))
      syncActiveAnimationFrame(session.document)
      const before = timeline.cels.map(cloneAnimationCel)
      if (!disconnectAnimationCels(session.document, targets.map((cel) => cel.id))) return
      const after = ensureAnimationDocument(session.document).cels.map(cloneAnimationCel)
      const restore = (snapshot: AnimationCel[]): void => {
        restoreAnimationCels(session.document, snapshot)
        refreshActiveAnimationFrame(session.document)
      }
      session.history.push({
        label: tr('workspace.history.animationCelUnlink'),
        bytes: [...before, ...after].reduce((sum, cel) => sum + (cel.surface?.pixels.byteLength ?? 0) + 24, 0),
        undo: () => restore(before),
        redo: () => restore(after)
      })
    }, true, true)
  },

  copySelectedAnimationCels() {
    get().mutateActive((session) => {
      const timeline = ensureAnimationDocument(session.document)
      const keys = new Set(session.selectedAnimationCellKeys)
      const layerIndexes = new Map(session.document.layers.map((layer, index) => [layer.id, index]))
      const frameIndexes = new Map(timeline.frames.map((frame, index) => [frame.id, index]))
      const selectedCels = timeline.cels
        .filter((cel) => keys.has(animationCelKey(cel.layerId, cel.frameId)))
        .sort((left, right) => (layerIndexes.get(left.layerId) ?? 0) - (layerIndexes.get(right.layerId) ?? 0) || (frameIndexes.get(left.frameId) ?? 0) - (frameIndexes.get(right.frameId) ?? 0))
        .map(cloneAnimationCel)
      const cels = selectedCels.map((cel) => ({ ...cel, linkedCelId: null }))
      session.animationCellClipboard = cels
      session.animationCellClipboardAnchorKey = cels[0] ? animationCelKey(cels[0].layerId, cels[0].frameId) : null
      if (cels.length > 0) {
        const layerIndexById = new Map(session.document.layers.map((layer, index) => [layer.id, index]))
        const frameIndexById = new Map(timeline.frames.map((frame, index) => [frame.id, index]))
        const anchor = cels[0]
        const anchorLayerIndex = layerIndexById.get(anchor.layerId) ?? 0
        const anchorFrameIndex = frameIndexById.get(anchor.frameId) ?? 0
        const crossDocumentSnapshot: AnimationCelClipboardSnapshot = {
          sourceDocumentId: session.document.id,
          anchorLayerIndex,
          anchorFrameIndex,
          items: selectedCels.flatMap((cel) => {
            const layerIndex = layerIndexById.get(cel.layerId)
            const frameIndex = frameIndexById.get(cel.frameId)
            const mask = timeline.layerMasks?.find((entry) => entry.layerId === cel.layerId && entry.frameId === cel.frameId)
            return layerIndex === undefined || frameIndex === undefined
              ? []
              : [{ layerIndex, frameIndex, cel: animationCelClipboardSnapshot(session.document, cel), mask: mask ? cloneAnimationLayerMask(mask) : undefined }]
          })
        }
        clipboardService.setAnimationCells(crossDocumentSnapshot)
        session.animationFrameClipboard = []
        session.animationMaskClipboard = []
        session.animationMaskClipboardAnchorKey = null
        clipboardService.captureAnimationCopySystemBaseline(typeof window.moonSprite?.readClipboardImage === 'function' ? () => window.moonSprite.readClipboardImage() : undefined)
      } else clipboardService.clearAnimation()
    }, false)
  },

  copySelectedAnimationFrames() {
    get().mutateActive((session) => {
      const timeline = ensureAnimationDocument(session.document)
      syncActiveAnimationFrame(session.document)
      const selectedIds = new Set(session.selectedAnimationFrameIds.length ? session.selectedAnimationFrameIds : [timeline.activeFrameId])
      session.animationFrameClipboard = timeline.frames.filter((frame) => selectedIds.has(frame.id)).map((frame): AnimationFrameClipboardItem => ({
        frameId: frame.id,
        duration: frame.duration,
        ...(frame.disabled === true ? { disabled: true } : {}),
        cels: timeline.cels.filter((cel) => cel.frameId === frame.id).map((cel) => ({ ...cloneAnimationCel(cel), linkedCelId: null })),
        layerMasks: (timeline.layerMasks ?? []).filter((entry) => entry.frameId === frame.id).map((entry) => cloneAnimationLayerMask(entry)),
        groupMasks: (timeline.groupMasks ?? []).filter((entry) => entry.frameId === frame.id).map((entry) => cloneAnimationGroupMask(entry))
      }))
      if (session.animationFrameClipboard.length > 0) {
        const layerIndexById = new Map(session.document.layers.map((layer, index) => [layer.id, index]))
        const groupIndexById = new Map(session.document.groups.map((group, index) => [group.id, index]))
        const crossDocumentSnapshot: AnimationFrameClipboardSnapshot = {
          sourceDocumentId: session.document.id,
          layers: session.document.layers.map((layer) => ({
            name: layer.name,
            kind: layer.kind,
            width: layer.width,
            height: layer.height,
            offsetX: layer.offsetX,
            offsetY: layer.offsetY,
            visible: layer.visible,
            locked: layer.locked,
            opacity: layer.opacity,
            blendMode: layer.blendMode,
            ...(layer.clippingMask === true ? { clippingMask: true } : {})
          })),
          frames: timeline.frames.filter((frame) => selectedIds.has(frame.id)).map((frame) => ({
            duration: frame.duration,
            ...(frame.disabled === true ? { disabled: true } : {}),
            cels: timeline.cels.filter((cel) => cel.frameId === frame.id).flatMap((cel) => {
              const layerIndex = layerIndexById.get(cel.layerId)
              return layerIndex === undefined ? [] : [{ layerIndex, cel: animationCelClipboardSnapshot(session.document, cel) }]
            }),
            layerMasks: (timeline.layerMasks ?? []).filter((entry) => entry.frameId === frame.id).flatMap((entry) => {
              const layerIndex = layerIndexById.get(entry.layerId)
              return layerIndex === undefined ? [] : [{ layerIndex, mask: cloneAnimationLayerMask(entry) }]
            }),
            groupMasks: (timeline.groupMasks ?? []).filter((entry) => entry.frameId === frame.id).flatMap((entry) => {
              const groupIndex = groupIndexById.get(entry.groupId)
              return groupIndex === undefined ? [] : [{ groupIndex, mask: cloneAnimationGroupMask(entry) }]
            })
          }))
        }
        clipboardService.setAnimationFrames(crossDocumentSnapshot)
        session.animationCellClipboard = []
        session.animationCellClipboardAnchorKey = null
        session.animationMaskClipboard = []
        session.animationMaskClipboardAnchorKey = null
        clipboardService.captureAnimationCopySystemBaseline(typeof window.moonSprite?.readClipboardImage === 'function' ? () => window.moonSprite.readClipboardImage() : undefined)
      } else clipboardService.clearAnimation()
    }, false)
  },

  pasteAnimationFrames() {
    get().mutateActive((session) => {
      const timeline = ensureAnimationDocument(session.document)
      const crossDocumentClipboard = clipboardService.getAnimationFrames()
      if (crossDocumentClipboard && crossDocumentClipboard.sourceDocumentId !== session.document.id) {
        pasteCrossDocumentAnimationFrames(session, crossDocumentClipboard)
        return
      }
      const clipboard = session.animationFrameClipboard
      if (!clipboard.length) return
      const selectedIds = new Set(session.selectedAnimationFrameIds.length ? session.selectedAnimationFrameIds : [timeline.activeFrameId])
      const anchorIndex = Math.max(-1, ...timeline.frames.map((frame, index) => selectedIds.has(frame.id) ? index : -1))
      const insertIndex = anchorIndex + 1
      const insertedFrames = clipboard.map((item) => ({ id: createId('frame'), duration: item.duration, ...(item.disabled === true ? { disabled: true } : {}) }))
      const insertedCels = clipboard.flatMap((item, index) => item.cels.map((cel) => {
        const id = createId('cel')
        return { ...cloneAnimationCel(cel), id, frameId: insertedFrames[index].id }
      }))
      const insertedLayerMasks = clipboard.flatMap((item, index) => (item.layerMasks ?? []).map((entry) => cloneAnimationLayerMask(entry, entry.layerId, insertedFrames[index].id, createId('mask'))))
      const insertedGroupMasks = clipboard.flatMap((item, index) => (item.groupMasks ?? []).map((entry) => cloneAnimationGroupMask(entry, entry.groupId, insertedFrames[index].id, createId('mask'))))
      const previousActiveFrameId = timeline.activeFrameId
      const previousSelectedFrameIds = [...session.selectedAnimationFrameIds]
      const insertedIds = new Set(insertedFrames.map((frame) => frame.id))
      const selectInsertedItems = (): void => {
        const onlyFrame = insertedFrames.length === 1 ? insertedFrames[0] : null
        const activeCelKey = onlyFrame ? animationCelKey(session.document.activeLayerId, onlyFrame.id) : null
        const hasActiveCel = activeCelKey !== null && insertedCels.some((cel) => cel.layerId === session.document.activeLayerId && cel.frameId === onlyFrame?.id)
        session.selectedAnimationMaskCellKeys = []
        session.selectedAnimationMaskRowKeys = []
        session.animationMaskCellSelectionAnchorKey = null
        if (hasActiveCel && activeCelKey) {
          session.selectedAnimationFrameIds = []
          session.animationFrameSelectionAnchorId = null
          session.selectedAnimationCellKeys = [activeCelKey]
          session.animationCellSelectionAnchorKey = activeCelKey
          session.animationCellSelectionExplicit = true
          return
        }
        session.selectedAnimationFrameIds = insertedFrames.map((frame) => frame.id)
        session.animationFrameSelectionAnchorId = insertedFrames.at(-1)?.id ?? null
        session.selectedAnimationCellKeys = []
        session.animationCellSelectionAnchorKey = null
        session.animationCellSelectionExplicit = false
      }
      const restoreInserted = (): void => {
        const current = ensureAnimationDocument(session.document)
        current.frames = current.frames.filter((frame) => !insertedIds.has(frame.id))
        current.cels = current.cels.filter((cel) => !insertedIds.has(cel.frameId))
        current.layerMasks = (current.layerMasks ?? []).filter((entry) => !insertedIds.has(entry.frameId))
        current.groupMasks = (current.groupMasks ?? []).filter((entry) => !insertedIds.has(entry.frameId))
        const fallback = current.frames.find((frame) => frame.id === previousActiveFrameId)?.id ?? current.frames[0]?.id
        if (fallback) activateAnimationFrame(session.document, fallback)
        session.activeLayerMaskId = null
        session.selectedAnimationFrameIds = previousSelectedFrameIds
        session.selectedAnimationCellKeys = []
        session.animationCellSelectionAnchorKey = null
        session.animationCellSelectionExplicit = false
      }
      const reapplyInserted = (): void => {
        const current = ensureAnimationDocument(session.document)
        const index = Math.min(insertIndex, current.frames.length)
        current.frames.splice(index, 0, ...insertedFrames.map((frame) => ({ ...frame })))
        current.cels.push(...insertedCels.map((cel) => cloneAnimationCel(cel)))
        current.layerMasks ??= []
        current.layerMasks.push(...insertedLayerMasks.map((entry) => cloneAnimationLayerMask(entry)))
        current.groupMasks ??= []
        current.groupMasks.push(...insertedGroupMasks.map((entry) => cloneAnimationGroupMask(entry)))
        activateAnimationFrame(session.document, insertedFrames[0].id)
        session.activeLayerMaskId = null
        selectInsertedItems()
      }
      timeline.frames.splice(insertIndex, 0, ...insertedFrames)
      timeline.cels.push(...insertedCels)
      timeline.layerMasks ??= []
      timeline.layerMasks.push(...insertedLayerMasks)
      timeline.groupMasks ??= []
      timeline.groupMasks.push(...insertedGroupMasks)
      for (let index = 0; index < insertedFrames.length; index += 1) {
        const sourceFrameId = timeline.frames[insertIndex + index - 1]?.id
        if (sourceFrameId) inheritAnimationFrameCelLinks(session.document, sourceFrameId, insertedFrames[index].id)
      }
      activateAnimationFrame(session.document, insertedFrames[0].id)
      session.activeLayerMaskId = null
      selectInsertedItems()
      session.history.push({ label: tr('workspace.history.pasteAnimationFrame'), bytes: insertedCels.reduce((sum, cel) => sum + (cel.surface?.pixels.byteLength ?? 0), 0) + [...insertedLayerMasks, ...insertedGroupMasks].reduce((sum, entry) => sum + entry.mask.pixels.byteLength, 0) + insertedFrames.length * 64, undo: restoreInserted, redo: reapplyInserted })
    }, true, true)
  },

  moveSelectedAnimationFrames(targetFrameId, insertAfter) {
    get().mutateActive((session) => {
      const timeline = ensureAnimationDocument(session.document)
      const selected = new Set(session.selectedAnimationFrameIds.length ? session.selectedAnimationFrameIds : [timeline.activeFrameId])
      const beforeIds = timeline.frames.map((frame) => frame.id)
      const beforeLoopSections = cloneAnimationLoopSections(timeline.loopSections)
      const moving = timeline.frames.filter((frame) => selected.has(frame.id))
      const remaining = timeline.frames.filter((frame) => !selected.has(frame.id))
      if (moving.length === 0) return
      const targetIndex = remaining.findIndex((frame) => frame.id === targetFrameId)
      const selectedTarget = selected.has(targetFrameId)
      const selectedTargetIndex = timeline.frames.findIndex((frame) => frame.id === targetFrameId)
      const movingIndexes = timeline.frames
        .map((frame, index) => selected.has(frame.id) ? index : -1)
        .filter((index) => index >= 0)
      const movingStartIndex = movingIndexes.length > 0 ? Math.min(...movingIndexes) : -1
      const movingEndIndex = movingIndexes.length > 0 ? Math.max(...movingIndexes) : -1
      const insertionIndex = targetIndex >= 0
        ? targetIndex + (insertAfter ? 1 : 0)
        : selectedTarget
          ? timeline.frames.slice(0, selectedTargetIndex).filter((frame) => !selected.has(frame.id)).length
          : -1
      if (insertionIndex < 0) return
      const dropBoundaryIndex = selectedTarget ? insertionIndex : Math.min(insertionIndex, remaining.length)
      // A boundary can be reported by either adjacent header (the previous
      // frame's right edge or the next frame's left edge). Normalize those
      // equivalent DOM targets to the selected block's actual side so loop
      // membership does not depend on which header received the pointer.
      const targetOriginalIndex = timeline.frames.findIndex((frame) => frame.id === targetFrameId)
      const dropSide = selectedTarget
        ? insertAfter ? 'after' as const : 'before' as const
        : targetOriginalIndex === movingStartIndex - 1 && insertAfter
          ? 'before' as const
          : targetOriginalIndex === movingEndIndex + 1 && !insertAfter
            ? 'after' as const
            : null
      remaining.splice(insertionIndex, 0, ...moving)
      const afterIds = remaining.map((frame) => frame.id)
      const afterLoopSections = reconcileAnimationLoopSectionsAfterFrameReorder(beforeLoopSections, timeline.frames, remaining.filter((frame) => !selected.has(frame.id)), remaining, moving.map((frame) => frame.id), dropBoundaryIndex, dropSide)
      const sectionsChanged = beforeLoopSections.length !== afterLoopSections.length
        || beforeLoopSections.some((section, index) => {
          const next = afterLoopSections[index]
          return !next || section.startFrameId !== next.startFrameId || section.endFrameId !== next.endFrameId
        })
      if (beforeIds.join('|') === afterIds.join('|') && !sectionsChanged) return
      const apply = (ids: readonly string[]): void => {
        const current = ensureAnimationDocument(session.document)
        const byId = new Map(current.frames.map((frame) => [frame.id, frame]))
        current.frames = ids.flatMap((id) => { const frame = byId.get(id); return frame ? [frame] : [] })
      }
      apply(afterIds)
      setAnimationLoopSections(session, afterLoopSections)
      session.selectedAnimationFrameIds = afterIds.filter((id) => selected.has(id))
      session.history.push({ label: tr('workspace.history.moveAnimationFrame'), bytes: 64, undo: () => { apply(beforeIds); setAnimationLoopSections(session, beforeLoopSections) }, redo: () => { apply(afterIds); setAnimationLoopSections(session, afterLoopSections) } })
    }, 'metadata', true)
  },

  pasteAnimationCels() {
    get().mutateActive((session) => {
      const timeline = ensureAnimationDocument(session.document)
      const crossDocumentClipboard = clipboardService.getAnimationCells()
      if (crossDocumentClipboard && crossDocumentClipboard.sourceDocumentId !== session.document.id) {
        pasteCrossDocumentAnimationCels(session, crossDocumentClipboard)
        return
      }
      if (!session.animationCellClipboard.length) return
      const targetKey = session.selectedAnimationCellKeys.at(-1) ?? animationCelKey(session.document.activeLayerId, timeline.activeFrameId)
      const target = parseAnimationCelKey(targetKey)
      const sourceAnchorKey = session.animationCellClipboardAnchorKey ?? animationCelKey(session.animationCellClipboard[0].layerId, session.animationCellClipboard[0].frameId)
      const sourceAnchor = parseAnimationCelKey(sourceAnchorKey)
      if (!target || !sourceAnchor) return
      const sourceAnchorFrameIndex = timeline.frames.findIndex((frame) => frame.id === sourceAnchor.frameId)
      const targetFrameIndex = timeline.frames.findIndex((frame) => frame.id === target.frameId)
      const sourceFrameIndexes = session.animationCellClipboard.map((cel) => timeline.frames.findIndex((frame) => frame.id === cel.frameId))
      if (sourceAnchorFrameIndex < 0 || targetFrameIndex < 0 || sourceFrameIndexes.some((index) => index < 0)) return
      const minimumDestination = targetFrameIndex + Math.min(...sourceFrameIndexes.map((index) => index - sourceAnchorFrameIndex))
      if (minimumDestination < 0) return
      const maximumDestination = targetFrameIndex + Math.max(...sourceFrameIndexes.map((index) => index - sourceAnchorFrameIndex))
      const appendedFrames = Array.from({ length: Math.max(0, maximumDestination - timeline.frames.length + 1) }, () => ({ id: createId('frame'), duration: 100 }))
      const previousSelection = [...session.selectedAnimationCellKeys]
      const previousSelectionExplicit = session.animationCellSelectionExplicit
      if (appendedFrames.length > 0) timeline.frames.push(...appendedFrames)
      ensureAnimationDocument(session.document)
      const appendedFrameIds = new Set(appendedFrames.map((frame) => frame.id))
      const placements = mapAnimationCelBlock(timeline, session.document.layers.map((layer) => layer.id), session.animationCellClipboard, sourceAnchorKey, target.layerId, target.frameId)
      if (placements.length !== session.animationCellClipboard.length) {
        timeline.frames = timeline.frames.filter((frame) => !appendedFrameIds.has(frame.id))
        timeline.cels = timeline.cels.filter((cel) => !appendedFrameIds.has(cel.frameId))
        return
      }
      const incompatiblePlacement = placements.some(({ source, target: destination }) => {
        const destinationLayer = session.document.layers.find((layer) => layer.id === destination.layerId)
        return animationCelContentKind(source) !== layerContentKind(destinationLayer)
      })
      if (incompatiblePlacement) {
        timeline.frames = timeline.frames.filter((frame) => !appendedFrameIds.has(frame.id))
        timeline.cels = timeline.cels.filter((cel) => !appendedFrameIds.has(cel.frameId))
        set({ message: tr('workspace.animation.incompatibleCel') })
        return
      }
      for (const frameId of appendedFrames.map((frame) => frame.id)) {
        const frameIndex = timeline.frames.findIndex((frame) => frame.id === frameId)
        const sourceFrameId = timeline.frames[frameIndex - 1]?.id
        if (!sourceFrameId) continue
        const pastedLayerIds = new Set(placements.filter(({ target: destination }) => destination.frameId === frameId).map(({ target: destination }) => destination.layerId))
        const inheritedLayerIds = session.document.layers.map((layer) => layer.id).filter((layerId) => !pastedLayerIds.has(layerId))
        if (inheritedLayerIds.length > 0) inheritAnimationFrameCelLinks(session.document, sourceFrameId, frameId, inheritedLayerIds)
      }
      const appendedBaseCels = timeline.cels.filter((cel) => appendedFrameIds.has(cel.frameId)).map(cloneAnimationCel)
      const destinationIds = new Set(placements.map(({ target: destination }) => destination.id))
      const affectedTargets = new Map<string, AnimationCel>()
      const linkGroups = new Map<string, { source: AnimationCel; members: AnimationCel[] }>()
      for (const { target: destination } of placements) {
        const source = resolveAnimationCel(timeline, destination) ?? destination
        if (!linkGroups.has(source.id)) {
          linkGroups.set(source.id, {
            source,
            members: timeline.cels.filter((cel) => (resolveAnimationCel(timeline, cel) ?? cel).id === source.id)
          })
        }
      }
      for (const { source, members } of linkGroups.values()) {
        for (const member of members) affectedTargets.set(member.id, member)
        const remaining = members.filter((member) => !destinationIds.has(member.id))
        const replacement = remaining[0]
        if (replacement && destinationIds.has(source.id)) {
          replacement.linkedCelId = null
          replacement.zIndex = source.zIndex
          replacement.surface = source.surface
          replacement.opacity = source.opacity
          replacement.text = source.text
          replacement.tilemap = source.tilemap
          replacement.freeTiles = source.freeTiles
          for (const member of remaining.slice(1)) {
            member.linkedCelId = replacement.id
            member.zIndex = replacement.zIndex
            member.surface = replacement.surface
            member.opacity = replacement.opacity
            member.text = replacement.text
            member.tilemap = replacement.tilemap
            member.freeTiles = replacement.freeTiles
          }
        }
      }
      for (const { target: destination } of placements) {
        destination.linkedCelId = null
        affectedTargets.set(destination.id, destination)
      }
      const writeTargets = [...affectedTargets.values()]
      const before = writeTargets.filter((cel) => !appendedFrameIds.has(cel.frameId)).map(cloneAnimationCel)
      for (const { source, target: destination } of placements) {
        destination.zIndex = normalizeAnimationCelZIndex(source.zIndex)
        destination.surface = source.surface ? cloneAnimationCelSurface(source.surface) : undefined
        destination.opacity = source.opacity
        destination.text = source.text ? cloneTextCelData(source.text) : undefined
        destination.tilemap = source.tilemap ? cloneTilemapCelData(source.tilemap) : undefined
        destination.freeTiles = source.freeTiles ? cloneFreeTileCelData(source.freeTiles) : undefined
      }
      refreshActiveAnimationFrame(session.document)
      session.activeLayerMaskId = null
      session.selectedAnimationCellKeys = placements.map(({ target: destination }) => animationCelKey(destination.layerId, destination.frameId))
      session.animationCellSelectionExplicit = true
      const after = writeTargets.map(cloneAnimationCel)
      const afterSelection = [...session.selectedAnimationCellKeys]
      if (after.length) session.history.push({
        label: tr('workspace.history.pasteAnimationCel'),
        bytes: [...before, ...after, ...appendedBaseCels].reduce((sum, cel) => sum + (cel.surface?.pixels.byteLength ?? 0), 0) + appendedFrames.length * 32,
        undo: () => {
          restoreAnimationCels(session.document, before)
          const current = ensureAnimationDocument(session.document)
          current.frames = current.frames.filter((frame) => !appendedFrameIds.has(frame.id))
          current.cels = current.cels.filter((cel) => !appendedFrameIds.has(cel.frameId))
          session.selectedAnimationCellKeys = previousSelection
          session.animationCellSelectionExplicit = previousSelectionExplicit
          refreshActiveAnimationFrame(session.document)
        },
        redo: () => {
          const current = ensureAnimationDocument(session.document)
          for (const frame of appendedFrames) if (!current.frames.some((candidate) => candidate.id === frame.id)) current.frames.push({ ...frame })
          ensureAnimationDocument(session.document)
          restoreAnimationCels(session.document, [...appendedBaseCels, ...after])
          session.selectedAnimationCellKeys = afterSelection
          session.animationCellSelectionExplicit = true
          refreshActiveAnimationFrame(session.document)
        }
      })
    }, true, true)
  },

  moveSelectedAnimationCels(layerId, frameId, sourceAnchorKey) {
    get().mutateActive((session) => {
      const beforeSelection = captureAnimationSelectionHistory(session)
      const timeline = ensureAnimationDocument(session.document)
      const selected = new Set(session.selectedAnimationCellKeys)
      const sources = timeline.cels.filter((candidate) => selected.has(animationCelKey(candidate.layerId, candidate.frameId))).map(cloneAnimationCel)
      const placements = mapAnimationCelBlock(timeline, session.document.layers.map((layer) => layer.id), sources, sourceAnchorKey, layerId, frameId)
      const affected = new Map<string, AnimationCel>()
      if (!placements.length || placements.length !== sources.length || placements.every(({ source, target }) => source.layerId === target.layerId && source.frameId === target.frameId)) return
      if (placements.some(({ source, target }) => animationCelContentKind(source) !== layerContentKind(session.document.layers.find((layer) => layer.id === target.layerId)))) {
        set({ message: tr('workspace.animation.incompatibleCel') })
        return
      }
      for (const source of sources) {
        const original = timeline.cels.find((cel) => cel.layerId === source.layerId && cel.frameId === source.frameId)
        if (original) affected.set(animationCelKey(original.layerId, original.frameId), cloneAnimationCel(original))
      }
      for (const { target: destination } of placements) affected.set(animationCelKey(destination.layerId, destination.frameId), cloneAnimationCel(destination))
      for (const source of sources) {
        const original = timeline.cels.find((cel) => cel.layerId === source.layerId && cel.frameId === source.frameId)
        if (original?.surface) original.surface = original.surface.format === 'rgba' ? { ...original.surface, pixels: new Uint8ClampedArray(original.surface.pixels.length) } : { ...original.surface, pixels: new Uint32Array(original.surface.pixels.length) }
        if (original) original.zIndex = 0
        if (original) delete original.text
        if (original) delete original.tilemap
      }
      for (const { source, target: destination } of placements) {
        destination.linkedCelId = null
        destination.zIndex = normalizeAnimationCelZIndex(source.zIndex)
        destination.surface = source.surface ? cloneAnimationCelSurface(source.surface) : undefined
        destination.opacity = source.opacity
        destination.text = source.text ? cloneTextCelData(source.text) : undefined
        destination.tilemap = source.tilemap ? cloneTilemapCelData(source.tilemap) : undefined
      }
      refreshActiveAnimationFrame(session.document)
      if (ensureAnimationDocument(session.document).activeFrameId !== frameId) activateAnimationFrame(session.document, frameId)
      session.document.activeLayerId = layerId
      session.activeLayerMaskId = null
      session.selectedAnimationCellKeys = placements.map(({ target: destination }) => animationCelKey(destination.layerId, destination.frameId))
      const sourceAnchor = parseAnimationCelKey(sourceAnchorKey)
      const mappedAnchor = sourceAnchor
        ? placements.find(({ source }) => source.layerId === sourceAnchor.layerId && source.frameId === sourceAnchor.frameId)?.target
        : undefined
      session.animationCellSelectionAnchorKey = mappedAnchor
        ? animationCelKey(mappedAnchor.layerId, mappedAnchor.frameId)
        : session.selectedAnimationCellKeys.at(-1) ?? null
      session.animationCellSelectionExplicit = true
      const after = [...affected.keys()].flatMap((key) => {
        const parsed = parseAnimationCelKey(key)
        const cel = parsed ? timeline.cels.find((candidate) => candidate.layerId === parsed.layerId && candidate.frameId === parsed.frameId) : null
        return cel ? [cloneAnimationCel(cel)] : []
      })
      const before = [...affected.values()]
      if (after.length) {
        const afterSelection = captureAnimationSelectionHistory(session)
        const entry: HistoryEntry = {
          label: tr('workspace.history.moveAnimationCel'),
          bytes: [...before, ...after].reduce((sum, cel) => sum + (cel.surface?.pixels.byteLength ?? 0), 0),
          undo: () => restoreAnimationCels(session.document, before),
          redo: () => restoreAnimationCels(session.document, after),
          affectedLayerIds: [...new Set(placements.flatMap(({ source, target }) => [source.layerId, target.layerId]))],
          requiresAnimationSync: true
        }
        session.history.push(historyEntryWithAnimationSelection(session, entry, beforeSelection, afterSelection))
      }
    }, true, true)
  },

  copySelectedAnimationMasks() {
    get().mutateActive((session) => {
      const timeline = ensureAnimationDocument(session.document)
      const selected = new Set(session.selectedAnimationMaskCellKeys)
      const ownerIndexes = new Map(animationMaskOwnerIds(session).map((id, index) => [id, index]))
      const frameIndexes = new Map(timeline.frames.map((frame, index) => [frame.id, index]))
      const clipboard = [...selected].flatMap((key): AnimationMaskClipboardItem[] => {
        const target = parseAnimationCelKey(key)
        const ownerKind = target ? animationMaskOwnerKind(session.document, target.layerId) : null
        const mask = target ? animationMaskAt(timeline, target.layerId, target.frameId) : null
        return target && ownerKind && mask ? [{ key, mask: cloneAnimationMaskForOwner(mask, ownerKind, mask.ownerId, { preserveLink: false }) }] : []
      }).sort((left, right) => {
        const leftTarget = parseAnimationCelKey(left.key)!
        const rightTarget = parseAnimationCelKey(right.key)!
        return (ownerIndexes.get(leftTarget.layerId) ?? 0) - (ownerIndexes.get(rightTarget.layerId) ?? 0)
          || (frameIndexes.get(leftTarget.frameId) ?? 0) - (frameIndexes.get(rightTarget.frameId) ?? 0)
      })
      session.animationMaskClipboard = clipboard
      session.animationMaskClipboardAnchorKey = clipboard[0]?.key ?? null
      if (clipboard.length > 0) {
        clipboardService.clearAnimation()
        session.animationCellClipboard = []
        session.animationCellClipboardAnchorKey = null
        session.animationFrameClipboard = []
        clipboardService.captureAnimationCopySystemBaseline(typeof window.moonSprite?.readClipboardImage === 'function' ? () => window.moonSprite.readClipboardImage() : undefined)
      }
    }, false)
  },

  pasteAnimationMasks(ownerId, frameId) {
    const current = activeSession(get())
    if (!current || !current.animationMaskClipboard.length) return
    const currentTimeline = ensureAnimationDocument(current.document)
    const currentFallback = parseAnimationCelKey(current.selectedAnimationMaskCellKeys.at(-1) ?? '')
    const currentTargetOwnerId = ownerId ?? currentFallback?.layerId
    const currentTargetFrameId = frameId ?? currentFallback?.frameId
    const currentSourceAnchorKey = current.animationMaskClipboardAnchorKey ?? current.animationMaskClipboard[0].key
    if (!currentTargetOwnerId || !currentTargetFrameId) return
    const currentPlacements = mapAnimationMaskBlock(current, current.animationMaskClipboard.map((item) => item.key), currentSourceAnchorKey, currentTargetOwnerId, currentTargetFrameId)
    if (animationMaskPlacementsTargetEmptyLayerCel(current, currentPlacements)) { set({ message: tr('workspace.layerMask.emptyCel') }); return }
    get().mutateActive((session) => {
      const timeline = ensureAnimationDocument(session.document)
      if (!session.animationMaskClipboard.length) return
      const beforeSelection = captureAnimationSelectionHistory(session)
      const fallback = parseAnimationCelKey(session.selectedAnimationMaskCellKeys.at(-1) ?? '')
      const targetOwnerId = ownerId ?? fallback?.layerId
      const targetFrameId = frameId ?? fallback?.frameId
      const sourceAnchorKey = session.animationMaskClipboardAnchorKey ?? session.animationMaskClipboard[0].key
      if (!targetOwnerId || !targetFrameId) return
      const placements = mapAnimationMaskBlock(session, session.animationMaskClipboard.map((item) => item.key), sourceAnchorKey, targetOwnerId, targetFrameId)
      if (!placements.length || placements.some((placement) => animationMaskOwnerLocked(session.document, parseAnimationCelKey(placement.targetKey)?.layerId ?? ''))) return
      if (animationMaskPlacementsTargetEmptyLayerCel(session, placements)) return
      const sourceByKey = new Map(session.animationMaskClipboard.map((item) => [item.key, item]))
      const before = placements.flatMap(({ targetKey }) => {
        const target = parseAnimationCelKey(targetKey)
        const snapshot = target ? animationMaskSlotSnapshot(session.document, target.layerId, target.frameId) : null
        return snapshot ? [snapshot] : []
      })
      for (const placement of placements) {
        const source = sourceByKey.get(placement.sourceKey)
        const target = parseAnimationCelKey(placement.targetKey)
        const ownerKind = target ? animationMaskOwnerKind(session.document, target.layerId) : null
        if (!source || !target || !ownerKind) continue
        const copied = cloneAnimationMaskForOwner(source.mask, ownerKind, source.mask.ownerId, { id: createId('mask'), preserveLink: false })
        setAnimationMaskSlot(session.document, target.layerId, target.frameId, copied)
      }
      const afterKeys = placements.map((placement) => placement.targetKey)
      const after = afterKeys.flatMap((key) => {
        const target = parseAnimationCelKey(key)
        const snapshot = target ? animationMaskSlotSnapshot(session.document, target.layerId, target.frameId) : null
        return snapshot ? [snapshot] : []
      })
      session.selectedAnimationMaskCellKeys = afterKeys
      session.animationMaskCellSelectionAnchorKey = afterKeys.at(-1) ?? null
      session.activeLayerMaskId = null
      const afterSelection = captureAnimationSelectionHistory(session)
      session.history.push({
        label: tr('workspace.history.pasteAnimationMask'),
        bytes: [...before, ...after].reduce((sum, item) => sum + (item.mask?.pixels.byteLength ?? 0), 0),
        undo: () => { restoreAnimationMaskSlots(session.document, before); restoreAnimationSelectionHistory(session, beforeSelection) },
        redo: () => { restoreAnimationMaskSlots(session.document, after); restoreAnimationSelectionHistory(session, afterSelection) },
        invalidation: { kind: 'full' }
      })
    }, true, true)
  },

  moveSelectedAnimationMasks(ownerId, frameId, sourceAnchorKey) {
    get().mutateActive((session) => {
      const beforeSelection = captureAnimationSelectionHistory(session)
      const timeline = ensureAnimationDocument(session.document)
      const directByKey = new Map<string, LayerMask>()
      for (const entry of timeline.layerMasks ?? []) directByKey.set(animationCelKey(entry.layerId, entry.frameId), entry.mask)
      for (const entry of timeline.groupMasks ?? []) directByKey.set(animationCelKey(entry.groupId, entry.frameId), entry.mask)
      const resolvedByKey = createAnimationMaskLookup(ensureAnimationDocument(session.document))
      const linkedKeys = session.selectedAnimationMaskCellKeys.filter((key) => {
        const direct = directByKey.get(key)
        const resolved = resolvedByKey.get(key)
        return Boolean(resolved && (!direct || direct.linkedMaskId))
      })
      if (linkedKeys.length) {
        session.selectedAnimationMaskCellKeys = session.selectedAnimationMaskCellKeys.filter((key) => {
          const direct = directByKey.get(key)
          return Boolean(direct && !direct.linkedMaskId)
        })
        session.animationMaskCellSelectionAnchorKey = session.selectedAnimationMaskCellKeys.at(-1) ?? null
        set({ message: tr('workspace.animation.incompatibleCel') })
        return
      }
      const sourceKeys = session.selectedAnimationMaskCellKeys.filter((key) => directByKey.has(key))
      const placements = mapAnimationMaskBlock(session, sourceKeys, sourceAnchorKey, ownerId, frameId)
      if (!placements.length || placements.length !== sourceKeys.length || placements.every((placement) => placement.sourceKey === placement.targetKey)) return
      if (placements.some((placement) => animationMaskOwnerLocked(session.document, parseAnimationCelKey(placement.targetKey)?.layerId ?? ''))) return
      const affectedKeys = [...new Set(placements.flatMap((placement) => [placement.sourceKey, placement.targetKey]))]
      const before = affectedKeys.flatMap((key) => {
        const target = parseAnimationCelKey(key)
        const snapshot = target ? animationMaskSlotSnapshot(session.document, target.layerId, target.frameId) : null
        return snapshot ? [snapshot] : []
      })
      const sourceMasks = new Map(placements.flatMap((placement) => {
        const target = parseAnimationCelKey(placement.sourceKey)
        const mask = target ? directByKey.get(placement.sourceKey) ?? null : null
        const ownerKind = target ? animationMaskOwnerKind(session.document, target.layerId) : null
        return target && mask && ownerKind ? [[placement.sourceKey, cloneAnimationMaskForOwner(mask, ownerKind, mask.ownerId)] as const] : []
      }))
      for (const sourceKey of sourceKeys) {
        const target = parseAnimationCelKey(sourceKey)
        const sourceMask = directByKey.get(sourceKey)
        const ownerKind = target ? animationMaskOwnerKind(session.document, target.layerId) : null
        if (target && sourceMask && ownerKind) setAnimationMaskSlot(session.document, target.layerId, target.frameId, whiteAnimationMaskForOwner(sourceMask, ownerKind, sourceMask.ownerId))
      }
      for (const placement of placements) {
        const source = sourceMasks.get(placement.sourceKey)
        const target = parseAnimationCelKey(placement.targetKey)
        if (source && target) setAnimationMaskSlot(session.document, target.layerId, target.frameId, source)
      }
      const after = affectedKeys.flatMap((key) => {
        const target = parseAnimationCelKey(key)
        const snapshot = target ? animationMaskSlotSnapshot(session.document, target.layerId, target.frameId) : null
        return snapshot ? [snapshot] : []
      })
      if (ensureAnimationDocument(session.document).activeFrameId !== frameId) activateAnimationFrame(session.document, frameId)
      if (session.document.layers.some((layer) => layer.id === ownerId)) session.document.activeLayerId = ownerId
      const afterKeys = placements.map((placement) => placement.targetKey)
      session.selectedAnimationMaskCellKeys = afterKeys
      session.animationMaskCellSelectionAnchorKey = afterKeys.at(-1) ?? null
      const afterSelection = captureAnimationSelectionHistory(session)
      session.history.push({
        label: tr('workspace.history.moveAnimationMask'),
        bytes: [...before, ...after].reduce((sum, item) => sum + (item.mask?.pixels.byteLength ?? 0), 0),
        undo: () => { restoreAnimationMaskSlots(session.document, before); restoreAnimationSelectionHistory(session, beforeSelection) },
        redo: () => { restoreAnimationMaskSlots(session.document, after); restoreAnimationSelectionHistory(session, afterSelection) },
        invalidation: { kind: 'full' }
      })
    }, true, true)
  },

  connectSelectedAnimationMasks() {
    get().mutateActive((session) => {
      const beforeSelection = captureAnimationSelectionHistory(session)
      const timeline = ensureAnimationDocument(session.document)
      const frameIndexes = new Map(timeline.frames.map((frame, index) => [frame.id, index]))
      const resolvedByKey = createAnimationMaskLookup(ensureAnimationDocument(session.document))
      const directByKey = new Map<string, LayerMask>()
      for (const entry of timeline.layerMasks ?? []) directByKey.set(animationCelKey(entry.layerId, entry.frameId), entry.mask)
      for (const entry of timeline.groupMasks ?? []) directByKey.set(animationCelKey(entry.groupId, entry.frameId), entry.mask)
      const selected = session.selectedAnimationMaskCellKeys.flatMap((key) => {
        const target = parseAnimationCelKey(key)
        const mask = target ? directByKey.get(key) ?? null : null
        const resolved = resolvedByKey.get(key) ?? mask
        return target && mask ? [{ key, target, mask, resolved }] : []
      })
      const byOwner = new Map<string, typeof selected>()
      for (const item of selected) byOwner.set(item.target.layerId, [...(byOwner.get(item.target.layerId) ?? []), item])
      const linkable = [...byOwner.values()].filter((items) => items.length > 1)
      if (!linkable.length || linkable.some((items) => animationMaskOwnerLocked(session.document, items[0].target.layerId))) return
      const affectedKeys = linkable.flatMap((items) => items.map((item) => item.key))
      const before = affectedKeys.flatMap((key) => {
        const target = parseAnimationCelKey(key)
        const snapshot = target ? animationMaskSlotSnapshot(session.document, target.layerId, target.frameId) : null
        return snapshot ? [snapshot] : []
      })
      let changed = false
      for (const items of linkable) {
        items.sort((left, right) => (frameIndexes.get(left.target.frameId) ?? 0) - (frameIndexes.get(right.target.frameId) ?? 0))
        const source = items[0].resolved ?? items[0].mask
        for (const item of items) {
          if (item.mask.id === source.id) continue
          if (item.mask.linkedMaskId !== source.id) changed = true
          item.mask.linkedMaskId = source.id
        }
      }
      if (!changed) return
      const after = affectedKeys.flatMap((key) => {
        const target = parseAnimationCelKey(key)
        const snapshot = target ? animationMaskSlotSnapshot(session.document, target.layerId, target.frameId) : null
        return snapshot ? [snapshot] : []
      })
      const afterSelection = captureAnimationSelectionHistory(session)
      session.history.push({
        label: tr('workspace.history.animationMaskLink'),
        bytes: [...before, ...after].reduce((sum, item) => sum + (item.mask?.pixels.byteLength ?? 0), 0),
        undo: () => { restoreAnimationMaskSlots(session.document, before); restoreAnimationSelectionHistory(session, beforeSelection) },
        redo: () => { restoreAnimationMaskSlots(session.document, after); restoreAnimationSelectionHistory(session, afterSelection) },
        invalidation: { kind: 'full' }
      })
    }, true, true)
  },

  disconnectSelectedAnimationMasks() {
    get().mutateActive((session) => {
      const beforeSelection = captureAnimationSelectionHistory(session)
      const timeline = ensureAnimationDocument(session.document)
      const selectedKeys = new Set(session.selectedAnimationMaskCellKeys)
      const resolvedByKey = createAnimationMaskLookup(ensureAnimationDocument(session.document))
      const slots = [
        ...(timeline.layerMasks ?? []).map((entry) => ({ ownerId: entry.layerId, frameId: entry.frameId, mask: entry.mask })),
        ...(timeline.groupMasks ?? []).map((entry) => ({ ownerId: entry.groupId, frameId: entry.frameId, mask: entry.mask }))
      ]
      const selectedRootIds = new Set(slots.flatMap((slot) => {
        const key = animationCelKey(slot.ownerId, slot.frameId)
        return selectedKeys.has(key) ? [resolvedByKey.get(key)?.id ?? slot.mask.id] : []
      }))
      const affected = slots.filter((slot) => {
        if (!slot.mask.linkedMaskId) return false
        const key = animationCelKey(slot.ownerId, slot.frameId)
        return selectedKeys.has(key) || selectedRootIds.has(resolvedByKey.get(key)?.id ?? slot.mask.id)
      })
      if (!affected.length || affected.some((slot) => animationMaskOwnerLocked(session.document, slot.ownerId))) return
      const affectedKeys = affected.map((slot) => animationCelKey(slot.ownerId, slot.frameId))
      const before = affectedKeys.flatMap((key) => {
        const target = parseAnimationCelKey(key)
        const snapshot = target ? animationMaskSlotSnapshot(session.document, target.layerId, target.frameId) : null
        return snapshot ? [snapshot] : []
      })
      for (const slot of affected) {
        const resolved = resolveAnimationMask(timeline, slot.mask)
        if (!resolved) continue
        const ownerKind = animationMaskOwnerKind(session.document, slot.ownerId)
        if (!ownerKind) continue
        const independent = cloneAnimationMaskForOwner(resolved, ownerKind, slot.mask.ownerId, { id: slot.mask.id, preserveLink: false })
        setAnimationMaskSlot(session.document, slot.ownerId, slot.frameId, independent)
      }
      const after = affectedKeys.flatMap((key) => {
        const target = parseAnimationCelKey(key)
        const snapshot = target ? animationMaskSlotSnapshot(session.document, target.layerId, target.frameId) : null
        return snapshot ? [snapshot] : []
      })
      const afterSelection = captureAnimationSelectionHistory(session)
      session.history.push({
        label: tr('workspace.history.animationMaskUnlink'),
        bytes: [...before, ...after].reduce((sum, item) => sum + (item.mask?.pixels.byteLength ?? 0), 0),
        undo: () => { restoreAnimationMaskSlots(session.document, before); restoreAnimationSelectionHistory(session, beforeSelection) },
        redo: () => { restoreAnimationMaskSlots(session.document, after); restoreAnimationSelectionHistory(session, afterSelection) },
        invalidation: { kind: 'full' }
      })
    }, true, true)
  },

  deleteSelectedAnimationItems() {
    const current = activeSession(get())
    if (!current) return
    if (current.selectedAnimationMaskCellKeys.length > 0 || current.selectedAnimationMaskRowKeys.length > 0) {
      get().deleteSelectedLayerMasks()
      return
    }
    const timeline = ensureAnimationDocument(current.document)
    if (current.selectedAnimationCellKeys.length) {
      get().mutateActive((session) => {
        const timeline = ensureAnimationDocument(session.document)
        const selected = new Set(session.selectedAnimationCellKeys)
        const selectedCels = timeline.cels.filter((cel) => selected.has(animationCelKey(cel.layerId, cel.frameId)))
        const selectedIds = new Set(selectedCels.map((cel) => cel.id))
        const lookup = createAnimationCelLookup(timeline)
        const membersBySource = new Map<string, AnimationCel[]>()
        for (const cel of timeline.cels) {
          const source = lookup.resolve(cel) ?? cel
          const members = membersBySource.get(source.id) ?? []
          members.push(cel)
          membersBySource.set(source.id, members)
        }
        const affectedIds = new Set(selectedIds)
        for (const cel of selectedCels) {
          const source = lookup.resolve(cel) ?? cel
          if (selectedIds.has(source.id)) for (const member of membersBySource.get(source.id) ?? []) affectedIds.add(member.id)
        }
        const affected = timeline.cels.filter((cel) => affectedIds.has(cel.id))
        const before = affected.map(cloneAnimationCel)

        // A deleted source must hand its shared content to one surviving member.
        // Deleting an ordinary member leaves the rest of the link group untouched.
        for (const source of selectedCels.filter((cel) => !cel.linkedCelId)) {
          const remaining = (membersBySource.get(source.id) ?? []).filter((member) => !selectedIds.has(member.id))
          const replacement = remaining[0]
          if (!replacement) continue
          replacement.linkedCelId = null
          for (const member of remaining.slice(1)) {
            member.linkedCelId = replacement.id
            member.zIndex = replacement.zIndex
            member.surface = replacement.surface
            member.opacity = replacement.opacity
            member.text = replacement.text
            member.tilemap = replacement.tilemap
            member.freeTiles = replacement.freeTiles
          }
        }

        for (const cel of selectedCels) {
          cel.surface = cel.surface?.format === 'rgba'
            ? { ...cel.surface, pixels: new Uint8ClampedArray(cel.surface.pixels.length), runtimeRaster: undefined }
            : cel.surface
              ? { ...cel.surface, pixels: new Uint32Array(cel.surface.pixels.length), runtimeRaster: undefined }
              : undefined
          cel.linkedCelId = null
          cel.zIndex = 0
          delete cel.text
          delete cel.tilemap
          delete cel.freeTiles
        }
        refreshActiveAnimationFrame(session.document)
        session.activeLayerMaskId = null
        const after = affected.map((cel) => cloneAnimationCel(timeline.cels.find((candidate) => candidate.id === cel.id) ?? cel))
        session.selectedAnimationCellKeys = []
        session.animationCellSelectionExplicit = false
        if (before.length) session.history.push({ label: tr('workspace.history.deleteAnimationCel'), bytes: [...before, ...after].reduce((sum, cel) => sum + (cel.surface?.pixels.byteLength ?? 0), 0), undo: () => restoreAnimationCels(session.document, before), redo: () => restoreAnimationCels(session.document, after) })
      }, true, true)
      return
    }
    const selectedFrames = current.selectedAnimationFrameIds.length ? [...current.selectedAnimationFrameIds] : [timeline.activeFrameId]
    current.history.beginCompound()
    for (const frameId of selectedFrames) {
      if (ensureAnimationDocument(current.document).frames.length <= 1) break
      get().setActiveAnimationFrame(frameId)
      // Defer selection normalization until the compound deletion completes.
      get().deleteAnimationFrame(false, true)
    }
    current.history.endCompound(tr('workspace.history.deleteAnimationFrame'))
    get().mutateActive((session) => { session.selectedAnimationFrameIds = [] }, false, true)
  },

  setAnimationPlaying(playing, completed = false) {
    // A floating selection belongs to the frame on which the transform was
    // started. Commit it before playback can advance the document surface;
    // the committed selection geometry remains available on later frames.
    if (playing) get().commitFloatingPaste()
    get().mutateActive((session) => {
      if (session.animationPlaying === playing) return
      const timeline = ensureAnimationDocument(session.document)
      const playbackMode = session.animationPlaybackMode ?? (timeline.loop ? 'all' : 'once')
      if (playing) {
        const preserveMaskContext = (session.selectedAnimationMaskRowKeys?.length ?? 0) > 0
          || (session.selectedAnimationMaskCellKeys?.length ?? 0) > 0
          || session.activeLayerMaskId !== null
        clearAnimationLoopPlayback(session)
        const firstPlayableFrameId = firstPlayableAnimationFrameId(timeline)
        if (!firstPlayableFrameId) return
        session.animationPlaybackStartFrameId = timeline.activeFrameId
        const loopSection = playbackMode === 'tag' ? animationLoopSectionAtFrame(timeline, timeline.activeFrameId) : null
        const targetFrameId = loopSection
          ? animationLoopSectionStartFrameId(timeline, loopSection)
          : playbackMode === 'once'
            ? firstPlayableFrameId
            : timeline.frames.find((frame) => frame.id === timeline.activeFrameId)?.disabled === true
              ? nextAnimationFrameId({ ...timeline, loop: true }, timeline.activeFrameId)
              : timeline.activeFrameId
        if (!targetFrameId) return
        if (loopSection) {
          setAnimationLoopPlaybackSection(session, loopSection)
          session.animationPlaybackTagCycleSectionId = playbackMode === 'tag' && loopSection.repeatCount !== null ? loopSection.id : null
        }
        if (targetFrameId && targetFrameId !== timeline.activeFrameId) {
          activateAnimationFrame(session.document, targetFrameId)
          if (!preserveMaskContext) {
            session.activeLayerMaskId = null
            session.layerMaskIsolatedView = false
          }
          session.lastPencilPoint = null
          session.lastEraserPoint = null
          session.revision += 1
        }
        session.animationPlaying = true
        return
      }
      session.animationPlaying = false
      const loopSectionId = session.animationPlaybackLoopSectionId
      const startFrameId = session.animationPlaybackStartFrameId
      session.animationPlaybackStartFrameId = null
      clearAnimationLoopPlayback(session)
      const returnFrameId = session.animationReturnToStart
        ? startFrameId
        : completed && !loopSectionId && playbackMode === 'once' ? firstPlayableAnimationFrameId(timeline) : null
      if (returnFrameId && returnFrameId !== timeline.activeFrameId && activateAnimationFrame(session.document, returnFrameId)) {
        session.lastPencilPoint = null
        session.lastEraserPoint = null
        session.revision += 1
      }
      // Playback only moves the playhead. Keep the user's layer/frame/cel
      // selection intact so stopping playback cannot rewrite the timeline
      // focus or discard a selection made while the animation was running.
    }, false)
  },

  pauseAnimationAtCurrentFrame() {
    get().mutateActive((session) => {
      if (!session.animationPlaying) return
      session.animationPlaying = false
      session.animationPlaybackStartFrameId = null
      clearAnimationLoopPlayback(session)
      // Pausing is also a playhead operation. Do not turn the paused frame
      // into a new selection or clear an existing multi-selection.
    }, false)
  },

  setAnimationPlaybackRate(rate) {
    const normalized = [0.25, 0.5, 1, 1.5, 2, 3].includes(rate) ? rate : 1
    get().mutateActive((session) => { session.animationPlaybackRate = normalized }, false)
    persistAnimationPlaybackPreferences({ animationPlaybackRate: normalized })
  },

  setAnimationPlaybackMode(mode) {
    const normalized: AnimationPlaybackMode = mode === 'tag' ? 'tag' : mode === 'all' ? 'all' : 'once'
    if (normalized !== 'tag') {
      get().setAnimationLoop(normalized === 'all')
      persistAnimationPlaybackPreferences({ animationPlaybackMode: normalized })
      return
    }
    get().mutateActive((session) => {
      if (session.animationPlaybackMode === 'tag' && (!session.animationPlaying || session.animationPlaybackLoopSectionRepeatIndefinitely)) return
      session.animationPlaybackMode = 'tag'
      if (!session.animationPlaying) return
      const preserveMaskContext = session.selectedAnimationMaskRowKeys.length > 0
        || session.selectedAnimationMaskCellKeys.length > 0
        || session.activeLayerMaskId !== null
      const timeline = ensureAnimationDocument(session.document)
      clearAnimationLoopPlayback(session)
      const section = animationLoopSectionAtFrame(timeline, timeline.activeFrameId)
      const firstFrameId = section ? animationLoopSectionStartFrameId(timeline, section) : null
      if (!section || !firstFrameId) {
        session.animationPlaying = false
        return
      }
      setAnimationLoopPlaybackSection(session, section)
      session.animationPlaybackTagCycleSectionId = section.repeatCount !== null ? section.id : null
      if (firstFrameId !== timeline.activeFrameId && activateAnimationFrame(session.document, firstFrameId)) {
        if (!preserveMaskContext) {
          session.activeLayerMaskId = null
          session.layerMaskIsolatedView = false
        }
        session.lastPencilPoint = null
        session.lastEraserPoint = null
        session.revision += 1
      }
    }, false)
    persistAnimationPlaybackPreferences({ animationPlaybackMode: normalized })
  },

  setAnimationReturnToStart(enabled) {
    get().mutateActive((session) => { session.animationReturnToStart = enabled }, false)
    persistAnimationPlaybackPreferences({ animationReturnToStart: enabled })
  },

  advanceAnimationFrame() {
    const session = activeSession(get())
    if (!session) return
    const timeline = ensureAnimationDocument(session.document)
    const loopSection = session.animationPlaybackLoopSectionId
      ? (timeline.loopSections ?? []).find((section) => section.id === session.animationPlaybackLoopSectionId)
      : null
    if (session.animationPlaybackLoopSectionId && !loopSection) {
      get().setAnimationPlaying(false)
      return
    }
    if (loopSection) {
      const playbackSection = session.animationPlaybackLoopSectionRepeatIndefinitely
        ? session.animationPlaybackLoopStack.length > 0
          ? { ...loopSection, repeatCount: 1 }
          : { ...loopSection, repeatCount: null }
        : loopSection
      const step = advanceAnimationLoopSectionPlayback(timeline, playbackSection, timeline.activeFrameId, session.animationPlaybackLoopIteration)
      const playbackMode = session.animationPlaybackMode ?? (timeline.loop ? 'all' : 'once')
      const nestedSection = step && !step.completed ? nestedAnimationLoopSectionAtFrame(timeline, loopSection, step.frameId) : null
      if (step && nestedSection) {
        const nestedStartFrameId = animationLoopSectionStartFrameId(timeline, nestedSection)
        if (!nestedStartFrameId) return
        get().mutateActive((current) => {
          current.animationPlaybackLoopStack.push({ sectionId: loopSection.id, iteration: step.completedIterations })
          setAnimationLoopPlaybackSection(current, nestedSection)
          activateAnimationPlaybackFrame(current, nestedStartFrameId)
        }, false)
        return
      }
      if (step?.completed && session.animationPlaybackLoopStack.length > 0) {
        const parentContext = session.animationPlaybackLoopStack.at(-1)
        const parentSection = parentContext
          ? (timeline.loopSections ?? []).find((section) => section.id === parentContext.sectionId) ?? null
          : null
        const boundaryFrameId = parentSection
          ? animationLoopSectionBoundaryFrameId(timeline, loopSection, parentSection.direction)
          : null
        if (!parentSection || !boundaryFrameId) {
          get().setAnimationPlaying(false)
          return
        }
        get().mutateActive((current) => {
          current.animationPlaybackLoopStack = current.animationPlaybackLoopStack.slice(0, -1)
          setAnimationLoopPlaybackSection(current, parentSection)
          activateAnimationPlaybackFrame(current, boundaryFrameId)
          current.animationPlaybackLoopIteration = parentContext!.iteration
        }, false)
        return
      }
      if (step?.completed && playbackMode === 'tag' && !session.animationPlaybackLoopSectionRepeatIndefinitely && loopSection.repeatCount !== null) {
        const nextFrameId = nextAnimationFrameId({ ...timeline, loop: true }, loopSection.endFrameId)
        if (nextFrameId) {
          const cycleSectionId = session.animationPlaybackTagCycleSectionId
          const cycleSection = cycleSectionId
            ? (timeline.loopSections ?? []).find((section) => section.id === cycleSectionId) ?? null
            : null
          if (cycleSection && animationLoopSectionContainsFrame(timeline, cycleSection, nextFrameId)) {
            get().mutateActive((current) => {
              setAnimationLoopPlaybackSection(current, cycleSection)
              const cycleStartFrameId = animationLoopSectionStartFrameId(timeline, cycleSection)
              if (cycleStartFrameId) activateAnimationPlaybackFrame(current, cycleStartFrameId)
            }, false)
          } else if (cycleSectionId) {
            get().mutateActive((current) => {
              const nextSection = animationLoopSectionAtFrame(timeline, nextFrameId)
              if (nextSection && nextSection.repeatCount !== null) {
                setAnimationLoopPlaybackSection(current, nextSection)
                const nextSectionStartFrameId = animationLoopSectionStartFrameId(timeline, nextSection)
                if (nextSectionStartFrameId) activateAnimationPlaybackFrame(current, nextSectionStartFrameId)
              } else {
                current.animationPlaybackLoopSectionId = null
                current.animationPlaybackLoopIteration = 0
                current.animationPlaybackLoopSectionRepeatIndefinitely = false
                activateAnimationPlaybackFrame(current, nextFrameId)
              }
            }, false)
          } else {
            get().setActiveAnimationFrame(nextFrameId)
          }
          return
        }
      }
      if (!step || step.completed) {
        get().setAnimationPlaying(false, Boolean(step?.completed))
        return
      }
      get().mutateActive((current) => {
        current.animationPlaybackLoopIteration = step.completedIterations
        if (!activateAnimationFrame(current.document, step.frameId)) return
        const preserveMaskContext = (current.selectedAnimationMaskRowKeys?.length ?? 0) > 0
          || (current.selectedAnimationMaskCellKeys?.length ?? 0) > 0
          || current.activeLayerMaskId !== null
        if (!preserveMaskContext) {
          current.activeLayerMaskId = null
          current.layerMaskIsolatedView = false
        }
        current.lastPencilPoint = null
        current.lastEraserPoint = null
        current.revision += 1
      }, false)
      return
    }
    const playbackMode = session.animationPlaybackMode ?? (timeline.loop ? 'all' : 'once')
    const loopAllFrames = playbackMode !== 'once'
    const playbackTimeline = loopAllFrames === timeline.loop ? timeline : { ...timeline, loop: loopAllFrames }
    const nextFrameId = nextAnimationFrameId(playbackTimeline, timeline.activeFrameId)
    if (!nextFrameId || !loopAllFrames && nextFrameId === timeline.activeFrameId) get().setAnimationPlaying(false, true)
    else if (playbackMode === 'tag' && session.animationPlaybackTagCycleSectionId) {
      const cycleSection = (timeline.loopSections ?? []).find((section) => section.id === session.animationPlaybackTagCycleSectionId) ?? null
      if (!cycleSection) {
        get().setAnimationPlaying(false)
        return
      }
      get().mutateActive((current) => {
        if (animationLoopSectionContainsFrame(timeline, cycleSection, nextFrameId)) {
          setAnimationLoopPlaybackSection(current, cycleSection)
          const cycleStartFrameId = animationLoopSectionStartFrameId(timeline, cycleSection)
          if (cycleStartFrameId) activateAnimationPlaybackFrame(current, cycleStartFrameId)
        } else {
          const nextSection = animationLoopSectionAtFrame(timeline, nextFrameId)
          if (nextSection && nextSection.repeatCount !== null) {
            setAnimationLoopPlaybackSection(current, nextSection)
            const nextSectionStartFrameId = animationLoopSectionStartFrameId(timeline, nextSection)
            if (nextSectionStartFrameId) activateAnimationPlaybackFrame(current, nextSectionStartFrameId)
          } else {
            current.animationPlaybackLoopSectionId = null
            current.animationPlaybackLoopIteration = 0
            current.animationPlaybackLoopSectionRepeatIndefinitely = false
            activateAnimationPlaybackFrame(current, nextFrameId)
          }
        }
      }, false)
    } else get().setActiveAnimationFrame(nextFrameId)
  },

  createAnimationLoopSection(options) {
    const current = activeSession(get())
    if (!current) return null
    const timeline = ensureAnimationDocument(current.document)
    const id = createId('loop-section')
    const section = normalizeAnimationLoopSections([{ id, ...options }], timeline.frames)[0]
    if (!section) return null
    get().mutateActive((session) => {
      const activeTimeline = ensureAnimationDocument(session.document)
      const before = cloneAnimationLoopSections(activeTimeline.loopSections)
      const after = [...before, section]
      setAnimationLoopSections(session, after)
      session.history.push({
        label: tr('workspace.history.createAnimationLoopSection'),
        bytes: 128,
        undo: () => setAnimationLoopSections(session, before),
        redo: () => setAnimationLoopSections(session, after),
        contentChanged: false,
        requiresAnimationSync: false
      })
    }, 'metadata')
    return id
  },

  updateAnimationLoopSection(id, options) {
    const current = activeSession(get())
    const currentTimeline = current ? ensureAnimationDocument(current.document) : null
    const existing = currentTimeline?.loopSections?.find((section) => section.id === id)
    const normalized = currentTimeline ? normalizeAnimationLoopSections([{ id, ...options }], currentTimeline.frames)[0] : null
    if (!current || !currentTimeline || !existing || !normalized) return
    if (existing.name === normalized.name && existing.startFrameId === normalized.startFrameId && existing.endFrameId === normalized.endFrameId && existing.direction === normalized.direction && existing.repeatCount === normalized.repeatCount) return
    get().mutateActive((session) => {
      const timeline = ensureAnimationDocument(session.document)
      const before = cloneAnimationLoopSections(timeline.loopSections)
      const after = before.map((section) => section.id === id ? normalized : section)
      if (session.animationPlaybackLoopSectionId === id || session.animationPlaybackTagCycleSectionId === id) {
        session.animationPlaying = false
        session.animationPlaybackStartFrameId = null
        clearAnimationLoopPlayback(session)
      }
      setAnimationLoopSections(session, after)
      session.history.push({
        label: tr('workspace.history.updateAnimationLoopSection'),
        bytes: 256,
        undo: () => setAnimationLoopSections(session, before),
        redo: () => setAnimationLoopSections(session, after),
        contentChanged: false,
        requiresAnimationSync: false
      })
    }, 'metadata')
  },

  deleteAnimationLoopSection(id) {
    const current = activeSession(get())
    if (!current?.document.animation?.loopSections?.some((section) => section.id === id)) return
    get().mutateActive((session) => {
      const timeline = ensureAnimationDocument(session.document)
      const before = cloneAnimationLoopSections(timeline.loopSections)
      const after = before.filter((section) => section.id !== id)
      if (session.animationPlaybackLoopSectionId === id || session.animationPlaybackTagCycleSectionId === id) {
        session.animationPlaying = false
        session.animationPlaybackStartFrameId = null
        clearAnimationLoopPlayback(session)
      }
      setAnimationLoopSections(session, after)
      session.history.push({
        label: tr('workspace.history.deleteAnimationLoopSection'),
        bytes: 128,
        undo: () => setAnimationLoopSections(session, before),
        redo: () => setAnimationLoopSections(session, after),
        contentChanged: false,
        requiresAnimationSync: false
      })
    }, 'metadata')
  },

  playAnimationLoopSection(id) {
    get().commitFloatingPaste()
    get().mutateActive((session) => {
      const preserveMaskContext = (session.selectedAnimationMaskRowKeys?.length ?? 0) > 0
        || (session.selectedAnimationMaskCellKeys?.length ?? 0) > 0
        || session.activeLayerMaskId !== null
      const timeline = ensureAnimationDocument(session.document)
      const section = (timeline.loopSections ?? []).find((candidate) => candidate.id === id)
      const firstFrameId = section ? animationLoopSectionStartFrameId(timeline, section) : null
      if (!section || !firstFrameId) {
        session.animationPlaying = false
        session.animationPlaybackStartFrameId = null
        clearAnimationLoopPlayback(session)
        return
      }
      session.animationPlaybackStartFrameId = timeline.activeFrameId
      session.animationPlaybackLoopSectionId = id
      session.animationPlaybackLoopIteration = 0
      session.animationPlaybackLoopSectionRepeatIndefinitely = section.repeatCount === null
      session.animationPlaybackLoopStack = []
      session.animationPlaybackTagCycleSectionId = session.animationPlaybackMode === 'tag' && section.repeatCount !== null ? id : null
      session.animationPlaying = true
      if (firstFrameId !== timeline.activeFrameId && activateAnimationFrame(session.document, firstFrameId)) {
        if (!preserveMaskContext) {
          session.activeLayerMaskId = null
          session.layerMaskIsolatedView = false
        }
        session.lastPencilPoint = null
        session.lastEraserPoint = null
        session.revision += 1
      }
    }, false)
  },

  addAnimationFrame() {
    get().mutateActive((session) => {
      const timeline = ensureAnimationDocument(session.document)
      const previousFrameId = timeline.activeFrameId
      const loopSectionsBefore = cloneAnimationLoopSections(timeline.loopSections)
      const frameId = addBlankAnimationFrame(session.document)
      const loopSectionsAfter = cloneAnimationLoopSections(timeline.loopSections)
      const frameIndex = timeline.frames.findIndex((frame) => frame.id === frameId)
      const frame = { ...timeline.frames[frameIndex] }
      const cels = cloneAnimationCelsForLayerIds(session.document, session.document.layers.map((layer) => layer.id), frameId)
      const restore = (): void => {
        const current = ensureAnimationDocument(session.document)
        if (!current.frames.some((candidate) => candidate.id === frameId)) current.frames.splice(Math.min(frameIndex, current.frames.length), 0, { ...frame })
        restoreAnimationCels(session.document, cels)
        current.loopSections = cloneAnimationLoopSections(loopSectionsAfter)
        activateAnimationFrame(session.document, frameId)
        clearAnimationItemSelection(session)
      }
      session.history.push({ label: tr('workspace.history.addAnimationFrame'), bytes: cels.reduce((sum, cel) => sum + (cel.surface?.pixels.byteLength ?? 0), 0) + (loopSectionsBefore.length + loopSectionsAfter.length) * 128 + 64, undo: () => { deleteAnimationFrame(session.document, frameId); ensureAnimationDocument(session.document).loopSections = cloneAnimationLoopSections(loopSectionsBefore); activateAnimationFrame(session.document, previousFrameId); session.activeLayerMaskId = null }, redo: () => { restore(); session.activeLayerMaskId = null } })
      session.animationPlaying = false
      session.activeLayerMaskId = null
      session.selection = null
      session.selectionPivot = null
      clearAnimationItemSelection(session)
    }, true, true)
  },

  addLinkedAnimationFrame() {
    get().mutateActive((session) => {
      const timeline = ensureAnimationDocument(session.document)
      const previousFrameId = timeline.activeFrameId
      const loopSectionsBefore = cloneAnimationLoopSections(timeline.loopSections)
      const selectedCellKey = session.animationCellSelectionAnchorKey && session.selectedAnimationCellKeys.includes(session.animationCellSelectionAnchorKey)
        ? session.animationCellSelectionAnchorKey
        : session.selectedAnimationCellKeys.at(-1)
      const parsedCell = selectedCellKey ? parseAnimationCelKey(selectedCellKey) : null
      const selectedCell = parsedCell
        && timeline.frames.some((frame) => frame.id === parsedCell.frameId)
        && session.document.layers.some((layer) => layer.id === parsedCell.layerId)
        ? parsedCell
        : null
      const selectedFrameId = session.animationFrameSelectionAnchorId && session.selectedAnimationFrameIds.includes(session.animationFrameSelectionAnchorId)
        ? session.animationFrameSelectionAnchorId
        : session.selectedAnimationFrameIds.at(-1)
      const sourceFrameId = selectedCell?.frameId
        ?? (selectedFrameId && timeline.frames.some((frame) => frame.id === selectedFrameId) ? selectedFrameId : timeline.activeFrameId)
      const layerIds = selectedCell ? [selectedCell.layerId] : session.document.layers.map((layer) => layer.id)
      if (sourceFrameId !== timeline.activeFrameId) activateAnimationFrame(session.document, sourceFrameId)
      const frameId = addBlankAnimationFrame(session.document)
      const loopSectionsAfter = cloneAnimationLoopSections(timeline.loopSections)
      const frameIndex = timeline.frames.findIndex((frame) => frame.id === frameId)
      const frame = { ...timeline.frames[frameIndex] }
      const groupMasks = selectedCell ? [] : (timeline.groupMasks ?? [])
        .filter((entry) => entry.frameId === sourceFrameId)
        .map((entry) => cloneAnimationGroupMask(entry, entry.groupId, frameId, createId('mask')))
      timeline.groupMasks ??= []
      timeline.groupMasks.push(...groupMasks)
      linkAnimationFrameCels(session.document, sourceFrameId, frameId, layerIds)
      const cels = cloneAnimationCelsForLayerIds(session.document, session.document.layers.map((layer) => layer.id), frameId)
      const restore = (): void => {
        const current = ensureAnimationDocument(session.document)
        if (!current.frames.some((candidate) => candidate.id === frameId)) current.frames.splice(Math.min(frameIndex, current.frames.length), 0, { ...frame })
        restoreAnimationCels(session.document, cels)
        current.groupMasks ??= []
        current.groupMasks.push(...groupMasks.filter((entry) => !current.groupMasks!.some((candidate) => candidate.mask.id === entry.mask.id)).map((entry) => cloneAnimationGroupMask(entry)))
        current.loopSections = cloneAnimationLoopSections(loopSectionsAfter)
        activateAnimationFrame(session.document, frameId)
        clearAnimationItemSelection(session)
      }
      session.history.push({
        label: tr('workspace.history.addLinkedAnimationFrame'),
        bytes: cels.reduce((sum, cel) => sum + (cel.surface?.pixels.byteLength ?? 0), 0) + groupMasks.reduce((sum, entry) => sum + entry.mask.pixels.byteLength, 0) + (loopSectionsBefore.length + loopSectionsAfter.length) * 128 + 64,
        undo: () => { deleteAnimationFrame(session.document, frameId); ensureAnimationDocument(session.document).loopSections = cloneAnimationLoopSections(loopSectionsBefore); activateAnimationFrame(session.document, previousFrameId); session.activeLayerMaskId = null },
        redo: () => { restore(); session.activeLayerMaskId = null }
      })
      session.animationPlaying = false
      session.activeLayerMaskId = null
      session.selection = null
      session.selectionPivot = null
      clearAnimationItemSelection(session)
    }, true, true)
  },

  duplicateAnimationFrame() {
    get().mutateActive((session) => {
      const timeline = ensureAnimationDocument(session.document)
      const previousFrameId = timeline.activeFrameId
      const loopSectionsBefore = cloneAnimationLoopSections(timeline.loopSections)
      const frameId = duplicateAnimationFrame(session.document)
      const loopSectionsAfter = cloneAnimationLoopSections(timeline.loopSections)
      const frameIndex = timeline.frames.findIndex((frame) => frame.id === frameId)
      const frame = { ...timeline.frames[frameIndex] }
      const cels = cloneAnimationCelsForLayerIds(session.document, session.document.layers.map((layer) => layer.id), frameId)
      const groupMasks = (timeline.groupMasks ?? []).filter((entry) => entry.frameId === frameId).map((entry) => cloneAnimationGroupMask(entry))
      const restore = (): void => {
        const current = ensureAnimationDocument(session.document)
        if (!current.frames.some((candidate) => candidate.id === frameId)) current.frames.splice(Math.min(frameIndex, current.frames.length), 0, { ...frame })
        restoreAnimationCels(session.document, cels)
        current.groupMasks ??= []
        current.groupMasks.push(...groupMasks.filter((entry) => !current.groupMasks!.some((candidate) => candidate.mask.id === entry.mask.id)).map((entry) => cloneAnimationGroupMask(entry)))
        current.loopSections = cloneAnimationLoopSections(loopSectionsAfter)
        activateAnimationFrame(session.document, frameId)
        clearAnimationItemSelection(session)
      }
      session.history.push({ label: tr('workspace.history.duplicateAnimationFrame'), bytes: cels.reduce((sum, cel) => sum + (cel.surface?.pixels.byteLength ?? 0), 0) + groupMasks.reduce((sum, entry) => sum + entry.mask.pixels.byteLength, 0) + (loopSectionsBefore.length + loopSectionsAfter.length) * 128 + 64, undo: () => { deleteAnimationFrame(session.document, frameId); ensureAnimationDocument(session.document).loopSections = cloneAnimationLoopSections(loopSectionsBefore); activateAnimationFrame(session.document, previousFrameId); session.activeLayerMaskId = null }, redo: () => { restore(); session.activeLayerMaskId = null } })
      session.animationPlaying = false
      session.activeLayerMaskId = null
      session.selection = null
      session.selectionPivot = null
      clearAnimationItemSelection(session)
    }, true, true)
  },

  deleteAnimationFrame(normalizeSelection = true, markSelectionNormalizationHistory = normalizeSelection) {
    get().mutateActive((session) => {
      const timeline = ensureAnimationDocument(session.document)
      const frameId = timeline.activeFrameId
      const frameIndex = timeline.frames.findIndex((frame) => frame.id === frameId)
      const frame = { ...timeline.frames[frameIndex] }
      const cels = cloneAnimationCelsForLayerIds(session.document, session.document.layers.map((layer) => layer.id), frameId)
      const layerMasks = (timeline.layerMasks ?? []).filter((entry) => entry.frameId === frameId).map((entry) => cloneAnimationLayerMask(entry))
      const groupMasks = (timeline.groupMasks ?? []).filter((entry) => entry.frameId === frameId).map((entry) => cloneAnimationGroupMask(entry))
      const loopSectionsBefore = cloneAnimationLoopSections(timeline.loopSections)
      if (!deleteAnimationFrame(session.document, frameId)) { set({ message: tr('workspace.animation.minimumFrame') }); return }
      const nextTimeline = ensureAnimationDocument(session.document)
      const nextFrameId = nextTimeline.activeFrameId
      const loopSectionsAfter = cloneAnimationLoopSections(nextTimeline.loopSections)
      const restore = (): void => {
        const current = ensureAnimationDocument(session.document)
        if (!current.frames.some((candidate) => candidate.id === frameId)) current.frames.splice(Math.min(frameIndex, current.frames.length), 0, { ...frame })
        restoreAnimationCels(session.document, cels)
        current.layerMasks ??= []
        current.layerMasks.push(...layerMasks.filter((entry) => !current.layerMasks!.some((candidate) => candidate.mask.id === entry.mask.id)).map((entry) => cloneAnimationLayerMask(entry)))
        current.groupMasks ??= []
        current.groupMasks.push(...groupMasks.filter((entry) => !current.groupMasks!.some((candidate) => candidate.mask.id === entry.mask.id)).map((entry) => cloneAnimationGroupMask(entry)))
        current.loopSections = cloneAnimationLoopSections(loopSectionsBefore)
        activateAnimationFrame(session.document, frameId)
      }
      session.history.push({ label: tr('workspace.history.deleteAnimationFrame'), bytes: cels.reduce((sum, cel) => sum + (cel.surface?.pixels.byteLength ?? 0), 0) + [...layerMasks, ...groupMasks].reduce((sum, entry) => sum + entry.mask.pixels.byteLength, 0) + (loopSectionsBefore.length + loopSectionsAfter.length) * 128 + 64, undo: () => { restore(); session.activeLayerMaskId = null }, redo: () => { deleteAnimationFrame(session.document, frameId); ensureAnimationDocument(session.document).loopSections = cloneAnimationLoopSections(loopSectionsAfter); activateAnimationFrame(session.document, nextFrameId); session.activeLayerMaskId = null } })
      session.animationPlaying = false
      session.animationPlaybackStartFrameId = null
      clearAnimationLoopPlayback(session)
      session.activeLayerMaskId = null
      session.selection = null
      session.selectionPivot = null
    }, true, normalizeSelection, markSelectionNormalizationHistory)
  },

  setActiveAnimationFrameDuration(duration) {
    get().mutateActive((session) => {
      const timeline = ensureAnimationDocument(session.document)
      const selected = session.selectedAnimationFrameIds.includes(timeline.activeFrameId) ? new Set(session.selectedAnimationFrameIds) : new Set([timeline.activeFrameId])
      const frames = timeline.frames.filter((frame) => selected.has(frame.id))
      const nextDuration = Math.max(1, Math.min(60_000, Math.trunc(duration) || 100))
      const before = frames.map((frame) => ({ id: frame.id, duration: frame.duration }))
      if (!before.some((frame) => frame.duration !== nextDuration)) return
      for (const frame of frames) setAnimationFrameDuration(session.document, frame.id, nextDuration)
      const apply = (values: Array<{ id: string; duration: number }>): void => {
        const current = ensureAnimationDocument(session.document)
        for (const value of values) {
          const target = current.frames.find((frame) => frame.id === value.id)
          if (target) target.duration = value.duration
        }
      }
      const after = frames.map((frame) => ({ id: frame.id, duration: frame.duration }))
      session.history.push({ label: tr('workspace.history.animationFrameDuration'), bytes: frames.length * 32, undo: () => apply(before), redo: () => apply(after) })
      // Editing frame timing must not look like canvas drawing and dismiss
      // the explicit multi-frame selection.
      session.selectionGuidesPreservedAtContentRevision = session.contentRevision + 1
    })
  },

  setSelectedAnimationFramesDisabled(disabled) {
    get().mutateActive((session) => updateSelectedAnimationFramesDisabled(session, disabled), 'metadata')
    const session = activeSession(get())
    const timeline = session?.document.animation
    const activeFrame = timeline?.frames.find((frame) => frame.id === timeline.activeFrameId)
    // Keep the playhead out of a frame that was just disabled. Advancing
    // through the normal playback path also preserves the selected mask row
    // and handles tags/looping consistently.
    if (session?.animationPlaying && activeFrame?.disabled === true) get().advanceAnimationFrame()
  },

  toggleSelectedAnimationFramesDisabled() {
    get().mutateActive((session) => updateSelectedAnimationFramesDisabled(session, 'toggle'), 'metadata')
    const session = activeSession(get())
    const timeline = session?.document.animation
    const activeFrame = timeline?.frames.find((frame) => frame.id === timeline.activeFrameId)
    if (session?.animationPlaying && activeFrame?.disabled === true) get().advanceAnimationFrame()
  },

  setAnimationLoop(loop) {
    const playbackMode: AnimationPlaybackMode = loop ? 'all' : 'once'
    const current = activeSession(get())
    if (!current) return
    if (current.animationPlaybackMode !== playbackMode || current.animationPlaybackLoopSectionId) {
      get().mutateActive((session) => {
        session.animationPlaybackMode = playbackMode
        clearAnimationLoopPlayback(session)
      }, false)
    }
    if (ensureAnimationDocument(current.document).loop === loop) return
    get().mutateActive((session) => {
      const timeline = ensureAnimationDocument(session.document)
      const before = timeline.loop
      setAnimationLoop(session.document, loop)
      session.history.push({
        label: tr('workspace.history.animationLoop'),
        bytes: 16,
        undo: () => { ensureAnimationDocument(session.document).loop = before; session.animationPlaybackMode = before ? 'all' : 'once'; clearAnimationLoopPlayback(session) },
        redo: () => { ensureAnimationDocument(session.document).loop = loop; session.animationPlaybackMode = playbackMode; clearAnimationLoopPlayback(session) }
      })
    })
  },

  async addLayer() {
    get().commitFloatingPaste()
    const current = activeSession(get())
    if (!current) return
    get().mutateActive((session) => {
      const document = session.document
      const placement = selectedRowInsertionTarget(session)
      const layer = createSparseLayer(tr('workspace.layer.defaultName', { index: document.layers.length + 1 }), document.colorMode)
      const targetGroupId = insertionTargetParent(document, placement)
      if (targetGroupId) layer.groupId = targetGroupId
      const groupMemberIds = targetGroupId ? new Set(getLayerIdsInGroup(document, targetGroupId)) : null
      const lastGroupMember = groupMemberIds ? document.layers.reduce((last, item, index) => groupMemberIds.has(item.id) ? index : last, -1) : -1
      const index = lastGroupMember >= 0 ? lastGroupMember + 1 : document.layers.length
      document.layers.splice(index, 0, layer)
      const timeline = ensureAnimationDocument(document)
      const animationCels = cloneAnimationCelsForLayerIds(document, [layer.id])
      activateNewLayerContext(session, layer.id, timeline.activeFrameId)
      session.history.beginCompound()
      session.history.push({
        label: tr('workspace.history.newLayer'), bytes: layer.pixels.byteLength,
        undo: () => { document.layers = document.layers.filter((item) => item.id !== layer.id); removeAnimationCelsForLayers(document, [layer.id]); document.activeLayerId = document.layers[Math.max(0, index - 1)].id },
        redo: () => { document.layers.splice(index, 0, layer); restoreAnimationCels(document, animationCels); document.activeLayerId = layer.id }
      })
      const placementHistory = moveLayerPanelRowsOperation(session, [layer.id], [], placement)
      if (placementHistory) session.history.push(placementHistory)
      session.history.endCompound(tr('workspace.history.newLayer'))
    }, true, true)
  },

  async applyFilterPreset(presetId) {
    get().commitFloatingPaste()
    const current = activeSession(get())
    const preset = filterPresetById(presetId)
    if (!current || !preset) return
    const documentId = current.document.id
    try {
      const resource = await window.moonSprite.getResourceInfo()
      const check = checkResourceLimit(current.document.width, current.document.height, current.document.layers.length + 1, current.document.colorMode, resource)
      if (!check.allowed) throw new Error(check.reason)
      get().mutateActive((session) => {
        if (session.document.id !== documentId) return
        const document = session.document
        const before = captureDocumentStructureSnapshot(document)
        const beforeSelection = captureLayerUi(session)
        const rgbaPixels = renderFilterPreset(preset.id, document.width, document.height)
        const layer = createLayer(`滤镜 · ${preset.name}`, document.width, document.height, document.colorMode)
        layer.blendMode = preset.blendMode
        layer.opacity = preset.opacity
        layer.description = preset.description
        if (session.selectedGroupId && document.groups.some((group) => group.id === session.selectedGroupId)) layer.groupId = session.selectedGroupId
        if (layer.format === 'rgba') layer.pixels = rgbaPixels
        else {
          const pixels = new Uint32Array(document.width * document.height)
          for (let index = 0; index < pixels.length; index += 1) {
            const offset = index * 4
            pixels[index] = paletteColorIdForCanvas(document, {
              r: rgbaPixels[offset],
              g: rgbaPixels[offset + 1],
              b: rgbaPixels[offset + 2],
              a: rgbaPixels[offset + 3]
            })
          }
          layer.pixels = pixels
        }
        document.layers.push(layer)
        const timeline = ensureAnimationDocument(document)
        const filterCels = timeline.cels.filter((cel) => cel.layerId === layer.id)
        const sourceSurface: AnimationCelSurface = layer.format === 'rgba'
          ? { format: 'rgba', width: layer.width, height: layer.height, offsetX: layer.offsetX, offsetY: layer.offsetY, pixels: new Uint8ClampedArray(layer.pixels) }
          : { format: 'indexed', width: layer.width, height: layer.height, offsetX: layer.offsetX, offsetY: layer.offsetY, pixels: new Uint32Array(layer.pixels) }
        for (const cel of filterCels) {
          cel.linkedCelId = null
          cel.surface = cloneAnimationCelSurface(sourceSurface)
          delete cel.text
          delete cel.tilemap
          delete cel.freeTiles
        }
        connectAnimationCels(document, filterCels.map((cel) => cel.id))
        document.activeLayerId = layer.id
        session.selectedGroupId = null
        session.selectedGroupIds = []
        session.selectedLayerIds = [layer.id]
        refreshActiveAnimationFrame(document)
        const after = captureDocumentStructureSnapshot(document)
        const afterSelection = captureLayerUi(session)
        const restore = (snapshot: DocumentStructureSnapshot, selection: ReturnType<typeof captureLayerUi>): void => {
          restoreDocumentStructureSnapshot(document, snapshot)
          session.selectedLayerIds = [...selection.selectedLayerIds]
          session.selectedGroupId = selection.selectedGroupId
          session.selectedGroupIds = [...selection.selectedGroupIds]
          session.collapsedGroupIds = [...selection.collapsedGroupIds]
        }
        session.history.push({
          label: `滤镜：${preset.name}`,
          bytes: documentStructureDeltaBytes(before, after),
          undo: () => restore(before, beforeSelection),
          redo: () => restore(after, afterSelection),
          invalidation: { kind: 'full' },
          requiresAnimationSync: false
        })
      }, true, true)
    } catch (error) {
      set({ message: error instanceof Error ? error.message : tr('workspace.canvasCreateError') })
    }
  },

  async applyLcdScreenFilter(options?: Partial<LcdScreenFilterOptions>) {
    get().commitFloatingPaste()
    const current = activeSession(get())
    const selectedLayerId = current?.selectedLayerIds.length === 1 ? current.selectedLayerIds[0] : null
    if (!current || !selectedLayerId) return
    const documentId = current.document.id
    const lcdOptions = normalizeLcdScreenFilterOptions(options)
    try {
      const resource = await window.moonSprite.getResourceInfo()
      const check = checkResourceLimit(current.document.width, current.document.height, current.document.layers.length + 4, current.document.colorMode, resource)
      if (!check.allowed) throw new Error(check.reason)
      get().mutateActive((session) => {
        if (session.document.id !== documentId) return
        const document = session.document
        const source = document.layers.find((layer) => layer.id === selectedLayerId)
        if (!source) return
        syncActiveAnimationFrame(document)
        const before = captureDocumentStructureSnapshot(document)
        const beforeSelection = captureLayerUi(session)
        const sourceVisibleBefore = source.visible
        const groupId = createId('filter-group')
        const group: LayerGroup = {
          id: groupId,
          name: tr('filter.lcdScreen'),
          parentGroupId: source.groupId ?? null,
          visible: true,
          locked: false,
          opacity: 1,
          blendMode: 'normal',
          panelOrder: document.layers.indexOf(source) + 0.5,
          displayColor: { ...nextAvailableLayerDisplayColor(document), a: 64 }
        }
        let lcdLayerColorIndex = 0
        const sourceColorAt = (x: number, y: number): RgbaColor => x < 0 || y < 0 || x >= source.width || y >= source.height
          ? { r: 0, g: 0, b: 0, a: 0 }
          : readLayerColor(document, source, y * source.width + x)
        const makeLayer = (name: string, mode: BlendMode, colorize: (color: RgbaColor, x: number, y: number) => RgbaColor, offset = { x: 0, y: 0 }): RasterLayer => {
          const layer = createLayer(name, source.width, source.height, document.colorMode)
          layer.groupId = groupId
          layer.blendMode = mode
          layer.displayColor = defaultFreeTileSourceDisplayColor(lcdLayerColorIndex++)
          if (layer.format === 'rgba') {
            const pixels = new Uint8ClampedArray(source.width * source.height * 4)
            for (let y = 0; y < source.height; y += 1) for (let x = 0; x < source.width; x += 1) {
              const color = colorize(sourceColorAt(x - offset.x, y - offset.y), x, y)
              const pixelOffset = (y * source.width + x) * 4
              pixels[pixelOffset] = color.r
              pixels[pixelOffset + 1] = color.g
              pixels[pixelOffset + 2] = color.b
              pixels[pixelOffset + 3] = color.a
            }
            layer.pixels = pixels
          } else {
            const pixels = new Uint32Array(source.width * source.height)
            for (let y = 0; y < source.height; y += 1) for (let x = 0; x < source.width; x += 1) {
              pixels[y * source.width + x] = paletteColorIdForCanvas(document, colorize(sourceColorAt(x - offset.x, y - offset.y), x, y))
            }
            layer.pixels = pixels
          }
          layer.offsetX = source.offsetX
          layer.offsetY = source.offsetY
          return layer
        }
        const redLayer = makeLayer(tr('filter.red'), 'screen', (color, x, y) => lcdChannelColorAtNormalized(color, 0, x, y, lcdOptions), lcdChannelOffset(0, lcdOptions))
        const greenLayer = makeLayer(tr('filter.green'), 'screen', (color, x, y) => lcdChannelColorAtNormalized(color, 1, x, y, lcdOptions), lcdChannelOffset(1, lcdOptions))
        const blueLayer = makeLayer(tr('filter.blue'), 'screen', (color, x, y) => lcdChannelColorAtNormalized(color, 2, x, y, lcdOptions), lcdChannelOffset(2, lcdOptions))
        const scanlineLayer = makeLayer(tr('filter.scanlines'), 'soft-light', (_color, x, y) => lcdScanlineColorAtNormalized(x, y, lcdOptions))
        redLayer.displayColor = { r: 255, g: 0, b: 0, a: 64 }
        greenLayer.displayColor = { r: 0, g: 255, b: 0, a: 64 }
        blueLayer.displayColor = { r: 0, g: 0, b: 255, a: 64 }
        scanlineLayer.displayColor = { r: 128, g: 128, b: 128, a: 64 }
        document.groups.push(group)
        const sourceIndex = document.layers.indexOf(source)
        const insertAt = sourceIndex >= 0 ? sourceIndex + 1 : document.layers.length
        // Internal layer order is bottom-to-top; reverse the visual child order
        // so the panel reads Scanlines, Blue, Green, Red.
        document.layers.splice(insertAt, 0, redLayer, greenLayer, blueLayer, scanlineLayer)
        source.visible = false
        const timeline = ensureAnimationDocument(document)
        const createdLayers = [redLayer, greenLayer, blueLayer, scanlineLayer]
        for (const layer of createdLayers) {
          const cels = timeline.cels.filter((cel) => cel.layerId === layer.id)
          const surface: AnimationCelSurface = layer.format === 'rgba'
            ? { format: 'rgba', width: layer.width, height: layer.height, offsetX: layer.offsetX, offsetY: layer.offsetY, pixels: new Uint8ClampedArray(layer.pixels) }
            : { format: 'indexed', width: layer.width, height: layer.height, offsetX: layer.offsetX, offsetY: layer.offsetY, pixels: new Uint32Array(layer.pixels) }
          for (const cel of cels) {
            cel.linkedCelId = null
            cel.surface = cloneAnimationCelSurface(surface)
            delete cel.text
            delete cel.tilemap
            delete cel.freeTiles
          }
          connectAnimationCels(document, cels.map((cel) => cel.id))
        }
        document.activeLayerId = redLayer.id
        session.selectedLayerIds = []
        session.selectedGroupId = groupId
        session.selectedGroupIds = [groupId]
        refreshActiveAnimationFrame(document)
        const after = captureDocumentStructureSnapshot(document)
        const afterSelection = captureLayerUi(session)
        const restore = (snapshot: DocumentStructureSnapshot, selection: ReturnType<typeof captureLayerUi>, sourceVisible: boolean): void => {
          restoreDocumentStructureSnapshot(document, snapshot)
          const restoredSource = document.layers.find((layer) => layer.id === selectedLayerId)
          if (restoredSource) restoredSource.visible = sourceVisible
          session.selectedLayerIds = [...selection.selectedLayerIds]
          session.selectedGroupId = selection.selectedGroupId
          session.selectedGroupIds = [...selection.selectedGroupIds]
          session.collapsedGroupIds = [...selection.collapsedGroupIds]
        }
        session.history.push({ label: `${tr('filter.lcdScreen')}`, bytes: documentStructureDeltaBytes(before, after), undo: () => restore(before, beforeSelection, sourceVisibleBefore), redo: () => restore(after, afterSelection, false), invalidation: { kind: 'full' }, requiresAnimationSync: false })
      }, true, true)
    } catch (error) {
      set({ message: error instanceof Error ? error.message : tr('workspace.canvasCreateError') })
    }
  },

  async createTilemapLayer(options) {
    get().commitFloatingPaste()
    const current = activeSession(get())
    if (!current) return
    const documentId = current.document.id
    try {
      let created = false
      const requestedTilesetId = typeof options.tilesetId === 'string' && options.tilesetId.trim() ? options.tilesetId : null
      const requestedTileset = requestedTilesetId
        ? current.document.tilesets?.find((tileset) => tileset.id === requestedTilesetId) ?? null
        : null
      if (requestedTilesetId && (!requestedTileset || !current.document.layers.some((layer) => layer.kind === 'tilemap' && layer.tilemapTilesetId === requestedTilesetId))) {
        throw new Error(tr('workspace.tilemap.tilesetUnavailable'))
      }
      const tileWidth = requestedTileset?.tileWidth ?? Math.max(1, Math.trunc(options.tileWidth))
      const tileHeight = requestedTileset?.tileHeight ?? Math.max(1, Math.trunc(options.tileHeight))
      const layerName = options.name.trim() || tr('workspace.tilemap.layerName')
      const resource = await window.moonSprite.getResourceInfo()
      const check = checkResourceLimit(current.document.width, current.document.height, current.document.layers.length + 1, current.document.colorMode, resource)
      if (!check.allowed) throw new Error(check.reason)
      get().mutateActive((session) => {
        if (session.document.id !== documentId) return
        const document = session.document
        syncActiveAnimationFrame(document)
        const before = captureDocumentStructureSnapshot(document)
        const beforeSelection = captureLayerUi(session)
        const beforeTileSelection = { tilesetId: session.selectedTilesetId, tileId: session.selectedTileId, secondaryTileId: session.secondaryTileId, mode: session.tilemapMode }
        const tileset = requestedTilesetId
          ? document.tilesets?.find((candidate) => candidate.id === requestedTilesetId) ?? null
          : createBlankTileset(createId('tileset'), layerName, tileWidth, tileHeight, createId('tile'))
        if (!tileset || tileset.tileWidth !== tileWidth || tileset.tileHeight !== tileHeight) throw new Error(tr('workspace.tilemap.tilesetUnavailable'))
        if (!requestedTilesetId) document.tilesets = [...(document.tilesets ?? []), tileset]

        const placement = selectedRowInsertionTarget(session)
        const layer = createSparseLayer(layerName, document.colorMode)
        layer.kind = 'tilemap'
        layer.tilemapTilesetId = tileset.id
        if (!requestedTilesetId) tileset.name = layer.name
        const targetGroupId = insertionTargetParent(document, placement)
        if (targetGroupId) layer.groupId = targetGroupId
        document.layers.push(layer)
        const timeline = ensureAnimationDocument(document)
        for (const frame of timeline.frames) {
          const tilemap = createTilemapCelData(document.width, document.height, tileWidth, tileHeight)
          const cel = timeline.cels.find((candidate) => candidate.layerId === layer.id && candidate.frameId === frame.id)
          if (!cel) continue
          delete cel.linkedCelId
          delete cel.text
          cel.tilemap = tilemap
          cel.surface = renderTilemapSurface(
            tilemap,
            document.tilesets ?? [],
            document.colorMode,
            0,
            0,
            document.colorMode === 'indexed' ? (color) => paletteColorIdForCanvas(document, color) : undefined
          )
          cel.opacity = layer.opacity
        }
        refreshActiveAnimationFrame(document)
        activateNewLayerContext(session, layer.id, timeline.activeFrameId)
        session.selectedTilesetId = tileset.id
        session.selectedTileId = tileset.tileIds[0] ?? null
        session.secondaryTileId = tileset.tileIds[0] ?? null
        session.tilemapMode = 'hybrid'
        moveLayerPanelRowsOperation(session, [layer.id], [], placement)
        const after = captureDocumentStructureSnapshot(document)
        const afterSelection = captureLayerUi(session)
        const afterTileSelection = { tilesetId: session.selectedTilesetId, tileId: session.selectedTileId, secondaryTileId: session.secondaryTileId, mode: session.tilemapMode }
        const restore = (
          snapshot: DocumentStructureSnapshot,
          selection: ReturnType<typeof captureLayerUi>,
          tileSelection: { tilesetId: string | null; tileId: string | null; secondaryTileId: string | null; mode: TilemapDrawingMode }
        ): void => {
          restoreDocumentStructureSnapshot(document, snapshot)
          session.selectedLayerIds = [...selection.selectedLayerIds]
          session.selectedGroupId = selection.selectedGroupId
          session.selectedGroupIds = [...selection.selectedGroupIds]
          session.collapsedGroupIds = [...selection.collapsedGroupIds]
          session.selectedTilesetId = tileSelection.tilesetId
          session.selectedTileId = tileSelection.tileId
          session.secondaryTileId = tileSelection.secondaryTileId
          session.tilemapMode = tileSelection.mode
        }
        session.history.push({
          label: tr('workspace.history.newTilemapLayer'),
          bytes: documentStructureDeltaBytes(before, after),
          undo: () => restore(before, beforeSelection, beforeTileSelection),
          redo: () => restore(after, afterSelection, afterTileSelection),
          invalidation: { kind: 'full' },
          requiresAnimationSync: false
        })
        created = true
      }, true, true)
      if (created) requestTilesetPanelVisibility(true)
    } catch (error) {
      set({ message: error instanceof Error ? error.message : tr('workspace.canvasCreateError') })
    }
  },

  async createFreeTileLayer(options) {
    get().commitFloatingPaste()
    const current = activeSession(get())
    if (!current) return
    const documentId = current.document.id
    try {
      let created = false
      const layerName = options.name.trim() || tr('workspace.freeTile.layerName')
      const resource = await window.moonSprite.getResourceInfo()
      const check = checkResourceLimit(current.document.width, current.document.height, current.document.layers.length + 1, current.document.colorMode, resource)
      if (!check.allowed) throw new Error(check.reason)
      get().mutateActive((session) => {
        if (session.document.id !== documentId) return
        const document = session.document
        syncActiveAnimationFrame(document)
        const before = captureDocumentStructureSnapshot(document)
        const beforeSelection = captureLayerUi(session)
        const beforeTileSelection = { tilesetId: session.selectedTilesetId, tileId: session.selectedTileId, secondaryTileId: session.secondaryTileId, mode: session.freeTileMode }
        ensureFreeTileTilesetOwnership(document)
        const existingSetLayer = options.freeTileSetId
          ? document.layers.find((candidate) => candidate.kind === 'free-tile' && freeTileSetIdForLayer(candidate) === options.freeTileSetId) ?? null
          : null
        let freeTileSetId = existingSetLayer?.freeTileSetId ?? null
        let freeTileSources = existingSetLayer?.freeTileSources ?? null
        if (!freeTileSetId || !freeTileSources?.length) {
          freeTileSetId = createId('free-tile-set')
          const sourceId = createId('free-tile-source')
          const sourceName = tr('workspace.freeTile.sourceName', { index: 1 })
          const tileset = createBlankTileset(createId('tileset'), sourceName, 1, 1, createId('tile'), 1)
          document.tilesets = [...(document.tilesets ?? []), tileset]
          freeTileSources = [{ id: sourceId, name: sourceName, tilesetId: tileset.id, displayColor: defaultFreeTileSourceDisplayColor(0), visible: true, locked: false, opacity: 1, blendMode: 'normal', offsetX: 0, offsetY: 0 }]
        }

        const placement = selectedRowInsertionTarget(session)
        const layer = createSparseLayer(layerName, document.colorMode)
        layer.kind = 'free-tile'
        layer.freeTileSetId = freeTileSetId
        layer.freeTileSources = freeTileSources
        const targetGroupId = insertionTargetParent(document, placement)
        if (targetGroupId) layer.groupId = targetGroupId
        document.layers.push(layer)
        const sources = freeTileSourcesForLayer(document, layer)
        const timeline = ensureAnimationDocument(document)
        for (const frame of timeline.frames) {
          const freeTiles = createFreeTileCelData()
          const cel = timeline.cels.find((candidate) => candidate.layerId === layer.id && candidate.frameId === frame.id)
          if (!cel) continue
          delete cel.linkedCelId
          delete cel.text
          delete cel.tilemap
          cel.freeTiles = freeTiles
          cel.surface = renderFreeTileSurface(
            freeTiles,
            sources,
            document.colorMode,
            document.width,
            document.height,
            0,
            0,
            document.colorMode === 'indexed' ? (color) => paletteColorIdForCanvas(document, color) : undefined
          )
          cel.opacity = layer.opacity
        }
        refreshActiveAnimationFrame(document)
        activateNewLayerContext(session, layer.id, timeline.activeFrameId)
        const selectedSource = sources[0] ?? null
        session.selectedTilesetId = selectedSource?.tileset.id ?? null
        session.selectedTileId = selectedSource?.tileset.tileIds[0] ?? null
        session.secondaryTileId = selectedSource?.tileset.tileIds[0] ?? null
        session.freeTileMode = 'edit'
        moveLayerPanelRowsOperation(session, [layer.id], [], placement)
        const after = captureDocumentStructureSnapshot(document)
        const afterSelection = captureLayerUi(session)
        const afterTileSelection = { tilesetId: session.selectedTilesetId, tileId: session.selectedTileId, secondaryTileId: session.secondaryTileId, mode: session.freeTileMode }
        const restore = (
          snapshot: DocumentStructureSnapshot,
          selection: ReturnType<typeof captureLayerUi>,
          tileSelection: { tilesetId: string | null; tileId: string | null; secondaryTileId: string | null; mode: FreeTileDrawingMode }
        ): void => {
          restoreDocumentStructureSnapshot(document, snapshot)
          session.selectedLayerIds = [...selection.selectedLayerIds]
          session.selectedGroupId = selection.selectedGroupId
          session.selectedGroupIds = [...selection.selectedGroupIds]
          session.collapsedGroupIds = [...selection.collapsedGroupIds]
          session.selectedTilesetId = tileSelection.tilesetId
          session.selectedTileId = tileSelection.tileId
          session.secondaryTileId = tileSelection.secondaryTileId
          session.freeTileMode = tileSelection.mode
        }
        session.history.push({
          label: tr('workspace.history.newFreeTileLayer'),
          bytes: documentStructureDeltaBytes(before, after),
          undo: () => restore(before, beforeSelection, beforeTileSelection),
          redo: () => restore(after, afterSelection, afterTileSelection),
          invalidation: { kind: 'full' },
          requiresAnimationSync: false
        })
        created = true
      }, true, true)
      if (created) requestTilesetPanelVisibility(true)
    } catch (error) {
      set({ message: error instanceof Error ? error.message : tr('workspace.canvasCreateError') })
    }
  },

  async convertLayerToTilemap(layerId, options) {
    get().commitFloatingPaste()
    const current = activeSession(get())
    if (!current) return
    const sourceLayer = current.document.layers.find((candidate) => candidate.id === layerId)
    if (!sourceLayer || sourceLayer.kind || hasConfiguredLayerStyles(sourceLayer.layerStyles)) return
    const documentId = current.document.id
    try {
      const tileWidth = Math.max(1, Math.trunc(options.tileWidth))
      const tileHeight = Math.max(1, Math.trunc(options.tileHeight))
      const layerName = options.name.trim() || sourceLayer.name
      createTilemapCelData(current.document.width, current.document.height, tileWidth, tileHeight)
      let converted = false
      get().mutateActive((session) => {
        if (session.document.id !== documentId) return
        const document = session.document
        const layer = document.layers.find((candidate) => candidate.id === layerId)
        if (!layer || layer.kind || hasConfiguredLayerStyles(layer.layerStyles)) return
        syncActiveAnimationFrame(document)
        const before = captureLayerContentSnapshot(document, layerId)
        detachLinkedLayerContent(document, layerId)
        const beforeTileSelection = { tilesetId: session.selectedTilesetId, tileId: session.selectedTileId, secondaryTileId: session.secondaryTileId, mode: session.tilemapMode }
        const timeline = ensureAnimationDocument(document)
        const frameCels = timeline.frames.flatMap((frame) => {
          const cel = timeline.cels.find((candidate) => candidate.layerId === layerId && candidate.frameId === frame.id)
          if (!cel) return []
          return [{ cel, surface: (resolveAnimationCel(timeline, cel) ?? cel).surface }]
        })
        let tileset = createBlankTileset(createId('tileset'), layerName, tileWidth, tileHeight, createId('tile'))
        const convertedCels = frameCels.map(({ cel, surface }) => {
          const sliced = sliceRasterSurfaceToTilemap(surface, document.palette, document.width, document.height, tileset, () => createId('tile'))
          tileset = sliced.tileset
          return { cel, tilemap: sliced.tilemap }
        })
        document.tilesets = [...(document.tilesets ?? []), tileset]
        for (const { cel, tilemap } of convertedCels) {
          delete cel.linkedCelId
          delete cel.text
          cel.tilemap = tilemap
          cel.surface = renderTilemapSurface(
            tilemap,
            document.tilesets,
            document.colorMode,
            0,
            0,
            document.colorMode === 'indexed' ? (color) => paletteColorIdForCanvas(document, color) : undefined
          )
        }
        layer.name = layerName
        layer.kind = 'tilemap'
        layer.tilemapTilesetId = tileset.id
        delete layer.linkedContentId
        delete layer.background
        delete layer.layerStyles
        refreshActiveAnimationFrame(document)
        document.activeLayerId = layer.id
        session.selectedGroupId = null
        session.selectedGroupIds = []
        session.selectedLayerIds = [layer.id]
        session.layerSelectionAnchorId = layer.id
        session.selectedTilesetId = tileset.id
        session.selectedTileId = tileset.tileIds[0] ?? null
        session.secondaryTileId = tileset.tileIds[0] ?? null
        session.tilemapMode = 'hybrid'
        session.selectedAnimationCellKeys = [animationCelKey(layer.id, timeline.activeFrameId)]
        session.animationCellSelectionExplicit = false
        const after = captureLayerContentSnapshot(document, layerId)
        const afterTileSelection = { tilesetId: session.selectedTilesetId, tileId: session.selectedTileId, secondaryTileId: session.secondaryTileId, mode: session.tilemapMode }
        const restore = (
          snapshot: ReturnType<typeof captureLayerContentSnapshot>,
          tileSelection: { tilesetId: string | null; tileId: string | null; secondaryTileId: string | null; mode: TilemapDrawingMode }
        ): void => {
          restoreLayerContentSnapshot(document, snapshot)
          session.selectedTilesetId = tileSelection.tilesetId
          session.selectedTileId = tileSelection.tileId
          session.secondaryTileId = tileSelection.secondaryTileId
          session.tilemapMode = tileSelection.mode
        }
        session.history.push({
          label: tr('workspace.history.convertToTilemapLayer'),
          bytes: layerContentSnapshotBytes(before) + layerContentSnapshotBytes(after),
          undo: () => restore(before, beforeTileSelection),
          redo: () => restore(after, afterTileSelection),
          invalidation: { kind: 'full' },
          affectedLayerIds: [layerId],
          requiresAnimationSync: false
        })
        converted = true
      }, true, true)
      if (converted) requestTilesetPanelVisibility(true)
    } catch (error) {
      set({ message: error instanceof Error ? error.message : tr('workspace.canvasCreateError') })
    }
  },

  async createBackgroundLayer(pattern) {
    get().commitFloatingPaste()
    const current = activeSession(get())
    if (!current) return
    const documentId = current.document.id
    try {
      const resource = await window.moonSprite.getResourceInfo()
      const check = checkResourceLimit(current.document.width, current.document.height, current.document.layers.length + 1, current.document.colorMode, resource)
      if (!check.allowed) throw new Error(check.reason)
      get().mutateActive((session) => {
        if (session.document.id !== documentId) return
        const document = session.document
        const before = captureDocumentStructureSnapshot(document)
        const beforeSelection = captureLayerUi(session)
        const layer = createLayer(tr('workspace.layer.backgroundName'), document.width, document.height, document.colorMode)
        const presetPattern = typeof pattern === 'string' ? pattern : pattern.pattern
        layer.background = presetPattern ? { mode: 'preset', pattern: presetPattern } : { mode: 'canvas' }
        if (layer.format === 'rgba') layer.pixels = typeof pattern === 'string'
          ? renderBackgroundPatternRgba(document.width, document.height, pattern)
          : renderBackgroundTileRgba(document.width, document.height, pattern)
        else layer.pixels = typeof pattern === 'string'
          ? renderBackgroundPatternIndexed(document.width, document.height, pattern, (color) => findOrAddPaletteColor(document, color, true))
          : renderBackgroundTileIndexed(document.width, document.height, pattern, (color) => findOrAddPaletteColor(document, color, true))
        document.layers.unshift(layer)
        const timeline = ensureAnimationDocument(document)
        connectAnimationCels(document, timeline.cels.filter((cel) => cel.layerId === layer.id).map((cel) => cel.id))
        refreshActiveAnimationFrame(document)
        // Keep the timeline's active row in sync with the newly-created layer.
        // The canvas sampler uses document.activeLayerId while the timeline UI
        // uses timelineActiveContext; updating only one left the old layer
        // visually active even though magic-wand sampled the background.
        activateNewLayerContext(session, layer.id, timeline.activeFrameId)
        session.selectedLayerIds = [layer.id]
        const after = captureDocumentStructureSnapshot(document)
        const afterSelection = captureLayerUi(session)
        const restore = (snapshot: DocumentStructureSnapshot, selection: ReturnType<typeof captureLayerUi>): void => {
          restoreDocumentStructureSnapshot(document, snapshot)
          session.selectedLayerIds = [...selection.selectedLayerIds]
          session.selectedGroupId = selection.selectedGroupId
          session.selectedGroupIds = [...selection.selectedGroupIds]
          session.collapsedGroupIds = [...selection.collapsedGroupIds]
        }
        session.history.push({ label: tr('workspace.history.newBackgroundLayer'), bytes: documentStructureDeltaBytes(before, after), undo: () => restore(before, beforeSelection), redo: () => restore(after, afterSelection), invalidation: { kind: 'full' }, requiresAnimationSync: false })
      }, true, true)
    } catch (error) {
      set({ message: error instanceof Error ? error.message : tr('workspace.canvasCreateError') })
    }
  },

  setLayerBackground(layerId, enabled) {
    get().commitFloatingPaste()
    get().mutateActive((session) => {
      const document = session.document
      const layer = document.layers.find((candidate) => candidate.id === layerId)
      if (!layer || layer.kind || Boolean(layer.background) === enabled) return
      const before = layer.background ? { ...layer.background } : undefined
      const beforeLinkedContentId = layer.linkedContentId
      const after = enabled ? { mode: 'canvas' as const } : undefined
      const preservedSelection = {
        activeLayerId: document.activeLayerId,
        selectedLayerIds: [...session.selectedLayerIds],
        selectedGroupId: session.selectedGroupId,
        selectedGroupIds: [...session.selectedGroupIds]
      }
      const moveHistory = enabled ? moveLayersToRootEdgeOperation(session, [layer.id], 'bottom') : null
      document.activeLayerId = preservedSelection.activeLayerId
      session.selectedLayerIds = preservedSelection.selectedLayerIds
      session.selectedGroupId = preservedSelection.selectedGroupId
      session.selectedGroupIds = preservedSelection.selectedGroupIds
      const apply = (value: typeof before, linkedContentId?: string): void => {
        if (value) {
          detachLinkedLayerContent(document, layer.id)
          layer.background = { ...value }
          return
        }
        delete layer.background
        if (!linkedContentId) {
          delete layer.linkedContentId
          return
        }
        layer.linkedContentId = linkedContentId
        const authority = linkedLayerMembers(document, linkedContentId).find((candidate) => candidate.id !== layer.id) ?? layer
        synchronizeLinkedLayerGroupContents(document, linkedContentId, authority.id)
      }
      const applyMovePreservingActiveLayer = (operation: (() => void) | undefined): void => {
        if (!operation) return
        const activeLayerId = document.activeLayerId
        operation()
        document.activeLayerId = activeLayerId
      }
      apply(after)
      session.history.push({
        label: tr(enabled ? 'workspace.history.convertToBackgroundLayer' : 'workspace.history.convertToRasterLayer'),
        bytes: 24 + (moveHistory?.bytes ?? 0),
        undo: () => {
          apply(before, beforeLinkedContentId)
          applyMovePreservingActiveLayer(moveHistory?.undo)
        },
        redo: () => {
          apply(after)
          applyMovePreservingActiveLayer(moveHistory?.redo)
        },
        affectedLayerIds: [layer.id],
        requiresAnimationSync: false,
        invalidation: { kind: 'full' }
      })
    })
  },

  setLayerAutoLinkAnimationCels(layerId, enabled) {
    const current = activeSession(get())
    if (!current) return
    const layer = current.document.layers.find((candidate) => candidate.id === layerId)
    const next = Boolean(enabled)
    if (!layer || Boolean(layer.autoLinkAnimationCels) === next) return
    get().mutateActive((session) => {
      const target = session.document.layers.find((candidate) => candidate.id === layerId)
      if (!target) return
      const before = target.autoLinkAnimationCels === true
      const apply = (value: boolean): void => {
        if (value) target.autoLinkAnimationCels = true
        else delete target.autoLinkAnimationCels
      }
      apply(next)
      session.history.push({
        label: tr('workspace.history.layerProperties'),
        bytes: 8,
        undo: () => apply(before),
        redo: () => apply(next),
        contentChanged: false,
        requiresAnimationSync: false
      })
    }, 'metadata')
  },

  createTextLayer(raw, x, y) {
    get().commitFloatingPaste()
    get().mutateActive((session) => {
      const document = session.document
      const before = captureDocumentStructureSnapshot(document)
      const beforeSelection = captureLayerUi(session)
      const data = normalizeTextCelData({ ...raw, originX: Math.trunc(x), originY: Math.trunc(y), transforms: raw.transforms ?? [] }, session.primaryColor)
      const rendered = rasterizeText(data, x, y)
      const surface = convertTextSurface(rendered.rgba, document.colorMode, document.palette, (color) => paletteColorIdForCanvas(document, color))
      const layer = createSparseLayer(data.text.split('\n')[0].trim().slice(0, 32) || tr('workspace.layer.textName'), document.colorMode)
      layer.kind = 'text'
      layer.width = surface.width
      layer.height = surface.height
      layer.offsetX = surface.offsetX
      layer.offsetY = surface.offsetY
      layer.pixels = surface.pixels
      const placement = selectedRowInsertionTarget(session)
      const targetGroupId = insertionTargetParent(document, placement)
      if (targetGroupId) layer.groupId = targetGroupId
      document.layers.push(layer)
      const timeline = ensureAnimationDocument(document)
      const cel = timeline.cels.find((candidate) => candidate.layerId === layer.id && candidate.frameId === timeline.activeFrameId)
      if (cel) {
        cel.text = cloneTextCelData(rendered.data)
        cel.surface = surface
        cel.opacity = layer.opacity
      }
      document.activeLayerId = layer.id
      session.selectedGroupId = null
      session.selectedGroupIds = []
      session.selectedLayerIds = [layer.id]
      session.selectedAnimationCellKeys = [animationCelKey(layer.id, timeline.activeFrameId)]
      session.animationCellSelectionExplicit = false
      syncActiveAnimationLayer(document, layer.id)
      moveLayerPanelRowsOperation(session, [layer.id], [], placement)
      const after = captureDocumentStructureSnapshot(document)
      const afterSelection = captureLayerUi(session)
      const restore = (snapshot: DocumentStructureSnapshot, selection: ReturnType<typeof captureLayerUi>): void => {
        restoreDocumentStructureSnapshot(document, snapshot)
        session.selectedLayerIds = [...selection.selectedLayerIds]
        session.selectedGroupId = selection.selectedGroupId
        session.selectedGroupIds = [...selection.selectedGroupIds]
        session.collapsedGroupIds = [...selection.collapsedGroupIds]
      }
      session.history.push({ label: tr('workspace.history.createText'), bytes: documentStructureDeltaBytes(before, after), undo: () => restore(before, beforeSelection), redo: () => restore(after, afterSelection), invalidation: { kind: 'full' }, requiresAnimationSync: false })
    }, true, true)
  },

  beginTextLayerDraft(raw, x, y) {
    get().commitFloatingPaste()
    let target: TextLayerDraftTarget | null = null
    get().mutateActive((session) => {
      const document = session.document
      const before = captureDocumentStructureSnapshot(document)
      const beforeSelection = captureLayerUi(session)
      const draftState: TextLayerDraftState = {
        documentId: document.id,
        before,
        beforeSelection,
        selectedAnimationCellKeys: [...session.selectedAnimationCellKeys],
        animationCellSelectionAnchorKey: session.animationCellSelectionAnchorKey,
        animationCellSelectionExplicit: session.animationCellSelectionExplicit,
        selectedAnimationFrameIds: [...session.selectedAnimationFrameIds],
        animationFrameSelectionAnchorId: session.animationFrameSelectionAnchorId,
        dirty: document.dirty,
        updatedAt: document.updatedAt
      }
      const data = normalizeTextCelData({ ...raw, originX: Math.trunc(x), originY: Math.trunc(y), transforms: raw.transforms ?? [] }, session.primaryColor)
      if (!data.text.length) return
      const rendered = rasterizeText(data, x, y)
      const surface = convertTextSurface(rendered.rgba, document.colorMode, document.palette, (color) => paletteColorIdForCanvas(document, color))
      const layer = createSparseLayer(data.text.split('\n')[0].trim().slice(0, 32) || tr('workspace.layer.textName'), document.colorMode)
      layer.kind = 'text'
      layer.width = surface.width
      layer.height = surface.height
      layer.offsetX = surface.offsetX
      layer.offsetY = surface.offsetY
      layer.pixels = surface.pixels
      const placement = selectedRowInsertionTarget(session)
      const targetGroupId = insertionTargetParent(document, placement)
      if (targetGroupId) layer.groupId = targetGroupId
      document.layers.push(layer)
      const timeline = ensureAnimationDocument(document)
      const cel = timeline.cels.find((candidate) => candidate.layerId === layer.id && candidate.frameId === timeline.activeFrameId)
      if (!cel) return
      cel.text = cloneTextCelData(rendered.data)
      cel.surface = surface
      cel.opacity = layer.opacity
      document.activeLayerId = layer.id
      session.selectedGroupId = null
      session.selectedGroupIds = []
      session.selectedLayerIds = [layer.id]
      session.selectedAnimationCellKeys = [animationCelKey(layer.id, timeline.activeFrameId)]
      session.animationCellSelectionAnchorKey = animationCelKey(layer.id, timeline.activeFrameId)
      session.animationCellSelectionExplicit = false
      syncActiveAnimationLayer(document, layer.id)
      moveLayerPanelRowsOperation(session, [layer.id], [], placement)
      textLayerDrafts.set(layer.id, draftState)
      target = { layerId: layer.id, frameId: timeline.activeFrameId }
      invalidateTextLayerDraft(session, true)
    }, false, true)
    return target
  },

  updateTextLayerDraft(layerId, frameId, raw, x, y) {
    const draft = textLayerDrafts.get(layerId)
    if (!draft) return
    get().mutateActive((session) => {
      if (session.document.id !== draft.documentId) return
      const document = session.document
      const layer = document.layers.find((candidate) => candidate.id === layerId && candidate.kind === 'text')
      const timeline = ensureAnimationDocument(document)
      const cel = timeline.cels.find((candidate) => candidate.layerId === layerId && candidate.frameId === frameId)
      const source = resolveAnimationCel(timeline, cel ?? null) ?? cel
      if (!layer || !cel || !source) return
      const normalized = normalizeTextCelData(raw, session.primaryColor)
      const offsetX = Math.trunc(x ?? source.surface?.offsetX ?? normalized.originX ?? layer.offsetX)
      const offsetY = Math.trunc(y ?? source.surface?.offsetY ?? normalized.originY ?? layer.offsetY)
      const rendered = renderTextAtCurrentSurface(document, { ...normalized, originX: normalized.originX ?? offsetX, originY: normalized.originY ?? offsetY }, offsetX, offsetY)
      const surface = convertTextSurface(rendered.rgba, document.colorMode, document.palette, (color) => paletteColorIdForCanvas(document, color))
      applyTextSurface(document, layer, source, cel, rendered.data, surface)
      layer.name = normalized.text.split('\n')[0].trim().slice(0, 32) || tr('workspace.layer.textName')
      if (timeline.activeFrameId === frameId) refreshActiveAnimationFrame(document)
      invalidateTextLayerDraft(session, true)
    }, false)
  },

  commitTextLayerDraft(layerId) {
    const draft = textLayerDrafts.get(layerId)
    if (!draft) return
    get().mutateActive((session) => {
      if (session.document.id !== draft.documentId || !session.document.layers.some((layer) => layer.id === layerId)) return
      const after = captureDocumentStructureSnapshot(session.document)
      const afterSelection = captureLayerUi(session)
      const restore = (snapshot: DocumentStructureSnapshot, selection: ReturnType<typeof captureLayerUi>): void => {
        restoreDocumentStructureSnapshot(session.document, snapshot)
        session.selectedLayerIds = [...selection.selectedLayerIds]
        session.selectedGroupId = selection.selectedGroupId
        session.selectedGroupIds = [...selection.selectedGroupIds]
        session.collapsedGroupIds = [...selection.collapsedGroupIds]
      }
      session.history.push({ label: tr('workspace.history.createText'), bytes: documentStructureDeltaBytes(draft.before, after), undo: () => restore(draft.before, draft.beforeSelection), redo: () => restore(after, afterSelection), invalidation: { kind: 'full' }, requiresAnimationSync: false })
      textLayerDrafts.delete(layerId)
    }, true, true)
  },

  cancelTextLayerDraft(layerId) {
    const draft = textLayerDrafts.get(layerId)
    if (!draft) return
    get().mutateActive((session) => {
      if (session.document.id !== draft.documentId) return
      restoreDocumentStructureSnapshot(session.document, draft.before)
      session.document.dirty = draft.dirty
      session.document.updatedAt = draft.updatedAt
      session.selectedLayerIds = [...draft.beforeSelection.selectedLayerIds]
      session.selectedGroupId = draft.beforeSelection.selectedGroupId
      session.selectedGroupIds = [...draft.beforeSelection.selectedGroupIds]
      session.collapsedGroupIds = [...draft.beforeSelection.collapsedGroupIds]
      session.selectedAnimationCellKeys = [...draft.selectedAnimationCellKeys]
      session.animationCellSelectionAnchorKey = draft.animationCellSelectionAnchorKey
      session.animationCellSelectionExplicit = draft.animationCellSelectionExplicit
      session.selectedAnimationFrameIds = [...draft.selectedAnimationFrameIds]
      session.animationFrameSelectionAnchorId = draft.animationFrameSelectionAnchorId
      textLayerDrafts.delete(layerId)
      invalidateTextLayerDraft(session, true)
    }, false, true)
  },

  setTextCel(layerId, frameId, raw, x, y) {
    get().mutateActive((session) => {
      const document = session.document
      const layer = document.layers.find((candidate) => candidate.id === layerId && candidate.kind === 'text')
      const timeline = ensureAnimationDocument(document)
      const cel = timeline.cels.find((candidate) => candidate.layerId === layerId && candidate.frameId === frameId)
      if (!layer || !cel) return
      const before = captureLayerContentSnapshot(document, layerId)
      const source = resolveAnimationCel(timeline, cel) ?? cel
      const normalized = normalizeTextCelData(raw, session.primaryColor)
      const offsetX = Math.trunc(x ?? source.surface?.offsetX ?? normalized.originX ?? layer.offsetX)
      const offsetY = Math.trunc(y ?? source.surface?.offsetY ?? normalized.originY ?? layer.offsetY)
      const rendered = renderTextAtCurrentSurface(document, { ...normalized, originX: normalized.originX ?? offsetX, originY: normalized.originY ?? offsetY }, offsetX, offsetY)
      const surface = convertTextSurface(rendered.rgba, document.colorMode, document.palette, (color) => paletteColorIdForCanvas(document, color))
      applyTextSurface(document, layer, source, cel, rendered.data, surface)
      if (timeline.activeFrameId === frameId) refreshActiveAnimationFrame(document)
      const after = captureLayerContentSnapshot(document, layerId)
      session.history.push({ label: tr('workspace.history.editText'), bytes: layerContentSnapshotBytes(before) + layerContentSnapshotBytes(after), undo: () => restoreLayerContentSnapshot(document, before), redo: () => restoreLayerContentSnapshot(document, after), invalidation: { kind: 'full' }, affectedLayerIds: [layerId], requiresAnimationSync: false })
    })
  },

  previewTextCel(layerId, frameId, raw, x, y) {
    const current = activeSession(get())
    if (!current) return null
    const layer = current.document.layers.find((candidate) => candidate.id === layerId && candidate.kind === 'text')
    const timeline = ensureAnimationDocument(current.document)
    const cel = timeline.cels.find((candidate) => candidate.layerId === layerId && candidate.frameId === frameId)
    const source = resolveAnimationCel(timeline, cel ?? null) ?? cel
    if (!layer || !cel || !source?.surface) return null
    const before: TextCelPreview = {
      surface: cloneAnimationCelSurface(source.surface),
      text: source.text ? cloneTextCelData(source.text) : undefined,
      palette: current.document.palette.map((entry) => ({ ...entry, color: { ...entry.color } })),
      paletteOrder: [...current.document.paletteOrder],
      paletteSlots: current.document.paletteSlots ? [...current.document.paletteSlots] : undefined,
      nextColorId: current.document.nextColorId
    }
    get().mutateActive((session) => {
      const document = session.document
      const activeLayer = document.layers.find((candidate) => candidate.id === layerId && candidate.kind === 'text')
      const activeTimeline = ensureAnimationDocument(document)
      const activeCel = activeTimeline.cels.find((candidate) => candidate.layerId === layerId && candidate.frameId === frameId)
      const activeSource = resolveAnimationCel(activeTimeline, activeCel ?? null) ?? activeCel
      if (!activeLayer || !activeCel || !activeSource) return
      const normalized = normalizeTextCelData(raw, session.primaryColor)
      const offsetX = Math.trunc(x ?? activeSource.surface?.offsetX ?? normalized.originX ?? activeLayer.offsetX)
      const offsetY = Math.trunc(y ?? activeSource.surface?.offsetY ?? normalized.originY ?? activeLayer.offsetY)
      const rendered = renderTextAtCurrentSurface(document, { ...normalized, originX: normalized.originX ?? offsetX, originY: normalized.originY ?? offsetY }, offsetX, offsetY)
      const surface = convertTextSurface(rendered.rgba, document.colorMode, document.palette, (color) => paletteColorIdForCanvas(document, color))
      activeSource.text = cloneTextCelData(rendered.data)
      activeSource.surface = surface
      if (activeCel !== activeSource) {
        activeCel.text = activeSource.text
        activeCel.surface = surface
      }
      if (activeTimeline.activeFrameId === frameId) refreshActiveAnimationFrame(document)
      const fromRevision = session.contentRevision
      session.revision += 1
      session.contentRevision += 1
      session.contentInvalidation = { kind: 'full', fromRevision, revision: session.contentRevision }
    }, false)
    return before
  },

  restoreTextCelPreview(layerId, frameId, preview) {
    get().mutateActive((session) => {
      const timeline = ensureAnimationDocument(session.document)
      const cel = timeline.cels.find((candidate) => candidate.layerId === layerId && candidate.frameId === frameId)
      const source = resolveAnimationCel(timeline, cel ?? null) ?? cel
      if (!cel || !source) return
      source.text = preview.text ? cloneTextCelData(preview.text) : undefined
      source.surface = cloneAnimationCelSurface(preview.surface)
      if (cel !== source) {
        cel.text = source.text
        cel.surface = source.surface
      }
      session.document.palette = preview.palette.map((entry) => ({ ...entry, color: { ...entry.color } }))
      session.document.paletteOrder = [...preview.paletteOrder]
      session.document.paletteSlots = preview.paletteSlots ? [...preview.paletteSlots] : undefined
      session.document.nextColorId = preview.nextColorId
      if (timeline.activeFrameId === frameId) refreshActiveAnimationFrame(session.document)
      const fromRevision = session.contentRevision
      session.revision += 1
      session.contentRevision += 1
      session.contentInvalidation = { kind: 'full', fromRevision, revision: session.contentRevision }
    }, false)
  },

  rasterizeLayer(layerId) {
    let shouldHideTilesetPanel = false
    get().mutateActive((session) => {
      const document = session.document
      const layer = document.layers.find((candidate) => candidate.id === layerId)
      if (!layer || (!layer.background && !layer.kind && !hasConfiguredLayerStyles(layer.layerStyles))) return
      const wasFreeTileLayer = layer.kind === 'free-tile'
      syncActiveAnimationFrame(document)
      const rasterizesStyles = hasEnabledLayerStyles(layer.layerStyles)
      const beforeSelection = captureAnimationSelectionHistory(session)
      const before = captureLayerContentSnapshot(document, layerId, { includeLayerMasks: rasterizesStyles })
      detachLinkedLayerContent(document, layerId)
      const timeline = ensureAnimationDocument(document)
      const rasterizedTilesets = removableOwnedTilesets(document, new Set([layerId]))
      if (rasterizesStyles) {
        const rasterizedByFrameId = new Map<string, AnimationCelSurface>()
        for (const frame of timeline.frames) {
          const preview = cloneDocumentForAnimationFrame(document, frame.id)
          const previewLayer = preview.layers.find((candidate) => candidate.id === layerId)
          const cel = timeline.cels.find((candidate) => candidate.layerId === layerId && candidate.frameId === frame.id)
          if (!previewLayer || !cel) continue
          preview.layers = [previewLayer]
          preview.groups = []
          preview.activeLayerId = previewLayer.id
          previewLayer.visible = true
          previewLayer.opacity = 1
          previewLayer.blendMode = 'normal'
          previewLayer.groupId = null
          delete previewLayer.clippingMask
          const sourceBounds = layerContentBounds(preview, previewLayer) ?? { x: previewLayer.offsetX, y: previewLayer.offsetY, width: 1, height: 1 }
          const styledBounds = layerStyleOutputBounds(sourceBounds, previewLayer.layerStyles) ?? sourceBounds
          const x = Math.floor(styledBounds.x)
          const y = Math.floor(styledBounds.y)
          const right = Math.ceil(styledBounds.x + styledBounds.width)
          const bottom = Math.ceil(styledBounds.y + styledBounds.height)
          const width = Math.max(1, right - x)
          const height = Math.max(1, bottom - y)
          const rgba = compositeRegion(preview, x, y, width, height)
          const surface: AnimationCelSurface = layer.format === 'rgba'
            ? { format: 'rgba', width, height, offsetX: x, offsetY: y, pixels: document.colorMode === 'grayscale' ? applyRelativeLuminance(rgba) : rgba }
            : {
                format: 'indexed', width, height, offsetX: x, offsetY: y,
                pixels: Uint32Array.from({ length: width * height }, (_, index) => {
                  const offset = index * 4
                  return paletteColorIdForCanvas(document, { r: rgba[offset], g: rgba[offset + 1], b: rgba[offset + 2], a: rgba[offset + 3] })
                })
              }
          rasterizedByFrameId.set(frame.id, surface)
        }
        for (const frame of timeline.frames) {
          const cel = timeline.cels.find((candidate) => candidate.layerId === layerId && candidate.frameId === frame.id)
          const surface = rasterizedByFrameId.get(frame.id)
          if (!cel || !surface) continue
          delete cel.linkedCelId
          cel.surface = surface
          delete cel.text
        }
        const maskWasBaked = (entry: AnimationLayerMask): boolean => entry.layerId === layerId && rasterizedByFrameId.has(entry.frameId)
        const removedMaskIds = new Set((timeline.layerMasks ?? []).filter(maskWasBaked).map((entry) => entry.mask.id))
        timeline.layerMasks = (timeline.layerMasks ?? []).filter((entry) => !maskWasBaked(entry))
        const consumesMaskContext = Boolean(session.activeLayerMaskId && removedMaskIds.has(session.activeLayerMaskId))
          || session.selectedAnimationMaskCellKeys.some((key) => parseAnimationCelKey(key)?.layerId === layerId)
          || session.selectedAnimationMaskRowKeys.includes(`layer:${layerId}`)
        if (consumesMaskContext) clearAnimationMaskContext(session)
      }
      for (const cel of timeline.cels) if (cel.layerId === layerId) {
        delete cel.text
        delete cel.tilemap
        delete cel.freeTiles
      }
      delete layer.kind
      delete layer.linkedContentId
      delete layer.tilemapTilesetId
      delete layer.freeTileTilesetId
      delete layer.freeTileSetId
      delete layer.freeTileSources
      delete layer.layerStyles
      delete layer.background
      removeTilesetSnapshots(document, rasterizedTilesets)
      refreshActiveAnimationFrame(document)
      const after = captureLayerContentSnapshot(document, layerId, { includeLayerMasks: rasterizesStyles })
      const afterSelection = captureAnimationSelectionHistory(session)
      const entry: HistoryEntry = { label: tr('workspace.history.convertToRasterLayer'), bytes: layerContentSnapshotBytes(before) + layerContentSnapshotBytes(after), undo: () => restoreLayerContentSnapshot(document, before), redo: () => restoreLayerContentSnapshot(document, after), invalidation: { kind: 'full' }, affectedLayerIds: [layerId], requiresAnimationSync: false }
      session.history.push(historyEntryWithAnimationSelection(session, entry, beforeSelection, afterSelection))
      shouldHideTilesetPanel = wasFreeTileLayer && !documentUsesTilesetPanel(document)
    }, true, true)
    if (shouldHideTilesetPanel) requestTilesetPanelVisibility(false)
  },

  createLinkedLayer(layerId) {
    let createdId: string | null = null
    get().mutateActive((session) => {
      const document = session.document
      const source = document.layers.find((candidate) => candidate.id === layerId)
      if (!isLinkableRasterLayer(source)) return
      syncActiveAnimationFrame(document)
      const previousActiveId = document.activeLayerId
      const previousSelection = [...session.selectedLayerIds]
      const previousGroupId = session.selectedGroupId
      const previousGroupIds = [...session.selectedGroupIds]
      const previousLinkedContentId = source.linkedContentId
      const linkedContentId = previousLinkedContentId ?? createId('layer-link')
      const allocateLinkedLayerName = createLinkedLayerNameAllocator(document)
      const initialNameSequence = previousLinkedContentId
        ? null
        : linkedLayerDefaultNameSequence(document, linkedContentId, tr('layers.linkedCopySuffix'), source.name)
      const copyLinkedName = initialNameSequence
        ? tr('layers.linkedDefaultName', { name: initialNameSequence.baseName, index: 1 })
        : allocateLinkedLayerName(linkedContentId, source.name)
      const previousMembers = previousLinkedContentId ? linkedLayerMembers(document, linkedContentId) : [source]
      const previousDisplayColors = previousMembers.map((layer) => ({ layer, displayColor: layer.displayColor ? { ...layer.displayColor } : undefined }))
      const displayColor = previousLinkedContentId
        ? previousMembers.find((layer) => layer.displayColor)?.displayColor ?? nextAvailableLayerDisplayColor(document)
        : nextAvailableLayerDisplayColor(document)
      source.linkedContentId = linkedContentId
      const copy = duplicateLayer(document, source.id)
      copy.name = copyLinkedName
      setLinkedLayerGroupDisplayColor(document, linkedContentId, displayColor)
      cloneAnimationCelsForLayer(document, source.id, copy)
      synchronizeLinkedLayerGroupContents(document, linkedContentId, source.id)
      const index = document.layers.indexOf(copy)
      const animationCels = ensureAnimationDocument(document).cels
        .filter((cel) => cel.layerId === copy.id)
        .map(cloneAnimationCel)
      createdId = copy.id
      document.activeLayerId = copy.id
      session.selectedLayerIds = [copy.id]
      session.selectedGroupId = null
      session.selectedGroupIds = []
      const restorePreviousSelection = (): void => {
        document.activeLayerId = previousActiveId
        session.selectedLayerIds = previousSelection
        session.selectedGroupId = previousGroupId
        session.selectedGroupIds = previousGroupIds
      }
      session.history.push({
        label: tr('workspace.history.createLinkedLayer'),
        bytes: layerHistoryBytes(copy) + animationCels.reduce((sum, cel) => sum + (cel.surface?.pixels.byteLength ?? 0), 0) + 64,
        undo: () => {
          document.layers = document.layers.filter((candidate) => candidate.id !== copy.id)
          removeAnimationCelsForLayers(document, [copy.id])
          if (previousLinkedContentId) source.linkedContentId = previousLinkedContentId
          else delete source.linkedContentId
          for (const snapshot of previousDisplayColors) {
            if (snapshot.displayColor) snapshot.layer.displayColor = { ...snapshot.displayColor }
            else delete snapshot.layer.displayColor
          }
          restorePreviousSelection()
          refreshActiveAnimationFrame(document)
        },
        redo: () => {
          source.linkedContentId = linkedContentId
          copy.linkedContentId = linkedContentId
          copy.name = copyLinkedName
          if (!document.layers.some((candidate) => candidate.id === copy.id)) document.layers.splice(Math.min(index, document.layers.length), 0, copy)
          restoreAnimationCels(document, animationCels)
          setLinkedLayerGroupDisplayColor(document, linkedContentId, displayColor)
          synchronizeLinkedLayerGroupContents(document, linkedContentId, source.id)
          document.activeLayerId = copy.id
          session.selectedLayerIds = [copy.id]
          session.selectedGroupId = null
          session.selectedGroupIds = []
        },
        invalidation: { kind: 'full' },
        affectedLayerIds: [...new Set([...previousMembers.map((layer) => layer.id), copy.id])],
        requiresAnimationSync: false
      })
    }, true, true)
    return createdId
  },

  duplicateActiveLayer() {
    get().mutateActive((session) => {
      const document = session.document
      const priorId = document.activeLayerId
      syncActiveAnimationFrame(document)
      const source = getLayer(document, priorId)
      const linkedCopyName = source.linkedContentId ? createLinkedLayerNameAllocator(document)(source.linkedContentId, source.name) : null
      const copy = duplicateLayer(document, priorId)
      if (linkedCopyName) copy.name = linkedCopyName
      cloneAnimationCelsForLayer(document, priorId, copy)
      const copiedTilesets = cloneOwnedLayerTilesets(document, [{ source, target: copy }])
      const animationCels = cloneAnimationCelsForLayerIds(document, [copy.id])
      session.selectedGroupId = null
      session.selectedGroupIds = []
      session.selectedLayerIds = [copy.id]
      const index = document.layers.findIndex((item) => item.id === copy.id)
      session.history.push({
        label: tr('workspace.history.copyLayer'), bytes: layerHistoryBytes(copy) + copiedTilesets.reduce((sum, tileset) => sum + tilemapTilesetBytes(tileset), 0),
        undo: () => { document.layers = document.layers.filter((item) => item.id !== copy.id); removeAnimationCelsForLayers(document, [copy.id]); document.tilesets = (document.tilesets ?? []).filter((tileset) => !copiedTilesets.some((copyTileset) => copyTileset.id === tileset.id)); document.activeLayerId = priorId },
        redo: () => { for (const tileset of copiedTilesets) if (!document.tilesets?.some((candidate) => candidate.id === tileset.id)) document.tilesets = [...(document.tilesets ?? []), tileset]; document.layers.splice(index, 0, copy); restoreAnimationCels(document, animationCels); document.activeLayerId = copy.id }
      })
    }, true, true)
  },

  duplicateLayers(layerIds) {
    const createdIds: string[] = []
    get().mutateActive((session) => {
      const document = session.document
      const priorActiveId = document.activeLayerId
      const priorSelection = [...session.selectedLayerIds]
      const orderedIds = [...new Set(layerIds)]
        .filter((id) => document.layers.some((layer) => layer.id === id))
        .sort((left, right) => document.layers.findIndex((layer) => layer.id === left) - document.layers.findIndex((layer) => layer.id === right))
      syncActiveAnimationFrame(document)
      const sourceLayers = orderedIds.map((id) => getLayer(document, id))
      const allocateLinkedLayerName = createLinkedLayerNameAllocator(document)
      const copies = sourceLayers.map((source) => {
        const linkedCopyName = source.linkedContentId ? allocateLinkedLayerName(source.linkedContentId, source.name) : null
        const copy = duplicateLayer(document, source.id)
        if (linkedCopyName) copy.name = linkedCopyName
        cloneAnimationCelsForLayer(document, source.id, copy)
        return copy
      })
      if (copies.length === 0) return
      const copiedTilesets = cloneOwnedLayerTilesets(document, copies.map((copy, index) => ({ source: sourceLayers[index], target: copy })))
      createdIds.push(...copies.map((copy) => copy.id))
      const placements = copies.map((copy) => ({ copy, index: document.layers.indexOf(copy) }))
      const animationCels = cloneAnimationCelsForLayerIds(document, createdIds)
      document.activeLayerId = copies.at(-1)!.id
      session.selectedGroupId = null
      session.selectedGroupIds = []
      session.selectedLayerIds = [...createdIds]
      session.history.push({
        label: tr('workspace.history.copyLayer'),
        bytes: copies.reduce((sum, copy) => sum + layerHistoryBytes(copy), 0) + copiedTilesets.reduce((sum, tileset) => sum + tilemapTilesetBytes(tileset), 0),
        undo: () => {
          const ids = new Set(createdIds)
          document.layers = document.layers.filter((layer) => !ids.has(layer.id))
          removeAnimationCelsForLayers(document, createdIds)
          document.tilesets = (document.tilesets ?? []).filter((tileset) => !copiedTilesets.some((copyTileset) => copyTileset.id === tileset.id))
          document.activeLayerId = priorActiveId
          session.selectedLayerIds = priorSelection
          session.selectedGroupId = null
          session.selectedGroupIds = []
        },
        redo: () => {
          for (const tileset of copiedTilesets) if (!document.tilesets?.some((candidate) => candidate.id === tileset.id)) document.tilesets = [...(document.tilesets ?? []), tileset]
          for (const { copy, index } of placements) if (!document.layers.some((layer) => layer.id === copy.id)) document.layers.splice(Math.min(index, document.layers.length), 0, copy)
          restoreAnimationCels(document, animationCels)
          document.activeLayerId = copies.at(-1)!.id
          session.selectedLayerIds = [...createdIds]
          session.selectedGroupId = null
          session.selectedGroupIds = []
        }
      })
    }, true, true)
    return createdIds
  },

  duplicateSelectedLayerRows() {
    const result = { layerIds: [] as string[], groupIds: [] as string[] }
    const current = activeSession(get())
    if (!current) return result
    const selectedGroups = new Set(selectedGroupRows(current))
    const rootGroupIds = [...selectedGroups].filter((groupId) => !current.document.groups.some((candidate) => selectedGroups.has(candidate.id) && getDescendantGroupIds(current.document, candidate.id).includes(groupId)))
    const copiedGroupIds = new Set<string>()
    for (const rootGroupId of rootGroupIds) {
      copiedGroupIds.add(rootGroupId)
      for (const descendantId of getDescendantGroupIds(current.document, rootGroupId)) copiedGroupIds.add(descendantId)
    }
    const directLayerIds = selectedDirectLayerRows(current).filter((layerId) => {
      const layer = current.document.layers.find((candidate) => candidate.id === layerId)
      return Boolean(layer && (!layer.groupId || !copiedGroupIds.has(layer.groupId)))
    })
    if (rootGroupIds.length === 0 && directLayerIds.length === 0) return result
    get().mutateActive((session) => {
      const document = session.document
      const placement = selectedRowInsertionTarget(session)
      const previousActiveId = document.activeLayerId
      const previousLayerIds = [...session.selectedLayerIds]
      const previousGroupId = session.selectedGroupId
      const previousGroupIds = [...session.selectedGroupIds]
      const previousCollapsedGroupIds = [...session.collapsedGroupIds]
      const groupIdMap = new Map([...copiedGroupIds].map((id) => [id, createId('group')]))
      const groups = document.groups.filter((group) => copiedGroupIds.has(group.id)).map((group): LayerGroup => ({
        ...group,
        id: groupIdMap.get(group.id)!,
        name: `${group.name} ${tr('canvas.history.copySuffix')}`,
        parentGroupId: group.parentGroupId && groupIdMap.has(group.parentGroupId) ? groupIdMap.get(group.parentGroupId)! : group.parentGroupId ?? null,
        panelOrder: typeof group.panelOrder === 'number' ? group.panelOrder + 0.01 : group.panelOrder,
        layerStyles: cloneLayerStyles(group.layerStyles),
        displayColor: group.displayColor ? { ...group.displayColor } : undefined
      }))
      const timeline = ensureAnimationDocument(document)
      const groupMasks = (timeline.groupMasks ?? [])
        .filter((entry) => copiedGroupIds.has(entry.groupId))
        .map((entry) => cloneAnimationGroupMask(entry, groupIdMap.get(entry.groupId)!, entry.frameId, createId('mask')))
      const copiedCollapsedGroupIds = [...copiedGroupIds]
        .filter((id) => previousCollapsedGroupIds.includes(id))
        .map((id) => groupIdMap.get(id)!)
      const allLayerIds = new Set(directLayerIds)
      for (const groupId of copiedGroupIds) for (const layerId of getLayerIdsInGroup(document, groupId)) allLayerIds.add(layerId)
      syncActiveAnimationFrame(document)
      const sourceLayers = document.layers.filter((layer) => allLayerIds.has(layer.id))
      const allocateLinkedLayerName = createLinkedLayerNameAllocator(document)
      const layers = sourceLayers.map((source): RasterLayer => {
        const id = createId('layer')
        const name = source.linkedContentId
          ? allocateLinkedLayerName(source.linkedContentId, source.name)
          : `${source.name} ${tr('canvas.history.copySuffix')}`
        const common = { ...source, id, name, groupId: source.groupId && groupIdMap.has(source.groupId) ? groupIdMap.get(source.groupId)! : source.groupId, layerStyles: cloneLayerStyles(source.layerStyles), background: source.background ? { ...source.background } : undefined, displayColor: source.displayColor ? { ...source.displayColor } : undefined }
        return source.format === 'rgba'
          ? { ...common, format: 'rgba', pixels: new Uint8ClampedArray(source.pixels) }
          : { ...common, format: 'indexed', pixels: new Uint32Array(source.pixels) }
      })
      const directSourceIds = new Set(directLayerIds)
      result.layerIds = layers.filter((_, index) => directSourceIds.has(sourceLayers[index].id)).map((layer) => layer.id)
      result.groupIds = rootGroupIds.map((id) => groupIdMap.get(id)!).filter(Boolean)
      const insertionIndex = Math.max(0, ...sourceLayers.map((layer) => document.layers.indexOf(layer))) + 1
      document.groups.push(...groups)
      timeline.groupMasks ??= []
      timeline.groupMasks.push(...groupMasks)
      document.layers.splice(insertionIndex, 0, ...layers)
      layers.forEach((layer, index) => cloneAnimationCelsForLayer(document, sourceLayers[index].id, layer))
      const copiedTilesets = cloneOwnedLayerTilesets(document, layers.map((layer, index) => ({ source: sourceLayers[index], target: layer })))
      const animationCels = cloneAnimationCelsForLayerIds(document, layers.map((layer) => layer.id))
      document.activeLayerId = layers.at(-1)?.id ?? previousActiveId
      session.collapsedGroupIds = [...new Set([...previousCollapsedGroupIds, ...copiedCollapsedGroupIds])]
      applyLayerRowSelection(session, layers.map((layer) => layer.id), result.groupIds, layers.length > 0 ? { kind: 'layer', id: layers.at(-1)!.id } : { kind: 'group', id: result.groupIds.at(-1)! })
      const createdLayerIds = new Set(layers.map((layer) => layer.id))
      const createdGroupIds = new Set(groups.map((group) => group.id))
      const creationHistory: HistoryEntry = {
        label: tr('workspace.history.copyLayer'),
        bytes: layers.reduce((sum, layer) => sum + layerHistoryBytes(layer), 0) + copiedTilesets.reduce((sum, tileset) => sum + tilemapTilesetBytes(tileset), 0) + groups.reduce((sum, group) => sum + groupHistoryBytes(group), 0) + groupMasks.reduce((sum, entry) => sum + entry.mask.pixels.byteLength, 0),
        undo: () => {
          document.layers = document.layers.filter((layer) => !createdLayerIds.has(layer.id))
          removeAnimationCelsForLayers(document, layers.map((layer) => layer.id))
          document.tilesets = (document.tilesets ?? []).filter((tileset) => !copiedTilesets.some((copyTileset) => copyTileset.id === tileset.id))
          document.groups = document.groups.filter((group) => !createdGroupIds.has(group.id))
          timeline.groupMasks = (timeline.groupMasks ?? []).filter((entry) => !createdGroupIds.has(entry.groupId))
          document.activeLayerId = previousActiveId
          session.selectedLayerIds = previousLayerIds
          session.selectedGroupId = previousGroupId
          session.selectedGroupIds = previousGroupIds
          session.collapsedGroupIds = previousCollapsedGroupIds
        },
        redo: () => {
          for (const group of groups) if (!document.groups.includes(group)) document.groups.push(group)
          timeline.groupMasks ??= []
          for (const entry of groupMasks) if (!timeline.groupMasks.some((candidate) => candidate.mask.id === entry.mask.id)) timeline.groupMasks.push(entry)
          for (const tileset of copiedTilesets) if (!document.tilesets?.some((candidate) => candidate.id === tileset.id)) document.tilesets = [...(document.tilesets ?? []), tileset]
          const missing = layers.filter((layer) => !document.layers.includes(layer))
          if (missing.length > 0) document.layers.splice(Math.min(insertionIndex, document.layers.length), 0, ...missing)
          restoreAnimationCels(document, animationCels)
          document.activeLayerId = layers.at(-1)?.id ?? previousActiveId
          session.collapsedGroupIds = [...new Set([...previousCollapsedGroupIds, ...copiedCollapsedGroupIds])]
          applyLayerRowSelection(session, layers.map((layer) => layer.id), result.groupIds, layers.length > 0 ? { kind: 'layer', id: layers.at(-1)!.id } : { kind: 'group', id: result.groupIds.at(-1)! })
        }
      }
      const placementHistory = moveLayerPanelRowsOperation(session, result.layerIds, result.groupIds, placement)
      session.history.push(placementHistory ? {
        label: creationHistory.label,
        bytes: creationHistory.bytes + placementHistory.bytes,
        undo: () => { placementHistory.undo(); creationHistory.undo() },
        redo: () => { creationHistory.redo(); placementHistory.redo() }
      } : creationHistory)
    }, true, true)
    return result
  },

  deleteActiveLayer() {
    if (activeSession(get())?.freeTileInstanceLayerId) return
    if ((activeSession(get())?.selectedLayerIds.length ?? 0) > 1) {
      get().deleteSelectedLayers()
      return
    }
    let shouldHideTilesetPanel = false
    get().mutateActive((session) => {
      const document = session.document
      if (document.layers.length === 1) { set({ message: tr('workspace.layer.minimum') }); return }
      const index = document.layers.findIndex((item) => item.id === document.activeLayerId)
      const removed = document.layers[index]
      if (!removed || isLayerEffectivelyLocked(document, removed)) { set({ message: tr('workspace.layer.lockedDelete') }); return }
      const removedTilesets = removableOwnedTilesets(document, new Set([removed.id]))
      const animationCels = cloneAnimationCelsForLayerIds(document, [removed.id])
      const removedLayerIds = new Set([removed.id])
      const animationLayerMasks = cloneAnimationLayerMasksForLayerIds(document, removedLayerIds)
      document.layers.splice(index, 1)
      removeAnimationCelsForLayers(document, [removed.id])
      removeAnimationLayerMasksForLayerIds(document, removedLayerIds)
      removeTilesetSnapshots(document, removedTilesets)
      const nextId = document.layers[Math.max(0, index - 1)].id
      document.activeLayerId = nextId
      session.selectedGroupId = null
      session.selectedGroupIds = []
      session.selectedLayerIds = [nextId]
      shouldHideTilesetPanel = (removed.kind === 'tilemap' || removed.kind === 'free-tile') && !documentUsesTilesetPanel(document)
      session.history.push({
        label: tr('workspace.history.deleteLayer'), bytes: layerHistoryBytes(removed) + animationLayerMasks.reduce((sum, entry) => sum + entry.mask.pixels.byteLength, 0) + removedTilesets.reduce((sum, snapshot) => sum + tilemapTilesetBytes(snapshot.tileset), 0),
        undo: () => { restoreTilesetSnapshots(document, removedTilesets); document.layers.splice(index, 0, removed); restoreAnimationCels(document, animationCels); restoreAnimationLayerMasks(document, animationLayerMasks); document.activeLayerId = removed.id },
        redo: () => { document.layers = document.layers.filter((item) => item.id !== removed.id); removeAnimationCelsForLayers(document, [removed.id]); removeAnimationLayerMasksForLayerIds(document, removedLayerIds); removeTilesetSnapshots(document, removedTilesets); document.activeLayerId = nextId }
      })
    }, true, true)
    if (shouldHideTilesetPanel) requestTilesetPanelVisibility(false)
  },

  deleteSelectedLayers() {
    const current = activeSession(get())
    if (!current) return
    if (current.freeTileInstanceLayerId) return
    const selectedGroupIdSet = new Set<string>()
    for (const groupId of selectedGroupRows(current)) {
      selectedGroupIdSet.add(groupId)
      for (const descendantId of getDescendantGroupIds(current.document, groupId)) selectedGroupIdSet.add(descendantId)
    }
    const selectedIds = new Set(selectedDirectLayerRows(current))
    for (const groupId of selectedGroupIdSet) for (const layerId of getLayerIdsInGroup(current.document, groupId)) selectedIds.add(layerId)
    const removedGroups = current.document.groups.map((group, index) => ({ group, index })).filter(({ group }) => selectedGroupIdSet.has(group.id))
    const removed = current.document.layers.map((layer, index) => ({ layer, index })).filter(({ layer }) => selectedIds.has(layer.id))
    if (removed.length === 0 && removedGroups.length === 0) return
    const locked = removed.some(({ layer }) => isLayerEffectivelyLocked(current.document, layer))
      || removedGroups.some(({ group }) => isGroupEffectivelyLocked(current.document, group))
    if (locked) { set({ message: tr('workspace.layer.structureLocked') }); return }
    if (removed.length >= current.document.layers.length) { set({ message: tr('workspace.layer.minimum') }); return }
    let shouldHideTilesetPanel = false
    get().mutateActive((session) => {
      const document = session.document
      const previousActiveId = document.activeLayerId
      const previousSelection = [...session.selectedLayerIds]
      const previousGroupId = session.selectedGroupId
      const previousGroupIds = [...session.selectedGroupIds]
      const removedTilesets = removableOwnedTilesets(document, selectedIds)
      const animationCels = cloneAnimationCelsForLayerIds(document, [...selectedIds])
      const timeline = ensureAnimationDocument(document)
      const removedLayerMasks = cloneAnimationLayerMasksForLayerIds(document, selectedIds)
      const removedGroupMasks = (timeline.groupMasks ?? []).filter((entry) => selectedGroupIdSet.has(entry.groupId)).map((entry) => cloneAnimationGroupMask(entry))
      document.layers = document.layers.filter((layer) => !selectedIds.has(layer.id))
      removeAnimationCelsForLayers(document, [...selectedIds])
      removeAnimationLayerMasksForLayerIds(document, selectedIds)
      timeline.groupMasks = (timeline.groupMasks ?? []).filter((entry) => !selectedGroupIdSet.has(entry.groupId))
      if (removedGroups.length > 0) document.groups = document.groups.filter((group) => !selectedGroupIdSet.has(group.id))
      removeTilesetSnapshots(document, removedTilesets)
      const nearestIndex = removed.length > 0 ? Math.max(0, Math.min(document.layers.length - 1, removed[0].index - 1)) : document.layers.findIndex((layer) => layer.id === previousActiveId)
      const nextId = document.layers[Math.max(0, nearestIndex)]?.id ?? previousActiveId
      document.activeLayerId = nextId
      session.selectedGroupId = null
      session.selectedGroupIds = []
      session.selectedLayerIds = [nextId]
      shouldHideTilesetPanel = removed.some(({ layer }) => layer.kind === 'tilemap' || layer.kind === 'free-tile') && !documentUsesTilesetPanel(document)
      session.history.push({
        label: removedGroups.length > 0 ? tr('workspace.history.deleteGroup') : removed.length === 1 ? tr('workspace.history.deleteLayer') : tr('workspace.history.deleteLayers'),
        bytes: removed.reduce((sum, item) => sum + layerHistoryBytes(item.layer), 0) + removedTilesets.reduce((sum, snapshot) => sum + tilemapTilesetBytes(snapshot.tileset), 0) + removedGroups.reduce((sum, item) => sum + groupHistoryBytes(item.group), 0) + [...removedLayerMasks, ...removedGroupMasks].reduce((sum, entry) => sum + entry.mask.pixels.byteLength, 0),
        undo: () => {
          restoreTilesetSnapshots(document, removedTilesets)
          for (const item of removedGroups) if (!document.groups.some((group) => group.id === item.group.id)) document.groups.splice(Math.min(item.index, document.groups.length), 0, item.group)
          for (const item of removed) if (!document.layers.some((layer) => layer.id === item.layer.id)) document.layers.splice(Math.min(item.index, document.layers.length), 0, item.layer)
          restoreAnimationCels(document, animationCels)
          restoreAnimationLayerMasks(document, removedLayerMasks)
          timeline.groupMasks ??= []
          for (const entry of removedGroupMasks) if (!timeline.groupMasks.some((candidate) => candidate.mask.id === entry.mask.id)) timeline.groupMasks.push(cloneAnimationGroupMask(entry))
          document.activeLayerId = previousActiveId
          session.selectedLayerIds = previousSelection
          session.selectedGroupId = previousGroupId
          session.selectedGroupIds = previousGroupIds
        },
        redo: () => {
          document.layers = document.layers.filter((layer) => !selectedIds.has(layer.id))
          removeAnimationCelsForLayers(document, [...selectedIds])
          removeAnimationLayerMasksForLayerIds(document, selectedIds)
          document.groups = document.groups.filter((group) => !selectedGroupIdSet.has(group.id))
          timeline.groupMasks = (timeline.groupMasks ?? []).filter((entry) => !selectedGroupIdSet.has(entry.groupId))
          removeTilesetSnapshots(document, removedTilesets)
          document.activeLayerId = nextId
          session.selectedLayerIds = [nextId]
          session.selectedGroupId = null
          session.selectedGroupIds = []
        }
      })
    }, true, true)
    if (shouldHideTilesetPanel) requestTilesetPanelVisibility(false)
  },

  mergeSelectedLayers() {
    get().commitFloatingPaste()
    const state = get()
    const session = activeSession(state)
    if (!session) return
    const beforeDocument = captureDocumentStructureSnapshot(session.document)
    const beforeUi = captureLayerUi(session)
    const result = mergeRasterLayers(session.document, session.selectedLayerIds)
    if (!result.ok) { set({ message: result.reason }); return }
    const shouldHideTilesetPanel = commitLayerMergeWithOwnedTilesets(session, beforeDocument, beforeUi, result, tr('workspace.history.mergeSelected'))
    set({ sessions: [...state.sessions], message: tr('workspace.layer.mergedSelected') })
    if (shouldHideTilesetPanel) requestTilesetPanelVisibility(false)
  },

  mergeActiveLayerDown() {
    get().commitFloatingPaste()
    const state = get()
    const session = activeSession(state)
    if (!session) return
    const beforeDocument = captureDocumentStructureSnapshot(session.document)
    const beforeUi = captureLayerUi(session)
    const result = mergeLayerDown(session.document, session.document.activeLayerId)
    if (!result.ok) { set({ message: result.reason }); return }
    const shouldHideTilesetPanel = commitLayerMergeWithOwnedTilesets(session, beforeDocument, beforeUi, result, tr('workspace.history.mergeDown'))
    set({ sessions: [...state.sessions], message: tr('workspace.layer.mergedDown') })
    if (shouldHideTilesetPanel) requestTilesetPanelVisibility(false)
  },

  mergeSelectedGroup() {
    get().commitFloatingPaste()
    const state = get()
    const session = activeSession(state)
    if (!session?.selectedGroupId) { set({ message: tr('workspace.group.selectFirst') }); return }
    const beforeDocument = captureDocumentStructureSnapshot(session.document)
    const beforeUi = captureLayerUi(session)
    const result = mergeLayerGroup(session.document, session.selectedGroupId)
    if (!result.ok) { set({ message: result.reason }); return }
    const shouldHideTilesetPanel = commitLayerMergeWithOwnedTilesets(session, beforeDocument, beforeUi, result, tr('workspace.history.mergeGroup'))
    set({ sessions: [...state.sessions], message: tr('workspace.group.merged') })
    if (shouldHideTilesetPanel) requestTilesetPanelVisibility(false)
  },

  mergeVisibleLayers() {
    get().commitFloatingPaste()
    const state = get()
    const session = activeSession(state)
    if (!session) return
    const beforeDocument = captureDocumentStructureSnapshot(session.document)
    const beforeUi = captureLayerUi(session)
    const result = mergeVisibleDocumentLayers(session.document)
    if (!result.ok) { set({ message: result.reason }); return }
    const shouldHideTilesetPanel = commitLayerMergeWithOwnedTilesets(session, beforeDocument, beforeUi, result, tr('workspace.history.mergeVisible'))
    set({ sessions: [...state.sessions], message: tr('workspace.layers.visibleMerged') })
    if (shouldHideTilesetPanel) requestTilesetPanelVisibility(false)
  },

  moveLayer(direction) {
    get().mutateActive((session) => {
      const document = session.document
      const index = document.layers.findIndex((layer) => layer.id === document.activeLayerId)
      const target = index + direction
      if (target < 0 || target >= document.layers.length) return
      ;[document.layers[index], document.layers[target]] = [document.layers[target], document.layers[index]]
      session.history.push({
        label: tr('canvas.history.moveLayer'), bytes: 32,
        undo: () => { ;[document.layers[index], document.layers[target]] = [document.layers[target], document.layers[index]] },
        redo: () => { ;[document.layers[index], document.layers[target]] = [document.layers[target], document.layers[index]] },
        requiresAnimationSync: false
      })
    }, 'content')
  },

  moveLayerBy(layerId, deltaX, deltaY, label = tr('canvas.history.moveLayer')) {
    get().mutateActive((session) => {
      const layer = session.document.layers.find((candidate) => candidate.id === layerId)
      if (!layer || isLayerEffectivelyLocked(session.document, layer)) return
      const before = { x: layer.offsetX, y: layer.offsetY }
      const after = { x: before.x + Math.trunc(deltaX), y: before.y + Math.trunc(deltaY) }
      if (before.x === after.x && before.y === after.y) return
      layer.offsetX = after.x
      layer.offsetY = after.y
      const timeline = ensureAnimationDocument(session.document)
      const activeCel = timeline.cels.find((candidate) => candidate.layerId === layer.id && candidate.frameId === timeline.activeFrameId)
      const textSource = activeCel ? resolveAnimationCel(timeline, activeCel) ?? activeCel : null
      if (layer.kind === 'text' && textSource?.text) translateTextCelData(textSource.text, after.x - before.x, after.y - before.y)
      session.history.push({
        label, bytes: 32,
        undo: () => { layer.offsetX = before.x; layer.offsetY = before.y; if (textSource?.text) translateTextCelData(textSource.text, before.x - after.x, before.y - after.y) },
        redo: () => { layer.offsetX = after.x; layer.offsetY = after.y; if (textSource?.text) translateTextCelData(textSource.text, after.x - before.x, after.y - before.y) }
      })
    })
  },

  beginLayerMoveDuplicatePreview(documentId, layerId, copySuffix) {
    let result: LayerMoveDuplicateResult | null = null
    get().mutateActive((session) => {
      if (session.document.id !== documentId) return
      const source = session.document.layers.find((candidate) => candidate.id === layerId)
      const linkedCopyName = source?.linkedContentId ? createLinkedLayerNameAllocator(session.document)(source.linkedContentId, source.name) : null
      result = beginLayerMoveDuplicatePreviewCommand(session, layerId, copySuffix)
      if (result) {
        if (linkedCopyName) result.layer.name = linkedCopyName
        // This is a transient preview, not a document operation, but the
        // compositor must see the new layer immediately rather than reuse the
        // pre-copy cache entry.
        const fromRevision = session.contentRevision
        session.revision += 1
        session.contentRevision += 1
        session.layersPanelRevision += 1
        session.contentInvalidation = { kind: 'full', fromRevision, revision: session.contentRevision }
      }
    }, false)
    return result
  },

  previewLayerMove(documentId, move, distanceX, distanceY) {
    const session = activeSession(get())
    if (!session || session.document.id !== documentId) return false
    return previewLayerMoveCommand(session, move, distanceX, distanceY)
  },

  cancelLayerMovePreview(documentId, move) {
    get().mutateActive((session) => {
      if (session.document.id !== documentId) return
      if (cancelLayerMovePreviewCommand(session, move)) {
        const fromRevision = session.contentRevision
        session.revision += 1
        session.contentRevision += 1
        session.layersPanelRevision += 1
        session.contentInvalidation = { kind: 'full', fromRevision, revision: session.contentRevision }
      }
    }, false)
  },

  commitLayerMove(documentId, move) {
    const session = activeSession(get())
    if (!session || session.document.id !== documentId) return
    const entry = createLayerMoveHistoryEntry(session, move, {
      single: tr('canvas.history.moveLayer'),
      multiple: tr('canvas.history.moveSelectedLayers')
    })
    if (!entry) return
    get().pushHistory(entry)
    // The copy is inserted while dragging for a live preview.  Confirming
    // that drag must make the copy (rather than the source layer) the active
    // editing target, without retaining a blue explicit layer selection.
    if (move.duplicatedLayerId) get().activateLayerForCanvas(move.duplicatedLayerId)
  },

  reorderLayer(layerId, targetLayerId) {
    get().reorderLayers([layerId], targetLayerId)
  },

  reorderLayers(layerIds, targetLayerId, insertAfterTarget = true) {
    const current = activeSession(get())
    const beforeRenderOrder = current ? normalCompositeLayers(current.document) : null
    get().mutateActive((session) => {
      const history = reorderLayersOperation(session, layerIds, targetLayerId, insertAfterTarget)
      if (!history) return
      const invalidation = layerReorderInvalidation(session.document, beforeRenderOrder, normalCompositeLayers(session.document))
      let entry: HistoryEntry
      const applyWithCurrentFrameInvalidation = (apply: () => void): void => {
        const before = normalCompositeLayers(session.document)
        apply()
        entry.invalidation = layerReorderInvalidation(session.document, before, normalCompositeLayers(session.document))
        if (entry.invalidation.kind === 'region') session.layersPanelRevision += 1
      }
      entry = {
        ...history,
        invalidation,
        requiresAnimationSync: false,
        undo: () => { applyWithCurrentFrameInvalidation(history.undo) },
        redo: () => { applyWithCurrentFrameInvalidation(history.redo) }
      }
      if (invalidation.kind === 'region') {
        session.layersPanelRevision += 1
      }
      session.history.push(entry)
      touch(session, true, invalidation)
      recordDocumentOperation(session)
    }, false)
  },

  assignLayerToGroup(layerId, groupId) {
    get().assignLayersToGroup([layerId], groupId)
  },

  assignLayersToGroup(layerIds, groupId, targetLayerId, insertAfterTarget = true) {
    get().mutateActive((session) => {
      const history = assignLayersToGroupOperation(session, layerIds, groupId, targetLayerId, insertAfterTarget)
      if (history) session.history.push({ ...history, requiresAnimationSync: false })
    }, 'content')
  },

  assignLayersToRoot(layerIds, targetLayerId, insertAfterTarget = true) {
    get().mutateActive((session) => {
      const history = assignLayersToRootOperation(session, layerIds, targetLayerId, insertAfterTarget)
      if (history) session.history.push({ ...history, requiresAnimationSync: false })
    }, 'content')
  },

  assignLayersAboveGroup(layerIds, groupId) {
    get().mutateActive((session) => {
      const history = assignLayersAboveGroupOperation(session, layerIds, groupId)
      if (history) session.history.push({ ...history, requiresAnimationSync: false })
    }, 'content')
  },

  reorderGroup(groupId, targetGroupId, insertAfterTarget = true) {
    if (groupId === targetGroupId) return
    get().mutateActive((session) => {
      if (!canMoveGroupInto(session.document, groupId, targetGroupId)) {
        set({ message: tr('workspace.group.moveNextToChild') })
        return
      }
      const history = reorderGroupOperation(session, groupId, targetGroupId, insertAfterTarget)
      if (history) session.history.push({ ...history, requiresAnimationSync: false })
    }, 'content')
  },

  positionGroupNextToLayer(groupId, targetLayerId, insertAfterTarget = true) {
    get().mutateActive((session) => {
      const history = positionGroupNextToLayerOperation(session, groupId, targetLayerId, insertAfterTarget)
      if (history) session.history.push({ ...history, requiresAnimationSync: false })
    }, 'content')
  },

  assignGroupToGroup(groupId, parentGroupId) {
    if (groupId === parentGroupId) return
    get().mutateActive((session) => {
      if (!canMoveGroupInto(session.document, groupId, parentGroupId)) { set({ message: tr('workspace.group.moveIntoChild') }); return }
      const history = assignGroupToGroupOperation(session, groupId, parentGroupId)
      if (history) session.history.push({ ...history, requiresAnimationSync: false })
    }, 'content')
  },

  assignGroupToRoot(groupId) {
    get().mutateActive((session) => {
      const history = assignGroupToRootOperation(session, groupId)
      if (history) session.history.push({ ...history, requiresAnimationSync: false })
    }, 'content')
  },

  moveLayersToRootEdge(layerIds, edge) {
    get().mutateActive((session) => {
      const history = moveLayersToRootEdgeOperation(session, layerIds, edge)
      if (history) session.history.push({ ...history, requiresAnimationSync: false })
    }, 'content')
  },

  moveGroupToRootEdge(groupId, edge) {
    get().mutateActive((session) => {
      const history = moveGroupToRootEdgeOperation(session, groupId, edge)
      if (history) session.history.push({ ...history, requiresAnimationSync: false })
    }, 'content')
  },

  moveLayerRows(layerIds, groupIds, target) {
    get().mutateActive((session) => {
      const history = moveLayerPanelRowsOperation(session, layerIds, groupIds, target)
      if (history) session.history.push({ ...history, requiresAnimationSync: false })
    }, 'content')
  },

  createLayerGroup() {
    get().mutateActive((session) => {
      const placement = selectedRowInsertionTarget(session)
      const placeRelativeToSelectedGroup = Boolean(session.selectedGroupId && selectedDirectLayerRows(session).length === 0)
      session.history.beginCompound()
      const history = createLayerGroupOperation(session, createId('group'), tr('workspace.group.defaultName', { index: session.document.groups.length + 1 }))
      if (history) session.history.push(history)
      if (history && placeRelativeToSelectedGroup && session.selectedGroupId) {
        const placementHistory = moveLayerPanelRowsOperation(session, [], [session.selectedGroupId], placement)
        if (placementHistory) session.history.push(placementHistory)
      }
      session.history.endCompound(history?.label ?? tr('workspace.history.newLayer'))
    }, true, true)
  },

  ungroupSelected() {
    const current = activeSession(get())
    const groupIds = current?.selectedGroupId ? [current.selectedGroupId] : current?.document.layers.filter((layer) => current.selectedLayerIds.includes(layer.id) && layer.groupId).map((layer) => layer.groupId!) ?? []
    if (current && groupIds.some((groupId) => lockedGroupStructure(current.document, groupId))) { set({ message: tr('workspace.group.lockedUngroup') }); return }
    get().mutateActive((session) => {
      const timeline = ensureAnimationDocument(session.document)
      const removedGroupMasks = (timeline.groupMasks ?? []).filter((entry) => groupIds.includes(entry.groupId)).map((entry) => cloneAnimationGroupMask(entry))
      const history = ungroupSelectedOperation(session)
      if (!history) return
      const maskIds = new Set(removedGroupMasks.map((entry) => entry.mask.id))
      const removeMasks = (): void => { timeline.groupMasks = (timeline.groupMasks ?? []).filter((entry) => !maskIds.has(entry.mask.id)) }
      const restoreMasks = (): void => { timeline.groupMasks ??= []; for (const entry of removedGroupMasks) if (!timeline.groupMasks.some((candidate) => candidate.mask.id === entry.mask.id)) timeline.groupMasks.push(cloneAnimationGroupMask(entry)) }
      removeMasks()
      session.history.push({ label: history.label, bytes: history.bytes + removedGroupMasks.reduce((sum, entry) => sum + entry.mask.pixels.byteLength, 0), undo: () => { history.undo(); restoreMasks() }, redo: () => { history.redo(); removeMasks() } })
    }, true, true)
  },

  toggleLayerVisibility(layerId) {
    get().mutateActive((session) => {
      const layer = getLayer(session.document, layerId)
      const hiddenAncestors = layer.visible === false ? hiddenAncestorGroupsForLayer(session.document, layer) : []
      if (hiddenAncestors.length > 0) {
        const beforeLayerVisible = layer.visible
        const beforeGroupVisible = hiddenAncestors.map((group) => ({ group, visible: group.visible }))
        layer.visible = true
        for (const { group } of beforeGroupVisible) group.visible = true
        const invalidation = groupVisibilityInvalidation(session.document, hiddenAncestors[0].id)
        const apply = (visible: boolean): void => {
          layer.visible = visible
          for (const { group } of beforeGroupVisible) group.visible = visible
        }
        session.history.push({
          label: tr('workspace.history.showLayer'),
          bytes: 8 * (beforeGroupVisible.length + 1),
          undo: () => apply(beforeLayerVisible),
          redo: () => apply(true),
          invalidation,
          affectedLayerIds: [layer.id],
          requiresAnimationSync: false
        })
        touch(session, true, invalidation)
        recordDocumentOperation(session)
        return
      }
      commitVisibilityChange(
        session,
        layer,
        tr('workspace.history.showLayer'),
        () => layerVisibilityInvalidation(session.document, layer),
        [layer.id]
      )
    }, false)
  },

  selectLayer(layerId, mode = 'replace') {
    get().cancelTextBoxTransform()
    get().commitFloatingPaste()
    get().mutateActive((session) => {
      session.layerSelectionExplicit = true
      const selectionMode: Exclude<LayerRowSelectionMode, boolean> = mode === true ? 'toggle' : mode === false ? 'replace' : mode
      const preserveMaskRowSelection = selectionMode !== 'replace' && session.selectedAnimationMaskRowKeys.length > 0
      // Layer, frame, and cel selections are mutually exclusive modes. A
      // Ctrl-toggle is the exception for row selections: it may coexist with
      // selected mask rows so ordinary layers and masks can be multi-selected.
      clearAnimationItemSelection(session, preserveMaskRowSelection)
      if (selectionMode === 'range') {
        applyLayerRowRange(session, { kind: 'layer', id: layerId }, { preserveMaskRowSelection })
      } else if (selectionMode === 'toggle') {
        const layers = selectedDirectLayerRows(session)
        const wasSelected = layers.includes(layerId)
        const toggledLayers = wasSelected ? layers.filter((id) => id !== layerId) : [...layers, layerId]
        // A selected group is a valid row selection, not a reason to discard
        // a Ctrl-added layer.  Keep the first toggled layer when the group
        // was the only prior row, while still allowing the last layer to be
        // toggled off when it was already selected.
        const nextLayers = toggledLayers.length === 0 && !wasSelected ? [layerId] : toggledLayers
        applyLayerRowSelection(session, nextLayers, selectedGroupRows(session), { kind: 'layer', id: layerId }, { preserveMaskRowSelection })
        session.layerSelectionAnchorId = layerId
      } else {
        applyLayerRowSelection(session, [layerId], [], { kind: 'layer', id: layerId })
        session.layerSelectionAnchorId = layerId
      }
      setTimelineActiveContext(session, { kind: 'layer', ownerKind: 'layer', ownerId: layerId }, session.document.animation?.activeFrameId ?? null, null)
      // applyLayerRowSelection owns the complete transition out of mask mode.
    }, false)
    const current = activeSession(get())
    if (current) requestTilesetPanelForLayer(current.document, layerId)
  },

  selectMoveToolLayer(layerId, additive = false) {
    get().commitFloatingPaste()
    get().mutateActive((session) => {
      session.layerSelectionExplicit = true
      if (!session.document.layers.some((layer) => layer.id === layerId)) return
      clearAnimationItemSelection(session)
      const currentLayerIds = selectedDirectLayerRows(session)
      const toggledLayerIds = additive
        ? currentLayerIds.includes(layerId)
          ? currentLayerIds.filter((candidate) => candidate !== layerId)
          : [...currentLayerIds, layerId]
        : [layerId]
      const selectedLayerIds = toggledLayerIds.length > 0 ? toggledLayerIds : [layerId]
      applyLayerRowSelection(session, selectedLayerIds, [], { kind: 'layer', id: layerId })
      setTimelineActiveContext(session, { kind: 'layer', ownerKind: 'layer', ownerId: layerId }, session.document.animation?.activeFrameId ?? null, null)
    }, false)
    const current = activeSession(get())
    if (current) requestTilesetPanelForLayer(current.document, layerId)
  },

  activateLayerForCanvas(layerId) {
    get().commitFloatingPaste()
    get().mutateActive((session) => {
      if (!session.document.layers.some((layer) => layer.id === layerId)) return
      // Canvas hit-testing changes the editing context only. It is deliberately
      // not equivalent to a timeline row click, which creates an explicit
      // layer selection and its blue selection outline.
      session.document.activeLayerId = layerId
      session.selectedLayerIds = []
      session.selectedGroupId = null
      session.selectedGroupIds = []
      session.layerSelectionExplicit = false
      session.layerSelectionAnchorId = layerId
      clearAnimationItemSelection(session)
      session.activeLayerMaskId = null
      session.layerMaskIsolatedView = false
      setTimelineActiveContext(session, { kind: 'layer', ownerKind: 'layer', ownerId: layerId }, session.document.animation?.activeFrameId ?? null, null)
    }, false)
    const current = activeSession(get())
    if (current) requestTilesetPanelForLayer(current.document, layerId)
  },

  selectGroup(groupId, mode = 'replace') {
    get().cancelTextBoxTransform()
    get().commitFloatingPaste()
    get().mutateActive((session) => {
      session.layerSelectionExplicit = true
      getGroup(session.document, groupId)
      const selectionMode: Exclude<LayerRowSelectionMode, boolean> = mode === true ? 'toggle' : mode === false ? 'replace' : mode
      const preserveMaskRowSelection = selectionMode !== 'replace' && session.selectedAnimationMaskRowKeys.length > 0
      clearAnimationItemSelection(session, preserveMaskRowSelection)
      if (selectionMode === 'range') applyLayerRowRange(session, { kind: 'group', id: groupId }, { preserveMaskRowSelection })
      else if (selectionMode === 'toggle') {
        const groups = selectedGroupRows(session)
        const nextGroups = groups.includes(groupId) ? groups.filter((id) => id !== groupId) : [...groups, groupId]
        applyLayerRowSelection(session, selectedDirectLayerRows(session), nextGroups, { kind: 'group', id: groupId }, { preserveMaskRowSelection })
        session.layerSelectionAnchorId = groupId
      } else {
        applyLayerRowSelection(session, [], [groupId], { kind: 'group', id: groupId })
        session.layerSelectionAnchorId = groupId
      }
      setTimelineActiveContext(session, { kind: 'group', ownerKind: 'group', ownerId: groupId }, session.document.animation?.activeFrameId ?? null, null)
    }, false)
  },

  selectLayerRows(layerIds, groupIds) {
    get().mutateActive((session) => {
      session.layerSelectionExplicit = layerIds.length > 0 || groupIds.length > 0
      clearAnimationItemSelection(session)
      const focus = layerIds.length > 0
        ? { kind: 'layer' as const, id: layerIds.at(-1)! }
        : groupIds.length > 0
          ? { kind: 'group' as const, id: groupIds.at(-1)! }
          : { kind: 'layer' as const, id: session.document.activeLayerId }
      applyLayerRowSelection(session, layerIds, groupIds, focus)
      setTimelineActiveContext(
        session,
        focus.kind === 'group'
          ? { kind: 'group', ownerKind: 'group', ownerId: focus.id }
          : { kind: 'layer', ownerKind: 'layer', ownerId: focus.id },
        session.document.animation?.activeFrameId ?? null,
        null
      )
    }, false)
    const current = activeSession(get())
    if (current && layerIds.some((layerId) => current.document.layers.some((layer) => layer.id === layerId && layer.kind === 'tilemap'))) requestTilesetPanelVisibility(true)
  },

  clearLayerSelection() {
    get().commitFloatingPaste()
    get().mutateActive((session) => {
      session.layerSelectionExplicit = false
      session.selectedGroupId = null
      session.selectedGroupIds = []
      session.selectedLayerIds = [session.document.activeLayerId]
      session.activeLayerMaskId = null
      session.layerMaskIsolatedView = false
      session.layerSelectionAnchorId = session.document.activeLayerId
      setTimelineActiveContext(session, { kind: 'layer', ownerKind: 'layer', ownerId: session.document.activeLayerId }, session.document.animation?.activeFrameId ?? null, null)
    }, false)
  },

  toggleGroupCollapsed(groupId) {
    get().mutateActive((session) => {
      getGroup(session.document, groupId)
      session.collapsedGroupIds = session.collapsedGroupIds.includes(groupId)
        ? session.collapsedGroupIds.filter((id) => id !== groupId)
        : [...session.collapsedGroupIds, groupId]
    }, false)
  },

  revealLayerInPanel(documentId, layerId) {
    const state = get()
    const session = state.sessions.find((candidate) => candidate.document.id === documentId)
    const layer = session?.document.layers.find((candidate) => candidate.id === layerId)
    if (!session || !layer) return
    const ancestorIds = new Set(getLayerPanelAncestorGroupIds(session.document.groups, layer.groupId))
    if (!session.collapsedGroupIds.some((id) => ancestorIds.has(id))) return
    session.collapsedGroupIds = session.collapsedGroupIds.filter((id) => !ancestorIds.has(id))
    set({ sessions: [...state.sessions] })
  },

  beginLayerPanelTransaction(documentId) {
    const session = get().sessions.find((candidate) => candidate.document.id === documentId)
    session?.history.beginCompound()
  },

  commitLayerPanelTransaction(documentId, label) {
    const state = get()
    const session = state.sessions.find((candidate) => candidate.document.id === documentId)
    if (!session) return
    session.history.endCompound(label)
    set({ sessions: [...state.sessions] })
  },

  toggleGroupVisibility(groupId) {
    get().mutateActive((session) => {
      const group = getGroup(session.document, groupId)
      const hiddenAncestors = group.visible === false ? hiddenAncestorGroupsForGroup(session.document, group) : []
      if (hiddenAncestors.length > 0) {
        const beforeGroupVisible = group.visible
        const beforeAncestorVisibility = hiddenAncestors.map((ancestor) => ({ group: ancestor, visible: ancestor.visible }))
        group.visible = true
        for (const { group: ancestor } of beforeAncestorVisibility) ancestor.visible = true
        const invalidation = groupVisibilityInvalidation(session.document, hiddenAncestors[0].id)
        const apply = (visible: boolean): void => {
          group.visible = visible
          for (const { group: ancestor } of beforeAncestorVisibility) ancestor.visible = visible
        }
        session.history.push({
          label: tr('workspace.history.showGroup'),
          bytes: 8 * (beforeAncestorVisibility.length + 1),
          undo: () => apply(beforeGroupVisible),
          redo: () => apply(true),
          invalidation,
          requiresAnimationSync: false
        })
        touch(session, true, invalidation)
        recordDocumentOperation(session)
        return
      }
      commitVisibilityChange(
        session,
        group,
        tr('workspace.history.showGroup'),
        () => groupVisibilityInvalidation(session.document, group.id),
        undefined,
        true
      )
    }, false)
  },

  selectLayerMask(celId, additive = false) {
    get().commitFloatingPaste()
    get().mutateActive((session) => {
      const timeline = ensureAnimationDocument(session.document)
      const cel = timeline.cels.find((candidate) => candidate.id === celId)
      const mask = cel ? animationMaskAt(timeline, cel.layerId, cel.frameId) : null
      if (!cel || !mask) return
      activateAnimationFrame(session.document, cel.frameId)
      applyLayerRowSelection(session, [], [], { kind: 'layer', id: cel.layerId })
      activateTimelineMask(session, 'layer', cel.layerId, cel.frameId, mask.id)
      session.layerMaskIsolatedView = true
      const key = animationCelKey(cel.layerId, cel.frameId)
      session.selectedAnimationCellKeys = []
      session.animationCellSelectionAnchorKey = null
      session.animationCellSelectionExplicit = false
      const selected = new Set(additive ? session.selectedAnimationMaskCellKeys : [])
      selected.add(key)
      session.selectedAnimationMaskCellKeys = [...selected]
      session.animationMaskCellSelectionAnchorKey = key
    }, false, true)
  },

  selectGroupMask(groupId, frameId, additive = false) {
    get().commitFloatingPaste()
    get().mutateActive((session) => {
      const timeline = ensureAnimationDocument(session.document)
      const mask = animationMaskAt(timeline, groupId, frameId)
      if (!mask || !session.document.groups.some((group) => group.id === groupId)) return
      activateAnimationFrame(session.document, frameId)
      applyLayerRowSelection(session, [], [groupId], { kind: 'group', id: groupId })
      activateTimelineMask(session, 'group', groupId, frameId, mask.id)
      session.layerMaskIsolatedView = true
      const key = animationCelKey(groupId, frameId)
      session.selectedAnimationCellKeys = []
      session.animationCellSelectionAnchorKey = null
      session.animationCellSelectionExplicit = false
      const selected = new Set(additive ? session.selectedAnimationMaskCellKeys : [])
      selected.add(key)
      session.selectedAnimationMaskCellKeys = [...selected]
      session.animationMaskCellSelectionAnchorKey = key
    }, false, true)
  },

  toggleLayerMaskVisibility(celId) {
    get().mutateActive((session) => {
      const timeline = ensureAnimationDocument(session.document)
      const cel = timeline.cels.find((candidate) => candidate.id === celId)
      const mask = cel ? animationMaskAt(timeline, cel.layerId, cel.frameId) : null
      if (!mask) return
      const before = mask.visible
      mask.visible = !before
      session.history.push({ label: tr('workspace.history.showLayer'), bytes: 8, undo: () => { mask.visible = before }, redo: () => { mask.visible = !before } })
    })
  },

  setLayerMaskLocked(celId, enabled) {
    get().mutateActive((session) => {
      const beforeSelection = captureAnimationSelectionHistory(session)
      const timeline = ensureAnimationDocument(session.document)
      const cel = timeline.cels.find((candidate) => candidate.id === celId)
      const mask = cel ? animationMaskAt(timeline, cel.layerId, cel.frameId) : null
      if (!mask || mask.ownerKind !== 'cel') return
      const before = mask.locked === true
      const after = Boolean(enabled)
      if (before === after) return
      const apply = (value: boolean): void => { mask.locked = value }
      apply(after)
      if (after && session.activeLayerMaskId === mask.id) { session.activeLayerMaskId = null; session.layerMaskIsolatedView = false; exitLayerMaskEditing(session) }
      const afterSelection = captureAnimationSelectionHistory(session)
      const entry: HistoryEntry = { label: tr('workspace.history.layerProperties'), bytes: 8, undo: () => apply(before), redo: () => apply(after), contentChanged: false, requiresAnimationSync: false }
      session.history.push(historyEntryWithAnimationSelection(session, entry, beforeSelection, afterSelection))
    }, 'metadata')
  },

  setLayerMaskAutoLinkAnimationCels(celId, enabled) {
    get().mutateActive((session) => {
      const timeline = ensureAnimationDocument(session.document)
      const cel = timeline.cels.find((candidate) => candidate.id === celId)
      const mask = cel ? animationMaskAt(timeline, cel.layerId, cel.frameId) : null
      if (!mask || mask.ownerKind !== 'cel') return
      const before = mask.autoLinkAnimationCels === true
      const after = Boolean(enabled)
      if (before === after) return
      const apply = (value: boolean): void => { if (value) mask.autoLinkAnimationCels = true; else delete mask.autoLinkAnimationCels }
      apply(after)
      session.history.push({ label: tr('workspace.history.layerProperties'), bytes: 8, undo: () => apply(before), redo: () => apply(after), contentChanged: false, requiresAnimationSync: false })
    }, 'metadata')
  },

  toggleGroupMaskVisibility(groupId, frameId) {
    get().mutateActive((session) => {
      const mask = animationMaskAt(ensureAnimationDocument(session.document), groupId, frameId)
      if (!mask) return
      const before = mask.visible
      mask.visible = !before
      session.history.push({ label: tr('workspace.history.showLayer'), bytes: 8, undo: () => { mask.visible = before }, redo: () => { mask.visible = !before } })
    })
  },

  setLayerMaskMoveWithOwner(celId, enabled) {
    get().mutateActive((session) => {
      const timeline = ensureAnimationDocument(session.document)
      const cel = timeline.cels.find((candidate) => candidate.id === celId)
        ?? timeline.cels.find((candidate) => candidate.layerId === celId && candidate.frameId === timeline.activeFrameId)
      const mask = cel ? animationMaskAt(timeline, cel.layerId, cel.frameId) : null
      if (!mask || mask.moveWithOwner === enabled) return
      const before = mask.moveWithOwner !== false
      mask.moveWithOwner = enabled
      session.history.push({ label: tr('workspace.history.layerMaskMoveBinding'), bytes: 8, undo: () => { mask.moveWithOwner = before }, redo: () => { mask.moveWithOwner = enabled } })
    })
  },

  setGroupMaskMoveWithOwner(groupId, frameId, enabled) {
    get().mutateActive((session) => {
      const mask = animationMaskAt(ensureAnimationDocument(session.document), groupId, frameId)
      if (!mask || mask.moveWithOwner === enabled) return
      const before = mask.moveWithOwner !== false
      mask.moveWithOwner = enabled
      session.history.push({ label: tr('workspace.history.layerMaskMoveBinding'), bytes: 8, undo: () => { mask.moveWithOwner = before }, redo: () => { mask.moveWithOwner = enabled } })
    })
  },

  createLayerMask(celId, frameId) {
    const current = activeSession(get())
    if (!current) return
    const currentTimeline = ensureAnimationDocument(current.document)
    const directCel = currentTimeline.cels.find((candidate) => candidate.id === celId)
    const targetLayerId = directCel?.layerId ?? celId
    const targetFrameId = directCel?.frameId ?? frameId ?? currentTimeline.activeFrameId
    const currentCel = directCel ?? currentTimeline.cels.find((candidate) => candidate.layerId === targetLayerId && candidate.frameId === targetFrameId)
    const currentSourceCel = resolveAnimationCel(currentTimeline, currentCel ?? null) ?? currentCel
    const currentLayer = current.document.layers.find((layer) => layer.id === targetLayerId)
    if (!currentLayer || !currentTimeline.frames.some((candidate) => candidate.id === targetFrameId)) return
    if (isLayerEffectivelyLocked(current.document, currentLayer)) { set({ message: tr('workspace.layerMask.locked') }); return }
    const existingMask = directAnimationMaskAt(current.document, targetLayerId, targetFrameId)
    if (existingMask) { get().selectAnimationMaskCell(animationCelKey(targetLayerId, targetFrameId)); return }
    if (!animationCelHasContent(currentSourceCel ?? null, current.document.palette)) { set({ message: tr('workspace.layerMask.emptyCel') }); return }
    get().mutateActive((session) => {
      const timeline = ensureAnimationDocument(session.document)
      const ensured = ensureAnimationCelSlot(session.document, targetLayerId, targetFrameId)
      const cel = directCel ?? ensured?.cel ?? timeline.cels.find((candidate) => candidate.layerId === targetLayerId && candidate.frameId === targetFrameId)
      const sourceCel = resolveAnimationCel(timeline, cel ?? null) ?? cel
      if (!cel || !sourceCel) return
      const currentMask = directAnimationMaskAt(session.document, targetLayerId, targetFrameId)
      if (currentMask) { activateTimelineMask(session, 'layer', targetLayerId, targetFrameId, currentMask.id); return }
      if (!animationCelHasContent(sourceCel, session.document.palette)) return
      const mask = createAttachedLayerMask(targetLayerId, session.document.width, session.document.height)
      setAnimationMaskSlot(session.document, targetLayerId, targetFrameId, mask)
      activateAnimationFrame(session.document, targetFrameId)
      refreshActiveAnimationFrame(session.document)
      applyLayerRowSelection(session, [], [], { kind: 'layer', id: targetLayerId })
      activateTimelineMask(session, 'layer', targetLayerId, targetFrameId, mask.id)
      session.layerMaskIsolatedView = false
      const key = animationCelKey(targetLayerId, targetFrameId)
      session.selectedAnimationCellKeys = []
      session.animationCellSelectionAnchorKey = null
      session.animationCellSelectionExplicit = false
      session.selectedAnimationMaskCellKeys = [key]
      session.animationMaskCellSelectionAnchorKey = key
      session.history.push({
        label: tr('workspace.history.createLayerMask'),
        bytes: mask.pixels.byteLength,
        undo: () => { setAnimationMaskSlot(session.document, targetLayerId, targetFrameId, null); if (ensured?.created) timeline.cels = timeline.cels.filter((candidate) => candidate !== cel); if (session.activeLayerMaskId === mask.id) { session.activeLayerMaskId = null; session.layerMaskIsolatedView = false; exitLayerMaskEditing(session) } },
        redo: () => { if (ensured?.created && !timeline.cels.includes(cel)) timeline.cels.push(cel); setAnimationMaskSlot(session.document, targetLayerId, targetFrameId, mask); activateTimelineMask(session, 'layer', targetLayerId, targetFrameId, mask.id); session.layerMaskIsolatedView = false; refreshActiveAnimationFrame(session.document) },
        invalidation: { kind: 'full' }
      })
    }, true, true)
  },

  createLayerMasksForLayer(layerId) {
    const current = activeSession(get())
    if (!current) return
    const layer = current.document.layers.find((candidate) => candidate.id === layerId)
    if (!layer) return
    if (isLayerEffectivelyLocked(current.document, layer)) { set({ message: tr('workspace.layerMask.locked') }); return }
    const currentTimeline = ensureAnimationDocument(current.document)
    const currentTargets = currentTimeline.cels.filter((cel) => cel.layerId === layerId && animationCelHasContent(resolveAnimationCel(currentTimeline, cel) ?? cel, current.document.palette))
    if (currentTargets.length === 0) { set({ message: tr('workspace.layerMask.emptyCel') }); return }
    if (!currentTargets.some((cel) => !directAnimationMaskAt(current.document, layerId, cel.frameId))) return
    get().mutateActive((session) => {
      const timeline = ensureAnimationDocument(session.document)
      const created = timeline.cels.flatMap((cel) => {
        if (cel.layerId !== layerId || directAnimationMaskAt(session.document, layerId, cel.frameId)) return []
        const source = resolveAnimationCel(timeline, cel) ?? cel
        if (!animationCelHasContent(source, session.document.palette)) return []
        const mask = createAttachedLayerMask(layerId, session.document.width, session.document.height)
        setAnimationMaskSlot(session.document, layerId, cel.frameId, mask)
        return [{ frameId: cel.frameId, mask }]
      })
      if (created.length === 0) return
      const activeCel = timeline.cels.find((cel) => cel.layerId === layerId && cel.frameId === timeline.activeFrameId)
      const activeMask = activeCel ? directAnimationMaskAt(session.document, layerId, timeline.activeFrameId) : null
      applyLayerRowSelection(session, [layerId], [], { kind: 'layer', id: layerId })
      session.activeLayerMaskId = activeMask?.id ?? null
      if (activeMask) activateTimelineMask(session, 'layer', layerId, timeline.activeFrameId, activeMask.id)
      session.layerMaskIsolatedView = false
      session.selectedAnimationCellKeys = []
      session.animationCellSelectionAnchorKey = null
      session.animationCellSelectionExplicit = false
      session.selectedAnimationMaskCellKeys = activeMask ? [animationCelKey(layerId, timeline.activeFrameId)] : []
      session.animationMaskCellSelectionAnchorKey = session.selectedAnimationMaskCellKeys[0] ?? null
      refreshActiveAnimationFrame(session.document)
      const createdMaskIds = new Set(created.map(({ mask }) => mask.id))
      const remove = (): void => {
        for (const { frameId } of created) setAnimationMaskSlot(session.document, layerId, frameId, null)
        if (session.activeLayerMaskId && createdMaskIds.has(session.activeLayerMaskId)) { session.activeLayerMaskId = null; exitLayerMaskEditing(session) }
        refreshActiveAnimationFrame(session.document)
      }
      const restore = (): void => {
        for (const { frameId, mask } of created) setAnimationMaskSlot(session.document, layerId, frameId, mask)
        session.activeLayerMaskId = activeMask?.id ?? null
        if (activeMask) activateTimelineMask(session, 'layer', layerId, timeline.activeFrameId, activeMask.id)
        session.layerMaskIsolatedView = false
        refreshActiveAnimationFrame(session.document)
      }
      session.history.push({
        label: tr('workspace.history.createLayerMask'),
        bytes: created.reduce((sum, { mask }) => sum + mask.pixels.byteLength, 0),
        undo: remove,
        redo: restore,
        invalidation: { kind: 'full' }
      })
    }, true, true)
  },

  createGroupMask(groupId, frameId) {
    const current = activeSession(get())
    if (!current) return
    const group = current.document.groups.find((candidate) => candidate.id === groupId)
    const targetFrameId = frameId ?? ensureAnimationDocument(current.document).activeFrameId
    if (!group) return
    if (isGroupEffectivelyLocked(current.document, group)) { set({ message: tr('workspace.layerMask.locked') }); return }
    const existing = animationGroupMaskAt(ensureAnimationDocument(current.document), groupId, targetFrameId)
    if (existing) { get().selectGroupMask(groupId, targetFrameId); return }
    get().mutateActive((session) => {
      const timeline = ensureAnimationDocument(session.document)
      const mask = createAttachedLayerMask(groupId, session.document.width, session.document.height, 'group')
      const entry = { groupId, frameId: targetFrameId, mask }
      timeline.groupMasks ??= []
      timeline.groupMasks.push(entry)
      activateAnimationFrame(session.document, targetFrameId)
      applyLayerRowSelection(session, [], [groupId], { kind: 'group', id: groupId })
      activateTimelineMask(session, 'group', groupId, targetFrameId, mask.id)
      session.layerMaskIsolatedView = false
      const key = animationCelKey(groupId, targetFrameId)
      session.selectedAnimationCellKeys = []
      session.animationCellSelectionAnchorKey = null
      session.animationCellSelectionExplicit = false
      session.selectedAnimationMaskCellKeys = [key]
      session.animationMaskCellSelectionAnchorKey = key
      const restore = (): void => { if (!timeline.groupMasks?.some((candidate) => candidate.mask.id === mask.id)) timeline.groupMasks?.push(entry); activateTimelineMask(session, 'group', groupId, targetFrameId, mask.id) }
      const remove = (): void => { timeline.groupMasks = (timeline.groupMasks ?? []).filter((candidate) => candidate.mask.id !== mask.id); if (session.activeLayerMaskId === mask.id) { session.activeLayerMaskId = null; exitLayerMaskEditing(session) } }
      session.history.push({ label: tr('workspace.history.createLayerGroupMask'), bytes: mask.pixels.byteLength, undo: remove, redo: restore, invalidation: { kind: 'full' } })
    }, true, true)
  },

  deleteLayerMask(celId) {
    const current = activeSession(get())
    if (!current) return
    const currentTimeline = ensureAnimationDocument(current.document)
    const currentCel = currentTimeline.cels.find((candidate) => candidate.id === celId)
    const currentLayer = currentCel ? current.document.layers.find((layer) => layer.id === currentCel.layerId) : null
    const currentMask = currentCel ? directAnimationMaskAt(current.document, currentCel.layerId, currentCel.frameId) : null
    if (!currentMask || !currentLayer || !currentCel) return
    if (isLayerEffectivelyLocked(current.document, currentLayer)) { set({ message: tr('workspace.layerMask.locked') }); return }
    get().mutateActive((session) => {
      const timeline = ensureAnimationDocument(session.document)
      const cel = timeline.cels.find((candidate) => candidate.id === celId)
      if (!cel) return
      const mask = directAnimationMaskAt(session.document, cel.layerId, cel.frameId)
      if (!mask) return
      const wasActive = session.activeLayerMaskId === mask.id
      setAnimationMaskSlot(session.document, cel.layerId, cel.frameId, null)
      if (wasActive) { session.activeLayerMaskId = null; exitLayerMaskEditing(session) }
      session.selectedAnimationMaskCellKeys = session.selectedAnimationMaskCellKeys.filter((key) => {
        const target = parseAnimationCelKey(key)
        return !target || target.layerId !== cel.layerId || target.frameId !== cel.frameId
      })
      if (session.selectedAnimationMaskCellKeys.length === 0) session.animationMaskCellSelectionAnchorKey = null
      session.history.push({
        label: tr('workspace.history.deleteLayerMask'),
        bytes: mask.pixels.byteLength,
        undo: () => { setAnimationMaskSlot(session.document, cel.layerId, cel.frameId, mask); if (wasActive) { session.activeLayerMaskId = mask.id; enterLayerMaskEditing(session) } },
        redo: () => { setAnimationMaskSlot(session.document, cel.layerId, cel.frameId, null); if (session.activeLayerMaskId === mask.id) { session.activeLayerMaskId = null; exitLayerMaskEditing(session) } },
        invalidation: { kind: 'full' }
      })
    }, true, true)
  },

  deleteGroupMask(groupId, frameId) {
    const current = activeSession(get())
    if (!current) return
    const group = current.document.groups.find((candidate) => candidate.id === groupId)
    const targetFrameId = frameId ?? ensureAnimationDocument(current.document).activeFrameId
    const mask = animationGroupMaskAt(ensureAnimationDocument(current.document), groupId, targetFrameId)
    if (!group || !mask) return
    if (isGroupEffectivelyLocked(current.document, group)) { set({ message: tr('workspace.layerMask.locked') }); return }
    get().mutateActive((session) => {
      const timeline = ensureAnimationDocument(session.document)
      const entry = timeline.groupMasks?.find((candidate) => candidate.groupId === groupId && candidate.frameId === targetFrameId)
      if (!entry) return
      const wasActive = session.activeLayerMaskId === entry.mask.id
      const remove = (): void => { timeline.groupMasks = (timeline.groupMasks ?? []).filter((candidate) => candidate !== entry); if (session.activeLayerMaskId === entry.mask.id) { session.activeLayerMaskId = null; exitLayerMaskEditing(session) } }
      const restore = (): void => { timeline.groupMasks ??= []; if (!timeline.groupMasks.includes(entry)) timeline.groupMasks.push(entry); if (wasActive) { session.activeLayerMaskId = entry.mask.id; enterLayerMaskEditing(session) } }
      remove()
      const key = animationCelKey(groupId, targetFrameId)
      session.selectedAnimationMaskCellKeys = session.selectedAnimationMaskCellKeys.filter((candidate) => candidate !== key)
      if (session.selectedAnimationMaskCellKeys.length === 0) session.animationMaskCellSelectionAnchorKey = null
      session.history.push({ label: tr('workspace.history.deleteLayerGroupMask'), bytes: entry.mask.pixels.byteLength, undo: restore, redo: remove, invalidation: { kind: 'full' } })
    }, true, true)
  },

  deleteSelectedLayerMasks() {
    const current = activeSession(get())
    if (!current || current.selectedAnimationMaskCellKeys.length === 0 && current.selectedAnimationMaskRowKeys.length === 0) return
    const timeline = ensureAnimationDocument(current.document)
    const snapshotsBySlot = new Map<string, AnimationMaskSlotSnapshot>()
    const addSnapshot = (ownerId: string, frameId: string): void => {
      const snapshot = animationMaskSlotSnapshot(current.document, ownerId, frameId)
      if (snapshot?.mask) snapshotsBySlot.set(`${snapshot.ownerKind}:${ownerId}:${frameId}`, snapshot)
    }
    for (const key of current.selectedAnimationMaskCellKeys) {
      const target = parseAnimationCelKey(key)
      if (target) addSnapshot(target.layerId, target.frameId)
    }
    const selectedRows = new Set(current.selectedAnimationMaskRowKeys)
    for (const entry of timeline.layerMasks ?? []) if (selectedRows.has(`layer:${entry.layerId}`)) addSnapshot(entry.layerId, entry.frameId)
    for (const entry of timeline.groupMasks ?? []) if (selectedRows.has(`group:${entry.groupId}`)) addSnapshot(entry.groupId, entry.frameId)
    const snapshots = [...snapshotsBySlot.values()]
    if (snapshots.length === 0) return
    if (snapshots.some((snapshot) => {
      if (snapshot.ownerKind === 'layer') {
        const layer = current.document.layers.find((candidate) => candidate.id === snapshot.ownerId)
        return layer ? isLayerEffectivelyLocked(current.document, layer) : false
      }
      const group = current.document.groups.find((candidate) => candidate.id === snapshot.ownerId)
      return group ? isGroupEffectivelyLocked(current.document, group) : false
    })) { set({ message: tr('workspace.layerMask.locked') }); return }
    const beforeSelection = captureAnimationSelectionHistory(current)
    get().mutateActive((session) => {
      const activeMaskId = session.activeLayerMaskId
      const removedMaskIds = new Set(snapshots.flatMap((item) => item.mask ? [item.mask.id] : []))
      const restore = (): void => { restoreAnimationMaskSlots(session.document, snapshots) }
      const remove = (): void => { for (const item of snapshots) setAnimationMaskSlot(session.document, item.ownerId, item.frameId, null) }
      remove()
      if (activeMaskId && removedMaskIds.has(activeMaskId)) { session.activeLayerMaskId = null; session.layerMaskIsolatedView = false; exitLayerMaskEditing(session) }
      session.selectedAnimationMaskCellKeys = []
      session.selectedAnimationMaskRowKeys = []
      session.animationMaskCellSelectionAnchorKey = null
      const afterSelection = captureAnimationSelectionHistory(session)
      const entry: HistoryEntry = {
        label: tr('workspace.history.deleteLayerMask'),
        bytes: snapshots.reduce((sum, item) => sum + (item.mask?.pixels.byteLength ?? 0), 0),
        undo: restore,
        redo: remove,
        invalidation: { kind: 'full' }
      }
      session.history.push(historyEntryWithAnimationSelection(session, entry, beforeSelection, afterSelection))
    }, true, true)
  },

  toggleActiveClippingMask() {
    const current = activeSession(get())
    if (!current) return
    if (current.selectedGroupId) {
      const group = current.document.groups.find((candidate) => candidate.id === current.selectedGroupId)
      if (group) get().setClippingMask('group', group.id, group.clippingMask !== true)
      return
    }
    const layer = current.document.layers.find((candidate) => candidate.id === current.document.activeLayerId)
    if (layer) get().setClippingMask('layer', layer.id, layer.clippingMask !== true)
  },

  setClippingMask(kind, id, enabled) {
    const current = activeSession(get())
    if (!current) return
    const currentTarget = kind === 'layer'
      ? current.document.layers.find((layer) => layer.id === id)
      : current.document.groups.find((group) => group.id === id)
    if (!currentTarget) return
    const locked = kind === 'layer'
      ? isLayerEffectivelyLocked(current.document, currentTarget as RasterLayer)
      : isGroupEffectivelyLocked(current.document, currentTarget as LayerGroup)
    if (locked) {
      set({ message: tr('workspace.clippingMask.locked') })
      return
    }
    const before = currentTarget.clippingMask === true
    if (before === enabled) return
    get().mutateActive((session) => {
      const target = kind === 'layer' ? getLayer(session.document, id) : getGroup(session.document, id)
      const apply = (value: boolean): void => {
        if (value) target.clippingMask = true
        else delete target.clippingMask
      }
      apply(enabled)
      session.history.push({
        label: tr('workspace.history.clippingMask'),
        bytes: 8,
        undo: () => apply(before),
        redo: () => apply(enabled)
      })
    })
  },

  setGroupLocked(groupId, enabled) {
    get().mutateActive((session) => {
      const group = getGroup(session.document, groupId)
      const before = group.locked
      const after = Boolean(enabled)
      if (before === after) return
      group.locked = after
      session.history.push({
        label: tr('workspace.history.layerProperties'),
        bytes: 8,
        undo: () => { group.locked = before },
        redo: () => { group.locked = after },
        contentChanged: false,
        requiresAnimationSync: false
      })
    }, 'metadata')
  },

  setGroupProperties(groupId, name, opacity, blendMode, locked, displayColor, description, cumulativeBlend) {
    const trimmed = name.trim()
    if (!trimmed) return
    const current = activeSession(get())
    if (!current) return
    const currentGroup = getGroup(current.document, groupId)
    const currentLockingAncestor = getGroupLockingAncestor(current.document, currentGroup)
    const currentVisualLocked = currentGroup.locked || Boolean(currentLockingAncestor)
    const nextOpacity = currentVisualLocked ? currentGroup.opacity : Math.max(0, Math.min(1, opacity))
    const nextBlendMode = currentVisualLocked ? currentGroup.blendMode : blendMode
    const nextCumulativeBlend = currentVisualLocked || cumulativeBlend === undefined ? currentGroup.cumulativeBlend === true : cumulativeBlend
    const nextLocked = currentLockingAncestor ? currentGroup.locked : locked
    const nextDisplayColor = displayColor === undefined ? currentGroup.displayColor : displayColor ?? undefined
    const nextDescription = description ?? currentGroup.description ?? ''
    if (!locked && currentLockingAncestor) { set({ message: tr('workspace.group.lockedUnlock') }); return }
    if (currentGroup.name === trimmed && currentGroup.opacity === nextOpacity && currentGroup.blendMode === nextBlendMode && currentGroup.locked === nextLocked && (currentGroup.description ?? '') === nextDescription && (currentGroup.cumulativeBlend === true) === nextCumulativeBlend && optionalColorEquals(currentGroup.displayColor, nextDisplayColor)) return
    const contentChanged = currentGroup.opacity !== nextOpacity || currentGroup.blendMode !== nextBlendMode || (currentGroup.cumulativeBlend === true) !== nextCumulativeBlend
    get().mutateActive((session) => {
      const group = getGroup(session.document, groupId)
      const lockingAncestor = getGroupLockingAncestor(session.document, group)
      if (!locked && lockingAncestor) {
        set({ message: tr('workspace.group.lockedUnlock') })
        return
      }
      const before = { name: group.name, opacity: group.opacity, blendMode: group.blendMode, locked: group.locked, displayColor: group.displayColor, description: group.description ?? '', cumulativeBlend: group.cumulativeBlend === true }
      const visualLocked = group.locked || Boolean(lockingAncestor)
      const after = { name: trimmed, opacity: visualLocked ? group.opacity : Math.max(0, Math.min(1, opacity)), blendMode: visualLocked ? group.blendMode : blendMode, locked: lockingAncestor ? group.locked : locked, displayColor: displayColor === undefined ? group.displayColor : displayColor ?? undefined, description: description ?? group.description ?? '', cumulativeBlend: visualLocked || cumulativeBlend === undefined ? group.cumulativeBlend === true : cumulativeBlend }
      if (before.name === after.name && before.opacity === after.opacity && before.blendMode === after.blendMode && before.locked === after.locked && before.description === after.description && before.cumulativeBlend === after.cumulativeBlend && optionalColorEquals(before.displayColor, after.displayColor)) return
      Object.assign(group, after)
      const invalidation = contentChanged ? groupBlendModeInvalidation(session.document, group.id) : undefined
      session.history.push({ label: tr('workspace.history.groupProperties'), bytes: 48 + before.name.length + after.name.length, undo: () => Object.assign(group, before), redo: () => Object.assign(group, after), invalidation, contentChanged, requiresAnimationSync: false })
    }, contentChanged ? 'content' : 'metadata', false, false, contentChanged ? groupBlendModeInvalidation(current.document, currentGroup.id) : undefined)
  },

  renameLayer(layerId, name) {
    const trimmed = name.trim()
    if (!trimmed) return
    const current = activeSession(get())
    if (!current || getLayer(current.document, layerId).name === trimmed) return
    get().mutateActive((session) => {
      const layer = getLayer(session.document, layerId)
      const before = layer.name
      applyLayerName(session.document, layer, trimmed)
      session.history.push({ label: tr('workspace.history.renameLayer'), bytes: before.length + trimmed.length, undo: () => { applyLayerName(session.document, layer, before) }, redo: () => { applyLayerName(session.document, layer, trimmed) }, contentChanged: false, requiresAnimationSync: false })
    }, 'metadata')
  },

  setLayerOpacity(layerId, opacity) {
    const current = activeSession(get())
    if (!current) return
    const currentLayer = getLayer(current.document, layerId)
    if (isLayerEffectivelyLocked(current.document, currentLayer)) return
    const after = Math.max(0, Math.min(1, opacity))
    if (currentLayer.opacity === after) return
    get().mutateActive((session) => {
      const layer = getLayer(session.document, layerId)
      const before = layer.opacity
      layer.opacity = after
      syncActiveAnimationLayer(session.document, layer.id)
      session.history.push({ label: tr('workspace.history.layerOpacity'), bytes: 16, undo: () => { layer.opacity = before }, redo: () => { layer.opacity = after }, affectedLayerIds: [layer.id] })
    }, 'content')
  },

  setLayerProperties(layerId, name, opacity) {
    const trimmed = name.trim()
    if (!trimmed) return
    const current = activeSession(get())
    if (!current) return
    const currentLayer = getLayer(current.document, layerId)
    const nextOpacity = isLayerEffectivelyLocked(current.document, currentLayer) ? currentLayer.opacity : Math.max(0, Math.min(1, opacity))
    if (currentLayer.name === trimmed && currentLayer.opacity === nextOpacity) return
    const contentChanged = currentLayer.opacity !== nextOpacity
    get().mutateActive((session) => {
      const layer = getLayer(session.document, layerId)
      const before = { name: layer.name, opacity: layer.opacity }
      const after = { name: trimmed, opacity: nextOpacity }
      applyLayerName(session.document, layer, after.name)
      layer.opacity = after.opacity
      if (contentChanged) syncActiveAnimationLayer(session.document, layer.id)
      session.history.push({ label: tr('workspace.history.layerProperties'), bytes: 32 + before.name.length + after.name.length, undo: () => { applyLayerName(session.document, layer, before.name); layer.opacity = before.opacity }, redo: () => { applyLayerName(session.document, layer, after.name); layer.opacity = after.opacity }, contentChanged, affectedLayerIds: contentChanged ? [layer.id] : undefined, requiresAnimationSync: contentChanged })
    }, contentChanged ? 'content' : 'metadata')
  },

  setLayerLocked(layerId, enabled) {
    get().mutateActive((session) => {
      const layer = getLayer(session.document, layerId)
      const before = layer.locked
      const after = Boolean(enabled)
      if (before === after) return
      layer.locked = after
      session.history.push({
        label: tr('workspace.history.layerProperties'),
        bytes: 8,
        undo: () => { layer.locked = before },
        redo: () => { layer.locked = after },
        contentChanged: false,
        requiresAnimationSync: false
      })
    }, 'metadata')
  },

  setLayerPropertiesWithBlend(layerId, name, opacity, blendMode, locked, displayColor, description) {
    const trimmed = name.trim()
    if (!trimmed) return
    const current = activeSession(get())
    if (!current) return
    const currentLayer = getLayer(current.document, layerId)
    const currentLockingGroup = getLayerLockingGroup(current.document, currentLayer)
    const currentVisualLocked = currentLayer.locked || Boolean(currentLockingGroup)
    const nextOpacity = currentVisualLocked ? currentLayer.opacity : Math.max(0, Math.min(1, opacity))
    const nextBlendMode = currentVisualLocked ? currentLayer.blendMode : blendMode
    const nextLocked = currentLockingGroup ? currentLayer.locked : locked ?? currentLayer.locked
    const nextDisplayColor = displayColor === undefined ? currentLayer.displayColor : displayColor ?? undefined
    const nextDescription = description ?? currentLayer.description ?? ''
    if (locked === false && currentLockingGroup) { set({ message: tr('workspace.group.lockedUnlock') }); return }
    if (currentLayer.name === trimmed && currentLayer.opacity === nextOpacity && currentLayer.blendMode === nextBlendMode && currentLayer.locked === nextLocked && (currentLayer.description ?? '') === nextDescription && optionalColorEquals(currentLayer.displayColor, nextDisplayColor)) return
    const contentChanged = currentLayer.opacity !== nextOpacity || currentLayer.blendMode !== nextBlendMode
    get().mutateActive((session) => {
      const layer = getLayer(session.document, layerId)
      const lockingGroup = getLayerLockingGroup(session.document, layer)
      if (locked === false && lockingGroup) {
        set({ message: tr('workspace.group.lockedUnlock') })
        return
      }
      const before = { name: layer.name, opacity: layer.opacity, blendMode: layer.blendMode, locked: layer.locked, displayColor: layer.displayColor, description: layer.description ?? '' }
      const visualLocked = layer.locked || Boolean(lockingGroup)
      const after = { name: trimmed, opacity: visualLocked ? layer.opacity : Math.max(0, Math.min(1, opacity)), blendMode: visualLocked ? layer.blendMode : blendMode, locked: lockingGroup ? layer.locked : locked ?? layer.locked, displayColor: displayColor === undefined ? layer.displayColor : displayColor ?? undefined, description: description ?? layer.description ?? '' }
      if (before.name === after.name && before.opacity === after.opacity && before.blendMode === after.blendMode && before.locked === after.locked && before.description === after.description && optionalColorEquals(before.displayColor, after.displayColor)) return
      const apply = (value: typeof before): void => {
        Object.assign(layer, value)
        applyLayerName(session.document, layer, value.name)
        if (layer.linkedContentId) setLinkedLayerGroupDisplayColor(session.document, layer.linkedContentId, value.displayColor)
      }
      apply(after)
      if (contentChanged) syncActiveAnimationLayer(session.document, layer.id)
      const invalidation = contentChanged ? layerBlendModeInvalidation(session.document, layer) : undefined
      session.history.push({ label: tr('workspace.history.layerProperties'), bytes: 40 + before.name.length + after.name.length, undo: () => apply(before), redo: () => apply(after), invalidation, contentChanged, affectedLayerIds: contentChanged ? [layer.id] : undefined, requiresAnimationSync: contentChanged })
    }, contentChanged ? 'content' : 'metadata', false, false, contentChanged ? layerBlendModeInvalidation(current.document, currentLayer) : undefined)
  },

  beginLayerPropertiesTransaction(targets) {
    let id: string | null = null
    get().mutateActive((session) => {
      id = beginLayerPropertiesTransactionCommand(documentTransactions, session, targets)
    }, false)
    return id
  },

  previewLayerPropertiesTransaction(id, values, changedFields) {
    get().mutateActive((session) => {
      const beforeContentRevision = session.contentRevision
      previewLayerPropertiesTransactionCommand(documentTransactions, session, id, values, changedFields)
      // Previewing opacity/blend mode invalidates the canvas immediately. It
      // is still a property-dialog interaction, so don't let that preview
      // revision hide the explicit layer/frame/cel selection guides.
      if (session.contentRevision !== beforeContentRevision) {
        session.selectionGuidesPreservedAtContentRevision = session.contentRevision
      }
    }, false)
  },

  commitLayerPropertiesTransaction(id, values, changedFields) {
    get().mutateActive((session) => {
      const result = commitLayerPropertiesTransactionCommand(documentTransactions, session, id, values, changedFields)
      if (result.kind === 'content') {
        syncActiveAnimationFrame(session.document)
        // Layer properties are a panel operation, not a canvas edit. Keep
        // the explicit layer/frame/cel selection visible after committing a
        // content-affecting property such as opacity or blend mode.
        session.selectionGuidesPreservedAtContentRevision = session.contentRevision + 1
        touch(session, true, result.invalidation)
        recordDocumentOperation(session)
      } else if (result.kind === 'metadata') {
        touchMetadata(session)
        recordDocumentOperation(session, undefined, false)
      }
    }, false)
  },

  cancelLayerPropertiesTransaction(id) {
    get().mutateActive((session) => {
      cancelLayerPropertiesTransactionCommand(documentTransactions, session, id)
    }, false)
  },

  previewLayerStyles(ownerKind, ownerId, styles) {
    get().previewLayerStyleEntries([{ target: { kind: ownerKind, id: ownerId }, styles }])
  },

  previewLayerStyleEntries(entries) {
    const current = activeSession(get())
    if (!current) return
    const seen = new Set<string>()
    const changes = entries.flatMap((entry) => {
      const key = `${entry.target.kind}:${entry.target.id}`
      if (seen.has(key)) return []
      seen.add(key)
      const owner = layerStyleOwnerForTarget(current.document, entry.target)
      return owner && !layerStylesEqual(owner.layerStyles, entry.styles) ? [{ target: entry.target, styles: entry.styles }] : []
    })
    if (changes.length === 0) return
    const operationProbe = window.__moonSpriteCanvasProbe
    const previewStartedAt = operationProbe?.recordOperationStage ? performance.now() : 0
    get().mutateActive((session) => {
      const targets = changes.map((change) => change.target)
      const beforeBounds = layerStylePreviewInvalidationRect(session.document, targets)
      let changed = false
      for (const change of changes) {
        const owner = layerStyleOwnerForTarget(session.document, change.target)
        if (!owner || layerStylesEqual(owner.layerStyles, change.styles)) continue
        assignLayerStyles(owner, change.styles)
        changed = true
      }
      if (!changed) return
      const afterBounds = layerStylePreviewInvalidationRect(session.document, targets)
      const fromRevision = session.contentRevision
      session.revision += 1
      session.contentRevision += 1
      session.layersPanelRevision += 1
      session.contentInvalidation = beforeBounds && afterBounds
        ? { kind: 'region', rect: unionRects(beforeBounds, afterBounds), fromRevision, revision: session.contentRevision }
        : { kind: 'full', fromRevision, revision: session.contentRevision }
    }, false)
    operationProbe?.recordOperationStage?.('layer-style.preview-mutation', performance.now() - previewStartedAt, { targets: changes.length })
  },

  setLayerStyles(ownerKind, ownerId, styles) {
    get().setLayerStylesForTargets([{ kind: ownerKind, id: ownerId }], styles)
  },

  setLayerStylesForTargets(targets, styles, action = 'edit') {
    const current = activeSession(get())
    if (!current) return false
    const uniqueTargets = uniqueLayerStyleTargets(current.document, targets)
    if (!uniqueTargets.some((target) => {
      const owner = layerStyleOwnerForTarget(current.document, target)
      return Boolean(owner && !layerStylesEqual(owner.layerStyles, styles))
    })) return false
    let committed = false
    get().mutateActive((session) => {
      const changes = uniqueTargets.flatMap((target) => {
        const owner = layerStyleOwnerForTarget(session.document, target)
        if (!owner || layerStylesEqual(owner.layerStyles, styles)) return []
        return [{ owner, before: cloneLayerStyles(owner.layerStyles), after: cloneLayerStyles(styles) }]
      })
      if (changes.length === 0) return
      for (const change of changes) assignLayerStyles(change.owner, change.after)
      const label = action === 'paste'
        ? tr('workspace.history.pasteLayerStyles')
        : action === 'clear'
          ? tr('workspace.history.clearLayerStyles')
          : tr('workspace.history.layerStyles')
      session.history.push({
        label,
        bytes: changes.reduce((bytes, change) => bytes + layerStylesHistoryBytes(change.before) + layerStylesHistoryBytes(change.after), 0),
        undo: () => { for (const change of changes) assignLayerStyles(change.owner, change.before) },
        redo: () => { for (const change of changes) assignLayerStyles(change.owner, change.after) },
        contentChanged: true,
        requiresAnimationSync: false,
        invalidation: { kind: 'full' }
      })
      committed = true
    }, 'content')
    return committed
  },

  setLayerStylesEnabled(targets, enabled) {
    const current = activeSession(get())
    if (!current) return false
    const uniqueTargets = uniqueLayerStyleTargets(current.document, targets)
    const hasChanges = uniqueTargets.some((target) => {
      const owner = layerStyleOwnerForTarget(current.document, target)
      const styles = cloneLayerStyles(owner?.layerStyles)
      return Boolean(styles && hasConfiguredLayerStyles(styles) && styles.enabled !== enabled)
    })
    if (!hasChanges) return false
    let committed = false
    get().mutateActive((session) => {
      const changes = uniqueTargets.flatMap((target) => {
        const owner = layerStyleOwnerForTarget(session.document, target)
        const before = cloneLayerStyles(owner?.layerStyles)
        if (!owner || !before || !hasConfiguredLayerStyles(before) || before.enabled === enabled) return []
        return [{ owner, before, after: { ...before, enabled } }]
      })
      if (changes.length === 0) return
      for (const change of changes) assignLayerStyles(change.owner, change.after)
      session.history.push({
        label: tr('workspace.history.layerStyles'),
        bytes: changes.reduce((bytes, change) => bytes + layerStylesHistoryBytes(change.before) + layerStylesHistoryBytes(change.after), 0),
        undo: () => { for (const change of changes) assignLayerStyles(change.owner, change.before) },
        redo: () => { for (const change of changes) assignLayerStyles(change.owner, change.after) },
        contentChanged: true,
        requiresAnimationSync: false,
        invalidation: { kind: 'full' }
      })
      committed = true
    }, 'content')
    return committed
  },

  copyLayerStyles(ownerKind, ownerId) {
    const session = activeSession(get())
    if (!session) return false
    const owner = layerStyleOwnerForTarget(session.document, { kind: ownerKind, id: ownerId })
    const styles = cloneLayerStyles(owner?.layerStyles)
    if (!styles) return false
    set({ layerStyleClipboard: styles })
    return true
  },

  pasteLayerStyles(targets) {
    const styles = cloneLayerStyles(get().layerStyleClipboard ?? undefined)
    return styles ? get().setLayerStylesForTargets(targets, styles, 'paste') : false
  },

  clearLayerStyles(targets) {
    return get().setLayerStylesForTargets(targets, undefined, 'clear')
  },
  splitLayerStyles(layerId) {
    get().commitFloatingPaste()
    get().mutateActive((session) => {
      const beforeSelection = captureAnimationSelectionHistory(session)
      const entry = splitLayerStylesCommand(session.document, layerId)
      if (entry) session.history.push(historyEntryWithAnimationSelection(session, entry, beforeSelection, captureAnimationSelectionHistory(session)))
    }, true, true)
  },
  applyActiveLayerAdjustment(adjustment) {
    get().mutateActive((session) => {
      const labels: Record<ColorAdjustment['kind'], string> = {
        'color-balance': tr('adjustment.title.colorBalance'), 'brightness-contrast': tr('adjustment.title.brightnessContrast'), 'hue-saturation': tr('adjustment.title.hueSaturation'), curves: tr('adjustment.title.curves')
      }
      const targetIds = distinctLinkedLayerTargets(session.document, session.selection
        ? [getActiveLayer(session.document).id]
        : session.selectedLayerIds.length > 0 ? session.selectedLayerIds : [session.document.activeLayerId])
      session.history.beginCompound()
      for (const layerId of targetIds) {
        const layer = session.document.layers.find((candidate) => candidate.id === layerId)
        if (!layer || layer.kind || isLayerEffectivelyLocked(session.document, layer)) continue
        const edit = applyColorAdjustment(session.document, layer, adjustment, session.selection)
        const entry = commitPixelEdit(session.document, edit, labels[adjustment.kind])
        if (entry) session.history.push(entry)
      }
      session.history.endCompound(labels[adjustment.kind])
    })
  },
  captureActiveLayerAdjustmentSnapshot() {
    const session = activeSession(get())
    return session ? captureAdjustmentSnapshot(session) : null
  },
  previewActiveLayerAdjustment(adjustment, baseline, selection, region) {
    get().mutateActive((session) => {
      prepareAdjustmentSnapshotTargets(session, baseline, Boolean(region))
      const targetSelection = selection === undefined ? session.selection : selection
      for (const layerSnapshot of baseline.layers) {
        const layer = session.document.layers.find((candidate) => candidate.id === layerSnapshot.layerId)
        if (!layer) continue
        if (!layer.kind && !isLayerEffectivelyLocked(session.document, layer)) applyColorAdjustmentDirect(session.document, layer, adjustment, targetSelection, layerSnapshot.pixels, region)
        else if (!region) restorePreparedAdjustmentSnapshotLayer(session, layerSnapshot)
      }
      shareLinkedLayerPreviewContents(session.document, baseline.layers.map((layer) => layer.layerId))
      if (region) markAdjustmentPreviewChanged(session, region)
      else {
        const fromRevision = session.contentRevision
        session.revision += 1
        session.contentRevision += 1
        session.contentInvalidation = { kind: 'full', fromRevision, revision: session.contentRevision }
      }
    }, false)
  },
  applyActiveLayerAdjustmentPreviewResult(baseline, result) {
    get().mutateActive((session) => {
      prepareAdjustmentSnapshotTargets(session, baseline, true)
      session.document.palette = result.palette.map((entry) => ({ ...entry, color: { ...entry.color } }))
      session.document.nextColorId = result.nextColorId
      let invalidation: SelectionRect | null = null
      const appliedLayerIds: string[] = []
      for (const layerResult of result.layers) {
        const layer = session.document.layers.find((candidate) => candidate.id === layerResult.layerId)
        if (!layer || layer.kind || isLayerEffectivelyLocked(session.document, layer)) continue
        if (!applyAdjustmentPreviewResultLayer(layer, layerResult, session.document.palette)) continue
        appliedLayerIds.push(layer.id)
      }
      if (appliedLayerIds.length === 0) return
      shareLinkedLayerPreviewContents(session.document, appliedLayerIds)
      for (const layerResult of result.layers) {
        const layer = session.document.layers.find((candidate) => candidate.id === layerResult.layerId)
        if (!layer || !appliedLayerIds.includes(layer.id)) continue
        const sourceRect = { x: layerResult.x, y: layerResult.y, width: layerResult.width, height: layerResult.height }
        for (const rect of adjustmentLinkedInvalidationRects(session.document, layer, sourceRect)) {
          invalidation = invalidation ? mergeSelectionRects(invalidation, rect) : rect
        }
      }
      if (!invalidation) return
      markAdjustmentPreviewChanged(session, invalidation)
    }, false)
  },
  restoreActiveDocumentSnapshot(snapshot, regions) {
    get().mutateActive((session) => {
      if (regions && regions.length > 0) {
        const restored = restoreAdjustmentSnapshotRegions(session, snapshot, regions)
        shareLinkedLayerPreviewContents(session.document, snapshot.layers.map((layer) => layer.layerId))
        if (restored === null) {
          const fromRevision = session.contentRevision
          session.revision += 1
          session.contentRevision += 1
          session.contentInvalidation = { kind: 'full', fromRevision, revision: session.contentRevision }
          return
        }
        let invalidation: SelectionRect | null = null
        for (const restoredLayer of restored) {
          const layer = session.document.layers.find((candidate) => candidate.id === restoredLayer.layerId)
          if (!layer) continue
          for (const rect of adjustmentLinkedInvalidationRects(session.document, layer, restoredLayer.rect)) {
            invalidation = invalidation ? mergeSelectionRects(invalidation, rect) : rect
          }
        }
        if (invalidation) markAdjustmentPreviewChanged(session, invalidation)
        return
      }
      restoreAdjustmentSnapshot(session, snapshot)
      shareLinkedLayerPreviewContents(session.document, snapshot.layers.map((layer) => layer.layerId))
      const fromRevision = session.contentRevision
      session.revision += 1
      session.contentRevision += 1
      session.contentInvalidation = { kind: 'full', fromRevision, revision: session.contentRevision }
    }, false)
  },
  applyActiveLayerAdjustmentFromSnapshot(adjustment, baseline, previewResult) {
    get().mutateActive((session) => {
      const before = baseline
      const reusePreview = Boolean(previewResult && !isColorAdjustmentIdentity(adjustment) && adjustmentPreviewResultCoversTargets(session, before, previewResult))
      const invalidationRect = adjustmentSnapshotInvalidationRect(session, before)
      if (!reusePreview) {
        prepareAdjustmentSnapshotTargets(session, before)
        for (const layerSnapshot of before.layers) {
          const layer = session.document.layers.find((candidate) => candidate.id === layerSnapshot.layerId)
          if (!layer) continue
          if (!layer.kind && !isLayerEffectivelyLocked(session.document, layer)) applyColorAdjustmentDirect(session.document, layer, adjustment, session.selection, layerSnapshot.pixels)
          else restorePreparedAdjustmentSnapshotLayer(session, layerSnapshot)
        }
      } else if (previewResult) {
        session.document.palette = previewResult.palette.map((entry) => ({ ...entry, color: { ...entry.color } }))
        session.document.nextColorId = previewResult.nextColorId
      }
      shareLinkedLayerPreviewContents(session.document, before.layers.map((layer) => layer.layerId))
      const after = captureAdjustmentSnapshot(session, before.layers.map((layer) => layer.layerId))
      const affectedLayerIds = before.layers.map((layer) => layer.layerId)
      commitLinkedLayerAdjustmentContents(session.document, affectedLayerIds)
      const labels: Record<ColorAdjustment['kind'], string> = {
        'color-balance': tr('adjustment.title.colorBalance'), 'brightness-contrast': tr('adjustment.title.brightnessContrast'), 'hue-saturation': tr('adjustment.title.hueSaturation'), curves: tr('adjustment.title.curves')
      }
      session.history.push({
        label: labels[adjustment.kind],
        bytes: before.layers.reduce((bytes, layer) => bytes + layer.pixels.byteLength, 0) + after.layers.reduce((bytes, layer) => bytes + layer.pixels.byteLength, 0) + (before.palette.length + after.palette.length) * 24,
        undo: () => { restoreAdjustmentSnapshot(session, before); commitLinkedLayerAdjustmentContents(session.document, affectedLayerIds) },
        redo: () => { restoreAdjustmentSnapshot(session, after); commitLinkedLayerAdjustmentContents(session.document, affectedLayerIds) },
        invalidation: invalidationRect ? { kind: 'region', frameId: session.document.animation?.activeFrameId, rect: invalidationRect } : { kind: 'full' },
        affectedLayerIds
      })
      for (const layerId of affectedLayerIds) syncActiveAnimationLayer(session.document, layerId)
      if (reusePreview) {
        session.document.dirty = true
        session.document.updatedAt = new Date().toISOString()
        session.recoverySuppressed = false
      } else touch(session, true, invalidationRect ? { kind: 'region', frameId: session.document.animation?.activeFrameId, rect: invalidationRect } : { kind: 'full' })
      recordDocumentOperation(session)
    }, false)
  },

  deleteSelection() {
    const current = activeSession(get())
    if (current?.pendingPaste) { get().cancelFloatingPaste(); return }
    if (!current?.selection) return
    if (activePaintLayer(current).kind === 'free-tile' && current.freeTileMode === 'edit' && current.selectedFreeTileInstanceId) {
      get().mutateActive((session) => {
        deleteFreeTileSourceSelectionInSession(session)
      }, false)
      return
    }
    const mask = activeLayerMask(current)
    if (mask) {
      const edit = fillSelectionOrCanvas(current.document, mask, current.secondaryColor, current.selection)
      if (edit) get().commitPixelEdit(edit, tr('workspace.history.deleteSelection'))
      return
    }
    const operationProbe = window.__moonSpriteCanvasProbe
    const editStartedAt = operationProbe?.recordOperationStage ? performance.now() : 0
    const edit = clearSelection(current.document, current.selection, activePaintLayer(current))
    operationProbe?.recordOperationStage?.('selection-delete.build-edit', performance.now() - editStartedAt, {
      points: edit?.before.size ?? 0,
      runs: edit?.runs?.length ?? 0,
      densePixels: edit?.denseRegion?.count ?? 0,
      dirtyPixels: edit?.dirtyRect ? edit.dirtyRect.width * edit.dirtyRect.height : 0
    })
    if (!edit) return
    const commitStartedAt = operationProbe?.recordOperationStage ? performance.now() : 0
    get().commitPixelEdit(edit, tr('workspace.history.deleteSelection'))
    operationProbe?.recordOperationStage?.('selection-delete.commit-total', performance.now() - commitStartedAt)
  },

  fillForeground() {
    const current = activeSession(get())
    if (!current) return
    if (selectedGroupRows(current).length > 0) return
    if (current.pendingPaste) get().commitFloatingPaste()
    const session = activeSession(get())
    if (!session) return
    const layer = activePaintLayer(session)
    if (layer.kind === 'free-tile' && session.freeTileMode === 'edit' && session.selectedFreeTileInstanceId) {
      const target = activeFreeTileCelTarget(session.document)
      const instance = target?.layer.id === layer.id
        ? target.freeTiles.instances.find((candidate) => candidate.id === session.selectedFreeTileInstanceId) ?? null
        : null
      const source = target && instance ? freeTileSourceForInstance(target.sources, instance) : null
      const sourceLayer = source ? layer.freeTileSources?.find((candidate) => candidate.id === source.id) : null
      if (!target || !instance || !source || !sourceLayer || sourceLayer.locked === true || source.visible === false || instance.locked === true || instance.visible === false) return
      const bounds = freeTileInstanceBounds(instance, target.sources, target.surface.offsetX, target.surface.offsetY)
      const sourceEdit = createFreeTileSourceEditRaster(session.document, source, bounds, session.selection ? { x: session.selection.x, y: session.selection.y } : undefined, instance)
      if (!sourceEdit) return
      const selection = freeTileSelectionToEditRaster(sourceEdit, session.selection) ?? {
        x: sourceEdit.sourceOffset.x,
        y: sourceEdit.sourceOffset.y,
        width: sourceEdit.transformedSourceBounds.width,
        height: sourceEdit.transformedSourceBounds.height
      }
      const edit = fillSelectionOrCanvas(sourceEdit.document, sourceEdit.layer, session.primaryColor, selection)
      if (!edit) { set({ message: tr('workspace.fill.empty') }); return }
      commitFreeTileSourceEditInSession(
        session,
        source.id,
        sourceEdit.before,
        freeTileSourceSnapshotFromEditRaster(sourceEdit),
        session.selection ? tr('workspace.history.fillSelectionForeground') : tr('workspace.history.fillCanvasForeground')
      )
      return
    }
    if (!isLayerEffectivelyVisible(session.document, layer)) { set({ message: tr('workspace.fill.invisible') }); return }
    if (isLayerEffectivelyLocked(session.document, layer)) { set({ message: tr('workspace.fill.locked') }); return }
    const operationProbe = window.__moonSpriteCanvasProbe
    const editStartedAt = operationProbe?.recordOperationStage ? performance.now() : 0
    const edit = fillSelectionOrCanvas(session.document, layer, session.primaryColor, session.selection)
    operationProbe?.recordOperationStage?.('selection-fill.build-edit', performance.now() - editStartedAt, {
      points: edit?.before.size ?? 0,
      runs: edit?.runs?.length ?? 0,
      densePixels: edit?.denseRegion?.count ?? 0,
      dirtyPixels: edit?.dirtyRect ? edit.dirtyRect.width * edit.dirtyRect.height : 0
    })
    if (!edit) { set({ message: tr('workspace.fill.empty') }); return }
    const commitStartedAt = operationProbe?.recordOperationStage ? performance.now() : 0
    get().commitPixelEdit(edit, session.selection ? tr('workspace.history.fillSelectionForeground') : tr('workspace.history.fillCanvasForeground'))
    operationProbe?.recordOperationStage?.('selection-fill.commit-total', performance.now() - commitStartedAt)
  },

  outlineActiveSelection(settings) {
    const session = activeSession(get())
    if (!session) return false
    const layer = activePaintLayer(session)
    if (isLayerEffectivelyLocked(session.document, layer)) { set({ message: tr('workspace.clipboard.layerLocked') }); return false }
    try {
      const normalized = normalizeOutlineSettings(settings, session.primaryColor)!
      const edit = outlineSelection(session.document, layer, session.selection, normalized.color, normalized.thickness, normalized.position, normalized.directions, normalized.kernel, normalized.smartHue, normalized.smartHueDarkness, normalized.backgroundColor, normalized.followOpacity)
      if (!edit) { set({ message: tr('workspace.outline.noContent') }); return false }
      session.document.outlineSettings = cloneOutlineSettings(normalized)
      persistOutlineSettings(normalized)
      const historyLabel = normalized.position === 'inside'
        ? tr('workspace.history.outlineInside')
        : normalized.position === 'both'
          ? tr('workspace.history.outlineBoth')
          : tr('workspace.history.outlineOutside')
      const positionLabel = normalized.position === 'inside'
        ? tr('outline.inside')
        : normalized.position === 'both'
          ? tr('outline.both')
          : tr('outline.outside')
      get().commitPixelEdit(edit, historyLabel)
      set({ message: tr('workspace.outline.applied', { thickness: normalized.thickness, position: positionLabel }) })
      return true
    } catch (error) {
      set({ message: error instanceof Error ? error.message : tr('workspace.outline.applyError') })
      return false
    }
  },

  quickOutlineActiveSelection() {
    const session = activeSession(get())
    if (!session) return false
    const settings = savedOutlineSettingsForSession(session)
    // Quick outline follows geometry/direction preferences but always uses
    // the foreground color at the moment the shortcut is pressed.
    return get().outlineActiveSelection({ ...settings, color: { ...session.primaryColor }, smartHue: false })
  },

  outlineSelectionInside() {
    const session = activeSession(get())
    if (!session) return false
    if (!session.selection) { set({ message: tr('app.selection.required') }); return false }
    const settings = savedOutlineSettingsForSession(session)
    // The S command is deliberately a one-shot inside stroke; it does not
    // change the user's saved Shift+O position preference.
    const insideSettings = {
      ...settings,
      position: 'inside' as const,
      color: { ...session.primaryColor },
      smartHue: false
    }
    const layer = activePaintLayer(session)
    if (isLayerEffectivelyLocked(session.document, layer)) { set({ message: tr('workspace.clipboard.layerLocked') }); return false }
    try {
      const edit = outlineSelectionBoundary(session.document, layer, session.selection, insideSettings.color, insideSettings.thickness, insideSettings.directions, insideSettings.kernel, insideSettings.smartHue, insideSettings.smartHueDarkness, insideSettings.followOpacity)
      if (!edit) { set({ message: tr('workspace.outline.noContent') }); return false }
      get().commitPixelEdit(edit, tr('workspace.history.outlineInside'))
      set({ message: tr('workspace.outline.applied', { thickness: insideSettings.thickness, position: tr('outline.inside') }) })
      return true
    } catch (error) {
      set({ message: error instanceof Error ? error.message : tr('workspace.outline.applyError') })
      return false
    }
  },

  antiAliasSelection(color, autoColorOpacity, includeInteriorColors, colorSource) {
    const session = activeSession(get())
    if (!session) return false
    const layer = activePaintLayer(session)
    if (isLayerEffectivelyLocked(session.document, layer)) { set({ message: tr('workspace.clipboard.layerLocked') }); return false }
    const edit = antiAliasSelection(session.document, layer, session.selection, color, autoColorOpacity, includeInteriorColors, colorSource)
    if (!edit) { set({ message: tr('workspace.outline.noContent') }); return false }
    get().commitPixelEdit(edit, tr('workspace.history.antiAlias'))
    return true
  },

  previewAntiAliasSelection(color, autoColorOpacity, includeInteriorColors, colorSource, previous = null) {
    const state = get()
    const changedSessions = new Set<DocumentSession>()
    if (previous) {
      const previousSession = state.sessions.find((candidate) => candidate.document.id === previous.documentId)
      if (previousSession) {
        restoreAntiAliasPreviewState(previousSession, previous)
        invalidateAntiAliasPreview(previousSession)
        changedSessions.add(previousSession)
      }
    }
    const session = activeSession(state)
    if (!session) {
      if (changedSessions.size > 0) set({ sessions: [...state.sessions] })
      return null
    }
    const layer = activePaintLayer(session)
    if (isLayerEffectivelyLocked(session.document, layer)) {
      if (changedSessions.size > 0) set({ sessions: [...state.sessions] })
      return null
    }
    const edit = antiAliasSelection(session.document, layer, session.selection, color, autoColorOpacity, includeInteriorColors, colorSource)
    if (!edit) {
      if (changedSessions.size > 0) set({ sessions: [...state.sessions] })
      return null
    }
    syncActiveAnimationFrame(session.document)
    invalidateAntiAliasPreview(session)
    changedSessions.add(session)
    set({ sessions: [...state.sessions] })
    return { documentId: session.document.id, edit }
  },

  restoreAntiAliasPreview(preview) {
    if (!preview) return
    const state = get()
    const session = state.sessions.find((candidate) => candidate.document.id === preview.documentId)
    if (!session) return
    restoreAntiAliasPreviewState(session, preview)
    invalidateAntiAliasPreview(session)
    set({ sessions: [...state.sessions] })
  },

  copyActiveLayerToClipboard() {
    get().copySelectedLayersToClipboard()
  },

  copySelectedLayersToClipboard() {
    get().commitFloatingPaste()
    const session = activeSession(get())
    if (!session) return
    const document = session.document
    syncActiveAnimationFrame(document)
    const selectedGroupIdSet = new Set<string>()
    for (const groupId of selectedGroupRows(session)) {
      selectedGroupIdSet.add(groupId)
      for (const descendantId of getDescendantGroupIds(document, groupId)) selectedGroupIdSet.add(descendantId)
    }
    const selectedLayerIdSet = new Set(selectedDirectLayerRows(session))
    for (const groupId of selectedGroupIdSet) for (const layerId of getLayerIdsInGroup(document, groupId)) selectedLayerIdSet.add(layerId)
    const layers = document.layers.filter((layer) => selectedLayerIdSet.has(layer.id))
    if (layers.length === 0) {
      set({ message: tr('workspace.copy.layerRequired') })
      return
    }
    const layerClipboards = layers.map((layer) => layerClipboardFromDocument(document, layer, layer.groupId && selectedGroupIdSet.has(layer.groupId) ? layer.groupId : null))
    const referencedTilesetIds = new Set([
      ...layerClipboards.flatMap((layer) => layer.tilemapTilesetId ? [layer.tilemapTilesetId] : []),
      ...layerClipboards.flatMap((layer) => layer.freeTileSources?.map((source) => source.tilesetId) ?? []),
      ...layerClipboards.flatMap((layer) => layer.animationCels ?? [])
        .flatMap((cel) => cel.tilemap?.cells ?? [])
        .flatMap((cell) => cell ? [cell.tilesetId] : [])
    ])
    const clipboard: LayerCollectionClipboard = {
      sourceDocumentId: document.id,
      animationFrames: ensureAnimationDocument(document).frames.map((frame) => ({ duration: frame.duration })),
      tilesets: (document.tilesets ?? []).filter((tileset) => referencedTilesetIds.has(tileset.id)).map((tileset) => ({ ...tileset, tileIds: [...tileset.tileIds], tileSlots: tileset.tileSlots ? [...tileset.tileSlots] : undefined, pixels: tileset.pixels.slice() })),
      layers: layerClipboards,
      groups: document.groups.filter((group) => selectedGroupIdSet.has(group.id)).map((group) => ({
        key: group.id,
        name: group.name,
        visible: group.visible,
        locked: group.locked,
        opacity: group.opacity,
        blendMode: group.blendMode,
        clippingMask: group.clippingMask === true,
        layerStyles: cloneLayerStyles(group.layerStyles),
        cumulativeBlend: group.cumulativeBlend === true,
        displayColor: group.displayColor ? { ...group.displayColor } : undefined,
        description: group.description ?? '',
        parentKey: group.parentGroupId ?? null,
        collapsed: session.collapsedGroupIds.includes(group.id)
      }))
    }
    clipboardService.setLayers(clipboard)
    if (typeof window.moonSprite.readClipboardImage === 'function') {
      clipboardService.captureLayerCopySystemBaseline(() => window.moonSprite.readClipboardImage())
    }
    if (typeof window.moonSprite.readClipboardImageSize === 'function') {
      clipboardService.captureLayerCopySystemBaselineSize(() => window.moonSprite.readClipboardImageSize())
    }
    set({ message: clipboard.groups.length > 0 ? tr('workspace.copy.group', { name: clipboard.groups[0].name, count: layers.length }) : layers.length === 1 ? tr('workspace.copy.layer', { name: layers[0].name }) : tr('workspace.copy.layers', { count: layers.length }) })
  },

  pasteLayerFromClipboard() {
    return get().pasteLayersFromClipboard()
  },

  pasteLayersFromClipboard() {
    const clipboard = clipboardService.getLayers()
    const current = activeSession(get())
    if (!clipboard || clipboard.layers.length === 0 || !current) return false
    get().mutateActive((session) => {
      const document = session.document
      const timeline = ensureAnimationDocument(document)
      syncActiveAnimationFrame(document)
      const tilesetIdMap = new Map<string, string>()
      const freeTileSourceIdMaps = new Map<string, Map<string, string>>()
      const pastedFreeTileSetIds = new Map<string, string>()
      const pastedFreeTileSourceIds = new Map<string, Map<string, string>>()
      const pastedFreeTileSources = new Map<string, FreeTileSourceLayer[]>()
      const pastedTilesets: Tileset[] = []
      for (const source of clipboard.tilesets ?? []) {
        const id = createId('tileset')
        tilesetIdMap.set(source.id, id)
        pastedTilesets.push({ ...source, id, name: `${source.name} ${tr('canvas.history.copySuffix')}`, tileIds: [...source.tileIds], tileSlots: source.tileSlots ? [...source.tileSlots] : undefined, pixels: source.pixels.slice() })
      }
      if (pastedTilesets.length > 0) document.tilesets = [...(document.tilesets ?? []), ...pastedTilesets]
      const clipboardFrameCount = Math.max(
        clipboard.animationFrames?.length ?? 0,
        ...clipboard.layers.flatMap((layer) => layer.animationCels?.map((cel) => cel.frameIndex + 1) ?? []),
        1
      )
      const appendedFrames = Array.from({ length: Math.max(0, clipboardFrameCount - timeline.frames.length) }, (_, index) => ({
        id: createId('frame'),
        duration: clipboard.animationFrames?.[timeline.frames.length + index]?.duration ?? 100
      }))
      if (appendedFrames.length > 0) {
        timeline.frames.push(...appendedFrames)
        ensureAnimationDocument(document)
      }
      const placement = selectedRowInsertionTarget(session)
      const targetGroupId = insertionTargetParent(document, placement)
      const groupIdByKey = new Map(clipboard.groups.map((group) => [group.key, createId('group')]))
      const resolveGroupParent = (parentKey?: string | null): string | null => {
        if (!parentKey) return targetGroupId
        const pastedParent = groupIdByKey.get(parentKey)
        if (pastedParent) return pastedParent
        return targetGroupId
      }
      const groups: LayerGroup[] = clipboard.groups.map((group) => {
        const id = groupIdByKey.get(group.key)!
        return {
        id,
        name: `${group.name} ${tr('canvas.history.copySuffix')}`,
        description: group.description ?? '',
        displayColor: group.displayColor ? { ...group.displayColor } : undefined,
        parentGroupId: resolveGroupParent(group.parentKey),
        visible: group.visible,
        locked: group.locked,
        opacity: group.opacity,
        blendMode: group.blendMode,
        clippingMask: group.clippingMask === true,
        layerStyles: cloneLayerStyles(group.layerStyles),
        cumulativeBlend: group.cumulativeBlend === true
      }})
      const sameSourceDocument = clipboard.sourceDocumentId === document.id
      const linkedContentIdMap = new Map<string, string>()
      const pastedLinkedContentId = (source: LayerClipboard): string | undefined => {
        if (!source.linkedContentId || source.kind || source.background) return undefined
        if (sameSourceDocument) return source.linkedContentId
        const existing = linkedContentIdMap.get(source.linkedContentId)
        if (existing) return existing
        const id = createId('layer-link')
        linkedContentIdMap.set(source.linkedContentId, id)
        return id
      }
      const allocateLinkedLayerName = createLinkedLayerNameAllocator(document)
      const layers = clipboard.layers.map((source, sourceIndex) => {
        const linkedContentId = pastedLinkedContentId(source)
        const name = linkedContentId
          ? allocateLinkedLayerName(linkedContentId, source.name)
          : `${source.name} ${tr('canvas.history.copySuffix')}`
        const layer = createLayer(name, source.width, source.height, document.colorMode)
        if (linkedContentId) layer.linkedContentId = linkedContentId
        layer.kind = source.kind
        if (source.kind === 'tilemap' && source.tilemapTilesetId) layer.tilemapTilesetId = tilesetIdMap.get(source.tilemapTilesetId)
        if (source.kind === 'free-tile' && source.freeTileSources) {
          const sourceSetKey = source.freeTileSetId ?? `clipboard-free-tile-set-${sourceIndex}`
          const freeTileSetId = pastedFreeTileSetIds.get(sourceSetKey) ?? createId('free-tile-set')
          pastedFreeTileSetIds.set(sourceSetKey, freeTileSetId)
          const sourceIdMap = pastedFreeTileSourceIds.get(sourceSetKey) ?? new Map<string, string>()
          pastedFreeTileSourceIds.set(sourceSetKey, sourceIdMap)
          let sharedSources = pastedFreeTileSources.get(sourceSetKey)
          if (!sharedSources) {
            sharedSources = source.freeTileSources.flatMap((sourceLayer) => {
              const tilesetId = tilesetIdMap.get(sourceLayer.tilesetId)
              if (!tilesetId) return []
              const sourceId = createId('free-tile-source')
              sourceIdMap.set(sourceLayer.id, sourceId)
              return [{ ...cloneFreeTileSourceLayer(sourceLayer), id: sourceId, tilesetId }]
            })
            pastedFreeTileSources.set(sourceSetKey, sharedSources)
          }
          layer.freeTileSetId = freeTileSetId
          layer.freeTileSources = sharedSources
          freeTileSourceIdMaps.set(layer.id, sourceIdMap)
          delete layer.freeTileTilesetId
        }
        layer.offsetX = source.offsetX
        layer.offsetY = source.offsetY
        layer.visible = source.visible
        layer.locked = source.locked
        layer.opacity = source.opacity
        layer.blendMode = source.blendMode
        if (source.clippingMask === true) layer.clippingMask = true
        assignLayerStyles(layer, source.layerStyles)
        if (source.background) layer.background = { ...source.background }
        layer.description = source.description ?? ''
        if (source.displayColor) layer.displayColor = { ...source.displayColor }
        layer.groupId = source.groupKey ? groupIdByKey.get(source.groupKey) ?? targetGroupId : targetGroupId
        if (layer.format === 'rgba') layer.pixels.set(document.colorMode === 'grayscale' ? applyRelativeLuminance(source.pixels.slice()) : source.pixels)
        else for (let index = 0; index < source.width * source.height; index += 1) {
          const offset = index * 4
          layer.pixels[index] = paletteColorIdForCanvas(document, { r: source.pixels[offset], g: source.pixels[offset + 1], b: source.pixels[offset + 2], a: source.pixels[offset + 3] })
        }
        return layer
      })
      for (const layer of layers) {
        const ownedTilesetIds = layer.kind === 'tilemap'
          ? layer.tilemapTilesetId ? [layer.tilemapTilesetId] : []
          : layer.kind === 'free-tile' ? (layer.freeTileSources ?? []).map((source) => source.tilesetId) : []
        for (const ownedTilesetId of ownedTilesetIds) {
          const tileset = pastedTilesets.find((candidate) => candidate.id === ownedTilesetId)
          const source = layer.freeTileSources?.find((candidate) => candidate.tilesetId === ownedTilesetId)
          const sharedTilemap = layer.kind === 'tilemap' && layers.filter((candidate) => candidate.kind === 'tilemap' && candidate.tilemapTilesetId === ownedTilesetId).length > 1
          if (tileset && !sharedTilemap) tileset.name = source?.name ?? layer.name
        }
      }
      const index = targetContainerTopIndex(document, targetGroupId)
      const previousActiveId = document.activeLayerId
      const previousSelection = [...session.selectedLayerIds]
      const previousGroupId = session.selectedGroupId
      const previousGroupIds = [...session.selectedGroupIds]
      const previousCollapsedGroupIds = [...session.collapsedGroupIds]
      document.groups.push(...groups)
      document.layers.splice(index, 0, ...layers)
      ensureAnimationDocument(document)
      layers.forEach((layer, layerIndex) => {
        for (const cel of clipboard.layers[layerIndex].animationCels ?? []) applyLayerClipboardAnimationCel(document, layer, cel, tilesetIdMap, freeTileSourceIdMaps.get(layer.id))
      })
      for (const frame of appendedFrames) {
        const frameIndex = timeline.frames.findIndex((candidate) => candidate.id === frame.id)
        const sourceFrameId = timeline.frames[frameIndex - 1]?.id
        if (sourceFrameId) inheritAnimationFrameCelLinks(document, sourceFrameId, frame.id)
      }
      const pastedIds = layers.map((layer) => layer.id)
      const pastedIdSet = new Set(pastedIds)
      const synchronizePastedLinkedLayers = (): void => {
        for (const linkedContentId of new Set(layers.flatMap((layer) => layer.linkedContentId ? [layer.linkedContentId] : []))) {
          const existing = sameSourceDocument
            ? document.layers.find((candidate) => candidate.linkedContentId === linkedContentId && !pastedIdSet.has(candidate.id))
            : null
          const preferred = existing ?? layers.find((candidate) => candidate.linkedContentId === linkedContentId)
          synchronizeLinkedLayerGroupContents(document, linkedContentId, preferred?.id)
        }
      }
      synchronizePastedLinkedLayers()
      refreshActiveAnimationFrame(document)
      const pastedGroupIds = new Set(groups.map((group) => group.id))
      const appendedFrameIds = new Set(appendedFrames.map((frame) => frame.id))
      const animationCels = ensureAnimationDocument(document).cels
        .filter((cel) => pastedIds.includes(cel.layerId) || appendedFrameIds.has(cel.frameId))
        .map(cloneAnimationCel)
      const animationLayerMasks = (ensureAnimationDocument(document).layerMasks ?? [])
        .filter((entry) => pastedIds.includes(entry.layerId) || appendedFrameIds.has(entry.frameId))
        .map((entry) => cloneAnimationLayerMask(entry))
      const pastedCollapsedGroupIds = clipboard.groups
        .filter((group) => group.collapsed)
        .map((group) => groupIdByKey.get(group.key)!)
      document.activeLayerId = layers.at(-1)!.id
      session.collapsedGroupIds = [...new Set([...previousCollapsedGroupIds, ...pastedCollapsedGroupIds])]
      applyLayerRowSelection(session, pastedIds, groups.map((group) => group.id), { kind: 'layer', id: layers.at(-1)!.id })
      session.history.beginCompound()
      session.history.push({
        label: layers.length === 1 && groups.length === 0 ? tr('workspace.history.pasteLayer') : tr('workspace.history.pasteCollection'),
        bytes: layers.reduce((sum, layer) => sum + layerHistoryBytes(layer), 0) + animationCels.reduce((sum, cel) => sum + (cel.surface?.pixels.byteLength ?? 0), 0) + animationLayerMasks.reduce((sum, entry) => sum + entry.mask.pixels.byteLength, 0) + pastedTilesets.reduce((sum, tileset) => sum + tilemapTilesetBytes(tileset), 0) + groups.reduce((sum, group) => sum + groupHistoryBytes(group), 0) + appendedFrames.length * 32,
        undo: () => {
          const currentTimeline = ensureAnimationDocument(document)
          currentTimeline.cels = currentTimeline.cels.filter((cel) => !pastedIds.includes(cel.layerId) && !appendedFrameIds.has(cel.frameId))
          currentTimeline.layerMasks = (currentTimeline.layerMasks ?? []).filter((entry) => !pastedIds.includes(entry.layerId) && !appendedFrameIds.has(entry.frameId))
          currentTimeline.frames = currentTimeline.frames.filter((frame) => !appendedFrameIds.has(frame.id))
          if (appendedFrameIds.has(currentTimeline.activeFrameId)) currentTimeline.activeFrameId = currentTimeline.frames[0].id
          document.layers = document.layers.filter((candidate) => !pastedIds.includes(candidate.id))
          document.groups = document.groups.filter((candidate) => !pastedGroupIds.has(candidate.id))
          if (pastedTilesets.length > 0) {
            const pastedTilesetIds = new Set(pastedTilesets.map((tileset) => tileset.id))
            document.tilesets = (document.tilesets ?? []).filter((tileset) => !pastedTilesetIds.has(tileset.id))
          }
          document.activeLayerId = previousActiveId
          session.selectedLayerIds = previousSelection
          session.selectedGroupId = previousGroupId
          session.selectedGroupIds = previousGroupIds
          session.collapsedGroupIds = previousCollapsedGroupIds
          refreshActiveAnimationFrame(document)
        },
        redo: () => {
          const currentTimeline = ensureAnimationDocument(document)
          for (const frame of appendedFrames) if (!currentTimeline.frames.some((candidate) => candidate.id === frame.id)) currentTimeline.frames.push({ ...frame })
          for (const group of groups) if (!document.groups.some((candidate) => candidate.id === group.id)) document.groups.push(group)
          for (const tileset of pastedTilesets) if (!document.tilesets?.some((candidate) => candidate.id === tileset.id)) document.tilesets = [...(document.tilesets ?? []), tileset]
          const missingLayers = layers.filter((layer) => !document.layers.some((candidate) => candidate.id === layer.id))
          if (missingLayers.length > 0) document.layers.splice(Math.min(index, document.layers.length), 0, ...missingLayers)
          restoreAnimationCels(document, animationCels)
          currentTimeline.layerMasks ??= []
          currentTimeline.layerMasks.push(...animationLayerMasks.filter((entry) => !currentTimeline.layerMasks!.some((candidate) => candidate.layerId === entry.layerId && candidate.frameId === entry.frameId)).map((entry) => cloneAnimationLayerMask(entry)))
          synchronizePastedLinkedLayers()
          document.activeLayerId = layers.at(-1)!.id
          session.collapsedGroupIds = [...new Set([...previousCollapsedGroupIds, ...pastedCollapsedGroupIds])]
          applyLayerRowSelection(session, pastedIds, groups.map((group) => group.id), { kind: 'layer', id: layers.at(-1)!.id })
        }
      })
      const createdGroupIds = new Set(groups.map((group) => group.id))
      const rootGroupIds = groups.filter((group) => !group.parentGroupId || !createdGroupIds.has(group.parentGroupId)).map((group) => group.id)
      const directLayerIds = layers.filter((layer) => !layer.groupId || !createdGroupIds.has(layer.groupId)).map((layer) => layer.id)
      const placementHistory = moveLayerPanelRowsOperation(session, directLayerIds, rootGroupIds, placement)
      if (placementHistory) session.history.push(placementHistory)
      session.history.endCompound(layers.length === 1 && groups.length === 0 ? tr('workspace.history.pasteLayer') : tr('workspace.history.pasteCollection'))
    })
    set({ message: clipboard.groups.length > 0 ? tr('workspace.clipboard.pastedLayer') : clipboard.layers.length === 1 ? tr('workspace.copy.layer', { name: clipboard.layers[0].name }) : tr('workspace.copy.layers', { count: clipboard.layers.length }) })
    if (clipboard.layers.some((layer) => layer.kind === 'free-tile')) requestTilesetPanelVisibility(true)
    return true
  },

  copySelection() {
    get().commitFloatingPaste()
    const session = activeSession(get())
    if (!session?.selection) { set({ message: tr('workspace.selectionRequired') }); return }
    const layer = getActiveLayer(session.document)
    const document = session.document
    const selection = clampSelection(document, session.selection)
    if (!selection) { set({ message: tr('workspace.clipboard.outside') }); return }
    const pixels = new Uint32Array(selection.width * selection.height)
    const mask = new Uint8Array(selection.width * selection.height)
    let copied = 0
    for (let y = 0; y < selection.height; y += 1) for (let x = 0; x < selection.width; x += 1) {
      if (!selectionContains(session.selection, selection.x + x, selection.y + y)) continue
        const color = readLayerColorAt(document, layer, selection.x + x, selection.y + y)
      if (color.a === 0) continue
      const clipboardIndex = y * selection.width + x
      pixels[clipboardIndex] = packColor(color)
      mask[clipboardIndex] = 1
      copied += 1
    }
    if (copied === 0) { clipboardService.clearSelection(); set({ message: tr('workspace.copyContent.empty') }); return }
    clipboardService.setSelection({ width: selection.width, height: selection.height, originX: selection.x, originY: selection.y, pixels, mask })
    // A selection copy is the active clipboard payload. Clear timeline
    // payloads so a later paste cannot be redirected to the old cel/frame.
    get().mutateActive((current) => clearAnimationClipboards(current), false)
    const clipboard = clipboardService.getSelection()
    if (!clipboard) return
    void window.moonSprite.writeClipboardImage(selectionClipboardImage(clipboard)).catch(() => {
      set({ message: tr('workspace.copyContent.internalOnly') })
    })
    set({ message: tr('workspace.copyContent.done', { count: copied }) })
  },

  cutSelection() {
    get().commitFloatingPaste()
    get().copySelection()
    get().deleteSelection()
  },

  async pasteClipboard() {
    if (isCanvasToolGestureLocked()) return
    const current = activeSession(get())
    const globalAnimationCells = clipboardService.getAnimationCells()
    const globalAnimationFrames = clipboardService.getAnimationFrames()
    const hasGlobalAnimationClipboard = Boolean(globalAnimationCells || globalAnimationFrames)
    const hasAnimationTarget = Boolean(current && (
      current.selectedAnimationMaskCellKeys.length
      || current.selectedAnimationCellKeys.length
      || current.selectedAnimationFrameIds.length
      // A newly opened document has a valid active layer/frame context even
      // though no timeline item is explicitly selected yet. Allow a global
      // animation payload to use that context as its paste target.
      || hasGlobalAnimationClipboard
    ))
    if (!current || (!hasAnimationTarget && !current.activeLayerMaskId && current.selectedLayerIds.length === 0 && current.selectedGroupIds.length === 0 && !current.selectedGroupId)) {
      set({ message: tr('workspace.clipboard.selectTarget') })
      return
    }
    // Probe the OS clipboard first. Internal payloads are only considered
    // when no newer external image is present, so a copy made in another app
    // cannot be shadowed by a stale layer/cel clipboard.
    const externalImage = await clipboardService.readSystemSelection(() => window.moonSprite.readClipboardImage())
    const active = activeSession(get())
    const hasAnimationClipboardTarget = Boolean(active && (
      active.selectedAnimationMaskCellKeys.length && active.animationMaskClipboard.length
      || active.selectedAnimationCellKeys.length && (active.animationCellClipboard.length || globalAnimationCells)
      || active.selectedAnimationFrameIds.length && (active.animationFrameClipboard.length || globalAnimationFrames)
      || !active.selectedAnimationMaskCellKeys.length && !active.selectedAnimationCellKeys.length && !active.selectedAnimationFrameIds.length && hasGlobalAnimationClipboard
    ))
    if (hasAnimationClipboardTarget && await clipboardService.preferInternalAnimation(externalImage)) {
      if (active!.selectedAnimationMaskCellKeys.length && active!.animationMaskClipboard.length) { get().pasteAnimationMasks(); return }
      if (active!.selectedAnimationCellKeys.length && (active!.animationCellClipboard.length || globalAnimationCells)) { get().pasteAnimationCels(); return }
      if (active!.selectedAnimationFrameIds.length && (active!.animationFrameClipboard.length || globalAnimationFrames)) { get().pasteAnimationFrames(); return }
      if (globalAnimationCells) { get().pasteAnimationCels(); return }
      if (globalAnimationFrames) { get().pasteAnimationFrames(); return }
    }
    if (clipboardService.getLayers() && await clipboardService.preferInternalLayers(externalImage)) {
      get().pasteLayersFromClipboard()
      return
    }
    if (externalImage) {
      await get().pasteSelection()
      return
    }
    const session = activeSession(get())
    if (!session) return
    if (session.selectedAnimationMaskCellKeys.length && session.animationMaskClipboard.length) { get().pasteAnimationMasks(); return }
    if (session.activeLayerMaskId) { await get().pasteSelection(); return }
    if (session.selectedAnimationCellKeys.length && (session.animationCellClipboard.length || globalAnimationCells)) { get().pasteAnimationCels(); return }
    if (session.selectedAnimationFrameIds.length && (session.animationFrameClipboard.length || globalAnimationFrames)) { get().pasteAnimationFrames(); return }
    if (globalAnimationCells) { get().pasteAnimationCels(); return }
    if (globalAnimationFrames) { get().pasteAnimationFrames(); return }
    if (clipboardService.getLayers()) { get().pasteLayersFromClipboard(); return }
    await get().pasteSelection()
  },

  async pasteSelection() {
    if (isCanvasToolGestureLocked()) return
    const targetSession = activeSession(get())
    if (!targetSession || !hasSelectedPaintTarget(targetSession)) {
      set({ message: tr('workspace.clipboard.selectTarget') })
      return
    }
    get().commitFloatingPaste()
    const clipboard = await clipboardService.readSelection(() => window.moonSprite.readClipboardImage())
    if (isCanvasToolGestureLocked()) return
    // A layer copy has no selection-image payload. Preserve the unified paste
    // entry point by falling back only after the live system image has been
    // checked, so external copies win over stale internal layer data.
    if (!clipboard && clipboardService.getLayers()) {
      get().pasteLayersFromClipboard()
      return
    }
    get().mutateActive((session) => {
      if (!clipboard) { set({ message: tr('workspace.clipboard.emptyPixels') }); return }
      const document = session.document
      const layer = activePaintLayer(session)
      if (layer.kind && layer.kind !== 'free-tile') { set({ message: tr('workspace.animation.incompatibleCel') }); return }
      if (isLayerEffectivelyLocked(document, layer)) { set({ message: tr('workspace.clipboard.layerLocked') }); return }
      // Keep the entire clipboard image, even when it is larger than the
      // document. The floating selection can then be moved until any part of
      // it reaches the canvas instead of losing off-canvas pixels on paste.
      const { x, y } = resolveClipboardPlacement({
        width: clipboard.width,
        height: clipboard.height,
        originX: clipboard.originX,
        originY: clipboard.originY,
        documentWidth: document.width,
        documentHeight: document.height,
        viewportWidth: session.viewportSize.width || document.width * session.view.zoom,
        viewportHeight: session.viewportSize.height || document.height * session.view.zoom,
        view: session.view,
        rotationIndicatorPosition: loadEditorPreferences().rotationIndicatorPosition
      })
      const width = clipboard.width
      const height = clipboard.height
      if (layer.kind === 'free-tile') {
        const target = activeFreeTileCelTarget(document)
        const selectedInstance = target && session.selectedFreeTileInstanceId
          ? target.freeTiles.instances.find((instance) => instance.id === session.selectedFreeTileInstanceId) ?? null
          : null
        if (target && selectedInstance) {
          const result = pasteSelectionClipboardIntoSelectedFreeTileInstance(session, target, selectedInstance, clipboard, x, y)
          if (result.status === 'unavailable') set({ message: tr('workspace.clipboard.freeTileInstanceUnavailable') })
          else if (result.status === 'too-large') set({ message: tr('workspace.clipboard.freeTileSourceTooLarge') })
          else if (result.status === 'outside') set({ message: tr('workspace.clipboard.outside') })
          else set({ message: tr('workspace.clipboard.pastedFreeTileSource', { count: result.pixelCount }) })
          if (result.status === 'pasted') requestTilesetPanelVisibility(true)
          return
        }
        const pasted = target ? pasteSelectionClipboardIntoFreeTile(session, target, clipboard, x, y) : null
        if (!pasted) { set({ message: tr('workspace.clipboard.outside') }); return }
        set({ message: tr('workspace.clipboard.pastedFreeTiles', { count: pasted.pixelCount }) })
        requestTilesetPanelVisibility(true)
        return
      }
      const beforeSelection = cloneSelectionMask(session.selection)
      const beforeSelectionPivot = session.selectionPivot ? { ...session.selectionPivot } : null
      const pastedMask = clipboard.mask
      const convertsRgbaValues = layer.format === 'rgba' && (isLayerMask(layer) || document.colorMode === 'grayscale')
      const values = layer.format === 'rgba'
        ? convertsRgbaValues ? clipboard.pixels.slice() : clipboard.pixels
        : new Uint32Array(width * height)
      if (convertsRgbaValues) {
        for (let offset = 0; offset < values.length; offset += 1) {
          const color = unpackColor(values[offset])
          values[offset] = packColor(relativeLuminanceColor(color))
        }
      }
      let pasted = 0
      if (layer.format === 'rgba') {
        if (pastedMask) for (const selected of pastedMask) pasted += selected
        else pasted = width * height
      } else {
        for (let offset = 0; offset < width * height; offset += 1) {
          if (pastedMask && pastedMask[offset] !== 1) continue
          values[offset] = paletteColorIdForCanvas(document, unpackColor(clipboard.pixels[offset]))
          pasted += 1
        }
      }
      if (pasted === 0) { set({ message: tr('workspace.clipboard.outside') }); return }
      // Keep the visible selection rectangular while the source mask prevents
      // transparent clipboard pixels from touching the destination.
      const sourceSelection: SelectionMask = !pastedMask || pasted === width * height
        ? { x, y, width, height }
        : { x, y, width, height, mask: pastedMask }
      const target = rectangularSelection(sourceSelection)
      const source: SelectionTransformSource = {
        selection: cloneSelectionMask(sourceSelection)!,
        values,
        // Floating copies use the visible destination fast path and retain the
        // full source arrays above. Avoid allocating huge JS offset arrays for
        // pasted images that extend beyond a small document.
        selectedOffsets: new Uint32Array(0),
        opaqueOffsets: new Uint32Array(0),
        opaqueIndices: new Uint32Array(0),
        opaqueValues: new Uint32Array(0),
        origin: 'clipboard'
      }
      const previewDeferred = width * height > DEFERRED_PASTE_AREA_THRESHOLD
      const edit = previewDeferred
        ? null
        : applySelectionTranslationCommit(document, source, target, true, layer) ?? beginPixelEdit(layer.id)
      session.selection = cloneSelectionMask(target)
      session.pendingPaste = { layerId: layer.id, beforeSelection, beforeSelectionPivot, source, target: cloneSelectionMask(target)!, transformTarget: { x: target.x, y: target.y, width: target.width, height: target.height }, transformAngle: 0, previewEdit: edit, translationPreview: null, previewDeferred, copy: true, label: tr('workspace.history.pasteToLayer') }
      session.selectionPivot = null
      // A paste remains floating until confirmed, so its first drag should move
      // the pasted pixels instead of beginning a new pencil stroke.
      session.tool = 'selection'
      if (previewDeferred) markFloatingOverlayChanged(session)
      else markFloatingPreviewChanged(session, target, target)
      set({ message: tr('workspace.clipboard.pastedPixels', { count: pasted }) })
    }, false)
  },

  async pasteAsNewLayer() {
    const systemSelection = await clipboardService.readSystemSelection(() => window.moonSprite.readClipboardImage())
    if (clipboardService.getLayers() && await clipboardService.preferInternalLayers(systemSelection)) return get().pasteLayersFromClipboard()
    const clipboard = await clipboardService.readSelection(() => window.moonSprite.readClipboardImage())
    const current = activeSession(get())
    if (!current) { set({ message: tr('workspace.clipboard.noContent') }); return false }
    if (!clipboard) {
      if (clipboardService.getLayers()) return get().pasteLayersFromClipboard()
      set({ message: tr('workspace.clipboard.noContent') })
      return false
    }
    get().mutateActive((session) => {
      const document = session.document
      const placement = resolveClipboardPlacement({
        width: clipboard.width,
        height: clipboard.height,
        originX: clipboard.originX,
        originY: clipboard.originY,
        documentWidth: document.width,
        documentHeight: document.height,
        viewportWidth: session.viewportSize.width || document.width * session.view.zoom,
        viewportHeight: session.viewportSize.height || document.height * session.view.zoom,
        view: session.view,
        rotationIndicatorPosition: loadEditorPreferences().rotationIndicatorPosition
      })
      const layer = createLayer(tr('layers.pasteLayer'), clipboard.width, clipboard.height, document.colorMode)
      layer.offsetX = placement.x
      layer.offsetY = placement.y
      for (let index = 0; index < clipboard.width * clipboard.height; index += 1) {
        if (clipboard.mask && clipboard.mask[index] !== 1) continue
        writeLayerColor(document, layer, index, unpackColor(clipboard.pixels[index]))
      }
      const insertionIndex = document.layers.length
      const previousActiveId = document.activeLayerId
      const previousSelection = [...session.selectedLayerIds]
      document.layers.push(layer)
      document.activeLayerId = layer.id
      session.selectedGroupId = null
      session.selectedGroupIds = []
      session.selectedLayerIds = [layer.id]
      session.layerSelectionAnchorId = layer.id
      session.history.push({
        label: tr('workspace.history.pasteAsLayer'),
        bytes: layer.pixels.byteLength + 64,
        undo: () => {
          document.layers = document.layers.filter((candidate) => candidate.id !== layer.id)
          document.activeLayerId = previousActiveId
          session.selectedLayerIds = previousSelection
        },
        redo: () => {
          if (!document.layers.some((candidate) => candidate.id === layer.id)) document.layers.splice(Math.min(insertionIndex, document.layers.length), 0, layer)
          document.activeLayerId = layer.id
          session.selectedLayerIds = [layer.id]
        }
      })
    })
    set({ message: tr('workspace.clipboard.pastedLayer') })
    return true
  },

  async pasteAsNewDocument() {
    const clipboard = await clipboardService.readSelection(() => window.moonSprite.readClipboardImage())
    if (!clipboard) { set({ message: tr('workspace.clipboard.noImage') }); return false }
    const document = createDocument(tr('document.pastedImage'), clipboard.width, clipboard.height, 'rgba')
    const layer = getActiveLayer(document)
    for (let index = 0; index < clipboard.width * clipboard.height; index += 1) {
      if (!clipboard.mask || clipboard.mask[index] === 1) writeLayerColor(document, layer, index, unpackColor(clipboard.pixels[index]))
    }
    document.dirty = true
    get().addSession(document)
    set({ message: tr('workspace.clipboard.pastedDocument') })
    return true
  },

  updateFloatingPastePreview(edit, target, translationPreview = null, transformTarget, transformAngle, transformShear, previewDeferred = false, layers, transformQuad) {
    get().mutateActive((session) => {
      if (!session.pendingPaste) return
      const previousTarget = session.pendingPaste.target
      clearFloatingSelectionBoxHistory(session.pendingPaste)
      if (layers) session.pendingPaste.layers = layers
      session.pendingPaste.previewEdit = edit
      session.pendingPaste.translationPreview = translationPreview
      session.pendingPaste.previewDeferred = session.pendingPaste.layers?.length ? false : previewDeferred
      session.pendingPaste.target = cloneSelectionMask(target)!
      if (transformTarget) session.pendingPaste.transformTarget = { ...transformTarget }
      else if ((session.pendingPaste.transformAngle ?? 0) % 360 === 0 && !session.pendingPaste.transformShear) {
        session.pendingPaste.transformTarget = { x: target.x, y: target.y, width: target.width, height: target.height }
      }
      if (transformAngle !== undefined) session.pendingPaste.transformAngle = transformAngle
      if (transformShear !== undefined) session.pendingPaste.transformShear = { ...transformShear }
      else if (transformAngle !== undefined) session.pendingPaste.transformShear = undefined
      if (transformQuad !== undefined) session.pendingPaste.transformQuad = cloneSelectionQuad(transformQuad) ?? undefined
      syncFloatingPrimaryLayerState(session.pendingPaste)
      session.selection = cloneSelectionMask(target)
      if (session.pendingPaste.previewDeferred) markFloatingOverlayChanged(session)
      else markFloatingPreviewChanged(session, previousTarget, target)
    }, false)
  },

  beginFloatingSelectionTransform(source, edit, before, target, copy, label, translationPreview = null, transformTarget, transformAngle = 0, transformShear, previewDeferred = false, tilemapEditCellIndex, layers, transformQuad) {
    get().mutateActive((session) => {
      const layer = layers?.[0] ?? null
      const activeLayer = activePaintLayer(session)
      session.pendingPaste = {
        layerId: layer?.layerId ?? activeLayer.id,
        ...(layers ? { layers } : {}),
        beforeSelection: cloneSelectionMask(before),
        beforeSelectionPivot: session.selectionPivot ? { ...session.selectionPivot } : null,
        source: layer?.source ?? source,
        target: cloneSelectionMask(target)!,
        transformTarget: transformTarget ? { ...transformTarget } : { x: target.x, y: target.y, width: target.width, height: target.height },
        transformAngle,
        transformShear: transformShear ? { ...transformShear } : undefined,
        transformQuad: cloneSelectionQuad(transformQuad) ?? undefined,
        previewEdit: layer?.previewEdit ?? edit,
        translationPreview: layer?.translationPreview ?? translationPreview,
        previewDeferred: layers?.length ? false : previewDeferred,
        tilemapEditCellIndex,
        copy,
        label
      }
      session.selection = cloneSelectionMask(target)
      if (session.pendingPaste.previewDeferred) markFloatingOverlayChanged(session)
      else markFloatingPreviewChanged(session, before, target)
    }, false)
  },

  beginFreeTileFloatingSelectionTransform(options) {
    get().mutateActive((session) => {
      const activeLayer = activePaintLayer(session)
      session.pendingPaste = {
        layerId: activeLayer.id,
        beforeSelection: cloneSelectionMask(options.before),
        beforeSelectionPivot: session.selectionPivot ? { ...session.selectionPivot } : null,
        source: options.source,
        target: cloneSelectionMask(options.target)!,
        transformTarget: options.transformTarget
          ? { ...options.transformTarget }
          : { x: options.target.x, y: options.target.y, width: options.target.width, height: options.target.height },
        transformAngle: options.transformAngle ?? 0,
        transformShear: options.transformShear ? { ...options.transformShear } : undefined,
        transformQuad: cloneSelectionQuad(options.transformQuad) ?? undefined,
        previewEdit: options.previewEdit,
        translationPreview: options.translationPreview ?? null,
        previewDeferred: false,
        copy: options.copy,
        label: options.label,
        freeTile: {
          sourceId: options.sourceId,
          instanceId: options.instanceId,
          edit: options.edit,
          selectionSource: cloneSelectionMask(options.selectionSource)!
        }
      }
      session.selection = cloneSelectionMask(options.target)
      markFloatingOverlayChanged(session)
    }, false)
  },

  commitFloatingPaste(deselectLabel) {
    const current = activeSession(get())
    if (!current?.pendingPaste) return
    get().mutateActive((session) => {
      const pending = session.pendingPaste
      if (!pending) return
      const beforeFreeTransformQuad = cloneSelectionQuad(session.freeTransformQuad)
      const afterFreeTransformQuad = session.freeTransformActive
        ? cloneSelectionQuad(pending.transformQuad)
          ?? selectionQuadFromRect(pending.transformTarget ?? pending.target)
        : null
      if (pending.freeTile) {
        const beforeSelection = cloneSelectionMask(pending.beforeSelection)
        const afterSelection = cloneSelectionMask(pending.target)
        const beforeSelectionPivot = pending.beforeSelectionPivot ? { ...pending.beforeSelectionPivot } : null
        const afterSelectionPivot = session.selectionPivot ? { ...session.selectionPivot } : null
        const freeTile = pending.freeTile
        session.pendingPaste = null
        if (session.freeTransformActive) session.freeTransformQuad = cloneSelectionQuad(afterFreeTransformQuad)
        commitFreeTileSourceEditInSession(
          session,
          freeTile.sourceId,
          freeTile.edit.before,
          freeTileSourceSnapshotFromEditRaster(freeTile.edit),
          pending.label,
          undefined,
          {
            before: beforeSelection,
            after: afterSelection,
            beforePivot: beforeSelectionPivot,
            afterPivot: afterSelectionPivot
          }
        )
        if (deselectLabel && afterSelection) {
          session.selection = null
          session.selectionPivot = null
          session.freeTransformActive = false
          session.freeTransformQuad = null
          session.history.push({
            label: deselectLabel,
            bytes: 48 + (afterSelection.mask?.byteLength ?? 0),
            undo: () => { session.selection = cloneSelectionMask(afterSelection); session.selectionPivot = afterSelectionPivot ? { ...afterSelectionPivot } : null; session.freeTransformActive = false; session.freeTransformQuad = cloneSelectionQuad(afterFreeTransformQuad) },
            redo: () => { session.selection = null; session.selectionPivot = null; session.freeTransformActive = false; session.freeTransformQuad = null },
            documentChanged: false,
            contentChanged: false,
            requiresAnimationSync: false
          })
        }
        return
      }
      if (pending.layers?.length) {
        const beforeAnimationSelection = captureAnimationSelectionHistory(session)
        const transformTarget = pending.transformTarget ?? { x: pending.target.x, y: pending.target.y, width: pending.target.width, height: pending.target.height }
        const simpleTranslation = (pending.transformAngle ?? 0) % 360 === 0
          && !pending.transformShear
          && !pending.transformQuad
          && transformTarget.width === pending.source.selection.width
          && transformTarget.height === pending.source.selection.height
          && !transformTarget.flipHorizontal
          && !transformTarget.flipVertical
        const entries: HistoryEntry[] = []
        for (const layerState of pending.layers) {
          const layer = selectionTransformLayerForState(session.document, layerState)
          if (!layer || layer.kind) continue
          const edit = pending.previewDeferred
            ? layerState.frameId
              ? applySelectionTransformLayerState(session.document, layerState, transformTarget, pending.transformAngle ?? 0, pending.copy, pending.transformShear, undefined, undefined, undefined, pending.transformQuad, session.selectionRotationAlgorithm === 'rotsprite')
              : simpleTranslation
              ? applySelectionTranslationCommit(session.document, layerState.source, transformTarget, pending.copy, layer, session.view.tileRepeatMode)
              : applySelectionTransform(session.document, layerState.source, transformTarget, pending.transformAngle ?? 0, pending.copy, pending.transformShear, undefined, undefined, layer, undefined, pending.transformQuad, false, session.selectionRotationAlgorithm === 'rotsprite')
            : layerState.previewEdit ?? (layerState.translationPreview ? selectionTranslationPreviewEdit(session.document, layerState.translationPreview) : null)
          const entry = edit ? commitPixelEdit(session.document, edit, pending.label) : null
          if (entry) entries.push(entry)
        }
        const beforeSelection = cloneSelectionMask(pending.beforeSelection)
        const tileRepeatMode = session.view.tileRepeatMode ?? 'off'
        const afterSelection = simpleTranslation && tileRepeatMode !== 'off'
          ? wrapSelectionMaskForTileRepeat(pending.target, session.document.width, session.document.height, tileRepeatMode) ?? cloneSelectionMask(pending.target)!
          : cloneSelectionMask(pending.target)!
        const beforeSelectionPivot = pending.beforeSelectionPivot ? { ...pending.beforeSelectionPivot } : null
        const selectionChanged = !selectionMasksEqual(beforeSelection, afterSelection)
        session.pendingPaste = null
        session.selection = deselectLabel ? null : cloneSelectionMask(afterSelection)
        if (session.freeTransformActive) session.freeTransformQuad = cloneSelectionQuad(afterFreeTransformQuad)
        else session.freeTransformQuad = null
        if (deselectLabel) session.selectionPivot = null
        if (deselectLabel) {
          session.freeTransformActive = false
          session.freeTransformQuad = null
        }
        const afterAnimationSelection = captureAnimationSelectionHistory(session)
        if (entries.length > 0) {
          const entry = combinedPixelHistoryEntry(
            session,
            entries,
            pending.label,
            beforeSelection,
            afterSelection,
            beforeSelectionPivot,
            null,
            beforeFreeTransformQuad,
            afterFreeTransformQuad
          )
          session.history.push(historyEntryWithAnimationSelection(session, entry, beforeAnimationSelection, afterAnimationSelection))
        } else if (selectionChanged) {
          const entry: HistoryEntry = {
            label: pending.label,
            bytes: 48 + (beforeSelection?.mask?.byteLength ?? 0) + (afterSelection.mask?.byteLength ?? 0),
            undo: () => {
              session.selection = cloneSelectionMask(beforeSelection)
              session.selectionPivot = beforeSelectionPivot ? { ...beforeSelectionPivot } : null
              session.freeTransformQuad = cloneSelectionQuad(beforeFreeTransformQuad)
            },
            redo: () => {
              session.selection = cloneSelectionMask(afterSelection)
              session.selectionPivot = null
              session.freeTransformQuad = cloneSelectionQuad(afterFreeTransformQuad)
            },
            documentChanged: false,
            contentChanged: false,
            requiresAnimationSync: false
          }
          session.history.push(historyEntryWithAnimationSelection(session, entry, beforeAnimationSelection, afterAnimationSelection))
        }
        if (deselectLabel) session.history.push({
          label: deselectLabel,
          bytes: 48 + (afterSelection.mask?.byteLength ?? 0),
          undo: () => { session.selection = cloneSelectionMask(afterSelection); session.selectionPivot = null; session.freeTransformActive = false; session.freeTransformQuad = cloneSelectionQuad(afterFreeTransformQuad) },
          redo: () => { session.selection = null; session.selectionPivot = null; session.freeTransformActive = false; session.freeTransformQuad = null },
          documentChanged: false,
          contentChanged: false,
          requiresAnimationSync: false
        })
        if (entries.length > 0) {
          for (const layerId of new Set(entries.flatMap((entry) => entry.affectedLayerIds ?? []))) syncActiveAnimationLayer(session.document, layerId)
          session.selectionGuidesPreservedAtContentRevision = session.contentRevision + 1
          touch(session, true, { kind: 'full' })
          recordDocumentOperation(session)
        }
        return
      }
      const activeLayer = session.document.layers.find((layer) => layer.id === pending.layerId)
      const transformTarget = pending.transformTarget ?? { x: pending.target.x, y: pending.target.y, width: pending.target.width, height: pending.target.height }
      const simpleTranslation = (pending.transformAngle ?? 0) % 360 === 0
        && !pending.transformShear
        && !pending.transformQuad
        && transformTarget.width === pending.source.selection.width
        && transformTarget.height === pending.source.selection.height
        && !transformTarget.flipHorizontal
        && !transformTarget.flipVertical
      const currentTilemapTarget = activeLayer?.kind === 'tilemap' ? activeTilemapCelTarget(session.document) : null
      const tilemapTarget = currentTilemapTarget?.layer.id === activeLayer?.id ? currentTilemapTarget : null
      const hybridCellTranslation = session.tilemapMode === 'hybrid'
        && pending.source.origin === 'selection'
        && !pending.sourceFlipHorizontal
        && !pending.sourceFlipVertical
        && simpleTranslation
        && tilemapTarget
        ? tilemapCellTranslationForSelection(
            tilemapTarget.tilemap,
            tilemapTarget.surface.offsetX,
            tilemapTarget.surface.offsetY,
            pending.source.selection,
            transformTarget
          )
        : null
      const edit = hybridCellTranslation
        ? null
        : pending.previewDeferred && activeLayer && (!activeLayer.kind || activeLayer.kind === 'tilemap')
          ? simpleTranslation
            ? applySelectionTranslationCommit(session.document, pending.source, transformTarget, pending.copy, activeLayer, session.view.tileRepeatMode)
            : applySelectionTransform(session.document, pending.source, transformTarget, pending.transformAngle ?? 0, pending.copy, pending.transformShear, undefined, undefined, activeLayer, undefined, pending.transformQuad, false, session.selectionRotationAlgorithm === 'rotsprite')
          : pending.previewEdit ?? (pending.translationPreview ? selectionTranslationPreviewEdit(session.document, pending.translationPreview) : null)
      const timeline = ensureAnimationDocument(session.document)
      const activeCel = activeLayer?.kind === 'text' ? timeline.cels.find((cel) => cel.layerId === activeLayer.id && cel.frameId === timeline.activeFrameId) : null
      const textSource = activeCel ? resolveAnimationCel(timeline, activeCel) ?? activeCel : null
      if (activeLayer?.kind === 'text' && textSource?.text) restoreFloatingPreview(session)
      const beforeText = textSource?.text ? cloneTextCelData(textSource.text) : null
      const beforeTextSurface = activeLayer?.kind === 'text' && textSource?.surface ? cloneAnimationCelSurface(textSource.surface) : null
      let tilemapPixelEdit: TilemapTilesetEdit | null = null
      if (activeLayer?.kind === 'tilemap' && session.tilemapMode !== 'paint') {
        if (hybridCellTranslation && tilemapTarget) {
          restoreFloatingPreview(session)
          tilemapPixelEdit = applyTilemapSelectionCellMove(
            session.document,
            tilemapTarget.layer.id,
            tilemapTarget.cel.frameId,
            pending.source.selection,
            hybridCellTranslation.columns,
            hybridCellTranslation.rows,
            pending.copy
          )
        } else if (edit) {
          const conversionMode: Exclude<TilemapDrawingMode, 'paint'> = session.tilemapMode
          tilemapPixelEdit = convertTilemapPixelEdit(
            session.document,
            edit,
            conversionMode,
            activeLayer.tilemapTilesetId ?? session.selectedTilesetId ?? '',
            () => createId('tile'),
            pending.tilemapEditCellIndex
          )
        }
      }
      const pixelEntry: HistoryEntry | null = tilemapPixelEdit && tilemapTilesetEditHasChanges(tilemapPixelEdit)
        ? {
            label: pending.label,
            bytes: tilemapTilesetEditBytes(tilemapPixelEdit),
            undo: () => { applyTilemapTilesetDocumentEdit(session.document, tilemapPixelEdit, 'before') },
            redo: () => { applyTilemapTilesetDocumentEdit(session.document, tilemapPixelEdit, 'after') },
            invalidation: { kind: 'full' },
            affectedLayerIds: [pending.layerId],
            contentChanged: true,
            requiresAnimationSync: false
          }
        : activeLayer?.kind ? null : edit ? commitPixelEdit(session.document, edit, pending.label) : null
      const selectedTileId = tilemapPixelEdit?.changedTileIds.at(-1)
      if (selectedTileId) {
        session.selectedTilesetId = tilemapPixelEdit!.tilesetId
        session.selectedTileId = selectedTileId
        session.secondaryTileId = session.document.tilesets?.find((tileset) => tileset.id === tilemapPixelEdit!.tilesetId)?.tileIds.includes(session.secondaryTileId ?? '')
          ? session.secondaryTileId
          : selectedTileId
      }
      const selectionSnapshot = (value: SelectionMask | null): SelectionMask | null => value ? { ...value } : null
      const beforeSelection = selectionSnapshot(pending.beforeSelection)
      const tileRepeatMode = session.view.tileRepeatMode ?? 'off'
      const visibleSelection = floatingPasteSelectionForCommit(session, pending)
      const afterSelection = simpleTranslation && tileRepeatMode !== 'off'
        ? wrapSelectionMaskForTileRepeat(visibleSelection, session.document.width, session.document.height, tileRepeatMode) ?? selectionSnapshot(visibleSelection)!
        : selectionSnapshot(visibleSelection)!
      const selectionGeometryChanged = beforeSelection?.x !== afterSelection.x || beforeSelection?.y !== afterSelection.y
        || beforeSelection?.width !== afterSelection.width || beforeSelection?.height !== afterSelection.height
      const sameMask = selectionGeometryChanged || beforeSelection?.mask === afterSelection.mask
        || (beforeSelection?.mask?.length === afterSelection.mask?.length && beforeSelection?.mask?.every((value, index) => value === afterSelection.mask?.[index]))
      const selectionChanged = selectionGeometryChanged || !sameMask
      session.pendingPaste = null
      session.selection = deselectLabel ? null : afterSelection
      if (session.freeTransformActive) session.freeTransformQuad = cloneSelectionQuad(afterFreeTransformQuad)
      else session.freeTransformQuad = null
      if (deselectLabel) session.selectionPivot = null
      if (deselectLabel) {
        session.freeTransformActive = false
        session.freeTransformQuad = null
      }
      let textHistory: { before: TextCelData; after: TextCelData; restore: (value: TextCelData) => void } | null = null
      if (activeLayer?.kind === 'text' && textSource?.text && (edit || selectionChanged)) {
        const sourceTarget = { x: pending.source.selection.x, y: pending.source.selection.y, width: pending.source.selection.width, height: pending.source.selection.height }
        const target = pending.transformTarget ?? { x: pending.target.x, y: pending.target.y, width: pending.target.width, height: pending.target.height }
        const sourceRect = { ...sourceTarget }
        const targetRect = { ...target }
        const nextText = cloneTextCelData(textSource.text)
        nextText.transforms = [...(nextText.transforms ?? []), {
          source: sourceRect,
          target: targetRect,
          angle: pending.transformAngle ?? 0,
          ...(pending.transformShear ? { shear: { ...pending.transformShear } } : {})
        }]
        const rendered = rasterizeText(nextText, nextText.originX ?? sourceRect.x, nextText.originY ?? sourceRect.y)
        const surface = convertTextSurface(rendered.rgba, session.document.colorMode, session.document.palette, (color) => paletteColorIdForCanvas(session.document, color))
        applyTextSurface(session.document, activeLayer, textSource, activeCel!, rendered.data, surface)
        refreshActiveAnimationFrame(session.document)
        const afterText = cloneTextCelData(nextText)
        const afterTextSurface = cloneAnimationCelSurface(surface)
        const restoreText = (value: TextCelData, restoredSurface: AnimationCelSurface): void => {
          applyTextSurface(session.document, activeLayer, textSource, activeCel!, value, cloneAnimationCelSurface(restoredSurface))
          refreshActiveAnimationFrame(session.document)
        }
        textHistory = {
          before: beforeText!,
          after: afterText,
          restore: (value) => restoreText(value, value === beforeText ? beforeTextSurface! : afterTextSurface)
        }
      }
      if (pixelEntry) session.history.push({
        ...pixelEntry,
        bytes: pixelEntry.bytes + (beforeSelection?.mask?.byteLength ?? 0) + (afterSelection?.mask?.byteLength ?? 0) + 64,
        undo: () => { pixelEntry.undo(); session.selection = selectionSnapshot(beforeSelection); session.selectionPivot = null; session.freeTransformQuad = cloneSelectionQuad(beforeFreeTransformQuad) },
        redo: () => { pixelEntry.redo(); session.selection = selectionSnapshot(afterSelection); session.selectionPivot = null; session.freeTransformQuad = cloneSelectionQuad(afterFreeTransformQuad) }
      })
      else if (selectionChanged || textHistory) session.history.push({
        label: pending.label,
        bytes: 48 + (beforeSelection?.mask?.byteLength ?? 0) + (afterSelection?.mask?.byteLength ?? 0),
        undo: () => { textHistory?.restore(textHistory.before); session.selection = selectionSnapshot(beforeSelection); session.selectionPivot = null; session.freeTransformQuad = cloneSelectionQuad(beforeFreeTransformQuad) },
        redo: () => { textHistory?.restore(textHistory.after); session.selection = selectionSnapshot(afterSelection); session.selectionPivot = null; session.freeTransformQuad = cloneSelectionQuad(afterFreeTransformQuad) }
      })
      if (deselectLabel) session.history.push({
        label: deselectLabel,
        bytes: 48 + (afterSelection.mask?.byteLength ?? 0),
        undo: () => { session.selection = selectionSnapshot(afterSelection); session.selectionPivot = null; session.freeTransformActive = false; session.freeTransformQuad = cloneSelectionQuad(afterFreeTransformQuad) },
        redo: () => { session.selection = null; session.selectionPivot = null; session.freeTransformActive = false; session.freeTransformQuad = null },
        documentChanged: false,
        contentChanged: false,
        requiresAnimationSync: false
      })
      if (pixelEntry) {
        if (activeLayer?.kind !== 'tilemap') syncActiveAnimationLayer(session.document, pending.layerId)
        if (!deselectLabel) session.selectionGuidesPreservedAtContentRevision = session.contentRevision + 1
        touch(session, true, pixelEntry.invalidation)
        recordDocumentOperation(session)
      } else if (textHistory) {
        if (!deselectLabel) session.selectionGuidesPreservedAtContentRevision = session.contentRevision + 1
        touch(session, true)
        recordDocumentOperation(session)
      }
    }, false)
  },

  cancelFloatingPaste() {
    const current = activeSession(get())
    if (!current?.pendingPaste) return
    get().mutateActive((session) => {
      const pending = session.pendingPaste
      if (!pending) return
      if (pending.freeTile) {
        const restored = applyFreeTileSourceSnapshot(session.document, pending.freeTile.edit.before)
        session.selection = cloneSelectionMask(pending.beforeSelection)
        session.selectionPivot = pending.beforeSelectionPivot ? { ...pending.beforeSelectionPivot } : null
        session.pendingPaste = null
        if (restored) {
          const fromRevision = session.contentRevision
          session.revision += 1
          session.contentRevision += 1
          session.layersPanelRevision += 1
          session.contentInvalidation = { kind: 'full', fromRevision, revision: session.contentRevision }
        } else markFloatingOverlayChanged(session)
        return
      }
      restoreFloatingPreview(session)
      session.selection = cloneSelectionMask(pending.beforeSelection)
      session.selectionPivot = pending.beforeSelectionPivot ? { ...pending.beforeSelectionPivot } : null
      session.pendingPaste = null
      if (pending.previewDeferred) markFloatingOverlayChanged(session)
      else markFloatingPreviewChanged(session, pending.target, pending.beforeSelection ?? pending.target)
    }, false)
  },

  moveActiveSelectionWithSelectionHistory(deltaX, deltaY, allowOutsideCanvas = false) {
    get().mutateActive((session) => {
      if (!session.selection) return
      const currentSelection = cloneSelectionMask(session.selection)!
      const requestedX = currentSelection.x + Math.trunc(deltaX)
      const requestedY = currentSelection.y + Math.trunc(deltaY)
      const nextX = allowOutsideCanvas
        ? requestedX
        : Math.max(0, Math.min(session.document.width - currentSelection.width, requestedX))
      const nextY = allowOutsideCanvas
        ? requestedY
        : Math.max(0, Math.min(session.document.height - currentSelection.height, requestedY))
      const actualX = nextX - currentSelection.x
      const actualY = nextY - currentSelection.y
      if (actualX === 0 && actualY === 0) return

      const pending = session.pendingPaste
      if (pending) {
        const pendingLayer = pending.layers?.length ? null : session.document.layers.find((candidate) => candidate.id === pending.layerId) ?? activePaintLayer(session)
        if (pendingLayer && isLayerEffectivelyLocked(session.document, pendingLayer)) return
        const clipboardSelectionBoxMoved = pending.source.origin === 'clipboard' && !selectionMasksEqual(currentSelection, pending.target)
        if (clipboardSelectionBoxMoved && !allowOutsideCanvas) {
          const nextSelection = { ...currentSelection, x: nextX, y: nextY }
          const beforePivot = cloneSelectionPivot(session.selectionPivot)
          const afterPivot = beforePivot ? { x: beforePivot.x + actualX, y: beforePivot.y + actualY } : null
          recordFloatingSelectionBoxMove(session, pending, currentSelection, nextSelection, beforePivot, afterPivot)
          if (pending.transformQuad) pending.transformQuad = translateSelectionQuad(pending.transformQuad, actualX, actualY) ?? undefined
          return
        }
        // Centering a floating clipboard paste must move its pixels along with
        // the selection box. A box-only move intentionally keeps the
        // materialized preview at its original target until the user begins a
        // content move; the centering command opts into the content path via
        // allowOutsideCanvas. Rebase the transform on the visible selection
        // before applying the requested centering delta so the old preview is
        // restored and cannot become a ghost at the paste origin.
        if (clipboardSelectionBoxMoved && allowOutsideCanvas) {
          restoreFloatingPreview(session)
          pending.target = cloneSelectionMask(currentSelection)!
          pending.transformTarget = { x: currentSelection.x, y: currentSelection.y, width: currentSelection.width, height: currentSelection.height }
          pending.transformAngle = 0
          pending.transformShear = undefined
          pending.transformQuad = undefined
          pending.previewEdit = null
          pending.translationPreview = null
          clearFloatingSelectionBoxHistory(pending)
        }
        clearFloatingSelectionBoxHistory(pending)
        const previousTarget = cloneSelectionMask(pending.target)!
        const angle = pending.transformAngle ?? 0
        const shear = pending.transformShear
        const transformTarget = pending.transformTarget ?? {
          x: pending.target.x,
          y: pending.target.y,
          width: pending.target.width,
          height: pending.target.height
        }
        const nextTransformTarget = { ...transformTarget, x: transformTarget.x + actualX, y: transformTarget.y + actualY }
        const nextTransformQuad = pending.transformQuad
          ? translateSelectionQuad(pending.transformQuad, actualX, actualY)
          : undefined
        if (pending.previewDeferred) {
          // Deferred previews are rendered by CanvasCompositeCache and must
          // never materialize pixels in the document. Centering a selection
          // while such a preview is active only advances its geometry; the
          // source canvas remains untouched until apply/commit.
          const nextSelection = nextTransformQuad
            ? transformSelectionMaskQuad(floatingSelectionGeometrySource(pending), nextTransformQuad, session.document.width, session.document.height, false, pending.source.sourceQuad)
            : transformSelectionMask(floatingSelectionGeometrySource(pending), nextTransformTarget, session.document.width, session.document.height, angle, shear, false)
          if (!nextSelection) return
          pending.target = cloneSelectionMask(nextSelection)!
          pending.transformTarget = nextTransformTarget
          pending.transformQuad = nextTransformQuad ?? undefined
          session.selection = cloneSelectionMask(nextSelection)
          if (session.selectionPivot) session.selectionPivot = { x: session.selectionPivot.x + actualX, y: session.selectionPivot.y + actualY }
          markFloatingOverlayChanged(session)
          return
        }
        if (pending.freeTile) {
          restoreFloatingPreview(session)
          const nextSelection = nextTransformQuad
            ? transformSelectionMaskQuad(
                pending.freeTile.selectionSource,
                nextTransformQuad,
                session.document.width,
                session.document.height,
                false,
                pending.source.sourceQuad
                  ? translateSelectionQuad(pending.source.sourceQuad, pending.freeTile.edit.origin.x, pending.freeTile.edit.origin.y) ?? undefined
                  : undefined
              )
            : transformSelectionMask(
                pending.freeTile.selectionSource,
                nextTransformTarget,
                session.document.width,
                session.document.height,
                angle,
                shear,
                false
              )
          if (!nextSelection) return
          const localTarget = freeTileTransformTargetToEditRaster(pending.freeTile.edit, nextTransformTarget)
          const simpleTranslation = angle % 360 === 0
            && !shear
            && !nextTransformQuad
            && nextTransformTarget.width === pending.source.selection.width
            && nextTransformTarget.height === pending.source.selection.height
            && !nextTransformTarget.flipHorizontal
            && !nextTransformTarget.flipVertical
          pending.previewEdit = null
          pending.translationPreview = simpleTranslation
            ? applySelectionTranslationPreview(
                pending.freeTile.edit.document,
                pending.source,
                localTarget,
                pending.copy,
                pending.translationPreview,
                pending.freeTile.edit.layer
              )
            : null
          if (!simpleTranslation) pending.previewEdit = applySelectionTransform(
            pending.freeTile.edit.document,
            pending.source,
            localTarget,
            angle,
            pending.copy,
            shear,
            undefined,
            undefined,
            pending.freeTile.edit.layer,
            undefined,
            nextTransformQuad
              ? {
                  nw: { x: nextTransformQuad.nw.x - pending.freeTile.edit.origin.x, y: nextTransformQuad.nw.y - pending.freeTile.edit.origin.y },
                  ne: { x: nextTransformQuad.ne.x - pending.freeTile.edit.origin.x, y: nextTransformQuad.ne.y - pending.freeTile.edit.origin.y },
                  se: { x: nextTransformQuad.se.x - pending.freeTile.edit.origin.x, y: nextTransformQuad.se.y - pending.freeTile.edit.origin.y },
                  sw: { x: nextTransformQuad.sw.x - pending.freeTile.edit.origin.x, y: nextTransformQuad.sw.y - pending.freeTile.edit.origin.y }
                }
              : undefined,
            false,
            session.selectionRotationAlgorithm === 'rotsprite'
          )
          pending.target = cloneSelectionMask(nextSelection)!
          pending.transformTarget = nextTransformTarget
          if (nextTransformQuad) pending.transformQuad = nextTransformQuad
          session.selection = cloneSelectionMask(nextSelection)
          if (session.selectionPivot) session.selectionPivot = { x: session.selectionPivot.x + actualX, y: session.selectionPivot.y + actualY }
          if (!previewFloatingFreeTileSource(session, pending)) markFloatingOverlayChanged(session)
          return
        }
        restoreFloatingPreview(session)
        const nextSelection = nextTransformQuad
          ? transformSelectionMaskQuad(floatingSelectionGeometrySource(pending), nextTransformQuad, session.document.width, session.document.height, false, pending.source.sourceQuad)
          : transformSelectionMask(floatingSelectionGeometrySource(pending), nextTransformTarget, session.document.width, session.document.height, angle, shear, false)
        if (!nextSelection) return
        const simpleTranslation = angle % 360 === 0
          && !shear
          && !nextTransformQuad
          && nextTransformTarget.width === pending.source.selection.width
          && nextTransformTarget.height === pending.source.selection.height
          && !nextTransformTarget.flipHorizontal
          && !nextTransformTarget.flipVertical
        if (pending.layers?.length) {
          for (const layerState of pending.layers) {
            layerState.previewEdit = null
            if (simpleTranslation && !layerState.frameId) {
              const layer = selectionTransformLayerForState(session.document, layerState)
              if (!layer || layer.kind) continue
              layerState.translationPreview = applySelectionTranslationPreview(session.document, layerState.source, nextTransformTarget, pending.copy, layerState.translationPreview, layer, undefined, session.view.tileRepeatMode)
            } else {
              layerState.translationPreview = null
              layerState.previewEdit = applySelectionTransformLayerState(session.document, layerState, nextTransformTarget, angle, pending.copy, shear, undefined, undefined, undefined, nextTransformQuad ?? undefined, session.selectionRotationAlgorithm === 'rotsprite')
            }
          }
          syncFloatingPrimaryLayerState(pending)
          pending.target = cloneSelectionMask(nextSelection)!
          pending.transformTarget = nextTransformTarget
          if (nextTransformQuad) pending.transformQuad = nextTransformQuad
          session.selection = cloneSelectionMask(nextSelection)
          if (session.selectionPivot) session.selectionPivot = { x: session.selectionPivot.x + actualX, y: session.selectionPivot.y + actualY }
          markFloatingPreviewChanged(session, previousTarget, nextSelection)
          return
        }
        const layer = pendingLayer ?? activePaintLayer(session)
        pending.previewEdit = null
        pending.translationPreview = simpleTranslation
          ? applySelectionTranslationPreview(session.document, pending.source, nextTransformTarget, pending.copy, pending.translationPreview, layer, tilemapEditClipForCell(session, pending.tilemapEditCellIndex), session.view.tileRepeatMode)
          : null
        if (!simpleTranslation) pending.previewEdit = applySelectionTransform(session.document, pending.source, nextTransformTarget, angle, pending.copy, shear, undefined, undefined, layer, undefined, nextTransformQuad ?? undefined, false, session.selectionRotationAlgorithm === 'rotsprite')
        pending.target = cloneSelectionMask(nextSelection)!
        pending.transformTarget = nextTransformTarget
        if (nextTransformQuad) pending.transformQuad = nextTransformQuad
        session.selection = cloneSelectionMask(nextSelection)
        if (session.selectionPivot) session.selectionPivot = { x: session.selectionPivot.x + actualX, y: session.selectionPivot.y + actualY }
        markFloatingPreviewChanged(session, previousTarget, nextSelection)
        return
      }

      const animationSelectionActive = session.selectedAnimationFrameIds.length > 0 || session.selectedAnimationCellKeys.length > 0
      if (animationSelectionActive) {
        const selectedLayers = selectedTransformLayersForSession(session)
        if (session.activeLayerMaskId || selectedLayers.length === 0 || selectedLayers.some((layer) => layer.kind
          || !isLayerEffectivelyVisible(session.document, layer)
          || isLayerEffectivelyLocked(session.document, layer))) return
        const layers = captureAnimationFrameSelectionTransformStates(
          session.document,
          session.selectedAnimationFrameIds,
          selectedLayers.map((layer) => layer.id),
          currentSelection,
          session.selectedAnimationCellKeys
        )
        if (layers.length === 0) return
        const nextSelection = { ...currentSelection, x: nextX, y: nextY }
        for (const layerState of layers) {
          layerState.previewEdit = applySelectionTransformLayerState(session.document, layerState, nextSelection)
        }
        const primary = layers[0]
        session.pendingPaste = {
          layerId: primary.layerId,
          layers,
          beforeSelection: cloneSelectionMask(currentSelection),
          beforeSelectionPivot: session.selectionPivot ? { ...session.selectionPivot } : null,
          source: primary.source,
          target: cloneSelectionMask(nextSelection)!,
          transformTarget: { x: nextSelection.x, y: nextSelection.y, width: nextSelection.width, height: nextSelection.height },
          transformAngle: 0,
          previewEdit: primary.previewEdit,
          translationPreview: null,
          copy: false,
          label: tr('workspace.history.moveSelectionContent')
        }
        session.selection = cloneSelectionMask(nextSelection)
        if (session.selectionPivot) session.selectionPivot = { x: session.selectionPivot.x + actualX, y: session.selectionPivot.y + actualY }
        markFloatingPreviewChanged(session, currentSelection, nextSelection)
        return
      }

      const selectedLayers = selectedTransformLayersForSession(session)
      const multipleLayers = selectedLayers.length > 1
      if (selectedLayers.length === 0 || (multipleLayers && selectedLayers.some((candidate) => candidate.kind))) return
      if (selectedLayers.some((candidate) => !isLayerEffectivelyVisible(session.document, candidate) || isLayerEffectivelyLocked(session.document, candidate))) return
      const layer = multipleLayers ? selectedLayers[0] : activePaintLayer(session)
      if (isLayerEffectivelyLocked(session.document, layer)) return
      const source = captureSelectionTransform(session.document, currentSelection, layer)
      if (!source) return
      const nextSelection = { ...currentSelection, x: nextX, y: nextY }
      const tilemapEditCellIndex = tilemapEditCellIndexForSelection(session, currentSelection)
      if (layer.kind === 'tilemap' && session.tilemapMode === 'edit' && tilemapEditCellIndex === undefined) return
      const translationPreview = applySelectionTranslationPreview(session.document, source, nextSelection, false, null, layer, tilemapEditClipForCell(session, tilemapEditCellIndex), session.view.tileRepeatMode)
      const layers = multipleLayers
        ? selectedLayers.map((candidate) => {
            const candidateSource = candidate.id === layer.id ? source : captureSelectionTransform(session.document, currentSelection, candidate)!
            const candidatePreview = candidate.id === layer.id
              ? translationPreview
              : applySelectionTranslationPreview(session.document, candidateSource, nextSelection, false, null, candidate, undefined, session.view.tileRepeatMode)
            return { layerId: candidate.id, source: candidateSource, previewEdit: null, translationPreview: candidatePreview }
          })
        : undefined
      session.pendingPaste = {
        layerId: layer.id,
        ...(layers ? { layers } : {}),
        beforeSelection: cloneSelectionMask(currentSelection),
        beforeSelectionPivot: session.selectionPivot ? { ...session.selectionPivot } : null,
        source,
        target: cloneSelectionMask(nextSelection)!,
        transformTarget: { x: nextSelection.x, y: nextSelection.y, width: nextSelection.width, height: nextSelection.height },
        transformAngle: 0,
        previewEdit: null,
        translationPreview,
        tilemapEditCellIndex,
        copy: false,
        label: tr('workspace.history.moveSelectionContent')
      }
      session.selection = cloneSelectionMask(nextSelection)
      if (session.selectionPivot) session.selectionPivot = { x: session.selectionPivot.x + actualX, y: session.selectionPivot.y + actualY }
      markFloatingPreviewChanged(session, currentSelection, nextSelection)
    }, false)
  },

  flipActiveSelection(axis) {
    get().mutateActive((session) => {
      if (session.pendingPaste) {
        const pending = session.pendingPaste
        clearFloatingSelectionBoxHistory(pending)
        const previousTarget = pending.target
        const previewDeferred = Boolean(pending.previewDeferred)
        if (previewDeferred) {
          // Deferred previews normally leave the document untouched. Also
          // clean up an already-materialized preview from an older runtime so
          // it cannot become part of the stable background after hot reload.
          if (pending.translationPreview) restoreSelectionTranslationPreview(session.document, pending.translationPreview)
          else if (pending.previewEdit) revertPixelEdit(session.document, pending.previewEdit)
        } else restoreFloatingPreview(session)
        // A flipped floating cel can change its visible bounds even when the
        // selection rectangle stays the same. Drop the source bounds used by
        // layer-style expansion before rebuilding the preview.
        for (const layerId of pending.layers?.map((state) => state.layerId) ?? [pending.layerId]) {
          const layer = session.document.layers.find((candidate) => candidate.id === layerId)
          if (layer) invalidateRasterContentBounds(layer)
        }
        if (pending.layers?.length) {
          for (const layerState of pending.layers) layerState.source = flipSelectionTransformSource(layerState.source, axis)
          syncFloatingPrimaryLayerState(pending)
        } else pending.source = flipSelectionTransformSource(pending.source, axis)
        if (axis === 'horizontal') pending.sourceFlipHorizontal = !pending.sourceFlipHorizontal
        else pending.sourceFlipVertical = !pending.sourceFlipVertical
        if (pending.freeTile) pending.freeTile.selectionSource = flipSelectionMask(pending.freeTile.selectionSource, axis)
        const transformTarget = pending.transformTarget ?? { x: pending.target.x, y: pending.target.y, width: pending.target.width, height: pending.target.height }
        const angle = pending.transformAngle ?? 0
        const shear = pending.transformShear
        const transformed = transformSelectionMask(floatingSelectionGeometrySource(pending), transformTarget, session.document.width, session.document.height, angle, shear, false)
        if (!transformed) return
        pending.target = transformed
        session.selection = cloneSelectionMask(transformed)
        pending.previewEdit = null
        pending.translationPreview = null
        pending.previewDeferred = previewDeferred
        if (previewDeferred) markFloatingOverlayChanged(session)
        else if (pending.layers?.length) {
          for (const layerState of pending.layers) {
            layerState.previewEdit = applySelectionTransformLayerState(session.document, layerState, transformTarget, angle, pending.copy, shear, undefined, undefined, undefined, undefined, session.selectionRotationAlgorithm === 'rotsprite')
            layerState.translationPreview = null
          }
          syncFloatingPrimaryLayerState(pending)
          markFloatingPreviewChanged(session, previousTarget, transformed)
        }
        else if (pending.freeTile) {
          pending.previewEdit = applySelectionTransform(
            pending.freeTile.edit.document,
            pending.source,
            freeTileTransformTargetToEditRaster(pending.freeTile.edit, transformTarget),
            angle,
            pending.copy,
            shear,
            undefined,
            undefined,
            pending.freeTile.edit.layer,
            undefined,
            undefined,
            false,
            session.selectionRotationAlgorithm === 'rotsprite'
          )
          if (!previewFloatingFreeTileSource(session, pending)) markFloatingOverlayChanged(session)
        }
        else {
          const preview = applySelectionTransform(session.document, pending.source, transformTarget, angle, pending.copy, shear, undefined, undefined, activePaintLayer(session), undefined, undefined, false, session.selectionRotationAlgorithm === 'rotsprite')
          if (preview) pending.previewEdit = preview
          markFloatingPreviewChanged(session, previousTarget, transformed)
        }
        return
      }
      const tilemapLayer = activePaintLayer(session)
      // A selected free-tile cel mirrors all of its frame-local instances.
      // Do this before the instance-only path so Shift+H/V on a timeline cel
      // persists in the cel data and cannot be lost on the next refresh.
      const timelineForFreeTiles = ensureAnimationDocument(session.document)
      const selectedFreeTileCelKeys = new Set(session.selectedAnimationCellKeys)
      if (session.selectedAnimationFrameIds.length > 0) {
        for (const cel of timelineForFreeTiles.cels) {
          if (session.selectedAnimationFrameIds.includes(cel.frameId)) selectedFreeTileCelKeys.add(animationCelKey(cel.layerId, cel.frameId))
        }
      }
      const freeTileCelEdits = timelineForFreeTiles.cels
        .filter((cel) => selectedFreeTileCelKeys.has(animationCelKey(cel.layerId, cel.frameId)) && session.document.layers.some((layer) => layer.id === cel.layerId && layer.kind === 'free-tile'))
        .map((cel) => {
          if (!cel.freeTiles) cel.freeTiles = createFreeTileCelData()
          const before = cloneFreeTileCelData(cel.freeTiles)
          const after = cloneFreeTileCelData(before)
          for (const instance of after.instances) {
            if (axis === 'horizontal') instance.flipHorizontal = instance.flipHorizontal !== true
            else instance.flipVertical = instance.flipVertical !== true
          }
          return { cel, before, after, edit: { layerId: cel.layerId, frameId: cel.frameId, before, after, dirtyRect: null } as FreeTilePlacementEdit }
        })
      if (!session.selection && freeTileCelEdits.length > 0) {
        const changed = freeTileCelEdits.filter(({ before, after }) => !freeTileCelDataEqual(before, after))
        if (changed.length > 0) {
          for (const entry of changed) applyFreeTilePlacementEdit(session.document, entry.edit, 'after')
          session.history.push({
            label: axis === 'horizontal' ? tr('workspace.history.flipSelectionHorizontal') : tr('workspace.history.flipSelectionVertical'),
            bytes: changed.reduce((total, entry) => total + (entry.before.instances.length + entry.after.instances.length) * 72, 0),
            undo: () => { for (const entry of changed) applyFreeTilePlacementEdit(session.document, entry.edit, 'before') },
            redo: () => { for (const entry of changed) applyFreeTilePlacementEdit(session.document, entry.edit, 'after') },
            invalidation: { kind: 'full' },
            affectedLayerIds: [...new Set(changed.map((entry) => entry.cel.layerId))],
            contentChanged: true,
            requiresAnimationSync: false
          })
          touch(session, true, { kind: 'full' })
          recordDocumentOperation(session)
        }
        return
      }
      // Shift+H/V also applies to selected free-tile instances. Keep the
      // operation on the instance metadata (rather than flipping the
      // rendered raster), otherwise the next canvas refresh restores the
      // pre-flip appearance.
      const freeTileInstanceIds = session.selectedFreeTileInstanceIds.length > 0
        ? session.selectedFreeTileInstanceIds
        : session.selectedFreeTileInstanceId ? [session.selectedFreeTileInstanceId] : []
      if (!session.selection && tilemapLayer.kind === 'free-tile' && freeTileInstanceIds.length > 0) {
        const target = activeFreeTileCelTarget(session.document)
        if (target) {
          const before = cloneFreeTileCelData(target.freeTiles)
          const selected = new Set(freeTileInstanceIds)
          const after = cloneFreeTileCelData(before)
          for (const instance of after.instances) {
            if (!selected.has(instance.id) || instance.locked === true) continue
            if (axis === 'horizontal') instance.flipHorizontal = instance.flipHorizontal !== true
            else instance.flipVertical = instance.flipVertical !== true
          }
          if (!freeTileCelDataEqual(before, after)) {
            const edit: FreeTilePlacementEdit = { layerId: target.layer.id, frameId: target.cel.frameId, before, after, dirtyRect: null }
            applyFreeTilePlacementEdit(session.document, edit, 'after')
            session.history.push({
              label: axis === 'horizontal' ? tr('workspace.history.flipSelectionHorizontal') : tr('workspace.history.flipSelectionVertical'),
              bytes: (before.instances.length + after.instances.length) * 72,
              undo: () => { applyFreeTilePlacementEdit(session.document, edit, 'before') },
              redo: () => { applyFreeTilePlacementEdit(session.document, edit, 'after') },
              invalidation: { kind: 'full' },
              affectedLayerIds: [target.layer.id],
              contentChanged: true,
              requiresAnimationSync: false
            })
            touch(session, true, { kind: 'full' })
            recordDocumentOperation(session)
          }
        }
        return
      }
      // A selected timeline cel on a tilemap layer represents the complete
      // tilemap cel. With no pixel selection, mirror all of its cells in one
      // document edit so the persisted tile metadata matches the preview.
      const activeTimeline = ensureAnimationDocument(session.document)
      const activeCelKey = animationCelKey(tilemapLayer.id, activeTimeline.activeFrameId)
      const tilemapCelSelected = session.selectedAnimationCellKeys.includes(activeCelKey)
        || session.selectedAnimationFrameIds.includes(activeTimeline.activeFrameId)
      if (!session.selection && tilemapLayer.kind === 'tilemap' && tilemapCelSelected) {
        const fullCanvasSelection: SelectionMask = { x: 0, y: 0, width: session.document.width, height: session.document.height }
        const edit = flipTilemapSelection(session.document, tilemapLayer.id, activeTimeline.activeFrameId, fullCanvasSelection, axis)
        if (edit) {
          session.history.push({
            label: axis === 'horizontal' ? tr('workspace.history.flipSelectionHorizontal') : tr('workspace.history.flipSelectionVertical'),
            bytes: tilemapEditBytes(edit),
            undo: () => { applyTilemapDocumentEdit(session.document, edit, 'before') },
            redo: () => { applyTilemapDocumentEdit(session.document, edit, 'after') },
            invalidation: edit.dirtyRect ? { kind: 'region', frameId: edit.frameId, rect: { ...edit.dirtyRect } } : { kind: 'full' },
            affectedLayerIds: [tilemapLayer.id],
            contentChanged: true,
            requiresAnimationSync: false
          })
          touch(session, true, { kind: 'full' })
          recordDocumentOperation(session)
        }
        return
      }
      if (session.selection && tilemapLayer.kind === 'tilemap' && session.tilemapMode === 'paint') {
        const beforeSelection = cloneSelectionMask(session.selection)
        const afterSelection = flipSelectionMask(session.selection, axis)
        const edit = flipTilemapSelection(session.document, tilemapLayer.id, ensureAnimationDocument(session.document).activeFrameId, session.selection, axis)
        if (edit) {
          const label = axis === 'horizontal' ? tr('workspace.history.flipSelectionHorizontal') : tr('workspace.history.flipSelectionVertical')
          session.history.push({
            label,
            bytes: tilemapEditBytes(edit),
            undo: () => { applyTilemapDocumentEdit(session.document, edit, 'before') },
            redo: () => { applyTilemapDocumentEdit(session.document, edit, 'after') },
            invalidation: edit.dirtyRect ? { kind: 'region', frameId: edit.frameId, rect: { ...edit.dirtyRect } } : { kind: 'full' },
            affectedLayerIds: [tilemapLayer.id],
            contentChanged: true,
            requiresAnimationSync: false
          })
          session.selectionGuidesPreservedAtContentRevision = session.contentRevision + 1
        }
        session.selection = afterSelection
        session.lastPencilPoint = null
        session.lastEraserPoint = null
        return
      }
      const selectedLayers = selectedTransformLayersForSession(session)
      const animationSelectionActive = session.selectedAnimationFrameIds.length > 0 || session.selectedAnimationCellKeys.length > 0
      if (session.selection && animationSelectionActive) {
        if (selectedLayers.length === 0 || selectedLayers.some((layer) => layer.kind || !isLayerEffectivelyVisible(session.document, layer) || isLayerEffectivelyLocked(session.document, layer))) return
        const states = captureAnimationFrameSelectionTransformStates(
          session.document,
          session.selectedAnimationFrameIds,
          selectedLayers.map((layer) => layer.id),
          session.selection,
          session.selectedAnimationCellKeys
        )
        if (states.length === 0) return
        const beforeSelection = cloneSelectionMask(session.selection)
        const selectionPivot = session.selectionPivot ? { ...session.selectionPivot } : null
        const afterSelection = flipSelectionMask(session.selection, axis)
        const target = {
          x: session.selection.x,
          y: session.selection.y,
          width: session.selection.width,
          height: session.selection.height,
          ...(axis === 'horizontal' ? { flipHorizontal: true } : { flipVertical: true })
        }
        const entries = states.flatMap((state) => {
          const edit = applySelectionTransformLayerState(session.document, state, target)
          const entry = edit && commitPixelEdit(session.document, edit, axis === 'horizontal' ? tr('workspace.history.flipSelectionHorizontal') : tr('workspace.history.flipSelectionVertical'))
          return entry ? [entry] : []
        })
        session.selection = afterSelection
        session.lastPencilPoint = null
        session.lastEraserPoint = null
        if (entries.length > 0 && afterSelection) session.history.push(combinedPixelHistoryEntry(
          session,
          entries,
          axis === 'horizontal' ? tr('workspace.history.flipSelectionHorizontal') : tr('workspace.history.flipSelectionVertical'),
          beforeSelection,
          afterSelection,
          selectionPivot,
          selectionPivot
        ))
        if (entries.length > 0) session.selectionGuidesPreservedAtContentRevision = session.contentRevision + 1
        return
      }
      if (session.selection && selectedLayers.length > 1) {
        if (selectedLayers.some((layer) => layer.kind || !isLayerEffectivelyVisible(session.document, layer) || isLayerEffectivelyLocked(session.document, layer))) return
        const beforeSelection = cloneSelectionMask(session.selection)
        const selectionPivot = session.selectionPivot ? { ...session.selectionPivot } : null
        const afterSelection = flipSelectionMask(session.selection, axis)
        const entries = selectedLayers.flatMap((layer) => {
          const edit = flipSelection(session.document, session.selection!, axis, layer)
          const entry = edit && commitPixelEdit(session.document, edit, axis === 'horizontal' ? tr('workspace.history.flipSelectionHorizontal') : tr('workspace.history.flipSelectionVertical'))
          return entry ? [entry] : []
        })
        session.selection = afterSelection
        session.lastPencilPoint = null
        session.lastEraserPoint = null
        if (entries.length > 0 && afterSelection) session.history.push(combinedPixelHistoryEntry(
          session,
          entries,
          axis === 'horizontal' ? tr('workspace.history.flipSelectionHorizontal') : tr('workspace.history.flipSelectionVertical'),
          beforeSelection,
          afterSelection,
          selectionPivot,
          selectionPivot
        ))
        if (entries.length > 0) session.selectionGuidesPreservedAtContentRevision = session.contentRevision + 1
        else if (!selectionMasksEqual(beforeSelection, afterSelection)) session.history.push({
          label: axis === 'horizontal' ? tr('workspace.history.flipSelectionHorizontal') : tr('workspace.history.flipSelectionVertical'),
          bytes: (beforeSelection?.mask?.byteLength ?? 0) + (afterSelection?.mask?.byteLength ?? 0),
          undo: () => { session.selection = cloneSelectionMask(beforeSelection) },
          redo: () => { session.selection = cloneSelectionMask(afterSelection) },
          documentChanged: false,
          contentChanged: false,
          requiresAnimationSync: false
        })
        return
      }
      const layer = activePaintLayer(session)
      if (isLayerEffectivelyLocked(session.document, layer)) return
      const beforeSelection = cloneSelectionMask(session.selection)
      const afterSelection = session.selection ? flipSelectionMask(session.selection, axis) : null
      const edit = session.selection ? flipSelection(session.document, session.selection, axis, layer) : flipLayer(session.document, axis)
      const entry = edit && commitPixelEdit(session.document, edit, axis === 'horizontal' ? tr('workspace.history.flipSelectionHorizontal') : tr('workspace.history.flipSelectionVertical'))
      // Flipping a whole styled layer changes the source geometry under the
      // style proxy. A point/region invalidation can leave the cached styled
      // surface behind, especially when the style extends beyond the layer.
      // Rebuild the complete composite for this operation.
      const wholeStyledLayerFlip = !session.selection && hasEnabledLayerStyles(layer.layerStyles)
      const sameMask = beforeSelection?.mask === afterSelection?.mask
        || (beforeSelection?.mask?.length === afterSelection?.mask?.length && beforeSelection?.mask?.every((value, index) => value === afterSelection?.mask?.[index]))
      const selectionChanged = !sameMask
      session.selection = afterSelection
      session.lastPencilPoint = null
      session.lastEraserPoint = null
      if (entry) {
        session.history.push({ ...entry, bytes: entry.bytes + (beforeSelection?.mask?.byteLength ?? 0) + (afterSelection?.mask?.byteLength ?? 0), undo: () => { entry.undo(); session.selection = cloneSelectionMask(beforeSelection) }, redo: () => { entry.redo(); session.selection = cloneSelectionMask(afterSelection) } })
        session.selectionGuidesPreservedAtContentRevision = session.contentRevision + 1
        if (wholeStyledLayerFlip) invalidateSessionContent(session)
      } else if (selectionChanged) {
        session.history.push({ label: axis === 'horizontal' ? tr('workspace.history.flipSelectionHorizontal') : tr('workspace.history.flipSelectionVertical'), bytes: (beforeSelection?.mask?.byteLength ?? 0) + (afterSelection?.mask?.byteLength ?? 0), undo: () => { session.selection = cloneSelectionMask(beforeSelection) }, redo: () => { session.selection = cloneSelectionMask(afterSelection) } })
      }
    })
  },

  transformActiveSelection(beforeSelection, afterSelection, angle = 0) {
    get().mutateActive((session) => {
      const edit = transformSelectionCopy(session.document, beforeSelection, afterSelection, angle, undefined, undefined, undefined, activePaintLayer(session), undefined, session.selectionRotationAlgorithm === 'rotsprite')
      const entry = edit && commitPixelEdit(session.document, edit, angle === 0 ? tr('workspace.history.transformSelectionContent') : tr('workspace.history.rotateSelectionContent'))
      const before = { ...beforeSelection }
      const after = { ...afterSelection }
      session.selection = after
      if (entry) {
        session.history.push({ ...entry, bytes: entry.bytes + 64, undo: () => { entry.undo(); session.selection = { ...before } }, redo: () => { entry.redo(); session.selection = { ...after } } })
      } else if (before.x !== after.x || before.y !== after.y || before.width !== after.width || before.height !== after.height) {
        session.history.push({ label: tr('workspace.history.transformSelection'), bytes: 48, undo: () => { session.selection = { ...before } }, redo: () => { session.selection = { ...after } } })
      }
    })
  },

  commitSelectionTransform(edit, beforeSelection, afterSelection, label) {
    get().mutateActive((session) => {
      const entry = edit && commitPixelEdit(session.document, edit, label)
      const before = cloneSelectionMask(beforeSelection)!
      const after = cloneSelectionMask(afterSelection)!
      const sameMask = before.mask === after.mask || (before.mask?.length === after.mask?.length && before.mask?.every((value, index) => value === after.mask?.[index]))
      const selectionChanged = before.x !== after.x || before.y !== after.y || before.width !== after.width || before.height !== after.height || !sameMask
      session.selection = after
      if (entry) {
        session.history.push({ ...entry, bytes: entry.bytes + 64 + (before.mask?.byteLength ?? 0) + (after.mask?.byteLength ?? 0), undo: () => { entry.undo(); session.selection = cloneSelectionMask(before) }, redo: () => { entry.redo(); session.selection = cloneSelectionMask(after) } })
        touch(session)
      } else if (selectionChanged) {
        session.history.push({
          label,
          bytes: 48 + (before.mask?.byteLength ?? 0) + (after.mask?.byteLength ?? 0),
          undo: () => { session.selection = cloneSelectionMask(before) },
          redo: () => { session.selection = cloneSelectionMask(after) },
          documentChanged: false,
          contentChanged: false,
          requiresAnimationSync: false
        })
      }
    }, false)
  },

  moveActiveSelection(deltaX, deltaY) {
    get().mutateActive((session) => {
      if (!session.selection) return
      const edit = moveSelection(session.document, session.selection, deltaX, deltaY, false, activePaintLayer(session))
      const entry = edit && commitPixelEdit(session.document, edit, tr('workspace.history.moveSelection'))
      if (entry) session.history.push(entry)
      if (entry) {
        session.selection = { ...session.selection, x: session.selection.x + deltaX, y: session.selection.y + deltaY }
        if (session.selectionPivot) session.selectionPivot = { x: session.selectionPivot.x + deltaX, y: session.selectionPivot.y + deltaY }
      }
    })
  },

  centerActiveContent(axis) {
    const current = activeSession(get())
    if (current?.pendingPaste && current.selection) {
      const selection = current.selection
      const deltaX = axis === 'vertical' ? 0 : Math.round(current.document.width / 2 - (selection.x + selection.width / 2))
      const deltaY = axis === 'horizontal' ? 0 : Math.round(current.document.height / 2 - (selection.y + selection.height / 2))
      if (deltaX !== 0 || deltaY !== 0) get().moveActiveSelectionWithSelectionHistory(deltaX, deltaY, true)
      return
    }

    // A fixed text box is an editable layout rectangle, not just the opaque
    // glyph pixels stored in its raster surface.  layerContentBounds() quite
    // correctly ignores transparent pixels for raster layers, but using that
    // result for boxed text would center the glyphs while leaving the text
    // box itself off-center.  Text without a box uses those same opaque
    // content bounds explicitly, because commitPixelEdit() intentionally
    // rejects raster edits on editable text layers.  Move the text layer
    // through the existing layer move command so its text origin, cel surface
    // offset, and history entry stay in sync.
    if (current && !current.selection) {
      const layer = activePaintLayer(current)
      if (layer.kind === 'text' && !current.activeLayerMaskId) {
        const timeline = current.document.animation
        const cel = timeline?.cels.find((candidate) => candidate.layerId === layer.id && candidate.frameId === timeline.activeFrameId)
        const source = cel ? resolveAnimationCel(timeline!, cel) ?? cel : null
        const text = source?.text
        const surface = source?.surface
        const bounds = text && surface && text.boxWidth !== undefined && text.boxHeight !== undefined
          ? {
              x: text.originX ?? surface.offsetX ?? layer.offsetX,
              y: text.originY ?? surface.offsetY ?? layer.offsetY,
              width: text.boxWidth,
              height: text.boxHeight
            }
          : layerContentBounds(current.document, layer)
        if (bounds) {
          const deltaX = axis === 'vertical' ? 0 : Math.round(current.document.width / 2 - (bounds.x + bounds.width / 2))
          const deltaY = axis === 'horizontal' ? 0 : Math.round(current.document.height / 2 - (bounds.y + bounds.height / 2))
          if (deltaX !== 0 || deltaY !== 0) get().moveLayerBy(layer.id, deltaX, deltaY)
          return
        }
      }
    }
    get().mutateActive((session) => {
      const layer = activePaintLayer(session)
      if (isLayerEffectivelyLocked(session.document, layer)) return
      const selection = session.selection ? cloneSelectionMask(session.selection) : layerContentBounds(session.document, layer)
      if (!selection) return
      const deltaX = axis === 'vertical' ? 0 : Math.round(session.document.width / 2 - (selection.x + selection.width / 2))
      const deltaY = axis === 'horizontal' ? 0 : Math.round(session.document.height / 2 - (selection.y + selection.height / 2))
      const source = session.selection
        ? captureSelectionTransform(session.document, selection, layer, { preserveOutsideCanvas: true })
        : null
      const target = { ...selection, x: selection.x + deltaX, y: selection.y + deltaY }
      const edit = source
        ? applySelectionTransform(session.document, source, target, 0, false, undefined, undefined, undefined, layer)
        : moveSelection(session.document, selection, deltaX, deltaY, false, layer)
      const entry = edit && commitPixelEdit(session.document, edit, session.selection ? tr('workspace.history.moveSelectionContent') : tr('canvas.history.moveLayer'))
      if (!entry) return
      const beforeSelection = session.selection ? cloneSelectionMask(session.selection) : null
      const beforePivot = session.selectionPivot ? { ...session.selectionPivot } : null
      const afterSelection = beforeSelection ? { ...beforeSelection, x: beforeSelection.x + deltaX, y: beforeSelection.y + deltaY } : null
      const afterPivot = beforePivot ? { x: beforePivot.x + deltaX, y: beforePivot.y + deltaY } : null
      session.history.push({
        ...entry,
        bytes: entry.bytes + (beforeSelection?.mask?.byteLength ?? 0) + (afterSelection?.mask?.byteLength ?? 0) + 48,
        undo: () => {
          entry.undo()
          session.selection = cloneSelectionMask(beforeSelection)
          session.selectionPivot = beforePivot ? { ...beforePivot } : null
        },
        redo: () => {
          entry.redo()
          session.selection = cloneSelectionMask(afterSelection)
          session.selectionPivot = afterPivot ? { ...afterPivot } : null
        }
      })
      if (session.selection) {
        session.selection = { ...session.selection, x: session.selection.x + deltaX, y: session.selection.y + deltaY }
        if (session.selectionPivot) session.selectionPivot = { x: session.selectionPivot.x + deltaX, y: session.selectionPivot.y + deltaY }
      }
    })
  },

  async convertColorMode(mode) {
    const current = activeSession(get())
    if (!current || current.document.colorMode === mode) return
    const resources = await window.moonSprite.getResourceInfo()
    const check = checkResourceLimit(current.document.width, current.document.height, current.document.layers.length, mode, resources)
    if (!check.allowed) { set({ message: check.reason }); return }
    get().mutateActive((session) => {
      if (session.document.colorMode === mode) return
      const before = captureDocumentColorModeSnapshot(session.document)
      convertDocumentColorMode(session.document, mode)
      const after = captureDocumentColorModeSnapshot(session.document)
      session.history.push({
        label: tr('workspace.history.convertColorMode'), bytes: documentColorModeSnapshotBytes(before) + documentColorModeSnapshotBytes(after),
        undo: () => restoreDocumentColorModeSnapshot(session.document, before),
        redo: () => restoreDocumentColorModeSnapshot(session.document, after),
        invalidation: { kind: 'full' },
        requiresAnimationSync: false
      })
    })
  },

  async saveActive(saveAs = false, options?: SaveAsOptions) {
    let session = activeSession(get())
    if (!session) return false
    const documentId = session.document.id
    const removeSavedRecovery = (recoveryId: string): void => {
      void recoveryService.delete(window.moonSprite, recoveryId).then(() => {
        set((state) => {
          const recoveredSession = state.sessions.find((item) => item.recoveryOriginId === recoveryId)
          if (recoveredSession) recoveredSession.recoveryOriginId = null
          return {
            recoveryRecords: state.recoveryRecords.filter((item) => item.id !== recoveryId),
            ...(recoveredSession ? { sessions: [...state.sessions] } : {})
          }
        })
      }).catch((error) => {
        console.error('MoonSprite recovery cleanup after save failed', error)
      })
    }
    get().commitFloatingPaste()
    await flushTimelapseCapture(session)
    session = get().sessions.find((item) => item.document.id === documentId) ?? null
    if (!session) return false
    persistProjectLayerPanelState(session)
    if (!saveAs && !session.document.dirty && (session.document.filePath || directSourceImageSaveTarget(session.document))) {
      if (session.recoveryOriginId) removeSavedRecovery(session.recoveryOriginId)
      set({ message: tr('workspace.save.done') })
      return true
    }
    let finishSaveProgress: ((succeeded?: boolean) => void) | undefined
    const beginSaveProgress = (): void => {
      if (!finishSaveProgress) finishSaveProgress = saveProgress.begin(saveAs ? 'saveAs' : 'save')
    }
    const endSaveProgress = (succeeded = true): void => {
      const finish = finishSaveProgress
      if (finish) finish(succeeded)
    }
    try {
      const result = await saveDocumentFile({
        api: window.moonSprite,
        documentId,
        getDocument: () => {
          const current = get().sessions.find((item) => item.document.id === documentId)
          return current ? { document: current.document, revision: current.contentRevision } : null
        },
        saveAs,
        options,
        preferredImageFormat: saveImageKindForPreference(readStoredString(SAVE_FORMAT_PREFERENCE_KEY)),
        lifecycle: {
          onEncodeStart: beginSaveProgress
        }
      })
      if (!result) { endSaveProgress(false); return false }
      const saved = get().sessions.find((item) => item.document.id === documentId)
      if (!saved) { endSaveProgress(false); return false }
      if (result.setDocumentFilePath) saved.document.filePath = result.filePath
      else saved.document.sourceFilePath = result.filePath
      saved.document.name = fileNameFromPath(result.filePath)
      persistProjectLayerPanelState(saved)
      const fullySaved = saved.contentRevision === result.revision
      saved.document.dirty = !fullySaved
      set({ sessions: [...get().sessions] })
      recordRecentProject(result.filePath, saved.document.name)
      scheduleLocalHistoryPersist(window.moonSprite, saved)
      const latest = get().sessions.find((item) => item.document.id === documentId)
      if (latest && latest.contentRevision === result.revision && !latest.document.dirty) {
        removeSavedRecovery(latest.recoveryOriginId ?? documentId)
      } else {
        // A save that raced with newer edits should finish immediately; recovery
        // protection continues in the background instead of extending Ctrl+S.
        void get().autosaveDirty().catch(() => undefined)
      }
      set({ message: fullySaved ? tr('workspace.save.done') : tr('workspace.save.newerChanges') })
      endSaveProgress()
      recordUsageEvent('save')
      return true
    } catch (error) {
      endSaveProgress(false)
      set({ message: error instanceof Error ? error.message : tr('workspace.save.error') })
      return false
    }
  },

  async exportActive(options) {
    get().commitFloatingPaste()
    const session = activeSession(get())
    if (!session) return false
    let progressStarted = false
    let exportTaskCurrent = 1
    let exportTaskTotal = 1
    let canceled = false
    let nativeCancel: (() => void) | null = null
    const cancel = (): void => {
      if (canceled) return
      canceled = true
      nativeCancel?.()
      if (get().saveProgress) set({ saveProgress: null })
    }
    const onCancelReady = (nextCancel: () => void): void => {
      nativeCancel = nextCancel
      if (canceled) nextCancel()
    }
    activeExportCancellation = cancel
    const exportProgressTitle = (): string => exportTaskTotal > 1
      ? `${tr('workspace.export.progressTitle')} (${exportTaskCurrent}/${exportTaskTotal})`
      : tr('workspace.export.progressTitle')
    const updateProgress = (value: number, label: string): void => {
      if (progressStarted && !get().saveProgress) return
      progressStarted = true
      set({ saveProgress: { title: exportProgressTitle(), value: Math.max(0, Math.min(100, Math.round(value))), label } })
    }
    try {
      const encodingLabel = tr('workspace.export.encoding')
      const exportOptions: ExportOptions | undefined = options
        ? { ...options, selection: options.target === 'selection' ? session.selection : undefined }
        : options
      exportTaskTotal = exportTaskCount(session.document, exportOptions)
      const message = await exportDocumentFile(window.moonSprite, session.document, exportOptions, {
        onEncodeStart: () => updateProgress(12, encodingLabel),
        onEncodeProgress: (value) => updateProgress(12 + value * 0.86, encodingLabel),
        onWriteStart: () => updateProgress(72, tr('workspace.save.writing')),
        onExportTaskStart: (current, total) => {
          exportTaskCurrent = current
          exportTaskTotal = total
          const progress = get().saveProgress
          if (progress) set({ saveProgress: { ...progress, title: exportProgressTitle() } })
        },
        onConflict: createExportConflictHandler(get().requestDialog, exportTaskTotal > 1),
        onCancelReady,
        isCanceled: () => canceled
      })
      if (!message) { if (progressStarted) set({ saveProgress: null }); return false }
      const progressVisible = progressStarted && Boolean(get().saveProgress)
      set({ message, ...(progressVisible ? { saveProgress: { title: exportProgressTitle(), value: 100, label: tr('workspace.export.done') } } : {}) })
      if (progressVisible) window.setTimeout(() => { if (get().saveProgress?.value === 100) set({ saveProgress: null }) }, 180)
      recordUsageExport(exportOptions?.format ?? 'png')
      return true
    } catch (error) {
      if (canceled) {
        set({ saveProgress: null })
        return false
      }
      set({ message: error instanceof Error ? error.message : tr('workspace.export.error'), ...(progressStarted ? { saveProgress: null } : {}) })
      return false
    } finally {
      if (activeExportCancellation === cancel) activeExportCancellation = null
    }
  },

  async openFiles() {
    const result = await window.moonSprite.openFiles()
    if (!result.canceled) {
      for (const filePath of result.filePaths) await get().openPath(filePath)
    }
  },

  async openPath(filePath, options) {
    const finishOpenProgress = openProgress.begin()
    try {
      await waitForDocumentCloseTasks(filePath)
      const parsed = await openDocumentFile(window.moonSprite, filePath)
      if (options?.duplicate) parsed.id = createId('doc')
      options?.onBeforeSession?.()
      get().addSession(parsed)
      const opened = get().sessions.find((session) => session.document.id === parsed.id)
      if (opened) {
        try {
          await restoreLocalHistory(window.moonSprite, opened)
          set({ sessions: [...get().sessions] })
        } catch (historyError) {
          console.error('MoonSprite local history restore failed', historyError)
        }
      }
      recordRecentProject(filePath, parsed.name)
      finishOpenProgress()
      return true
    } catch (error) {
      finishOpenProgress(false)
      set({ message: error instanceof Error ? `${fileNameFromPath(filePath)}: ${error.message}` : tr('workspace.open.error') })
      return false
    }
  },

  async closeDocument(id) {
    const session = get().sessions.find((item) => item.document.id === id)
    if (!session) return
    const preserveOpenedRecovery = session.recoveryOriginId !== null
    const recoverySuppressedBeforeClose = session.recoverySuppressed
    let discardClosedRecovery = !session.document.dirty && !preserveOpenedRecovery
    if (documentTransactions.cancelDocument(id, session)) set((state) => ({ sessions: [...state.sessions] }))
    if (session.document.dirty) {
      const choice = await get().requestDialog({ title: tr('workspace.unsaved.title'), message: tr('workspace.unsaved.message', { name: session.document.name }), detail: tr('workspace.unsaved.detail'), choices: [{ id: 'cancel', label: tr('common.cancel'), tone: 'quiet' }, { id: 'discard', label: tr('app.discard'), tone: 'danger' }, { id: 'save', label: tr('common.save'), tone: 'primary' }] })
      if (choice === 'cancel') return
      if (choice === 'save') {
        get().setActive(id)
        const saved = await get().saveActive()
        if (!saved) return
      }
      if (choice === 'discard' && !preserveOpenedRecovery) discardClosedRecovery = true
    }
    discardClosedRecovery ||= !session.document.dirty && !preserveOpenedRecovery
    if (discardClosedRecovery) session.recoverySuppressed = true
    startDocumentCloseTask(session.document.filePath || session.document.sourceFilePath || id, async () => {
      await flushLocalHistoryPersist(window.moonSprite, session)
      if (discardClosedRecovery) await get().discardRecovery(id)
    }, historyError => {
      console.error('MoonSprite local history close flush failed', historyError)
      session.recoverySuppressed = recoverySuppressedBeforeClose
      set(state => ({
        sessions: state.sessions.some(item => item.document.id === id) ? state.sessions : [...state.sessions, session],
        activeId: state.activeId ?? id,
        message: `${session.document.name}: ${historyError instanceof Error ? historyError.message : String(historyError)}`
      }))
    })
    timelapseCaptureGenerations.set(session.document, (timelapseCaptureGenerations.get(session.document) ?? 0) + 1)
    set((state) => {
      const sessions = state.sessions.filter((item) => item.document.id !== id)
      return { sessions, activeId: state.activeId === id ? (sessions.at(-1)?.document.id ?? null) : state.activeId }
    })
    const active = activeSession(get())
    requestTilesetPanelVisibility(documentUsesTilesetPanel(active?.document))
  },

  restoreProjectBackup(documentId, document) {
    const current = get().sessions.find((session) => session.document.id === documentId)
    if (!current || get().activeId !== documentId) return false
    const identity = {
      id: current.document.id,
      name: current.document.name,
      filePath: current.document.filePath,
      sourceFilePath: current.document.sourceFilePath
    }
    const before = cloneProjectRollbackSnapshot(current.document)
    const after = cloneProjectRollbackSnapshot(document)
    Object.assign(after, identity, { dirty: before.dirty })
    let restored = false
    get().mutateActive((session) => {
      if (session.document.id !== documentId) return
      restoreProjectRollbackSnapshot(session, after)
      session.history.push({
        label: '回档工程备份',
        bytes: projectRollbackSnapshotBytes(before) + projectRollbackSnapshotBytes(after),
        undo: () => restoreProjectRollbackSnapshot(session, before),
        redo: () => restoreProjectRollbackSnapshot(session, after),
        invalidation: { kind: 'full' }
      })
      restored = true
    }, 'content', true)
    return restored
  },

  async restoreRecoveries() {
    try {
      const recoveries = await recoveryService.list(window.moonSprite, loadEditorPreferences().recoveryRetentionDays)
      set({ recoveryRecords: recoveries })
    } catch {
      set({ recoveryRecords: [], message: tr('workspace.recovery.readError') })
    }
  },

  async restoreRecovery(id) {
    const record = get().recoveryRecords.find((item) => item.id === id)
    if (!record) return false
    try {
      const document = await recoveryService.restore(window.moonSprite, record)
      get().addSession(document, { recoveryOriginId: record.id })
      set({ message: tr('workspace.recovery.restored', { name: record.name }) })
      return true
    } catch {
      set({ message: tr('workspace.recovery.restoreError', { name: record.name }) })
      return false
    }
  },

  async autosaveDirty() {
    const dirty = get().sessions
      .filter((session) => session.document.dirty && !session.recoverySuppressed)
      .map((session) => ({ id: session.recoveryOriginId ?? session.document.id, document: session.document }))
    try {
      await recoveryService.autosave(window.moonSprite, dirty)
    } catch (error) {
      console.error('MoonSprite recovery autosave failed', error)
      set({ message: tr('workspace.recovery.autosaveError') })
    }
  },

  async discardRecovery(id) {
    const session = get().sessions.find((item) => item.document.id === id || item.recoveryOriginId === id)
    if (session) {
      session.recoverySuppressed = true
      set({ sessions: [...get().sessions] })
    }
    try {
      await recoveryService.discard(window.moonSprite, id)
      set((state) => {
        const recoveredSession = state.sessions.find((item) => item.recoveryOriginId === id)
        if (recoveredSession) recoveredSession.recoveryOriginId = null
        return {
          recoveryRecords: state.recoveryRecords.filter((item) => item.id !== id),
          ...(recoveredSession ? { sessions: [...state.sessions] } : {})
        }
      })
    } catch (error) {
      console.error('MoonSprite recovery discard failed', error)
      set({ message: tr('workspace.recovery.discardError') })
    }
  },

  dismissSaveProgress() { set({ saveProgress: null }) },

  cancelExport() { activeExportCancellation?.() },

  requestDialog(options) {
    return new Promise((resolve) => set({ dialog: { ...options, resolve } }))
  },

  resolveDialog(choice) {
    const dialog = get().dialog
    if (!dialog) return
    set({ dialog: null })
    dialog.resolve(choice)
  },

  setMessage(message) { set({ message }) },
  syncLocalHistoryPreferences() {
    for (const session of get().sessions) configureLocalHistory(session, window.moonSprite)
    set({ sessions: [...get().sessions] })
  }
}))
