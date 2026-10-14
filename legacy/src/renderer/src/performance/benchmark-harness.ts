import type { FillKind, ShapeKind, ToolId } from '@shared/types-brush'
import type { LayerGroup } from '@shared/types-layer'
import type { ViewState } from '@shared/types-view'
import { cacheRasterContentBounds, createDocument, createLayer } from '@/core/document-model'
import { createDefaultLayerStyles, resolveLayerStyles } from '@/core/layer-styles'
import { useWorkspace } from '@/store/workspace'
import { largeProjectPlan, MAX_LARGE_PROJECT_PIXEL_BYTES } from './benchmark-plan'

const activeSession = () => {
  const state = useWorkspace.getState()
  return state.sessions.find((candidate) => candidate.document.id === state.activeId) ?? null
}

const addDocument = (document: ReturnType<typeof createDocument>) => {
  document.timelapse = { ...document.timelapse!, enabled: false, snapshots: [] }
  useWorkspace.getState().addSession(document)
}

async function createSimpleDocument(size: number) {
  const document = createDocument('Simple performance project', size, size, 'rgba')
  addDocument(document)
  return { uniquePixelBytes: document.layers[0].pixels.byteLength, layerCount: 1, frameCount: 1 }
}

async function createSparseMagicWandDocument(size: number) {
  const document = createDocument('Sparse magic wand performance project', size, size, 'rgba')
  addDocument(document)
  return { uniquePixelBytes: document.layers[0].pixels.byteLength, layerCount: 1, frameCount: 1 }
}

async function createComplexDocument(size: number) {
  const document = createDocument('Complex performance project', 1, 1, 'rgba')
  document.width = size
  document.height = size
  document.groups = Array.from({ length: 6 }, (_, index): LayerGroup => ({
    id: `perf-group-${index}`,
    name: `Group ${index}`,
    parentGroupId: index >= 3 ? `perf-group-${index - 3}` : null,
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal'
  }))
  document.layers = Array.from({ length: 24 }, (_, layerIndex) => {
    const layer = createLayer(`Layer ${layerIndex}`, size, size, 'rgba')
    if (layer.format !== 'rgba') throw new Error('Complex benchmark requires RGBA layers.')
    layer.groupId = `perf-group-${layerIndex % 6}`
    const channel = layerIndex % 3
    for (let y = layerIndex % 8; y < size; y += 8) {
      for (let x = 0; x < size; x += 1) {
        const offset = (y * size + x) * 4
        layer.pixels[offset + channel] = 64 + layerIndex * 7
        layer.pixels[offset + 3] = 96 + layerIndex * 5
      }
    }
    return layer
  })
  document.activeLayerId = document.layers.at(-1)!.id
  const frames = Array.from({ length: 12 }, (_, index) => ({ id: `perf-frame-${index}`, duration: 80 }))
  document.animation = {
    frames,
    activeFrameId: frames[0].id,
    loop: true,
    cels: frames.flatMap((frame, frameIndex) => document.layers.map((layer, layerIndex) => {
      if (layer.format !== 'rgba') throw new Error('Complex benchmark requires RGBA layers.')
      return {
        id: `perf-cel-${frameIndex}-${layerIndex}`,
        layerId: layer.id,
        frameId: frame.id,
        opacity: layer.opacity,
        surface: {
          format: 'rgba' as const,
          width: layer.width,
          height: layer.height,
          offsetX: frameIndex % 3 - 1,
          offsetY: frameIndex % 2,
          pixels: layer.pixels
        }
      }
    }))
  }
  addDocument(document)
  return { uniquePixelBytes: document.layers.reduce((sum, layer) => sum + layer.pixels.byteLength, 0), layerCount: document.layers.length, frameCount: frames.length }
}

