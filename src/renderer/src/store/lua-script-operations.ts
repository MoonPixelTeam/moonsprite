import type { AnimationLoopDirection } from '@shared/types-animation'
import type { BlendMode, RgbaColor } from '@shared/types-color'
import type { ColorMode } from '@shared/types-raster'
import type { FreeTileInstance, TilemapCell } from '@shared/types-tiles'
import type { LuaScriptOperation, LuaScriptSurfaceSnapshot } from '@shared/types-scripting'
import type { MoonSpriteApi } from '@shared/types-platform'
import type { SelectionMask } from '@shared/types-selection'
import type { StoredBrush } from '@shared/types-library'
import type { WorkspacePanelDock, WorkspacePanelId } from '@shared/types-workspace'
import { animationLayerAtFrame, ensureAnimationDocument, refreshActiveAnimationFrame, syncAnimationLayerAtFrame } from '@/core/animation'
import { publishBrushLibraryChanged } from '@/core/brush-library-events'
import { createId, getActiveLayer, markLayerContentChanged, readLayerPacked, setLayerStorageOrigin } from '@/core/document-model'
import {
  captureFreeTileSourceSnapshot,
  freeTileSourceOwnerForId
} from '@/core/free-tile-document'
import { cloneFreeTileCelData } from '@/core/free-tile'
import { normalizeLayerStyles } from '@/core/layer-styles'
import { translateCurrent as tr } from '@/core/localization'
import { extractPaletteColors } from '@/core/palette'
import {
  beginTilemapEdit,
  createBlankTileset,
  readTilesetTilePixels
} from '@/core/tilemap'
import { tilemapCelTargetAt, writeTilemapCell } from '@/core/tilemap-document'
import {
  DEFAULT_PANEL_DOCKS,
  loadPanelDocks,
  loadPanelVisibility
} from '@/core/workspace-layout-preferences'
import { importBrushPaths } from '@/platform/brush-library-service'
import type { ExportOptions, SaveAsOptions } from './document-file-service'
import { cloneSelectionMask } from './workspace-session'
import type { DocumentSession } from './workspace-types'
import { useWorkspace } from './workspace'

const MAX_RESOURCE_SNAPSHOT_PIXELS = 1_048_576
const MAX_LUA_SURFACE_PIXELS = 4_194_304
const PANEL_IDS = Object.keys(DEFAULT_PANEL_DOCKS) as WorkspacePanelId[]
const COLOR_MODES: readonly ColorMode[] = ['rgba', 'grayscale', 'indexed']
const BLEND_MODES: readonly BlendMode[] = [
  'normal', 'darken', 'multiply', 'color-burn', 'linear-burn', 'lighten', 'screen', 'color-dodge', 'linear-dodge',
  'overlay', 'soft-light', 'hard-light', 'vivid-light', 'linear-light', 'pin-light', 'hard-mix', 'difference',
  'exclusion', 'subtract', 'divide', 'hue', 'saturation', 'color', 'luminosity'
]

export interface LuaScriptOperationResult {
  changedPixelCount: number
  documentBoundary: boolean
}

const packedRgba = (pixels: Uint8ClampedArray, index: number): number => {
  const offset = index * 4
  return (pixels[offset] | pixels[offset + 1] << 8 | pixels[offset + 2] << 16 | pixels[offset + 3] << 24) >>> 0
}

const resourcePixels = (pixels: Uint8ClampedArray, used: { count: number }): number[] | null => {
  const count = Math.floor(pixels.length / 4)
  if (used.count + count > MAX_RESOURCE_SNAPSHOT_PIXELS) return null
  used.count += count
  return Array.from({ length: count }, (_, index) => packedRgba(pixels, index))
}

const layerInfo = (layer: DocumentSession['document']['layers'][number]) => ({
  id: layer.id,
  name: layer.name,
  kind: layer.kind ?? 'raster',
  groupId: layer.groupId ?? null,
  width: layer.width,
  height: layer.height,
  x: layer.offsetX,
  y: layer.offsetY,
  opacity: Math.round(layer.opacity * 255),
  visible: layer.visible,
  locked: layer.locked,
  format: layer.format,
  blendMode: layer.blendMode,
  displayColor: layer.displayColor ?? null,
  description: layer.description ?? '',
  styles: layer.layerStyles ?? null,
  tilemapTilesetId: layer.tilemapTilesetId ?? null,
  freeTileSetId: layer.freeTileSetId ?? null
})

