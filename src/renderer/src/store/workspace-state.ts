import type {
  AnimationLoopDirection,
  AnimationCelSurface,
  AntiAliasColorSource,
  BackgroundPatternId,
  BlendMode,
  BrushDitherSettings,
  BrushPaintMode,
  BrushShape,
  BrushTexture,
  CanvasAnchor,
  ColorMode,
  DocumentSlice,
  FillKind,
  FillMode,
  FreeTileInstance,
  FreeTileSourceLayer,
  GradientDither,
  GradientStop,
  GradientType,
  ImageBrush,
  ImageBrushSettings,
  ImageResizeInterpolation,
  LayerStyles,
  LineKind,
  LiquifyMode,
  MoveKind,
  OutlineSettings,
  PaletteEntry,
  PaletteSlotLayout,
  ProceduralBrushSettings,
  RecoveryRecord,
  RgbaColor,
  SelectionKind,
  SelectionMask,
  SelectionMode,
  SelectionQuad,
  SelectionRect,
  ShapeKind,
  ShapeRatio,
  SpriteDocument,
  TextCelData,
  TileRepeatMode,
  TimelapseSettings,
  TimelapseExportFormat,
  ToolId,
  ViewState
} from '@shared/types'
import type { ColorAdjustment } from '@/core/adjustments'
import type { AdjustmentPreviewResult } from '@/core/adjustment-preview-protocol'
import type { BackgroundPatternTile } from '@/core/background-patterns'
import type { ContentInvalidationHint, HistoryEntry, PixelEdit } from '@/core/history'
import type { LayerPanelRowMoveTarget } from '@/core/layer-operations'
import type { PaletteSortDirection, PaletteSortMode } from '@/core/palette'
import type { BrushDynamicsEffect, BrushDynamicsMapping, BrushPressureSettings } from '@/core/pressure'
import type { SelectionShearTransform } from '@/core/selection'
import type { SymmetryAxes, SymmetryCenter } from '@/core/symmetry'
import type { SelectionTransformLayerState, SelectionTransformSource, SelectionTranslationPreview } from '@/core/tools'
import type { TilemapDrawingMode, TilemapEdit, TilemapTilesetEdit } from '@/core/tilemap'
import type { FreeTileDrawingMode } from '@/core/free-tile'
import type { FreeTilePlacementEdit, FreeTileSourceEditSnapshot } from '@/core/free-tile-document'
import type { FreeTileSourceEditRaster } from '@/core/free-tile-edit'
import type { TimelapseExportOptions } from '@/core/timelapse'
import type { SpriteSheetExportOptions } from '@/core/sprite-sheet'
import type { FilterPresetId, LcdScreenFilterOptions } from '@/core/filter-presets'
import type { ExportOptions, SaveAsOptions } from './document-file-service'
import type { LayerMoveDuplicateResult, LayerMoveState } from './workspace-layer-move'
import type { LayerPropertyField, LayerPropertyTarget, LayerPropertyValues } from './workspace-layer-properties'
import type { AdjustmentSnapshot, AnimationPlaybackMode, AppDialog, CanvasResizePreview, DocumentSession, OutlinePreview, SelectionPivot } from './workspace-types'

export type ColorReplacementTarget = 'layer' | 'document' | 'selection' | 'layers' | 'frames' | 'cells' | 'palette' | `loop-section:${string}`

export interface ColorReplacementPreview {
  documentId: string
  edits: PixelEdit[]
  palette: SpriteDocument['palette']
  nextColorId: number
  primaryColor: RgbaColor
  secondaryColor: RgbaColor
}

export interface AntiAliasPreview {
  documentId: string
  edit: PixelEdit
}

export interface TextCelPreview {
  surface: AnimationCelSurface
  text?: TextCelData
  palette: PaletteEntry[]
  paletteOrder: number[]
  paletteSlots?: Array<number | null>
  nextColorId: number
}

export interface TextLayerDraftTarget {
  layerId: string
  frameId: string
}

export interface TilemapLayerOptions {
  name: string
  tileWidth: number
  tileHeight: number
  /** Reuse a project Tilemap Tileset; null or omitted creates a new one. */
  tilesetId?: string | null
}

export interface FreeTileLayerOptions {
  name: string
  /** Reuse a project Free Tile source set; null or omitted creates a new one. */
  freeTileSetId?: string | null
}