async function createLargeDocument(size: number, options: { layers?: number; frames?: number } = {}) {
  const profile = largeProjectPlan(size)
  if (options.layers !== undefined) {
    profile.localLayers = options.layers - 2
    profile.uniquePixelBytes = (2 * size * size + profile.localLayers * profile.localSize * profile.localSize) * 4
  }
  const { uniquePixelBytes } = profile
  if (uniquePixelBytes > MAX_LARGE_PROJECT_PIXEL_BYTES) {
    throw new Error(`Large performance project requires ${uniquePixelBytes} pixel bytes, exceeding the ${MAX_LARGE_PROJECT_PIXEL_BYTES} byte limit.`)
  }

  const document = createDocument('Large mixed performance project', 1, 1, 'rgba')
  document.width = size
  document.height = size
  document.layers = []
  document.animation = undefined
  document.groups = Array.from({ length: profile.groups }, (_, index): LayerGroup => ({
    id: `large-group-${index}`,
    name: `Section ${index}`,
    parentGroupId: index >= Math.ceil(profile.groups / 2) ? `large-group-${index - Math.ceil(profile.groups / 2)}` : null,
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal'
  }))

  const background = createLayer('Background map', size, size, 'rgba')
  for (let y = 0; y < size; y += Math.max(12, Math.floor(size / 160))) {
    for (let x = 0; x < size; x += 1) {
      const offset = (y * size + x) * 4
      background.pixels[offset] = 20
      background.pixels[offset + 1] = 24 + (x % 96)
      background.pixels[offset + 2] = 32
      background.pixels[offset + 3] = 255
    }
  }

  const localLayers = Array.from({ length: profile.localLayers }, (_, layerIndex) => {
    const localSize = profile.localSize
    const layer = createLayer(`Sprite cluster ${layerIndex}`, localSize, localSize, 'rgba')
    layer.groupId = `large-group-${layerIndex % profile.groups}`
    layer.opacity = layerIndex % 5 === 0 ? 0.72 : 1
    const columns = Math.max(1, Math.floor(size / localSize))
    const rows = Math.max(1, Math.floor(size / localSize))
    layer.offsetX = Math.min(size - localSize, (layerIndex % columns) * localSize + (layerIndex * 37) % Math.max(1, Math.floor(localSize / 2)))
    layer.offsetY = Math.min(size - localSize, (Math.floor(layerIndex / columns) % rows) * localSize + (layerIndex * 53) % Math.max(1, Math.floor(localSize / 2)))
    const channel = layerIndex % 3
    const tile = 16 + layerIndex % 5 * 4
    for (let top = layerIndex % tile; top < localSize; top += tile * 2) {
      for (let left = (layerIndex * 7) % tile; left < localSize; left += tile * 2) {
        const width = Math.min(tile, localSize - left)
        const height = Math.min(tile, localSize - top)
        for (let y = top; y < top + height; y += 1) {
          for (let x = left; x < left + width; x += 1) {
            const offset = (y * localSize + x) * 4
            layer.pixels[offset + channel] = 80 + (layerIndex * 19) % 160
            layer.pixels[offset + (channel + 1) % 3] = 48 + (x + y) % 176
            layer.pixels[offset + 3] = 192 + (layerIndex * 11) % 64
          }
        }
      }
    }
    return layer
  })

  const editLayer = createLayer('Active large edit', size, size, 'rgba')
  editLayer.groupId = 'large-group-0'
  const regionSize = Math.min(1024, Math.floor(size / 3))
  const left = Math.floor((size - regionSize) / 2)
  const top = Math.floor((size - regionSize) / 2)
  for (let x = left; x < left + regionSize; x += 1) {
    for (const y of [top, top + regionSize - 1]) {
      const offset = (y * size + x) * 4
      editLayer.pixels[offset] = 240
      editLayer.pixels[offset + 1] = 240
      editLayer.pixels[offset + 2] = 240
      editLayer.pixels[offset + 3] = 255
    }
  }
  for (let y = top; y < top + regionSize; y += 1) {
    for (const x of [left, left + regionSize - 1]) {
      const offset = (y * size + x) * 4
      editLayer.pixels[offset] = 240
      editLayer.pixels[offset + 1] = 240
      editLayer.pixels[offset + 2] = 240
      editLayer.pixels[offset + 3] = 255
    }
  }

  document.layers = [background, ...localLayers, editLayer]
  document.activeLayerId = editLayer.id
  const frameCount = options.frames ?? 1
  if (frameCount > 1) {
    const frames = Array.from({ length: frameCount }, (_, i) => ({ id: `large-frame-${i}`, duration: 80 }))
    document.animation = {
      frames, activeFrameId: frames[0].id, loop: true,
      cels: frames.flatMap((frame, i) => document.layers.map(layer => {
        if (layer.format !== 'rgba') throw new Error('Large benchmark requires RGBA layers.')
        return {
        id: `${frame.id}-${layer.id}`, layerId: layer.id, frameId: frame.id, opacity: layer.opacity,
        surface: { format: 'rgba' as const, width: layer.width, height: layer.height, offsetX: layer.offsetX + i % 3, offsetY: layer.offsetY + i % 2, pixels: layer.pixels }
        }
      }))
    }
  }
  addDocument(document)
  cacheRasterContentBounds(editLayer, document.palette, { x: left, y: top, width: regionSize, height: regionSize })
  return { uniquePixelBytes, layerCount: document.layers.length, frameCount, sharedFramePixels: frameCount > 1 }
}