export function buildLuaMseSnapshot(session: DocumentSession, storedBrushes: readonly StoredBrush[] = []): Record<string, unknown> {
  const document = session.document
  const timeline = ensureAnimationDocument(document)
  const activeLayer = getActiveLayer(document)
  const activeFrameIndex = Math.max(0, timeline.frames.findIndex((frame) => frame.id === timeline.activeFrameId))
  const activeCel = timeline.cels.find((cel) => cel.layerId === activeLayer.id && cel.frameId === timeline.activeFrameId)
  const usedResourcePixels = { count: 0 }
  const panelVisibility = loadPanelVisibility()
  const panelDocks = loadPanelDocks()
  const projectBrushes = (document.customBrushes ?? []).map((brush) => ({
    id: brush.id,
    name: brush.name,
    source: 'project',
    width: brush.width,
    height: brush.height,
    sourceX: brush.sourceX ?? 0,
    sourceY: brush.sourceY ?? 0,
    coverage: brush.coverage.length <= MAX_RESOURCE_SNAPSHOT_PIXELS ? Array.from(brush.coverage) : null,
    colors: brush.colors && brush.colors.length <= MAX_RESOURCE_SNAPSHOT_PIXELS ? Array.from(brush.colors) : null
  }))
  const localBrushes = storedBrushes.map((brush) => ({
    id: brush.id,
    name: brush.name,
    source: 'local',
    folderId: brush.folderId ?? null,
    intrinsicSize: brush.intrinsicSize === true,
    sourceX: brush.sourceX ?? 0,
    sourceY: brush.sourceY ?? 0
  }))
  return {
    document: {
      id: document.id,
      name: document.name,
      filePath: document.filePath ?? document.sourceFilePath ?? '',
      width: document.width,
      height: document.height,
      colorMode: document.colorMode,
      frame: activeFrameIndex + 1,
      activeLayer: layerInfo(activeLayer)
    },
    layers: document.layers.map(layerInfo),
    animation: {
      frames: timeline.frames.map((frame, index) => ({ id: frame.id, number: index + 1, duration: frame.duration, disabled: frame.disabled === true, active: frame.id === timeline.activeFrameId })),
      loops: (timeline.loopSections ?? []).map((loop) => ({ ...loop }))
    },
    range: {
      layerIds: session.selectedLayerIds.length > 0 ? [...session.selectedLayerIds] : [activeLayer.id],
      frameIds: session.selectedAnimationFrameIds.length > 0 ? [...session.selectedAnimationFrameIds] : [timeline.activeFrameId],
      cellKeys: [...session.selectedAnimationCellKeys]
    },
    palette: {
      entries: document.palette.map((entry) => ({ id: entry.id, name: entry.name, color: { ...entry.color } })),
      order: [...document.paletteOrder],
      slots: document.paletteSlots ? [...document.paletteSlots] : null,
      columns: document.paletteColumns ?? 0,
      nextColorId: document.nextColorId
    },
    tiles: {
      sets: (document.tilesets ?? []).map((tileset) => ({
        id: tileset.id,
        name: tileset.name,
        tileWidth: tileset.tileWidth,
        tileHeight: tileset.tileHeight,
        columns: tileset.columns,
        rows: tileset.rows,
        tileIds: [...tileset.tileIds],
        tileSlots: tileset.tileSlots ? [...tileset.tileSlots] : null,
        pixels: resourcePixels(tileset.pixels, usedResourcePixels)
      }))
    },
    freeTiles: {
      layerId: activeLayer.kind === 'free-tile' ? activeLayer.id : null,
      frameId: timeline.activeFrameId,
      setId: activeLayer.kind === 'free-tile' ? activeLayer.freeTileSetId ?? activeLayer.id : null,
      sources: activeLayer.kind === 'free-tile' ? (activeLayer.freeTileSources ?? []).map((source) => ({ ...source, displayColor: source.displayColor ?? null })) : [],
      instances: activeLayer.kind === 'free-tile' ? (activeCel?.freeTiles?.instances ?? []).map((instance) => ({ ...instance })) : []
    },
    brushes: [...projectBrushes, ...localBrushes],
    slices: (document.slices ?? []).map((slice) => ({ ...slice })),
    workspace: {
      panels: PANEL_IDS.map((id) => ({ id, visible: panelVisibility[id], dock: panelDocks[id] }))
    }
  }
}

const activeSession = (): DocumentSession => {
  const state = useWorkspace.getState()
  const session = state.sessions.find((candidate) => candidate.document.id === state.activeId)
  if (!session) throw new Error(tr('script.documentRequired'))
  return session
}

const operationError = (path: string, detail: string): Error => new Error(`mse.${path}: ${detail}`)

const recordValue = (value: unknown): Record<string, unknown> | null => (
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
)

const positional = (value: unknown): unknown[] => Array.isArray(value) ? value : [value]

const specFor = (operation: LuaScriptOperation): Record<string, unknown> => {
  const direct = recordValue(operation.arguments)
  if (direct) return direct
  const values = positional(operation.arguments)
  const second = recordValue(values[1])
  if (operation.path === 'styles.apply' && second) return { id: values[0], styles: second }
  if (operation.path === 'palette.update' && second && second.r !== undefined) return { id: values[0], color: second }
  return second ? { ...second, id: second.id ?? values[0] } : { value: values[0] }
}