export interface WorkspaceData {
  sessions: DocumentSession[]
  activeId: string | null
  sharedPrimaryColor: RgbaColor
  sharedSecondaryColor: RgbaColor
  layerStyleClipboard: LayerStyles | null
  message: string | null
  saveProgress: { title: string; value: number; label: string; requiresConfirmation?: boolean } | null
  dialog: AppDialog | null
  recoveryRecords: RecoveryRecord[]
}

export interface WorkspaceSessionCommands {
  newDocument(name: string, width: number, height: number, colorMode: ColorMode, recordDrawing?: boolean): Promise<void>
  exportSpriteSheet(options: SpriteSheetExportOptions, sourceDocumentId?: string): Promise<boolean>
  previewSpriteSheet(sourceDocumentId: string, options: SpriteSheetExportOptions, previousPreviewDocumentIds: readonly string[]): Promise<string[] | null>
  closeSpriteSheetPreview(documentIds: readonly string[], preferredActiveId: string): void
  addSession(document: SpriteDocument, options?: { recoveryOriginId?: string }): void
  reorderSessions(documentIds: string[]): void
  setActive(id: string): void
  mutateActive(mutator: (session: DocumentSession) => void, dirty?: boolean | 'content' | 'metadata', normalizeSelection?: boolean, markSelectionNormalizationHistory?: boolean, invalidation?: ContentInvalidationHint): void
}

export interface WorkspaceSliceCommands {
  selectSlice(id: string | null, additive?: boolean): void
  selectAllSlices(): void
  createSlice(bounds: SelectionRect): string | null
  createSlices(bounds: readonly SelectionRect[]): string[]
  updateSlice(id: string, patch: Partial<Pick<DocumentSlice, 'name' | 'x' | 'y' | 'width' | 'height'>>): void
  updateSlices(patches: Record<string, SelectionRect>): void
  duplicateSlices(ids: string[], targets: Record<string, SelectionRect>): string[]
  deleteSlice(id: string): void
  deleteSlices(ids: string[]): void
}

export interface WorkspaceToolCommands {
  setTool(tool: ToolId): void
  syncCanvasToolSettings(documentId: string): void
  setMoveKind(kind: MoveKind): void
  setBrushSize(size: number): void
  setBrushAngle(angle: number): void
  setAirbrushParticleRadius(radius: number): void
  setAirbrushParticleShape(shape: BrushShape): void
  setAirbrushScatterRadius(radius: number): void
  setAirbrushDensity(density: number): void
  setAirbrushIntervalMs(intervalMs: number): void
  setLiquifyMode(mode: LiquifyMode): void
  setLiquifyRadius(radius: number): void
  setLiquifyStrength(strength: number): void
  setLiquifySmoothing(enabled: boolean): void
  setLiquifySmoothingStrength(strength: number): void
  setSmoothStrength(strength: number): void
  setLiquifyGestureActive(active: boolean): void
  setLiquifyResetHistoryPosition(position: number | null, revision: number | null): void
  resetLiquify(): boolean
  setBrushShape(shape: BrushShape): void
  setBrushDither(settings: BrushDitherSettings): void
  setBrushTexture(texture: BrushTexture): void
  setBrushTextureScale(scale: number): void
  setBrushPaintMode(mode: BrushPaintMode): void
  setBrushDynamicsMapping(effect: BrushDynamicsEffect, patch: Partial<BrushDynamicsMapping>): void
  setBrushDynamicsGradientDither(dither: GradientDither): void
  setBrushPressure(settings: Partial<BrushPressureSettings>): void
  setBrushImage(brush: ImageBrush | null): void
  setTemporaryBrush(brush: ImageBrush): void
  deleteProjectBrush(id: string): void
  createBrushFromSelection(): Promise<void>
  createBackgroundPresetFromSelection(): Promise<void>
  setBrushImageSettings(settings: Partial<ImageBrushSettings>): void
  setProceduralBrushSettings(settings: Partial<ProceduralBrushSettings>): void
  setProceduralAntialias(enabled: boolean): void
  setProceduralAntialiasStrength(strength: number): void
  setShapeKind(kind: ShapeKind): void
  setLineKind(kind: LineKind): void
  setCurveAnchorCount(count: number): void
  setShapeRatio(ratio: ShapeRatio | null): void
  setShapeRounded(enabled: boolean): void
  setShapeCornerRadius(radius: number): void
  setFillMode(mode: FillMode): void
  setFillKind(kind: FillKind): void
  setFillTolerance(tolerance: number): void
  setFillGapClosing(enabled: boolean): void
  setFillGapThreshold(threshold: number): void
  setGradientTolerance(tolerance: number): void
  setGradientContiguous(contiguous: boolean): void
  setGradientType(type: GradientType): void
  setGradientDither(dither: GradientDither): void
  setGradientFreeform(enabled: boolean): void
  setGradientStops(stops: GradientStop[]): void
  setMoveAutoSelect(enabled: boolean): void
  setPerfectPixels(enabled: boolean): void
  setSymmetryAxis(axis: keyof SymmetryAxes, enabled: boolean): void
  setSymmetryCenter(center: SymmetryCenter): void
  resetSymmetryCenter(): void
  setLastPencilPoint(point: { x: number; y: number } | null): void
  setLastEraserPoint(point: { x: number; y: number } | null): void
}

