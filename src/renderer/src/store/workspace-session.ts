import type { ImageBrush, LayerMask, ProceduralBrushId, ProceduralBrushSettings, RasterLayer, RgbaColor, SelectionMask, SpriteDocument, ToolId } from '@shared/types'
import { HistoryStack, type ContentInvalidationHint } from '@/core/history'
import { PROCEDURAL_BRUSH_IDS } from '@/core/brushes'
import { packColor, unpackColor } from '@/core/raster'
import {
  cloneProceduralSettings,
  BRUSH_TOOLS,
  defaultToolSettings,
  loadToolSettings,
  normalizePersistedBrushProfile,
  saveToolSettings,
  type BrushTool,
  type PersistedBrushProfile,
  type PersistedToolSettings
} from '@/core/tool-preferences'
import type { BrushProfile, DocumentSession } from './workspace-types'
import { defaultSymmetryCenter } from '@/core/symmetry'
import { ensureAnimationDocument, parseAnimationCelKey } from '@/core/animation'
import { normalizeProjectDisplaySettings, normalizeProjectStatistics, normalizeTimelapseSettings } from '@/core/project-metadata'
import { findLayerMask, getActiveLayer, getLayerIdsInGroup, isLayerEffectivelyLocked, isLayerEffectivelyVisible } from '@/core/document'
import { cloneBrushDynamicsSettings, normalizeBrushDynamicsSettings } from '@/core/pressure'
import { applyProjectLayerPanelState, loadLocalLayerPanelState, normalizeProjectLayerPanelState } from '@/core/layer-panel-state'
import { ensureTilemapTilesetOwnership } from '@/core/tilemap-document'
import { ensureFreeTileTilesetOwnership } from '@/core/free-tile-document'
import { loadEditorPreferences } from '@/core/file-preferences'
import { loadDocumentViewState } from '@/core/document-view-state'

const defaultColor: RgbaColor = { r: 41, g: 121, b: 255, a: 255 }
const defaultSecondary: RgbaColor = { r: 241, g: 244, b: 248, a: 255 }

export const isBrushTool = (tool: ToolId): tool is BrushTool => BRUSH_TOOLS.includes(tool as BrushTool)

const TEXT_LAYER_ALLOWED_TOOLS = new Set<ToolId>(['text', 'move', 'eyedropper', 'hand', 'zoom', 'rotate'])
const TILEMAP_LAYER_ALLOWED_TOOLS = new Set<ToolId>(['pencil', 'eraser', 'selection', 'move', 'eyedropper', 'hand', 'zoom', 'rotate'])
const FREE_TILE_PAINT_ALLOWED_TOOLS = new Set<ToolId>(['pencil', 'eraser', 'move', 'eyedropper', 'hand', 'zoom', 'rotate'])
const FREE_TILE_EDIT_ALLOWED_TOOLS = new Set<ToolId>(['pencil', 'airbrush', 'eraser', 'fill', 'selection', 'shape', 'line', 'move', 'eyedropper', 'hand', 'zoom', 'rotate'])

export const isToolAvailableForSession = (session: DocumentSession, tool: ToolId): boolean => {
  const groupSelected = session.selectedGroupIds.length > 0 || Boolean(session.selectedGroupId)
  if (groupSelected) return tool === 'move' || tool === 'hand' || tool === 'zoom' || tool === 'rotate'
  if (session.activeLayerMaskId) return true
  const textLayerSelected = session.selectedLayerIds.some((id) => session.document.layers.some((layer) => layer.id === id && layer.kind === 'text'))
  if (textLayerSelected) return TEXT_LAYER_ALLOWED_TOOLS.has(tool)
  const tilemapLayerSelected = session.selectedLayerIds.some((id) => session.document.layers.some((layer) => layer.id === id && layer.kind === 'tilemap'))
  if (tilemapLayerSelected && session.tilemapMode === 'paint') return TILEMAP_LAYER_ALLOWED_TOOLS.has(tool)
  const freeTileLayerSelected = session.selectedLayerIds.some((id) => session.document.layers.some((layer) => layer.id === id && layer.kind === 'free-tile'))
  if (!freeTileLayerSelected) return true
  return (session.freeTileMode === 'edit' ? FREE_TILE_EDIT_ALLOWED_TOOLS : FREE_TILE_PAINT_ALLOWED_TOOLS).has(tool)
}