const stringValue = (value: unknown, fallback = ''): string => typeof value === 'string' ? value : fallback
const finiteNumber = (value: unknown, fallback = 0): number => typeof value === 'number' && Number.isFinite(value) ? value : fallback
const integer = (value: unknown, fallback = 0): number => Math.trunc(finiteNumber(value, fallback))
const booleanValue = (value: unknown, fallback = false): boolean => typeof value === 'boolean' ? value : fallback

const surfaceSnapshotValue = (value: unknown, format: LuaScriptSurfaceSnapshot['format']): LuaScriptSurfaceSnapshot => {
  const source = recordValue(value)
  if (!source) throw new Error('surface must be an object')
  const width = integer(source.width)
  const height = integer(source.height)
  const pixelCount = width * height
  if (source.format !== format
    || !Number.isSafeInteger(width)
    || !Number.isSafeInteger(height)
    || width < 1
    || height < 1
    || !Number.isSafeInteger(pixelCount)
    || pixelCount > MAX_LUA_SURFACE_PIXELS
    || !Array.isArray(source.pixels)
    || source.pixels.length !== pixelCount
    || source.pixels.some((pixel) => !Number.isSafeInteger(pixel))) {
    throw new Error('surface is invalid')
  }
  return {
    format,
    width,
    height,
    offsetX: integer(source.offsetX),
    offsetY: integer(source.offsetY),
    pixels: source.pixels.map((pixel) => (pixel as number) >>> 0)
  }
}

const snapshotForLayer = (document: DocumentSession['document'], layer: DocumentSession['document']['layers'][number]): LuaScriptSurfaceSnapshot => ({
  format: layer.format,
  width: layer.width,
  height: layer.height,
  offsetX: layer.offsetX,
  offsetY: layer.offsetY,
  pixels: Array.from({ length: layer.width * layer.height }, (_, index) => readLayerPacked(document, layer, index) >>> 0)
})

const equalSurfaceSnapshots = (left: LuaScriptSurfaceSnapshot, right: LuaScriptSurfaceSnapshot): boolean => (
  left.format === right.format
  && left.width === right.width
  && left.height === right.height
  && left.offsetX === right.offsetX
  && left.offsetY === right.offsetY
  && left.pixels.length === right.pixels.length
  && left.pixels.every((pixel, index) => (pixel >>> 0) === (right.pixels[index] >>> 0))
)

const applySurfaceSnapshot = (layer: DocumentSession['document']['layers'][number], snapshot: LuaScriptSurfaceSnapshot): void => {
  markLayerContentChanged(layer)
  layer.width = snapshot.width
  layer.height = snapshot.height
  layer.offsetX = snapshot.offsetX
  layer.offsetY = snapshot.offsetY
  setLayerStorageOrigin(layer, { x: 0, y: 0 })
  if (layer.format === 'indexed') {
    layer.pixels = Uint32Array.from(snapshot.pixels, (pixel) => pixel >>> 0)
  } else {
    const pixels = new Uint8ClampedArray(snapshot.pixels.length * 4)
    snapshot.pixels.forEach((pixel, index) => {
      const value = pixel >>> 0
      const offset = index * 4
      pixels[offset] = value & 0xff
      pixels[offset + 1] = value >>> 8 & 0xff
      pixels[offset + 2] = value >>> 16 & 0xff
      pixels[offset + 3] = value >>> 24 & 0xff
    })
    layer.pixels = pixels
  }
}

const colorValue = (value: unknown, fallback?: RgbaColor): RgbaColor => {
  const source = recordValue(value)
  if (!source) {
    if (fallback) return { ...fallback }
    throw new Error('color must be an { r, g, b, a } table')
  }
  return {
    r: Math.max(0, Math.min(255, integer(source.r))),
    g: Math.max(0, Math.min(255, integer(source.g))),
    b: Math.max(0, Math.min(255, integer(source.b))),
    a: Math.max(0, Math.min(255, integer(source.a, 255)))
  }
}

const resolveFrameId = (session: DocumentSession, value: unknown): string => {
  const timeline = ensureAnimationDocument(session.document)
  if (typeof value === 'string' && timeline.frames.some((frame) => frame.id === value)) return value
  const index = integer(value, 1) - 1
  const frame = timeline.frames[index]
  if (!frame) throw new Error('frame does not exist')
  return frame.id
}

const resolveLayerId = (session: DocumentSession, value: unknown): string => {
  const id = stringValue(value, session.document.activeLayerId)
  if (!session.document.layers.some((layer) => layer.id === id)) throw new Error('layer does not exist')
  return id
}

const activateLayerFrame = (layerId: string, frameId?: string): void => {
  const workspace = useWorkspace.getState()
  workspace.selectLayer(layerId, 'replace')
  if (frameId) workspace.setActiveAnimationFrame(frameId)
}