const activeView = (): ViewState | null => {
  const session = activeSession()
  return session ? { ...session.view } : null
}

const resetScenario = (view: ViewState) => {
  const state = useWorkspace.getState()
  state.setView(view)
  state.setSelection(null)
}

const prepareTool = (tool: ToolId, fillKind: FillKind | null = null, shapeKind: ShapeKind | null = null) => {
  const state = useWorkspace.getState()
  state.setTool(tool)
  if (fillKind) state.setFillKind(fillKind)
  if (shapeKind) state.setShapeKind(shapeKind)
  state.setPrimaryColor({ r: 41, g: 121, b: 255, a: 255 })
  state.setSecondaryColor({ r: 245, g: 86, b: 74, a: 255 })
  state.setGradientDither('none')
}

const setBrushSize = (size: number) => useWorkspace.getState().setBrushSize(size)

const prepareCenteredSelection = (size: number) => {
  const session = activeSession()
  if (!session) return
  const width = Math.max(1, Math.min(session.document.width, Math.trunc(size)))
  const height = Math.max(1, Math.min(session.document.height, Math.trunc(size)))
  useWorkspace.getState().setSelection({
    x: Math.floor((session.document.width - width) / 2),
    y: Math.floor((session.document.height - height) / 2),
    width,
    height
  })
}

const prepareActiveLayerStyle = (shadowBlur: number, innerGlowSize: number) => {
  const session = activeSession()
  if (!session) return
  const layer = session.document.layers.find((candidate) => candidate.id === session.document.activeLayerId)
  if (!layer) return
  const styles = createDefaultLayerStyles()
  styles.shadow.enabled = shadowBlur > 0
  styles.shadow.blur = Math.max(0, Math.trunc(shadowBlur))
  styles.innerGlow.enabled = innerGlowSize > 0
  styles.innerGlow.size = Math.max(1, Math.trunc(innerGlowSize || 1))
  useWorkspace.getState().previewLayerStyles('layer', layer.id, styles)
}

const previewActiveLayerStyleSize = (effect: 'shadow' | 'innerGlow', size: number) => {
  const session = activeSession()
  if (!session) return
  const layer = session.document.layers.find((candidate) => candidate.id === session.document.activeLayerId)
  if (!layer) return
  const styles = resolveLayerStyles(layer.layerStyles)
  if (effect === 'shadow') styles.shadow = { ...styles.shadow, enabled: true, blur: Math.max(0, Math.trunc(size)) }
  else styles.innerGlow = { ...styles.innerGlow, enabled: true, size: Math.max(1, Math.trunc(size)) }
  useWorkspace.getState().previewLayerStyles('layer', layer.id, styles)
}

const recordOperation = (stage: string, startedAt: number) => {
  window.__moonSpriteCanvasProbe?.recordOperationStage?.(stage, performance.now() - startedAt)
}

const toggleActiveLayerVisibility = () => {
  const session = activeSession()
  if (!session) return
  const startedAt = performance.now()
  useWorkspace.getState().toggleLayerVisibility(session.document.activeLayerId)
  recordOperation('layer-visibility.command', startedAt)
}

const toggleActiveLayerGroupVisibility = () => {
  const session = activeSession()
  const activeLayer = session?.document.layers.find((layer) => layer.id === session.document.activeLayerId)
  if (!session || !activeLayer?.groupId) return
  const startedAt = performance.now()
  useWorkspace.getState().toggleGroupVisibility(activeLayer.groupId)
  recordOperation('group-visibility.command', startedAt)
}