export const copyCanvasToolSettings = (source: DocumentSession, target: DocumentSession): void => {
  Object.assign(target, {
    tool: source.tool,
    moveKind: source.moveKind,
    primaryColor: { ...source.primaryColor },
    secondaryColor: { ...source.secondaryColor },
    brushSize: source.brushSize,
    brushShape: source.brushShape,
    brushDither: structuredClone(source.brushDither),
    brushTexture: source.brushTexture,
    brushTextureScale: source.brushTextureScale,
    brushPaintMode: source.brushPaintMode,
    brushImageId: source.brushImageId,
    brushImage: source.brushImage ? structuredClone(source.brushImage) : null,
    brushImageTemporary: source.brushImageTemporary,
    brushImageSettings: structuredClone(source.brushImageSettings),
    brushProfiles: structuredClone(source.brushProfiles),
    proceduralBrushSettings: structuredClone(source.proceduralBrushSettings),
    proceduralAntialias: source.proceduralAntialias,
    proceduralAntialiasStrength: source.proceduralAntialiasStrength,
    brushDynamics: structuredClone(source.brushDynamics),
    brushPressure: structuredClone(source.brushPressure),
    shapeKind: source.shapeKind,
    lineKind: source.lineKind,
    curveAnchorCount: source.curveAnchorCount,
    shapeRatio: source.shapeRatio,
    shapeRounded: source.shapeRounded,
    shapeCornerRadius: source.shapeCornerRadius,
    fillMode: source.fillMode,
    fillKind: source.fillKind,
    fillTolerance: source.fillTolerance,
    fillGapClosing: source.fillGapClosing,
    fillGapThreshold: source.fillGapThreshold,
    gradientTolerance: source.gradientTolerance,
    gradientContiguous: source.gradientContiguous,
    gradientType: source.gradientType,
    gradientDither: source.gradientDither,
    gradientFreeform: source.gradientFreeform,
    gradientStops: source.gradientStops ? structuredClone(source.gradientStops) : undefined,
    moveAutoSelect: source.moveAutoSelect,
    selectionKind: source.selectionKind,
    selectionMode: source.selectionMode,
    selectionRounded: source.selectionRounded,
    selectionCornerRadius: source.selectionCornerRadius,
    wandTolerance: source.wandTolerance,
    wandContiguous: source.wandContiguous,
    wandGapClosing: source.wandGapClosing,
    wandGapThreshold: source.wandGapThreshold,
    perfectPixels: source.perfectPixels,
    symmetryAxes: structuredClone(source.symmetryAxes),
    symmetryAxesInitialized: structuredClone(source.symmetryAxesInitialized),
    airbrushParticleRadius: source.airbrushParticleRadius,
    airbrushParticleShape: source.airbrushParticleShape,
    airbrushScatterRadius: source.airbrushScatterRadius,
    airbrushDensity: source.airbrushDensity,
    airbrushIntervalMs: source.airbrushIntervalMs
  })
}

export const activeLayerMask = (session: DocumentSession): LayerMask | null => session.activeLayerMaskId
  ? findLayerMask(session.document, session.activeLayerMaskId)
  : null

export const activePaintLayer = (session: DocumentSession): RasterLayer => activeLayerMask(session) ?? getActiveLayer(session.document)

const MASK_WHITE: RgbaColor = { r: 255, g: 255, b: 255, a: 255 }
const MASK_BLACK: RgbaColor = { r: 0, g: 0, b: 0, a: 255 }

export const enterLayerMaskEditing = (session: DocumentSession): void => {
  if (!session.layerMaskColorMemory) session.layerMaskColorMemory = { primary: { ...session.primaryColor }, secondary: { ...session.secondaryColor } }
  session.primaryColor = { ...MASK_WHITE }
  session.secondaryColor = { ...MASK_BLACK }
}