export interface WorkspaceColorCommands {
  setPrimaryColor(color: RgbaColor): void
  setSecondaryColor(color: RgbaColor): void
  replaceColor(target: ColorReplacementTarget, sourceColor: RgbaColor, replacementColor: RgbaColor): void
  previewColorReplacement(target: ColorReplacementTarget, sourceColor: RgbaColor, replacementColor: RgbaColor, previous?: ColorReplacementPreview | null): ColorReplacementPreview | null
  restoreColorReplacementPreview(preview: ColorReplacementPreview | null): void
  selectSecondaryPaletteColor(id: number): void
  swapPrimarySecondaryColors(): void
  selectPaletteColor(id: number, additive?: boolean): void
  selectPaletteColors(ids: number[], primaryId: number): void
  addPaletteColor(color?: RgbaColor): number | null
  updatePaletteColor(id: number, color: RgbaColor): void
  applyPalette(colors: RgbaColor[], layout?: PaletteSlotLayout): void
  deletePaletteColor(id: number): void
  deletePaletteColors(ids: number[]): void
  movePaletteColor(direction: -1 | 1): void
  reorderPaletteColors(ids: number[], targetSlots: Array<number | null>, targetColumns: number): void
  reversePaletteColors(): void
  gradientPaletteColors(byHue: boolean): void
  gradientPaletteSlots(slotIndices: number[], sourceSlots: Array<number | null>, columns: number, byHue: boolean): void
  sortPaletteColors(mode: PaletteSortMode, direction: PaletteSortDirection): void
}