const rgbaPixels = (value: unknown, pixelCount: number): Uint8ClampedArray => {
  if (!Array.isArray(value)) throw new Error('pixels must be an array')
  if (value.length === pixelCount * 4 && value.every((entry) => typeof entry === 'number')) {
    return Uint8ClampedArray.from(value as number[])
  }
  if (value.length !== pixelCount) throw new Error(`pixels must contain ${pixelCount} packed colors`)
  const result = new Uint8ClampedArray(pixelCount * 4)
  for (let index = 0; index < value.length; index += 1) {
    const entry = value[index]
    const packed = typeof entry === 'number'
      ? entry >>> 0
      : (() => {
          const color = colorValue(entry)
          return (color.r | color.g << 8 | color.b << 16 | color.a << 24) >>> 0
        })()
    const offset = index * 4
    result[offset] = packed & 0xff
    result[offset + 1] = packed >>> 8 & 0xff
    result[offset + 2] = packed >>> 16 & 0xff
    result[offset + 3] = packed >>> 24 & 0xff
  }
  return result
}

const selectionFromSpec = (spec: Record<string, unknown>): SelectionMask => {
  const width = Math.max(1, integer(spec.width))
  const height = Math.max(1, integer(spec.height))
  const mask = Array.isArray(spec.mask) ? Uint8Array.from(spec.mask.map((value) => Math.max(0, Math.min(255, integer(value))))) : undefined
  if (mask && mask.length !== width * height) throw new Error('selection mask size does not match its bounds')
  return { x: integer(spec.x), y: integer(spec.y), width, height, ...(mask ? { mask } : {}) }
}

const loopOptions = (session: DocumentSession, spec: Record<string, unknown>) => ({
  name: stringValue(spec.name, 'Loop'),
  startFrameId: resolveFrameId(session, spec.startFrameId ?? spec.start ?? 1),
  endFrameId: resolveFrameId(session, spec.endFrameId ?? spec.end ?? ensureAnimationDocument(session.document).frames.length),
  direction: (spec.direction === 'reverse' ? 'reverse' : 'forward') as AnimationLoopDirection,
  repeatCount: spec.repeatCount === null ? null : Math.max(1, integer(spec.repeatCount, 1))
})

const capturePaletteState = (session: DocumentSession) => ({
  palette: session.document.palette.map((entry) => ({ ...entry, color: { ...entry.color } })),
  order: [...session.document.paletteOrder],
  slots: session.document.paletteSlots ? [...session.document.paletteSlots] : undefined,
  columns: session.document.paletteColumns,
  nextColorId: session.document.nextColorId,
  selectionId: session.paletteSelectionId,
  selectedIds: [...session.selectedPaletteIds]
})

const applyPaletteState = (session: DocumentSession, state: ReturnType<typeof capturePaletteState>): void => {
  session.document.palette = state.palette.map((entry) => ({ ...entry, color: { ...entry.color } }))
  session.document.paletteOrder = [...state.order]
  session.document.paletteSlots = state.slots ? [...state.slots] : undefined
  session.document.paletteColumns = state.columns
  session.document.nextColorId = state.nextColorId
  session.paletteSelectionId = state.selectionId
  session.selectedPaletteIds = [...state.selectedIds]
}