export const exitLayerMaskEditing = (session: DocumentSession): void => {
  const memory = session.layerMaskColorMemory
  session.layerMaskColorMemory = undefined
  if (!memory) return
  session.primaryColor = { ...memory.primary }
  session.secondaryColor = { ...memory.secondary }
}

export const selectedTransformLayersForSession = (session: DocumentSession): RasterLayer[] => {
  const mask = activeLayerMask(session)
  if (mask) return [mask]
  const selectedIds = new Set(session.selectedLayerIds)
  for (const key of [...session.selectedAnimationCellKeys, ...session.selectedAnimationMaskCellKeys]) {
    const target = parseAnimationCelKey(key)
    if (target) selectedIds.add(target.layerId)
  }
  const selectedGroupIds = new Set(session.selectedGroupIds)
  if (session.selectedGroupId) selectedGroupIds.add(session.selectedGroupId)
  for (const groupId of selectedGroupIds) for (const layerId of getLayerIdsInGroup(session.document, groupId)) selectedIds.add(layerId)
  // Frame selection without an explicit layer selection means the complete
  // editable timeline. Once the user explicitly selects layers, the frame
  // selection is scoped to those layers.
  if (session.selectedAnimationFrameIds.length > 0 && session.layerSelectionExplicit !== true) {
    return session.document.layers.filter((layer) => !layer.kind
      && isLayerEffectivelyVisible(session.document, layer)
      && !isLayerEffectivelyLocked(session.document, layer))
  }
  return session.document.layers.filter((layer) => selectedIds.has(layer.id))
}

export const selectedTransformLayersAreEditable = (
  session: DocumentSession,
  layers = selectedTransformLayersForSession(session)
): boolean => layers.length > 0
  && (layers.length === 1 || layers.every((layer) => !layer.kind))
  && layers.every((layer) => isLayerEffectivelyVisible(session.document, layer) && !isLayerEffectivelyLocked(session.document, layer))

export const brushProfileFromSession = (session: DocumentSession): BrushProfile => ({
  brushSize: session.brushSize,
  brushShape: session.brushShape,
  brushDither: { ...(session.brushDither ?? defaultToolSettings.brushDither) },
  brushTexture: session.brushTexture,
  brushTextureScale: session.brushTextureScale,
  brushPaintMode: session.brushPaintMode,
  brushImageId: session.brushImageId,
  brushImage: session.brushImage,
  brushImageTemporary: session.brushImageTemporary,
  brushImageSettings: { ...session.brushImageSettings },
  proceduralBrushSettings: cloneProceduralSettings(session.proceduralBrushSettings),
  proceduralAntialias: session.proceduralAntialias,
  proceduralAntialiasStrength: session.proceduralAntialiasStrength,
  brushDynamics: cloneBrushDynamicsSettings(session.brushDynamics),
  brushPressure: { ...session.brushPressure }
})

export const applyBrushProfile = (session: DocumentSession, profile: BrushProfile): void => {
  session.brushSize = profile.brushSize
  session.brushShape = profile.brushShape
  session.brushDither = { ...profile.brushDither }
  session.brushTexture = profile.brushTexture
  session.brushTextureScale = profile.brushTextureScale
  session.brushPaintMode = profile.brushPaintMode
  session.brushImageId = profile.brushImageId
  session.brushImage = profile.brushImage
  session.brushImageTemporary = profile.brushImageTemporary
  session.brushImageSettings = { ...profile.brushImageSettings }
  session.proceduralBrushSettings = cloneProceduralSettings(profile.proceduralBrushSettings)
  session.proceduralAntialias = profile.proceduralAntialias
  session.proceduralAntialiasStrength = profile.proceduralAntialiasStrength
  session.brushDynamics = cloneBrushDynamicsSettings(profile.brushDynamics)
  session.brushPressure = { ...profile.brushPressure }
}