export interface WorkspaceViewSelectionCommands {
  setView(view: Partial<ViewState>): void
  setViewForDocument(documentId: string, view: Partial<ViewState>): void
  setViewportSize(size: { width: number; height: number }): void
  setViewportSizeForDocument(documentId: string, size: { width: number; height: number }): void
  setTileRepeatMode(mode: TileRepeatMode): void
  setSelection(selection: SelectionMask | null): void
  setSelectionPropertiesActive(active: boolean): void
  setSelectionAspectRatio(ratio: number | null): void
  setSelectionRotationAlgorithm(algorithm: 'fast' | 'rotsprite'): void
  updateSelectionProperties(patch: Partial<SelectionRect> & { angle?: number; shearAngle?: number }): void
  shrinkSelectionToContent(): void
  setSelectionPivot(pivot: SelectionPivot | null): void
  invertSelection(): void
  toggleSelectionOutline(): void
  beginLayerTransform(): void
  beginFreeTransform(): void
  beginSelectedTextBoxTransform(): void
  previewTextBoxTransform(bounds: SelectionRect): void
  commitTextBoxTransform(bounds: SelectionRect): void
  cancelTextBoxTransform(): void
  setSelectionKind(kind: SelectionKind): void
  commitSelectionChange(before: SelectionMask | null, after: SelectionMask | null, label: string, options?: { resetTimelineSelection?: boolean }): void
  commitFloatingSelectionBoxMove(before: SelectionMask, after: SelectionMask, beforePivot: SelectionPivot | null, afterPivot: SelectionPivot | null): void
  commitTilemapSelectionMove(edit: TilemapEdit, before: SelectionMask | null, after: SelectionMask | null, label: string): void
  setSelectionMode(mode: SelectionMode): void
  setSelectionRounded(enabled: boolean): void
  setSelectionCornerRadius(radius: number): void
  setWandTolerance(tolerance: number): void
  setWandContiguous(contiguous: boolean): void
  setWandGapClosing(enabled: boolean): void
  setWandGapThreshold(threshold: number): void
  setCanvasResizePreview(preview: CanvasResizePreview | null): void
  togglePixelGrid(): void
  toggleGrid(): void
  deleteSelection(): void
  fillForeground(): void
  antiAliasSelection(color: RgbaColor | null, autoColorOpacity?: number, includeInteriorColors?: boolean, colorSource?: AntiAliasColorSource): boolean
  previewAntiAliasSelection(color: RgbaColor | null, autoColorOpacity?: number, includeInteriorColors?: boolean, colorSource?: AntiAliasColorSource, previous?: AntiAliasPreview | null): AntiAliasPreview | null
  restoreAntiAliasPreview(preview: AntiAliasPreview | null): void
  setOutlinePreview(preview: OutlinePreview | null): void
  outlineActiveSelection(settings: OutlineSettings): boolean
  quickOutlineActiveSelection(): boolean
  outlineSelectionInside(): boolean
  beginFloatingSelectionTransform(source: SelectionTransformSource, edit: PixelEdit | null, before: SelectionMask, target: SelectionMask, copy: boolean, label: string, translationPreview?: SelectionTranslationPreview | null, transformTarget?: SelectionRect, transformAngle?: number, transformShear?: SelectionShearTransform, previewDeferred?: boolean, tilemapEditCellIndex?: number, layers?: SelectionTransformLayerState[], transformQuad?: SelectionQuad): void
  beginFreeTileFloatingSelectionTransform(options: {
    sourceId: string
    instanceId: string
    edit: FreeTileSourceEditRaster
    selectionSource: SelectionMask
    source: SelectionTransformSource
    previewEdit: PixelEdit | null
    before: SelectionMask
    target: SelectionMask
    copy: boolean
    label: string
    translationPreview?: SelectionTranslationPreview | null
    transformTarget?: SelectionRect
    transformAngle?: number
    transformShear?: SelectionShearTransform
    transformQuad?: SelectionQuad
  }): void
  commitFloatingPaste(deselectLabel?: string): void
  cancelFloatingPaste(): void
  updateFloatingPastePreview(edit: PixelEdit | null, target: SelectionMask, translationPreview?: SelectionTranslationPreview | null, transformTarget?: SelectionRect, transformAngle?: number, transformShear?: SelectionShearTransform, previewDeferred?: boolean, layers?: SelectionTransformLayerState[], transformQuad?: SelectionQuad): void
  moveActiveSelection(deltaX: number, deltaY: number): void
  centerActiveContent(axis: 'both' | 'horizontal' | 'vertical'): void
  moveActiveSelectionWithSelectionHistory(deltaX: number, deltaY: number, allowOutsideCanvas?: boolean): void
  flipActiveSelection(axis: 'horizontal' | 'vertical'): void
  transformActiveSelection(before: SelectionMask, after: SelectionMask, angle?: number): void
  commitSelectionTransform(edit: PixelEdit | null, before: SelectionMask, after: SelectionMask, label: string): void
}

export interface WorkspaceHistoryCommands {
  beginLiquifyStroke(layerId: string): boolean
  cancelLiquifyStroke(edit: PixelEdit, compound: boolean): void
  applySmoothBrushStroke(edit: PixelEdit, stroke: { visited: Set<number> }): boolean
  cancelSmoothBrushStroke(edit: PixelEdit): void
  commitLiquifyStroke(edit: PixelEdit, label: string, compound: boolean, activity?: { stroke?: boolean; durationMs?: number }, push?: boolean): HistoryEntry | null
  commitPixelEdit(edit: PixelEdit, label: string, activity?: { stroke?: boolean; durationMs?: number }): HistoryEntry | null
  commitTilemapEdit(edit: TilemapEdit, label: string, activity?: { stroke?: boolean; durationMs?: number }): HistoryEntry | null
  commitTilemapTilesetEdit(edit: TilemapTilesetEdit, label: string, activity?: { stroke?: boolean; durationMs?: number }): HistoryEntry | null
  pushHistory(entry: HistoryEntry): void
  undo(): void
  redo(): void
  setHistoryPosition(position: number): void
  setTimelapseSettings(settings: Partial<Omit<TimelapseSettings, 'snapshots'>>): void
  clearTimelapse(): void
  exportTimelapse(format: TimelapseExportFormat, options: TimelapseExportOptions): Promise<boolean>
}