const previewActiveLayerOpacity = (opacity: number) => {
  const session = activeSession()
  if (!session) return
  const layer = session.document.layers.find((candidate) => candidate.id === session.document.activeLayerId)
  if (!layer) return
  const state = useWorkspace.getState()
  const transactionId = state.beginLayerPropertiesTransaction([{ id: layer.id, kind: 'layer' }])
  if (!transactionId) return
  const startedAt = performance.now()
  state.previewLayerPropertiesTransaction(transactionId, {
    name: layer.name,
    opacity,
    blendMode: layer.blendMode,
    cumulativeBlend: false,
    locked: layer.locked,
    displayColor: layer.displayColor ?? null,
    description: layer.description ?? ''
  }, ['opacity'])
  recordOperation('layer-opacity.preview-command', startedAt)
}

const reorderActiveLayer = () => {
  const session = activeSession()
  if (!session) return
  const sourceIndex = session.document.layers.findIndex((layer) => layer.id === session.document.activeLayerId)
  const target = session.document.layers[sourceIndex - 1]
  if (sourceIndex <= 0 || !target) return
  const startedAt = performance.now()
  useWorkspace.getState().reorderLayers([session.document.activeLayerId], target.id, false)
  recordOperation('layer-reorder.command', startedAt)
}

const setMoveAutoSelect = (enabled: boolean) => {
  useWorkspace.getState().setMoveAutoSelect(enabled)
}

const setTimelapseRecording = (enabled: boolean) => {
  useWorkspace.getState().setTimelapseSettings({ enabled, quality: 'low', fps: 12, speed: 8 })
}

const timelapseSnapshotCount = () => activeSession()?.document.timelapse?.snapshots.length ?? 0

const delay = (milliseconds: number) => new Promise((resolve) => window.setTimeout(resolve, milliseconds))

async function undoRedo(count: number) {
  let completed = 0
  for (let index = 0; index < count; index += 1) {
    if (!activeSession()?.history.canUndo) break
    useWorkspace.getState().undo()
    await delay(60)
    if (!activeSession()?.history.canRedo) break
    useWorkspace.getState().redo()
    await delay(60)
    completed += 1
  }
  return completed
}

async function playAnimation() {
  const session = activeSession()
  const frameIds = session?.document.animation?.frames.map((frame) => frame.id) ?? []
  useWorkspace.getState().setAnimationPlaying(true)
  try {
    for (const frameId of frameIds) {
      useWorkspace.getState().setActiveAnimationFrame(frameId)
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      await delay(40)
    }
  } finally {
    useWorkspace.getState().setAnimationPlaying(false)
  }
  return frameIds.length
}

const setAnimationPlaying = (playing: boolean) => useWorkspace.getState().setAnimationPlaying(playing)

function prepareMagicWand() {
  const workspace = useWorkspace.getState()
  workspace.setTool('selection')
  workspace.setSelectionKind('magic')
  workspace.setWandContiguous(true)
  workspace.setWandGapClosing(false)
}

export function installPerformanceHarness() {
  window.__moonSpritePerformanceHarness = {
    createSimpleDocument,
    createSparseMagicWandDocument,
    createComplexDocument,
    createLargeDocument,
    activeView,
    resetScenario,
    prepareTool,
    setBrushSize,
    prepareMagicWand,
    selectionState: () => {
      const selection = activeSession()?.selection
      return selection ? { x: selection.x, y: selection.y, width: selection.width, height: selection.height } : null
    },
    prepareCenteredSelection,
    interactionState: () => {
      const session = activeSession()
      const selection = session?.selection
      return { contentRevision: session?.contentRevision, selection: selection ? { x: selection.x, y: selection.y, width: selection.width, height: selection.height } : null, angle: session?.pendingPaste?.transformAngle ?? session?.selectionAngle, view: session?.view, pendingPaste: Boolean(session?.pendingPaste) }
    },
    prepareActiveLayerStyle,
    previewActiveLayerStyleSize,
    toggleActiveLayerVisibility,
    toggleActiveLayerGroupVisibility,
    previewActiveLayerOpacity,
    reorderActiveLayer,
    setMoveAutoSelect,
    setTimelapseRecording,
    timelapseSnapshotCount,
    undoRedo,
    setAnimationPlaying,
    playAnimation
  }
}