export const remapSelectionBrushColors = (brush: ImageBrush, primary: RgbaColor, secondary: RgbaColor): ImageBrush => {
  if (!brush.intrinsicSize || brush.sourceX === undefined || brush.sourceY === undefined || !brush.colors || brush.colors.length !== brush.width * brush.height) return brush
  const paintColors = new Uint32Array(brush.colors.length)
  for (let index = 0; index < brush.colors.length; index += 1) {
    const source = unpackColor(brush.colors[index] ?? 0)
    if (source.a === 0) continue
    const luminance = (source.r * 2126 + source.g * 7152 + source.b * 722) / 10000
    const replacement = luminance >= 128 ? primary : secondary
    paintColors[index] = packColor({ ...replacement, a: Math.round(replacement.a * source.a / 255) })
  }
  return { ...brush, paintColors }
}

export const clearSelectionBrushPaintColors = (brush: ImageBrush | null): ImageBrush | null => brush ? { ...brush, paintColors: undefined } : null

export const rememberBrushProfile = (session: DocumentSession): void => {
  if (isBrushTool(session.tool)) session.brushProfiles[session.tool] = brushProfileFromSession(session)
}

let toolSettingsPersistTimer: number | null = null

function persistedBrushProfileFromSession(profile: BrushProfile): PersistedBrushProfile {
  return {
    brushSize: profile.brushSize,
    brushShape: profile.brushShape,
    brushDither: { ...profile.brushDither },
    brushTexture: profile.brushTexture,
    brushTextureScale: profile.brushTextureScale,
    brushPaintMode: profile.brushPaintMode,
    brushImageId: profile.brushImageTemporary ? null : profile.brushImageId,
    brushImageSettings: { ...profile.brushImageSettings },
    proceduralBrushSettings: cloneProceduralSettings(profile.proceduralBrushSettings),
    proceduralAntialias: profile.proceduralAntialias,
    proceduralAntialiasStrength: profile.proceduralAntialiasStrength,
    brushDynamics: cloneBrushDynamicsSettings(profile.brushDynamics),
    brushPressure: { ...profile.brushPressure }
  }
}

function brushProfileFromPersisted(profile: PersistedBrushProfile): BrushProfile {
  return {
    ...profile,
    brushDither: { ...profile.brushDither },
    brushImage: null,
    brushImageTemporary: false,
    brushImageSettings: { ...profile.brushImageSettings },
    proceduralBrushSettings: cloneProceduralSettings(profile.proceduralBrushSettings),
    brushDynamics: normalizeBrushDynamicsSettings(profile.brushDynamics),
    brushPressure: { ...profile.brushPressure }
  }
}

export function persistToolSettings(session: DocumentSession): void {
  const activeProfile = brushProfileFromSession(session)
  if (isBrushTool(session.tool)) session.brushProfiles[session.tool] = activeProfile
  const profiles = Object.fromEntries(BRUSH_TOOLS.map((tool) => [
    tool,
    persistedBrushProfileFromSession(session.brushProfiles[tool])
  ])) as Record<BrushTool, PersistedBrushProfile>
  const active = persistedBrushProfileFromSession(activeProfile)
  const snapshot: PersistedToolSettings = {
    ...active,
    brushPaintModePreferenceVersion: 1,
    proceduralAntialiasPreferenceVersion: 1,
    brushProfiles: profiles,
    shapeKind: session.shapeKind,
    lineKind: session.lineKind,
    curveAnchorCount: session.curveAnchorCount,
    shapeRatio: session.shapeRatio ? { ...session.shapeRatio } : null,
    shapeRounded: session.shapeRounded,
    shapeCornerRadius: session.shapeCornerRadius,
    fillMode: session.fillMode,
    fillKind: session.fillKind ?? 'bucket',
    fillTolerance: session.fillTolerance,
    fillGapClosing: session.fillGapClosing,
    fillGapThreshold: session.fillGapThreshold,
    gradientTolerance: session.gradientTolerance,
    gradientContiguous: session.gradientContiguous,
    gradientType: session.gradientType,
    gradientDither: session.gradientDither ?? 'none',
    gradientFreeform: session.gradientFreeform ?? false,
    gradientStops: (session.gradientStops ?? defaultToolSettings.gradientStops).map((stop) => ({ ...stop, color: { ...stop.color } })),
    moveAutoSelect: session.moveAutoSelect,
    selectionKind: session.selectionKind,
    selectionMode: session.selectionMode,
    selectionRounded: session.selectionRounded,
    selectionCornerRadius: session.selectionCornerRadius,
    wandTolerance: session.wandTolerance,
    wandContiguous: session.wandContiguous,
    wandGapClosing: session.wandGapClosing,
    wandGapThreshold: session.wandGapThreshold,
    perfectPixels: session.perfectPixels,
    airbrushParticleRadius: session.airbrushParticleRadius,
    airbrushParticleShape: session.airbrushParticleShape,
    airbrushScatterRadius: session.airbrushScatterRadius,
    airbrushDensity: session.airbrushDensity,
    airbrushIntervalMs: session.airbrushIntervalMs,
    symmetryAxes: { ...session.symmetryAxes }
  }
  try {
    if (toolSettingsPersistTimer !== null) window.clearTimeout(toolSettingsPersistTimer)
    toolSettingsPersistTimer = window.setTimeout(() => {
      saveToolSettings(snapshot)
      toolSettingsPersistTimer = null
    }, 100)
  } catch { /* Ignore unavailable renderer storage. */ }
}