export interface WorkspaceTilemapCommands {
  setTilemapMode(mode: TilemapDrawingMode): void
  activateTilemapLayerForDrawing(layerId?: string): void
  setSelectedTileset(id: string): void
  setSelectedTile(tilesetId: string, tileId: string, role?: 'primary' | 'secondary'): void
  reorderTilesetTiles(tilesetId: string, orderedTileIds: string[]): boolean
  setTilesetTileSlots(tilesetId: string, tileSlots: Array<string | null>): boolean
  addTilesetTile(tilesetId: string): string | null
  deleteTilesetTile(tilesetId: string, tileId: string): boolean
  deleteTilesetTiles(tilesetId: string, tileIds: string[]): boolean
  previewTilesetTilePixels(tilesetId: string, tileId: string, pixels: Uint8ClampedArray): boolean
  commitTilesetTileEdit(tilesetId: string, tileId: string, before: Uint8ClampedArray, after: Uint8ClampedArray): boolean
}

export interface WorkspaceFreeTileCommands {
  setFreeTileMode(mode: FreeTileDrawingMode): void
  setFreeTileInstanceLayerView(layerId: string | null): void
  setSelectedFreeTileInstance(instanceId: string | null, mode?: FreeTileDrawingMode, role?: 'primary' | 'secondary'): void
  selectFreeTileInstanceRow(instanceId: string, mode?: 'replace' | 'toggle' | 'range', orderedInstanceIds?: readonly string[]): void
  addFreeTileSource(layerId?: string): string | null
  deleteFreeTileSource(sourceId: string): boolean
  deleteFreeTileInstance(instanceId: string): boolean
  deleteFreeTileInstances(instanceIds: readonly string[]): boolean
  showOnlyFreeTileInstance(instanceId: string): boolean
  setFreeTileInstanceProperties(instanceId: string, changes: FreeTileInstancePropertyChanges, selectInstance?: boolean): boolean
  beginFreeTileInstancePropertiesTransaction(instanceIds: string | readonly string[]): string | null
  previewFreeTileInstancePropertiesTransaction(id: string, changes: FreeTileInstancePropertyChanges): boolean
  commitFreeTileInstancePropertiesTransaction(id: string, changes: FreeTileInstancePropertyChanges): boolean
  cancelFreeTileInstancePropertiesTransaction(id: string): boolean
  reorderFreeTileInstance(instanceId: string, targetInstanceId: string, position: 'before' | 'after'): boolean
  setFreeTileSourceProperties(sourceId: string, changes: FreeTileSourcePropertyChanges): boolean
  beginFreeTileSourcePropertiesTransaction(sourceId: string): string | null
  previewFreeTileSourcePropertiesTransaction(id: string, changes: FreeTileSourcePropertyChanges): boolean
  commitFreeTileSourcePropertiesTransaction(id: string, changes: FreeTileSourcePropertyChanges): boolean
  cancelFreeTileSourcePropertiesTransaction(id: string): boolean
  previewFreeTileSource(sourceId: string, width: number, height: number, pixels: Uint8ClampedArray, offsetX: number, offsetY: number): boolean
  commitFreeTileSourceEdit(
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
  ): HistoryEntry | null
  beginFreeTilePlacement(): FreeTilePlacementEdit | null
  previewFreeTilePlacement(edit: FreeTilePlacementEdit): boolean
  commitFreeTilePlacement(
    edit: FreeTilePlacementEdit,
    label: string,
    selectionEdit?: {
      before: SelectionMask | null
      after: SelectionMask | null
      beforePivot: SelectionPivot | null
      afterPivot: SelectionPivot | null
    }
  ): HistoryEntry | null
  cancelFreeTilePlacement(edit: FreeTilePlacementEdit): void
}

export type FreeTileInstancePropertyChanges = Partial<{
  x: number
  y: number
  visible: boolean
  locked: boolean
  opacity: number
  blendMode: FreeTileInstance['blendMode']
  rotation: NonNullable<FreeTileInstance['rotation']>
  flipHorizontal: boolean
  flipVertical: boolean
}>
export type FreeTileSourcePropertyChanges = Partial<Pick<FreeTileSourceLayer, 'name' | 'description' | 'visible' | 'locked' | 'offsetX' | 'offsetY'>> & { displayColor?: RgbaColor | null }

export interface AnimationLoopSectionOptions {
  name: string
  startFrameId: string
  endFrameId: string
  direction: AnimationLoopDirection
  repeatCount: number | null
}