export async function applyLuaScriptOperation(
  operation: LuaScriptOperation,
  api: Partial<MoonSpriteApi>
): Promise<LuaScriptOperationResult> {
  const workspace = useWorkspace.getState()
  const spec = specFor(operation)
  let changedPixelCount = 0
  let documentBoundary = false
  try {
    switch (operation.path) {
      case 'document.create': {
        const width = Math.max(1, integer(spec.width, 64))
        const height = Math.max(1, integer(spec.height, 64))
        const colorMode = COLOR_MODES.includes(spec.colorMode as ColorMode) ? spec.colorMode as ColorMode : 'rgba'
        await workspace.newDocument(stringValue(spec.name, 'Sprite'), width, height, colorMode)
        documentBoundary = true
        break
      }
      case 'document.open':
      case 'io.open': {
        const path = stringValue(spec.path ?? spec.value)
        if (path) await workspace.openPath(path)
        else await workspace.openFiles()
        documentBoundary = true
        break
      }
      case 'document.save':
      case 'io.save': {
        const options = recordValue(spec.options) as SaveAsOptions | null
        await workspace.saveActive(booleanValue(spec.saveAs), options ?? undefined)
        break
      }
      case 'io.export': {
        await workspace.exportActive(spec as unknown as ExportOptions)
        break
      }
      case 'layers.create': {
        await workspace.addLayer()
        const layer = getActiveLayer(activeSession().document)
        const name = stringValue(spec.name)
        if (name) workspace.renameLayer(layer.id, name)
        if (spec.opacity !== undefined) workspace.setLayerOpacity(layer.id, Math.max(0, Math.min(1, finiteNumber(spec.opacity, 255) / 255)))
        break
      }
      case 'layers.duplicate': {
        const session = activeSession()
        workspace.duplicateLayers([resolveLayerId(session, spec.id ?? spec.value)])
        break
      }
      case 'layers.remove': {
        const session = activeSession()
        workspace.selectLayer(resolveLayerId(session, spec.id ?? spec.value), 'replace')
        workspace.deleteSelectedLayers()
        break
      }
      case 'layers.update': {
        const session = activeSession()
        const id = resolveLayerId(session, spec.id)
        const layer = session.document.layers.find((candidate) => candidate.id === id)!
        const blendMode = BLEND_MODES.includes(spec.blendMode as BlendMode) ? spec.blendMode as BlendMode : layer.blendMode
        const opacity = spec.opacity === undefined ? layer.opacity : Math.max(0, Math.min(1, finiteNumber(spec.opacity, 255) / 255))
        workspace.setLayerPropertiesWithBlend(
          id,
          stringValue(spec.name, layer.name),
          opacity,
          blendMode,
          spec.locked === undefined ? layer.locked : booleanValue(spec.locked),
          spec.displayColor === undefined ? layer.displayColor : spec.displayColor === null ? null : colorValue(spec.displayColor),
          spec.description === undefined ? layer.description : stringValue(spec.description)
        )
        if (typeof spec.visible === 'boolean' && spec.visible !== layer.visible) workspace.toggleLayerVisibility(id)
        const x = spec.x === undefined ? layer.offsetX : integer(spec.x)
        const y = spec.y === undefined ? layer.offsetY : integer(spec.y)
        if (x !== layer.offsetX || y !== layer.offsetY) workspace.moveLayerBy(id, x - layer.offsetX, y - layer.offsetY, 'Lua: update layer')
        break
      }
      case 'animation.setFrame': {
        const session = activeSession()
        workspace.setActiveAnimationFrame(resolveFrameId(session, spec.id ?? spec.frame ?? spec.value))
        break
      }
      case 'animation.setFrameDuration': {
        const session = activeSession()
        const timeline = ensureAnimationDocument(session.document)
        const frameId = resolveFrameId(session, spec.id ?? spec.frame ?? spec.value)
        const frame = timeline.frames.find((candidate) => candidate.id === frameId)
        if (!frame) throw new Error('frame does not exist')
        const before = frame.duration
        const after = Math.max(1, Math.min(60_000, integer(spec.duration, before)))
        if (before !== after) {
          frame.duration = after
          workspace.pushHistory({
            label: 'Lua: set frame duration',
            bytes: 32,
            undo: () => { frame.duration = before },
            redo: () => { frame.duration = after },
            contentChanged: false,
            requiresAnimationSync: false
          })
        }
        break
      }
      case 'animation.setCelSurface': {
        const session = activeSession()
        const timeline = ensureAnimationDocument(session.document)
        const layerId = resolveLayerId(session, spec.layerId)
        const frameId = resolveFrameId(session, spec.frameId)
        const cel = timeline.cels.find((candidate) => candidate.layerId === layerId && candidate.frameId === frameId)
        if (!cel || (typeof spec.celId === 'string' && cel.id !== spec.celId)) throw new Error('cel does not exist')
        const layer = session.document.layers.find((candidate) => candidate.id === layerId)!
        const before = surfaceSnapshotValue(spec.before, layer.format)
        const after = surfaceSnapshotValue(spec.after, layer.format)
        const current = animationLayerAtFrame(session.document, layerId, frameId)
        if (!current || !equalSurfaceSnapshots(snapshotForLayer(session.document, current), before)) {
          throw new Error('cel surface changed before the script result was applied')
        }
        const apply = (snapshot: LuaScriptSurfaceSnapshot): void => {
          const target = animationLayerAtFrame(session.document, layerId, frameId)
          if (!target) return
          applySurfaceSnapshot(target, snapshot)
          syncAnimationLayerAtFrame(session.document, target, frameId)
          refreshActiveAnimationFrame(session.document)
        }
        apply(after)
        workspace.pushHistory({
          label: 'Lua: set cel surface',
          bytes: (before.pixels.length + after.pixels.length) * 4 + 96,
          undo: () => apply(before),
          redo: () => apply(after),
          invalidation: { kind: 'full' },
          affectedLayerIds: [layerId],
          contentChanged: true,
          requiresAnimationSync: false
        })
        changedPixelCount = before.width !== after.width || before.height !== after.height
          ? Math.max(before.pixels.length, after.pixels.length)
          : before.pixels.reduce((count, pixel, index) => count + Number((pixel >>> 0) !== (after.pixels[index] >>> 0)), 0)
        break
      }
      case 'animation.createLoop': {
        const session = activeSession()
        const createdId = workspace.createAnimationLoopSection(loopOptions(session, spec))
        const requestedId = stringValue(spec.id)
        if (createdId && requestedId && requestedId !== createdId) {
          const created = ensureAnimationDocument(session.document).loopSections?.find((loop) => loop.id === createdId)
          if (created) created.id = requestedId
        }
        break
      }
      case 'animation.updateLoop': {
        const session = activeSession()
        const id = stringValue(spec.id)
        if (!id) throw new Error('loop id is required')
        workspace.updateAnimationLoopSection(id, loopOptions(session, spec))
        break
      }
      case 'animation.removeLoop': {
        const id = stringValue(spec.id ?? spec.value)
        if (!id) throw new Error('loop id is required')
        workspace.deleteAnimationLoopSection(id)
        break
      }
      case 'animation.play': {
        const id = stringValue(spec.id ?? spec.value)
        if (id) workspace.playAnimationLoopSection(id)
        else workspace.setAnimationPlaying(spec.playing === undefined ? true : booleanValue(spec.playing))
        break
      }
      case 'palette.create': {
        const session = activeSession()
        const before = capturePaletteState(session)
        const directColor = spec.r !== undefined ? spec : spec.color
        workspace.addPaletteColor(directColor === undefined ? undefined : colorValue(directColor))
        const after = capturePaletteState(session)
        if (after.nextColorId !== before.nextColorId || after.palette.length !== before.palette.length) {
          workspace.pushHistory({
            label: 'Lua: create palette color',
            bytes: (before.palette.length + after.palette.length) * 32 + (before.slots?.length ?? 0) * 4 + (after.slots?.length ?? 0) * 4,
            undo: () => applyPaletteState(session, before),
            redo: () => applyPaletteState(session, after),
            contentChanged: false,
            requiresAnimationSync: false
          })
        }
        break
      }
      case 'palette.update': {
        const id = integer(spec.id)
        const session = activeSession()
        const entry = session.document.palette.find((candidate) => candidate.id === id)
        if (!entry) throw new Error('palette color does not exist')
        if (spec.color !== undefined) workspace.updatePaletteColor(id, colorValue(spec.color, entry.color))
        if (typeof spec.name === 'string' && spec.name !== entry.name) {
          const before = entry.name
          const after = spec.name
          entry.name = after
          workspace.pushHistory({
            label: 'Lua: rename palette color', bytes: before.length + after.length + 24,
            undo: () => { entry.name = before }, redo: () => { entry.name = after }, contentChanged: false, requiresAnimationSync: false
          })
        }
        break
      }
      case 'palette.remove': {
        workspace.deletePaletteColor(integer(spec.id ?? spec.value))
        break
      }
      case 'palette.extract': {
        const session = activeSession()
        const colors = extractPaletteColors(session.document, Math.max(1, Math.min(4096, integer(spec.limit, 256))))
        const mode = stringValue(spec.mode, 'replace')
        workspace.applyPalette(mode === 'append' ? [...session.document.palette.map((entry) => entry.color), ...colors] : colors)
        break
      }
      case 'tiles.createSet': {
        const session = activeSession()
        const width = Math.max(1, Math.min(256, integer(spec.tileWidth ?? spec.width, 16)))
        const height = Math.max(1, Math.min(256, integer(spec.tileHeight ?? spec.height, 16)))
        const tileset = createBlankTileset(createId('tileset'), stringValue(spec.name, 'Tileset'), width, height, createId('tile'), 1)
        session.document.tilesets = [...(session.document.tilesets ?? []), tileset]
        workspace.pushHistory({
          label: 'Lua: create tileset', bytes: tileset.pixels.byteLength + 128,
          undo: () => { session.document.tilesets = (session.document.tilesets ?? []).filter((candidate) => candidate.id !== tileset.id) },
          redo: () => { if (!(session.document.tilesets ?? []).some((candidate) => candidate.id === tileset.id)) session.document.tilesets = [...(session.document.tilesets ?? []), tileset] },
          contentChanged: false, requiresAnimationSync: false
        })
        break
      }
      case 'tiles.createLayer': {
        const session = activeSession()
        const tilesetId = stringValue(spec.tilesetId)
        const tileset = tilesetId ? session.document.tilesets?.find((candidate) => candidate.id === tilesetId) : null
        await workspace.createTilemapLayer({
          name: stringValue(spec.name, '瓦片图层'),
          tileWidth: tileset?.tileWidth ?? Math.max(1, integer(spec.tileWidth, 16)),
          tileHeight: tileset?.tileHeight ?? Math.max(1, integer(spec.tileHeight, 16)),
          tilesetId: tileset?.id ?? null
        })
        break
      }
      case 'tiles.place': {
        const session = activeSession()
        const layerId = resolveLayerId(session, spec.layerId)
        const frameId = resolveFrameId(session, spec.frameId ?? spec.frame ?? ensureAnimationDocument(session.document).activeFrameId)
        activateLayerFrame(layerId, frameId)
        const current = activeSession()
        const target = tilemapCelTargetAt(current.document, layerId, frameId)
        if (!target) throw new Error('target is not a tilemap cel')
        const column = integer(spec.column ?? spec.x)
        const row = integer(spec.row ?? spec.y)
        if (column < 0 || row < 0 || column >= target.tilemap.columns || row >= target.tilemap.rows) throw new Error('tile cell is outside the tilemap')
        const tilesetId = stringValue(spec.tilesetId, target.layer.tilemapTilesetId)
        const tileset = current.document.tilesets?.find((candidate) => candidate.id === tilesetId)
        const tileId = stringValue(spec.tileId, tileset?.tileIds[0])
        if (!tileset || !tileset.tileIds.includes(tileId)) throw new Error('tile does not exist')
        const cell: TilemapCell | null = booleanValue(spec.clear) ? null : {
          tilesetId, tileId,
          ...(booleanValue(spec.flipHorizontal) ? { flipHorizontal: true } : {}),
          ...(booleanValue(spec.flipVertical) ? { flipVertical: true } : {}),
          ...(spec.rotation === undefined ? {} : { rotation: Math.max(0, Math.min(3, integer(spec.rotation))) as 0 | 1 | 2 | 3 })
        }
        const edit = beginTilemapEdit(layerId, frameId)
        if (writeTilemapCell(current.document, target, edit, row * target.tilemap.columns + column, cell)) {
          workspace.commitTilemapEdit(edit, 'Lua: place tile')
          changedPixelCount += target.tilemap.tileWidth * target.tilemap.tileHeight
        }
        break
      }
      case 'tiles.edit': {
        const session = activeSession()
        const tilesetId = stringValue(spec.tilesetId)
        const tileId = stringValue(spec.tileId)
        const tileset = session.document.tilesets?.find((candidate) => candidate.id === tilesetId)
        if (!tileset || !tileset.tileIds.includes(tileId)) throw new Error('tile does not exist')
        const before = readTilesetTilePixels(tileset, tileId)
        if (!before) throw new Error('tile pixels are unavailable')
        const after = rgbaPixels(spec.pixels, tileset.tileWidth * tileset.tileHeight)
        if (workspace.commitTilesetTileEdit(tilesetId, tileId, before, after)) changedPixelCount += tileset.tileWidth * tileset.tileHeight
        break
      }
      case 'freeTiles.createLayer': {
        await workspace.createFreeTileLayer({ name: stringValue(spec.name, '自由瓦片图层'), freeTileSetId: stringValue(spec.freeTileSetId) || null })
        break
      }
      case 'freeTiles.createSource': {
        const session = activeSession()
        const layerId = resolveLayerId(session, spec.layerId)
        activateLayerFrame(layerId)
        const sourceId = workspace.addFreeTileSource(layerId)
        if (!sourceId) throw new Error('could not create free tile source')
        if (typeof spec.name === 'string') workspace.setFreeTileSourceProperties(sourceId, { name: spec.name })
        break
      }
      case 'freeTiles.place': {
        const session = activeSession()
        const layerId = resolveLayerId(session, spec.layerId)
        const frameId = resolveFrameId(session, spec.frameId ?? spec.frame ?? ensureAnimationDocument(session.document).activeFrameId)
        activateLayerFrame(layerId, frameId)
        const current = activeSession()
        const owner = freeTileSourceOwnerForId(current.document, stringValue(spec.sourceId))
        if (!owner || owner.layer.id !== layerId) throw new Error('free tile source does not belong to the target layer')
        const edit = workspace.beginFreeTilePlacement()
        if (!edit) throw new Error('target is not a free tile cel')
        const instance: FreeTileInstance = {
          id: createId('free-tile-instance'), sourceId: owner.source.id,
          x: integer(spec.x), y: integer(spec.y), visible: true, locked: false,
          opacity: 1, blendMode: 'normal'
        }
        edit.after = { ...cloneFreeTileCelData(edit.after), instances: [...edit.after.instances, instance] }
        workspace.commitFreeTilePlacement(edit, 'Lua: place free tile')
        changedPixelCount += owner.tileset.tileWidth * owner.tileset.tileHeight
        break
      }
      case 'freeTiles.edit': {
        const session = activeSession()
        const sourceId = stringValue(spec.sourceId)
        const before = captureFreeTileSourceSnapshot(session.document, sourceId)
        if (!before) throw new Error('free tile source does not exist')
        const width = Math.max(1, integer(spec.width, before.width))
        const height = Math.max(1, integer(spec.height, before.height))
        const after = {
          ...before, width, height,
          offsetX: integer(spec.offsetX, before.offsetX), offsetY: integer(spec.offsetY, before.offsetY),
          pixels: rgbaPixels(spec.pixels, width * height)
        }
        if (workspace.commitFreeTileSourceEdit(sourceId, before, after, 'Lua: edit free tile')) changedPixelCount += width * height
        break
      }
      case 'brushes.importImage': {
        if (!api.openBrushImages) throw new Error('brush picker is unavailable')
        const result = await api.openBrushImages()
        if (!result.canceled && result.filePaths.length > 0) {
          await importBrushPaths(api as MoonSpriteApi, result.filePaths)
          publishBrushLibraryChanged()
        }
        break
      }
      case 'brushes.createFromSelection': {
        await workspace.createBrushFromSelection()
        break
      }
      case 'brushes.remove': {
        const id = stringValue(spec.id ?? spec.value)
        const session = activeSession()
        if (session.document.customBrushes?.some((brush) => brush.id === id)) workspace.deleteProjectBrush(id)
        else if (api.deleteBrush) { await api.deleteBrush(id); publishBrushLibraryChanged() }
        else throw new Error('brush does not exist')
        break
      }
      case 'selection.set': {
        const session = activeSession()
        workspace.commitSelectionChange(cloneSelectionMask(session.selection), selectionFromSpec(spec), 'Lua: set selection')
        break
      }
      case 'selection.clear': {
        const session = activeSession()
        workspace.commitSelectionChange(cloneSelectionMask(session.selection), null, 'Lua: clear selection')
        break
      }
      case 'selection.invert': {
        workspace.invertSelection()
        break
      }
      case 'selection.transform': {
        if (spec.flip === 'horizontal' || booleanValue(spec.flipHorizontal)) workspace.flipActiveSelection('horizontal')
        if (spec.flip === 'vertical' || booleanValue(spec.flipVertical)) workspace.flipActiveSelection('vertical')
        const dx = integer(spec.dx)
        const dy = integer(spec.dy)
        if (dx !== 0 || dy !== 0) workspace.moveActiveSelectionWithSelectionHistory(dx, dy)
        break
      }
      case 'slices.create': {
        workspace.createSlice(selectionFromSpec(spec))
        break
      }
      case 'slices.update': {
        const id = stringValue(spec.id)
        if (!id) throw new Error('slice id is required')
        workspace.updateSlice(id, {
          ...(typeof spec.name === 'string' ? { name: spec.name } : {}),
          ...(spec.x === undefined ? {} : { x: integer(spec.x) }),
          ...(spec.y === undefined ? {} : { y: integer(spec.y) }),
          ...(spec.width === undefined ? {} : { width: Math.max(1, integer(spec.width)) }),
          ...(spec.height === undefined ? {} : { height: Math.max(1, integer(spec.height)) })
        })
        break
      }
      case 'slices.remove': {
        workspace.deleteSlice(stringValue(spec.id ?? spec.value))
        break
      }
      case 'styles.apply': {
        const session = activeSession()
        const id = resolveLayerId(session, spec.id)
        const styles = normalizeLayerStyles(spec.styles ?? spec.value)
        if (!styles) throw new Error('invalid layer styles')
        workspace.setLayerStyles('layer', id, styles)
        break
      }
      case 'styles.copy': {
        const session = activeSession()
        workspace.copyLayerStyles('layer', resolveLayerId(session, spec.id ?? spec.value))
        break
      }
      case 'styles.paste': {
        const session = activeSession()
        workspace.pasteLayerStyles([{ kind: 'layer', id: resolveLayerId(session, spec.id ?? spec.value) }])
        break
      }
      case 'styles.clear': {
        const session = activeSession()
        workspace.clearLayerStyles([{ kind: 'layer', id: resolveLayerId(session, spec.id ?? spec.value) }])
        break
      }
      case 'styles.setEnabled': {
        const session = activeSession()
        workspace.setLayerStylesEnabled([{ kind: 'layer', id: resolveLayerId(session, spec.id) }], booleanValue(spec.enabled, true))
        break
      }
      case 'workspace.setPanel':
      case 'workspace.showPanel':
      case 'workspace.hidePanel': {
        const id = stringValue(spec.id ?? spec.value) as WorkspacePanelId
        if (!PANEL_IDS.includes(id)) throw new Error('unknown workspace panel')
        const visible = operation.path === 'workspace.showPanel' ? true : operation.path === 'workspace.hidePanel' ? false : spec.visible
        const dock = ['left', 'right', 'bottom', 'floating'].includes(stringValue(spec.dock)) ? spec.dock as WorkspacePanelDock : undefined
        window.dispatchEvent(new CustomEvent('moonsprite:set-workspace-panel', { detail: { id, visible, dock } }))
        break
      }
      case 'ui.notify': {
        const message = stringValue(spec.message ?? spec.text ?? spec.value)
        window.setTimeout(() => useWorkspace.getState().setMessage(message), 0)
        break
      }
      default:
        throw new Error('unsupported operation')
    }
  } catch (error) {
    throw operationError(operation.path, error instanceof Error ? error.message : String(error))
  }
  return { changedPixelCount, documentBoundary }
}