export const sessionFromDocument = (document: SpriteDocument): DocumentSession => {
  if (!document.layers.some((layer) => layer.id === document.activeLayerId)) {
    const fallbackLayerId = document.layers.at(-1)?.id
    if (fallbackLayerId) document.activeLayerId = fallbackLayerId
  }
  // Loading a document is a read/session boundary. Do not normalize sparse
  // animation timelines here: GIF/imported projects may intentionally omit
  // empty cel slots, and merely opening/selecting them must not allocate
  // surfaces. Editing/drawing commands materialize slots at their boundary.
  const timeline = document.animation ?? ensureAnimationDocument(document)
  ensureTilemapTilesetOwnership(document)
  ensureFreeTileTilesetOwnership(document)
  document.displaySettings = normalizeProjectDisplaySettings(document.displaySettings)
  document.statistics = normalizeProjectStatistics(document.statistics)
  document.timelapse = normalizeTimelapseSettings(document.timelapse, document.timelapse?.snapshots ?? [])
  const layerPanelState = loadLocalLayerPanelState(document) ?? normalizeProjectLayerPanelState(document, document.layerPanelState)
  const settings = loadToolSettings()
  const editorPreferences = loadEditorPreferences()
  const storedView = loadDocumentViewState(document)
  const fallbackProfile = normalizePersistedBrushProfile(settings, defaultToolSettings)
  const persistedProfiles = settings.brushProfiles ?? Object.fromEntries(BRUSH_TOOLS.map((tool) => [tool, fallbackProfile])) as Record<BrushTool, PersistedBrushProfile>
  const brushProfiles = Object.fromEntries(BRUSH_TOOLS.map((tool) => [
    tool,
    brushProfileFromPersisted(persistedProfiles[tool] ?? fallbackProfile)
  ])) as Record<BrushTool, BrushProfile>
  const activeLayer = document.layers.find((layer) => layer.id === document.activeLayerId)
  const initialTilesetId = activeLayer?.kind === 'free-tile'
    ? activeLayer.freeTileSources?.[0]?.tilesetId
    : activeLayer?.tilemapTilesetId
  const initialTileset = document.tilesets?.find((tileset) => tileset.id === initialTilesetId) ?? document.tilesets?.[0]
  const session = {
    document,
    history: new HistoryStack(),
    tool: 'pencil',
    moveKind: 'move',
    selectedSliceId: null,
    selectedSliceIds: [],
    selectedTilesetId: initialTileset?.id ?? null,
    selectedTileId: initialTileset?.tileIds[0] ?? null,
    secondaryTileId: initialTileset?.tileIds[0] ?? null,
    selectedFreeTileInstanceId: null,
    selectedFreeTileInstanceIds: [],
    freeTileInstanceSelectionAnchorId: null,
    freeTileInstanceLayerId: null,
    tilemapMode: 'hybrid',
    freeTileMode: 'paint',
    primaryColor: document.palette.find((entry) => entry.id !== 0)?.color ?? defaultColor,
    secondaryColor: defaultSecondary,
    brushSize: settings.brushSize,
    brushShape: settings.brushShape,
    brushDither: { ...settings.brushDither },
    brushTexture: settings.brushTexture,
    brushTextureScale: settings.brushTextureScale,
    brushPaintMode: settings.brushPaintMode,
    brushImageId: settings.brushImageId,
    brushImage: null,
    brushImageTemporary: false,
    brushImageSettings: { ...settings.brushImageSettings },
    brushProfiles: {} as Record<BrushTool, BrushProfile>,
    proceduralBrushSettings: Object.fromEntries(PROCEDURAL_BRUSH_IDS.map((id) => [id, { ...settings.proceduralBrushSettings[id] }])) as Record<ProceduralBrushId, ProceduralBrushSettings>,
    proceduralAntialias: settings.proceduralAntialias,
    proceduralAntialiasStrength: settings.proceduralAntialiasStrength,
    brushDynamics: normalizeBrushDynamicsSettings(settings.brushDynamics),
    brushPressure: { ...settings.brushPressure },
    shapeKind: settings.shapeKind,
    lineKind: settings.lineKind,
    curveAnchorCount: settings.curveAnchorCount,
    shapeRatio: typeof settings.shapeRatio === 'number' ? { width: settings.shapeRatio, height: 1 } : settings.shapeRatio ? { ...settings.shapeRatio } : null,
    shapeRounded: settings.shapeRounded,
    shapeCornerRadius: settings.shapeCornerRadius,
    fillMode: settings.fillMode,
    fillKind: settings.fillKind,
    fillTolerance: settings.fillTolerance,
    fillGapClosing: settings.fillGapClosing,
    fillGapThreshold: settings.fillGapThreshold,
    gradientTolerance: settings.gradientTolerance,
    gradientContiguous: settings.gradientContiguous,
    gradientType: settings.gradientType,
    gradientDither: settings.gradientDither,
    gradientFreeform: settings.gradientFreeform,
    gradientStops: settings.gradientStops.map((stop) => ({ ...stop, color: { ...stop.color } })),
    moveAutoSelect: settings.moveAutoSelect,
    selection: null,
    selectionPropertiesActive: false,
    selectionAngle: 0,
    freeTransformQuad: null,
    selectionPivot: null,
    selectionKind: settings.selectionKind,
    selectionMode: settings.selectionMode,
    selectionRounded: settings.selectionRounded,
    selectionCornerRadius: settings.selectionCornerRadius,
    wandTolerance: settings.wandTolerance,
    wandContiguous: settings.wandContiguous,
    wandGapClosing: settings.wandGapClosing,
    wandGapThreshold: settings.wandGapThreshold,
    perfectPixels: settings.perfectPixels,
    airbrushParticleRadius: settings.airbrushParticleRadius,
    airbrushParticleShape: settings.airbrushParticleShape,
    airbrushScatterRadius: settings.airbrushScatterRadius,
    airbrushDensity: settings.airbrushDensity,
    airbrushIntervalMs: settings.airbrushIntervalMs,
    symmetryAxes: { ...settings.symmetryAxes },
    symmetryAxesInitialized: {
      horizontal: settings.symmetryAxes.horizontal,
      vertical: settings.symmetryAxes.vertical,
      diagonalUp: settings.symmetryAxes.diagonalUp,
      diagonalDown: settings.symmetryAxes.diagonalDown,
      rotational: Boolean(settings.symmetryAxes.rotational)
    },
    symmetryCenter: storedView?.symmetryCenter ?? defaultSymmetryCenter(document.width, document.height),
    lastPencilPoint: null,
    lastEraserPoint: null,
    canvasResizePreview: null,
    outlinePreview: null,
    pendingPaste: null,
    textBoxTransform: null,
    view: {
      zoom: storedView?.zoom ?? 16,
      panX: storedView?.panX ?? 0,
      panY: storedView?.panY ?? 0,
      rotation: storedView?.rotation ?? 0,
      mirrored: storedView?.mirrored ?? false,
      mirroredVertical: storedView?.mirroredVertical ?? false,
      showPixelGrid: document.displaySettings.showPixelGrid,
      showGrid: document.displaySettings.showGrid,
      isoViewEnabled: false,
      relativeLuminance: false,
      showSelectionOutline: true,
      showSelectionPivot: false,
      tileRepeatMode: 'off',
      quickCommandBarPositionX: 0.5,
      quickCommandBarExpanded: editorPreferences.quickCommandBarExpanded,
      grid: { ...document.displaySettings.grid }
    },
    viewportSize: { width: 0, height: 0 },
    paletteSelectionId: document.palette.find((entry) => entry.id !== 0)?.id ?? document.palette[0]?.id ?? null,
    paletteSecondarySelectionId: null,
    selectedPaletteIds: document.palette.find((entry) => entry.id !== 0)?.id !== undefined
      ? [document.palette.find((entry) => entry.id !== 0)!.id]
      : document.palette[0] ? [document.palette[0].id] : [],
    selectedGroupId: null,
    selectedGroupIds: [],
    selectedLayerIds: [document.activeLayerId],
    layerSelectionExplicit: false,
    activeLayerMaskId: null,
    layerMaskIsolatedView: false,
    layerSelectionAnchorId: document.activeLayerId,
    collapsedGroupIds: [],
    animationPlaying: false,
    animationPlaybackRate: 1,
    animationPlaybackMode: timeline.loop ? 'all' : 'once',
    animationPlaybackStartFrameId: null,
    animationPlaybackLoopSectionId: null,
    animationPlaybackLoopIteration: 0,
    animationPlaybackLoopSectionRepeatIndefinitely: false,
    animationReturnToStart: false,
    timelineActiveContext: {
      row: { kind: 'layer', ownerKind: 'layer', ownerId: document.activeLayerId },
      frameId: timeline.activeFrameId,
      maskEditTargetId: null
    },
    selectedAnimationFrameIds: [],
    animationFrameSelectionAnchorId: null,
    selectedAnimationCellKeys: [],
    animationCellSelectionAnchorKey: null,
    animationCellSelectionExplicit: false,
    selectedAnimationMaskCellKeys: [],
    selectedAnimationMaskRowKeys: [],
    animationMaskCellSelectionAnchorKey: null,
    animationCellClipboard: [],
    animationCellClipboardAnchorKey: null,
    animationMaskClipboard: [],
    animationMaskClipboardAnchorKey: null,
    animationFrameClipboard: [],
    revision: 0,
    contentRevision: 0,
    selectionGuidesPreservedAtContentRevision: undefined,
    layersPanelRevision: 0,
    contentInvalidation: null,
    recoveryOriginId: null,
    recoverySuppressed: false
  } as DocumentSession
  applyBrushProfile(session, brushProfiles.pencil)
  session.brushProfiles = brushProfiles
  applyProjectLayerPanelState(session, layerPanelState)
  return session
}

export function touch(session: DocumentSession, dirty = true, invalidation: ContentInvalidationHint = { kind: 'full' }): void {
  if (dirty) {
    const fromRevision = session.contentRevision
    session.document.dirty = true
    session.document.updatedAt = new Date().toISOString()
    session.revision += 1
    session.contentRevision += 1
    if (invalidation.kind === 'full') session.layersPanelRevision += 1
    session.contentInvalidation = invalidation.kind === 'region'
      ? { ...invalidation, rect: { ...invalidation.rect }, fromRevision, revision: session.contentRevision }
      : { kind: 'full', fromRevision, revision: session.contentRevision }
    session.recoverySuppressed = false
  }
}

export function touchMetadata(session: DocumentSession): void {
  session.document.dirty = true
  session.document.updatedAt = new Date().toISOString()
  session.layersPanelRevision += 1
  session.recoverySuppressed = false
}

export const cloneSelectionMask = (selection: SelectionMask | null): SelectionMask | null =>
  selection ? { ...selection, mask: selection.mask?.slice() } : null