export interface WorkspaceAnimationCommands {
  setActiveAnimationFrame(frameId: string): void
  stepAnimationFrame(delta: number): void
  stepLayerSelection(delta: number): void
  selectAnimationFrame(frameId: string, mode?: 'replace' | 'toggle' | 'range'): void
  selectAnimationCell(key: string, mode?: 'replace' | 'toggle' | 'range'): void
  selectAnimationMaskCell(key: string, mode?: 'replace' | 'toggle' | 'range'): void
  selectAnimationMaskRow(ownerKind: 'layer' | 'group', ownerId: string, mode?: 'replace' | 'toggle' | 'range'): void
  selectAnimationCelContent(key: string, additive?: boolean): void
  clearAnimationSelection(preserveActiveContext?: boolean): void
  setAnimationCelOpacity(layerId: string, frameId: string, opacity: number): void
  setAnimationCelProperties(layerId: string, frameId: string, properties: { opacity: number; zIndex: number }, targetKeys?: readonly string[]): void
  connectSelectedAnimationCels(): void
  disconnectSelectedAnimationCels(): void
  copySelectedAnimationCels(): void
  pasteAnimationCels(): void
  moveSelectedAnimationCels(layerId: string, frameId: string, sourceAnchorKey: string): void
  copySelectedAnimationMasks(): void
  pasteAnimationMasks(ownerId?: string, frameId?: string): void
  moveSelectedAnimationMasks(ownerId: string, frameId: string, sourceAnchorKey: string): void
  connectSelectedAnimationMasks(): void
  disconnectSelectedAnimationMasks(): void
  copySelectedAnimationFrames(): void
  pasteAnimationFrames(): void
  setSelectedAnimationFramesDisabled(disabled: boolean): void
  toggleSelectedAnimationFramesDisabled(): void
  moveSelectedAnimationFrames(targetFrameId: string, insertAfter: boolean): void
  deleteSelectedAnimationItems(): void
  setAnimationPlaying(playing: boolean, completed?: boolean): void
  pauseAnimationAtCurrentFrame(): void
  setAnimationPlaybackRate(rate: number): void
  setAnimationPlaybackMode(mode: AnimationPlaybackMode): void
  setAnimationReturnToStart(enabled: boolean): void
  advanceAnimationFrame(): void
  createAnimationLoopSection(options: AnimationLoopSectionOptions): string | null
  updateAnimationLoopSection(id: string, options: AnimationLoopSectionOptions): void
  deleteAnimationLoopSection(id: string): void
  playAnimationLoopSection(id: string): void
  addAnimationFrame(): void
  addLinkedAnimationFrame(): void
  duplicateAnimationFrame(): void
  deleteAnimationFrame(normalizeSelection?: boolean, markSelectionNormalizationHistory?: boolean): void
  setActiveAnimationFrameDuration(duration: number): void
  setAnimationLoop(loop: boolean): void
}

export interface WorkspaceLayerCommands {
  addLayer(): Promise<void>
  applyFilterPreset(presetId: FilterPresetId): Promise<void>
  applyLcdScreenFilter(options?: Partial<LcdScreenFilterOptions>): Promise<void>
  createTilemapLayer(options: TilemapLayerOptions): Promise<void>
  createFreeTileLayer(options: FreeTileLayerOptions): Promise<void>
  convertLayerToTilemap(layerId: string, options: TilemapLayerOptions): Promise<void>
  createBackgroundLayer(pattern: BackgroundPatternId | BackgroundPatternTile): Promise<void>
  setLayerBackground(layerId: string, enabled: boolean): void
  setLayerAutoLinkAnimationCels(layerId: string, enabled: boolean): void
  createTextLayer(data: TextCelData, x: number, y: number): void
  beginTextLayerDraft(data: TextCelData, x: number, y: number): TextLayerDraftTarget | null
  updateTextLayerDraft(layerId: string, frameId: string, data: TextCelData, x?: number, y?: number): void
  commitTextLayerDraft(layerId: string): void
  cancelTextLayerDraft(layerId: string): void
  setTextCel(layerId: string, frameId: string, data: TextCelData, x?: number, y?: number): void
  previewTextCel(layerId: string, frameId: string, data: TextCelData, x?: number, y?: number): TextCelPreview | null
  restoreTextCelPreview(layerId: string, frameId: string, preview: TextCelPreview): void
  rasterizeLayer(layerId: string): void
  splitLayerStyles(layerId: string): void
  createLinkedLayer(layerId: string): string | null
  /** Switch the canvas editing target without creating a blue explicit layer selection. */
  activateLayerForCanvas(layerId: string): void
  duplicateActiveLayer(): void
  duplicateLayers(layerIds: string[]): string[]
  duplicateSelectedLayerRows(): { layerIds: string[]; groupIds: string[] }
  deleteActiveLayer(): void
  deleteSelectedLayers(): void
  mergeSelectedLayers(): void
  mergeActiveLayerDown(): void
  mergeSelectedGroup(): void
  mergeVisibleLayers(): void
  moveLayer(direction: -1 | 1): void
  moveLayerBy(layerId: string, deltaX: number, deltaY: number, label?: string): void
  beginLayerMoveDuplicatePreview(documentId: string, layerId: string, copySuffix: string): LayerMoveDuplicateResult | null
  previewLayerMove(documentId: string, move: LayerMoveState, distanceX: number, distanceY: number): boolean
  cancelLayerMovePreview(documentId: string, move: LayerMoveState): void
  commitLayerMove(documentId: string, move: LayerMoveState): void
  reorderLayer(layerId: string, targetLayerId: string): void
  reorderLayers(layerIds: string[], targetLayerId: string, insertAfterTarget?: boolean): void
  assignLayerToGroup(layerId: string, groupId: string): void
  assignLayersToGroup(layerIds: string[], groupId: string, targetLayerId?: string, insertAfterTarget?: boolean): void
  assignLayersToRoot(layerIds: string[], targetLayerId?: string, insertAfterTarget?: boolean): void
  assignLayersAboveGroup(layerIds: string[], groupId: string): void
  reorderGroup(groupId: string, targetGroupId: string, insertAfterTarget?: boolean): void
  positionGroupNextToLayer(groupId: string, targetLayerId: string, insertAfterTarget?: boolean): void
  assignGroupToGroup(groupId: string, parentGroupId: string): void
  assignGroupToRoot(groupId: string): void
  moveLayersToRootEdge(layerIds: string[], edge: 'top' | 'bottom'): void
  moveGroupToRootEdge(groupId: string, edge: 'top' | 'bottom'): void
  moveLayerRows(layerIds: string[], groupIds: string[], target: LayerPanelRowMoveTarget): void
  createLayerGroup(): void
  ungroupSelected(): void
  selectGroup(groupId: string, mode?: boolean | 'replace' | 'toggle' | 'range'): void
  selectLayerRows(layerIds: string[], groupIds: string[]): void
  clearLayerSelection(): void
  toggleGroupCollapsed(groupId: string): void
  revealLayerInPanel(documentId: string, layerId: string): void
  beginLayerPanelTransaction(documentId: string): void
  commitLayerPanelTransaction(documentId: string, label: string): void
  toggleGroupVisibility(groupId: string): void
  selectLayerMask(celId: string, additive?: boolean): void
  selectGroupMask(groupId: string, frameId: string, additive?: boolean): void
  toggleLayerMaskVisibility(celId: string): void
  setLayerMaskLocked(celId: string, enabled: boolean): void
  setLayerMaskAutoLinkAnimationCels(celId: string, enabled: boolean): void
  toggleGroupMaskVisibility(groupId: string, frameId: string): void
  setLayerMaskMoveWithOwner(celId: string, enabled: boolean): void
  setGroupMaskMoveWithOwner(groupId: string, frameId: string, enabled: boolean): void
  createLayerMask(celIdOrLayerId: string, frameId?: string): void
  createLayerMasksForLayer(layerId: string): void
  createGroupMask(groupId: string, frameId?: string): void
  deleteLayerMask(celId: string): void
  deleteGroupMask(groupId: string, frameId?: string): void
  deleteSelectedLayerMasks(): void
  toggleActiveClippingMask(): void
  setClippingMask(kind: 'layer' | 'group', id: string, enabled: boolean): void
  setGroupProperties(groupId: string, name: string, opacity: number, blendMode: BlendMode, locked: boolean, displayColor?: RgbaColor | null, description?: string, cumulativeBlend?: boolean): void
  setGroupLocked(groupId: string, enabled: boolean): void
  toggleLayerVisibility(layerId: string): void
  selectLayer(layerId: string, mode?: boolean | 'replace' | 'toggle' | 'range'): void
  selectMoveToolLayer(layerId: string, additive?: boolean): void
  renameLayer(layerId: string, name: string): void
  setLayerOpacity(layerId: string, opacity: number): void
  setLayerProperties(layerId: string, name: string, opacity: number): void
  setLayerPropertiesWithBlend(layerId: string, name: string, opacity: number, blendMode: BlendMode, locked?: boolean, displayColor?: RgbaColor | null, description?: string): void
  setLayerLocked(layerId: string, enabled: boolean): void
  beginLayerPropertiesTransaction(targets: readonly LayerPropertyTarget[]): string | null
  previewLayerPropertiesTransaction(id: string, values: LayerPropertyValues, changedFields: readonly LayerPropertyField[]): void
  commitLayerPropertiesTransaction(id: string, values: LayerPropertyValues, changedFields: readonly LayerPropertyField[]): void
  cancelLayerPropertiesTransaction(id: string): void
  previewLayerStyles(ownerKind: 'layer' | 'group', ownerId: string, styles?: LayerStyles): void
  setLayerStyles(ownerKind: 'layer' | 'group', ownerId: string, styles?: LayerStyles): void
  previewLayerStyleEntries(entries: readonly { target: LayerPropertyTarget; styles?: LayerStyles }[]): void
  setLayerStylesForTargets(targets: readonly LayerPropertyTarget[], styles?: LayerStyles, action?: 'edit' | 'paste' | 'clear'): boolean
  setLayerStylesEnabled(targets: readonly LayerPropertyTarget[], enabled: boolean): boolean
  copyLayerStyles(ownerKind: 'layer' | 'group', ownerId: string): boolean
  pasteLayerStyles(targets: readonly LayerPropertyTarget[]): boolean
  clearLayerStyles(targets: readonly LayerPropertyTarget[]): boolean
  applyActiveLayerAdjustment(adjustment: ColorAdjustment): void
  captureActiveLayerAdjustmentSnapshot(): AdjustmentSnapshot | null
  previewActiveLayerAdjustment(adjustment: ColorAdjustment, baseline: AdjustmentSnapshot, selection?: SelectionMask | null, region?: SelectionRect): void
  applyActiveLayerAdjustmentPreviewResult(baseline: AdjustmentSnapshot, result: AdjustmentPreviewResult): void
  restoreActiveDocumentSnapshot(snapshot: AdjustmentSnapshot, regions?: readonly SelectionRect[]): void
  applyActiveLayerAdjustmentFromSnapshot(adjustment: ColorAdjustment, baseline: AdjustmentSnapshot, previewResult?: AdjustmentPreviewResult | null): void
}

export interface WorkspaceClipboardCommands {
  copySelection(): void
  copyActiveLayerToClipboard(): void
  copySelectedLayersToClipboard(): void
  cutSelection(): void
  pasteSelection(): Promise<void>
  pasteClipboard(): Promise<void>
  pasteAsNewLayer(): Promise<boolean>
  pasteAsNewDocument(): Promise<boolean>
  pasteLayerFromClipboard(): boolean
  pasteLayersFromClipboard(): boolean
}

export interface WorkspaceDocumentIoCommands {
  resizeActiveCanvas(width: number, height: number, anchor: CanvasAnchor, offsetX?: number, offsetY?: number, trimOutside?: boolean): Promise<void>
  cropActiveCanvas(): Promise<void>
  trimActiveCanvas(): Promise<void>
  resizeActiveImage(width: number, height: number, interpolation: ImageResizeInterpolation): Promise<void>
  convertColorMode(mode: ColorMode): Promise<void>
  saveActive(saveAs?: boolean, options?: SaveAsOptions): Promise<boolean>
  exportActive(options?: ExportOptions): Promise<boolean>
  openFiles(): Promise<void>
  openPath(filePath: string, options?: { duplicate?: boolean; onBeforeSession?: () => void }): Promise<boolean>
  closeDocument(id: string): Promise<void>
}

export interface WorkspaceRecoveryCommands {
  restoreRecoveries(): Promise<void>
  restoreRecovery(id: string): Promise<boolean>
  autosaveDirty(): Promise<void>
  discardRecovery(id: string): Promise<void>
}

export interface WorkspaceUiCommands {
  dismissSaveProgress(): void
  cancelExport(): void
  setMessage(message: string | null): void
  requestDialog(options: Omit<AppDialog, 'resolve'>): Promise<string>
  resolveDialog(choice: string): void
}

export type WorkspaceState = WorkspaceData
  & WorkspaceSessionCommands
  & WorkspaceSliceCommands
  & WorkspaceToolCommands
  & WorkspaceColorCommands
  & WorkspaceViewSelectionCommands
  & WorkspaceHistoryCommands
  & WorkspaceTilemapCommands
  & WorkspaceFreeTileCommands
  & WorkspaceAnimationCommands
  & WorkspaceLayerCommands
  & WorkspaceClipboardCommands
  & WorkspaceDocumentIoCommands
  & WorkspaceRecoveryCommands
  & WorkspaceUiCommands
