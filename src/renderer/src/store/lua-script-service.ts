import type {
  LuaScriptDialog,
  LuaScriptDialogAction,
  LuaScriptExecutionContext,
  LuaScriptCreatedDocument,
  LuaScriptCreatedLayer,
  LuaScriptRunResult,
  LuaScriptSurfaceSnapshot,
  MoonSpriteApi,
  RasterLayer,
  RgbaColor,
  SpriteDocument
} from '@shared/types'
import { animationLayerAtFrame, ensureAnimationDocument, syncAnimationLayerAtFrame } from '@/core/animation'
import {
  createDocument,
  createId,
  createLayer,
  getActiveLayer,
  getLayer,
  isLayerEffectivelyLocked,
  markLayerContentChanged,
  readLayerPacked,
  setLayerStorageOrigin
} from '@/core/document'
import { beginPixelEdit, recordPixel, type HistoryEntry } from '@/core/history'
import { translateCurrent as tr } from '@/core/localization'
import type { DocumentSession } from './workspace-types'
import { useWorkspace } from './workspace'
import { applyLuaScriptOperation, buildLuaMseSnapshot } from './lua-script-operations'

const MAX_SCRIPT_IMAGE_PIXELS = 4_194_304
const MAX_SCRIPT_OPERATION_BYTES = 16 * 1024 * 1024
const MSE_OPERATION_PATHS = new Set([
  'document.create', 'document.open', 'document.save',
  'layers.create', 'layers.duplicate', 'layers.remove', 'layers.update',
  'animation.setFrame', 'animation.setFrameDuration', 'animation.setCelSurface', 'animation.createLoop', 'animation.updateLoop', 'animation.removeLoop', 'animation.play',
  'palette.create', 'palette.update', 'palette.remove', 'palette.extract',
  'tiles.createSet', 'tiles.createLayer', 'tiles.place', 'tiles.edit',
  'freeTiles.createSource', 'freeTiles.createLayer', 'freeTiles.place', 'freeTiles.edit',
  'brushes.importImage', 'brushes.createFromSelection', 'brushes.remove',
  'selection.set', 'selection.clear', 'selection.invert', 'selection.transform',
  'slices.create', 'slices.update', 'slices.remove',
  'styles.apply', 'styles.copy', 'styles.paste', 'styles.clear', 'styles.setEnabled',
  'workspace.setPanel', 'workspace.showPanel', 'workspace.hidePanel',
  'io.export', 'io.save', 'io.open', 'ui.notify'
])

interface LuaScriptTarget {
  documentId: string
  layerId: string
  frameId: string | null
  revision: number
  expected: LuaScriptSurfaceSnapshot
}

export interface LuaScriptClientSession {
  sessionId: string
  fileName: string
  filePath: string
  dialogs: LuaScriptDialog[]
  target: LuaScriptTarget
}

export interface LuaScriptRunSummary {
  fileName: string
  filePath: string
  output: string[]
  transactionCount: number
  changedPixelCount: number
  elapsedMs: number
}

export interface LuaScriptRunOutcome {
  summary: LuaScriptRunSummary
  session: LuaScriptClientSession | null
}

const packRgba = (color: RgbaColor): number => (
  color.r
  | color.g << 8
  | color.b << 16
  | color.a << 24
) >>> 0

const snapshotFromLayer = (document: SpriteDocument, layer: RasterLayer): LuaScriptSurfaceSnapshot => ({
  format: layer.format,
  width: layer.width,
  height: layer.height,
  offsetX: layer.offsetX,
  offsetY: layer.offsetY,
  pixels: Array.from({ length: layer.width * layer.height }, (_, index) => readLayerPacked(document, layer, index) >>> 0)
})

const cloneSnapshot = (snapshot: LuaScriptSurfaceSnapshot): LuaScriptSurfaceSnapshot => ({
  ...snapshot,
  pixels: [...snapshot.pixels]
})

const snapshotsEqual = (left: LuaScriptSurfaceSnapshot, right: LuaScriptSurfaceSnapshot): boolean => (
  left.format === right.format
  && left.width === right.width
  && left.height === right.height
  && left.offsetX === right.offsetX
  && left.offsetY === right.offsetY
  && left.pixels.length === right.pixels.length
  && left.pixels.every((pixel, index) => (pixel >>> 0) === (right.pixels[index] >>> 0))
)

const selectionContext = (session: DocumentSession): LuaScriptExecutionContext['selection'] => {
  const selection = session.selection
  if (!selection) return null
  return {
    x: selection.x,
    y: selection.y,
    width: selection.width,
    height: selection.height,
    mask: selection.mask ? Array.from(selection.mask) : null
  }
}

const buildInvocation = (session: DocumentSession, storedBrushes: Awaited<ReturnType<MoonSpriteApi['listBrushes']>>['brushes'] = []): { context: LuaScriptExecutionContext; target: LuaScriptTarget } => {
  if (session.activeLayerMaskId) throw new Error(tr('script.layerMaskUnsupported'))
  const document = session.document
  const layer = getActiveLayer(document)
  if (layer.kind) throw new Error(tr('script.layerKindUnsupported'))
  if (isLayerEffectivelyLocked(document, layer)) throw new Error(tr('script.layerLocked'))
  const pixelCount = layer.width * layer.height
  if (!Number.isSafeInteger(pixelCount) || pixelCount < 1 || pixelCount > MAX_SCRIPT_IMAGE_PIXELS) {
    throw new Error(tr('script.imageTooLarge', { count: MAX_SCRIPT_IMAGE_PIXELS }))
  }
  const timeline = document.animation
  const frameId = timeline?.activeFrameId ?? null
  const frameNumber = Math.max(1, (timeline?.frames.findIndex((frame) => frame.id === frameId) ?? 0) + 1)
  const expected = snapshotFromLayer(document, layer)
  const activeLayerCels = timeline ? timeline.frames.flatMap((frame, index) => {
    const cel = timeline.cels.find((candidate) => candidate.layerId === layer.id && candidate.frameId === frame.id)
    const frameLayer = cel ? animationLayerAtFrame(document, layer.id, frame.id) : null
    return cel && frameLayer ? [{
      id: cel.id,
      frameId: frame.id,
      frameNumber: index + 1,
      surface: snapshotFromLayer(document, frameLayer)
    }] : []
  }) : []
  const celPixelCount = activeLayerCels.reduce((count, cel) => count + cel.surface.pixels.length, 0)
  if (celPixelCount > MAX_SCRIPT_IMAGE_PIXELS * 3) {
    throw new Error(tr('script.imageTooLarge', { count: MAX_SCRIPT_IMAGE_PIXELS * 3 }))
  }
  return {
    context: {
      documentId: document.id,
      documentName: document.name,
      documentWidth: document.width,
      documentHeight: document.height,
      documentFilePath: document.filePath ?? document.sourceFilePath ?? '',
      colorMode: document.colorMode,
      layerId: layer.id,
      layerName: layer.name,
      layerWidth: layer.width,
      layerHeight: layer.height,
      layerOffsetX: layer.offsetX,
      layerOffsetY: layer.offsetY,
      layerOpacity: Math.max(0, Math.min(255, Math.round(layer.opacity * 255))),
      layerVisible: layer.visible,
      layerLocked: layer.locked,
      layerFormat: layer.format,
      layerGroupId: layer.groupId ?? null,
      layerStackIndex: document.layers.indexOf(layer) + 1,
      frameNumber,
      pixels: [...expected.pixels],
      activeLayerCels,
      selection: selectionContext(session),
      transparentColor: 0,
      foreground: packRgba(session.primaryColor),
      background: packRgba(session.secondaryColor),
      mseSnapshot: buildLuaMseSnapshot(session, storedBrushes)
    },
    target: {
      documentId: document.id,
      layerId: layer.id,
      frameId,
      revision: session.revision,
      expected
    }
  }
}

const validateSurfaceSnapshot = (snapshot: LuaScriptSurfaceSnapshot, format: RasterLayer['format']): void => {
  const pixelCount = snapshot.width * snapshot.height
  if (snapshot.format !== format
    || !Number.isSafeInteger(snapshot.width)
    || !Number.isSafeInteger(snapshot.height)
    || snapshot.width < 1
    || snapshot.height < 1
    || !Number.isSafeInteger(pixelCount)
    || pixelCount > MAX_SCRIPT_IMAGE_PIXELS
    || snapshot.pixels.length !== pixelCount
    || !Number.isSafeInteger(snapshot.offsetX)
    || !Number.isSafeInteger(snapshot.offsetY)
    || snapshot.pixels.some((pixel) => !Number.isSafeInteger(pixel))) {
    throw new Error(tr('script.invalidResult'))
  }
}

const validateCreatedLayer = (layer: LuaScriptCreatedLayer, format: RasterLayer['format']): void => {
  if (!layer.id.trim()
    || !layer.name.trim()
    || !Number.isInteger(layer.opacity)
    || layer.opacity < 0
    || layer.opacity > 255
    || !Number.isInteger(layer.frameNumber)
    || layer.frameNumber < 1
    || (layer.stackIndex !== undefined && (!Number.isSafeInteger(layer.stackIndex) || layer.stackIndex < 1))) {
    throw new Error(tr('script.invalidResult'))
  }
  validateSurfaceSnapshot(layer.surface, format)
}

const validateCreatedStructures = (target: LuaScriptTarget, result: LuaScriptRunResult): void => {
  const targetIds = new Set<string>()
  for (const layer of result.createdLayers) {
    if (targetIds.has(layer.id)) throw new Error(tr('script.invalidResult'))
    targetIds.add(layer.id)
    validateCreatedLayer(layer, target.expected.format)
  }
  for (const document of result.createdDocuments) {
    const pixelCount = document.width * document.height
    if (!document.name.trim()
      || !Number.isSafeInteger(document.width)
      || !Number.isSafeInteger(document.height)
      || document.width < 1
      || document.height < 1
      || !Number.isSafeInteger(pixelCount)
      || pixelCount > MAX_SCRIPT_IMAGE_PIXELS
      || !['rgba', 'grayscale', 'indexed'].includes(document.colorMode)
      || document.layers.length < 1) {
      throw new Error(tr('script.invalidResult'))
    }
    const format: RasterLayer['format'] = document.colorMode === 'indexed' ? 'indexed' : 'rgba'
    const layerIds = new Set<string>()
    for (const layer of document.layers) {
      if (layerIds.has(layer.id)) throw new Error(tr('script.invalidResult'))
      layerIds.add(layer.id)
      validateCreatedLayer(layer, format)
    }
  }
}

const validateResult = (target: LuaScriptTarget, result: LuaScriptRunResult): void => {
  let expected = cloneSnapshot(target.expected)
  for (const batch of result.batches) {
    let operationBytes = 0
    for (const operation of batch.operations ?? []) {
      if (!MSE_OPERATION_PATHS.has(operation.path)) throw new Error(tr('script.invalidResult'))
      try {
        operationBytes += JSON.stringify(operation.arguments).length
      } catch {
        throw new Error(tr('script.invalidResult'))
      }
      if (operationBytes > MAX_SCRIPT_OPERATION_BYTES) throw new Error(tr('script.invalidResult'))
    }
    if (batch.surfaceChange) {
      if (batch.changes.length > 0) throw new Error(tr('script.invalidResult'))
      validateSurfaceSnapshot(batch.surfaceChange.before, expected.format)
      validateSurfaceSnapshot(batch.surfaceChange.after, expected.format)
      if (!snapshotsEqual(expected, batch.surfaceChange.before)) throw new Error(tr('script.invalidResult'))
      expected = cloneSnapshot(batch.surfaceChange.after)
      continue
    }
    const batchIndices = new Set<number>()
    for (const change of batch.changes) {
      if (!Number.isSafeInteger(change.index)
        || change.index < 0
        || change.index >= expected.pixels.length
        || batchIndices.has(change.index)
        || !Number.isSafeInteger(change.before)
        || !Number.isSafeInteger(change.after)) {
        throw new Error(tr('script.invalidResult'))
      }
      batchIndices.add(change.index)
      const before = change.before >>> 0
      if ((expected.pixels[change.index] >>> 0) !== before) throw new Error(tr('script.invalidResult'))
      expected.pixels[change.index] = change.after >>> 0
    }
  }
  validateCreatedStructures(target, result)
}

const findActiveTargetSession = (target: LuaScriptTarget, requireExpected = true): DocumentSession | null => {
  const state = useWorkspace.getState()
  const session = state.sessions.find((candidate) => candidate.document.id === target.documentId)
  if (!session || state.activeId !== target.documentId) return null
  const layer = session.document.layers.find((candidate) => candidate.id === target.layerId)
  if (!layer
    || session.document.activeLayerId !== target.layerId
    || (session.document.animation?.activeFrameId ?? null) !== target.frameId
    || layer.kind
    || isLayerEffectivelyLocked(session.document, layer)
    || (requireExpected && (session.revision !== target.revision
      || !snapshotsEqual(snapshotFromLayer(session.document, layer), target.expected)))) {
    return null
  }
  return session
}

const activeTargetSession = (target: LuaScriptTarget, requireExpected = true): DocumentSession => {
  const session = findActiveTargetSession(target, requireExpected)
  if (!session) throw new Error(tr('script.targetChanged'))
  return session
}

/** Returns whether a persistent dialog can still address its original layer/cel. */
export const luaScriptTargetIsActive = (clientSession: LuaScriptClientSession): boolean => (
  findActiveTargetSession(clientSession.target, false) !== null
)

const rebaseTarget = (target: LuaScriptTarget, storedBrushes: Awaited<ReturnType<MoonSpriteApi['listBrushes']>>['brushes'] = []): LuaScriptExecutionContext => {
  const session = activeTargetSession(target, false)
  const current = buildInvocation(session, storedBrushes)
  if (current.target.documentId !== target.documentId
    || current.target.layerId !== target.layerId
    || current.target.frameId !== target.frameId) {
    throw new Error(tr('script.targetChanged'))
  }
  target.revision = current.target.revision
  target.expected = current.target.expected
  return current.context
}

const layerForFrame = (document: SpriteDocument, target: LuaScriptTarget): RasterLayer => {
  if (target.frameId && document.animation?.activeFrameId !== target.frameId) {
    return animationLayerAtFrame(document, target.layerId, target.frameId) ?? getLayer(document, target.layerId)
  }
  return getLayer(document, target.layerId)
}

const applySnapshotToLayer = (layer: RasterLayer, snapshot: LuaScriptSurfaceSnapshot): void => {
  markLayerContentChanged(layer)
  layer.width = snapshot.width
  layer.height = snapshot.height
  layer.offsetX = snapshot.offsetX
  layer.offsetY = snapshot.offsetY
  setLayerStorageOrigin(layer, { x: 0, y: 0 })
  if (layer.format === 'indexed') {
    layer.pixels = Uint32Array.from(snapshot.pixels, (pixel) => pixel >>> 0)
    return
  }
  const pixels = new Uint8ClampedArray(snapshot.pixels.length * 4)
  for (let index = 0; index < snapshot.pixels.length; index += 1) {
    const value = snapshot.pixels[index] >>> 0
    const offset = index * 4
    pixels[offset] = value & 0xff
    pixels[offset + 1] = (value >>> 8) & 0xff
    pixels[offset + 2] = (value >>> 16) & 0xff
    pixels[offset + 3] = (value >>> 24) & 0xff
  }
  layer.pixels = pixels
}

const applySnapshotAtTargetFrame = (document: SpriteDocument, target: LuaScriptTarget, snapshot: LuaScriptSurfaceSnapshot): void => {
  const layer = layerForFrame(document, target)
  applySnapshotToLayer(layer, snapshot)
  if (target.frameId) syncAnimationLayerAtFrame(document, layer, target.frameId)
}

const changedPixelCountForSurface = (before: LuaScriptSurfaceSnapshot, after: LuaScriptSurfaceSnapshot): number => {
  if (before.width !== after.width || before.height !== after.height || before.format !== after.format) {
    return Math.max(before.pixels.length, after.pixels.length)
  }
  let count = 0
  for (let index = 0; index < before.pixels.length; index += 1) {
    if ((before.pixels[index] >>> 0) !== (after.pixels[index] >>> 0)) count += 1
  }
  return count
}

const createdLayerPixelCount = (layer: LuaScriptCreatedLayer): number => layer.surface.pixels.reduce((count, pixel) => (
  count + (layer.surface.format === 'indexed' ? Number((pixel >>> 0) !== 0) : Number(((pixel >>> 24) & 0xff) !== 0))
), 0)

const rasterLayerFromScript = (created: LuaScriptCreatedLayer, colorMode: SpriteDocument['colorMode']): RasterLayer => {
  const layer = createLayer(created.name, 1, 1, colorMode)
  layer.id = created.id
  layer.opacity = created.opacity / 255
  layer.visible = created.visible
  layer.locked = created.locked
  layer.groupId = created.parentGroupId ?? null
  applySnapshotToLayer(layer, created.surface)
  return layer
}

const animationSurfaceFromLayer = (layer: RasterLayer) => layer.format === 'rgba'
  ? { format: 'rgba' as const, width: layer.width, height: layer.height, offsetX: layer.offsetX, offsetY: layer.offsetY, pixels: layer.pixels }
  : { format: 'indexed' as const, width: layer.width, height: layer.height, offsetX: layer.offsetX, offsetY: layer.offsetY, pixels: layer.pixels }

const commitCreatedLayer = (target: LuaScriptTarget, created: LuaScriptCreatedLayer, label: string): number => {
  const session = focusScriptTarget(target)
  const document = session.document
  if (document.layers.some((layer) => layer.id === created.id)) throw new Error(tr('script.invalidResult'))
  const previousActiveLayerId = document.activeLayerId
  const timeline = ensureAnimationDocument(document)
  const previousFrameId = timeline.activeFrameId
  const frame = timeline.frames[created.frameNumber - 1] ?? timeline.frames[0]
  if (!frame) throw new Error(tr('script.invalidResult'))
  const layer = rasterLayerFromScript(created, document.colorMode)
  const cel = {
    id: createId('cel'),
    layerId: layer.id,
    frameId: frame.id,
    opacity: layer.opacity,
    surface: animationSurfaceFromLayer(layer)
  }
  const index = created.stackIndex === undefined
    ? document.layers.length
    : Math.max(0, Math.min(document.layers.length, created.stackIndex - 1))
  document.layers.splice(index, 0, layer)
  timeline.cels.push(cel)
  document.activeLayerId = layer.id
  timeline.activeFrameId = frame.id
  session.selectedGroupId = null
  session.selectedGroupIds = []
  session.selectedLayerIds = [layer.id]
  useWorkspace.getState().pushHistory({
    label,
    bytes: created.surface.pixels.length * 4 + 128,
    undo: () => {
      document.layers = document.layers.filter((candidate) => candidate.id !== layer.id)
      ensureAnimationDocument(document).cels = ensureAnimationDocument(document).cels.filter((candidate) => candidate.layerId !== layer.id)
      document.activeLayerId = document.layers.some((candidate) => candidate.id === previousActiveLayerId)
        ? previousActiveLayerId
        : document.layers.at(-1)?.id ?? ''
      ensureAnimationDocument(document).activeFrameId = previousFrameId
    },
    redo: () => {
      document.layers.splice(Math.min(index, document.layers.length), 0, layer)
      const animation = ensureAnimationDocument(document)
      if (!animation.cels.some((candidate) => candidate.id === cel.id)) animation.cels.push(cel)
      document.activeLayerId = layer.id
      animation.activeFrameId = frame.id
    },
    invalidation: { kind: 'full' },
    affectedLayerIds: [layer.id],
    contentChanged: true,
    requiresAnimationSync: false
  })
  const updated = useWorkspace.getState().sessions.find((candidate) => candidate.document.id === target.documentId)
  if (!updated) throw new Error(tr('script.targetChanged'))
  const originalLayer = updated.document.layers.find((candidate) => candidate.id === target.layerId)
  if (!originalLayer) throw new Error(tr('script.targetChanged'))
  target.expected = snapshotFromLayer(updated.document, layerForFrame(updated.document, target))
  target.revision = updated.revision
  return createdLayerPixelCount(created)
}

const createScriptDocument = (created: LuaScriptCreatedDocument): SpriteDocument => {
  const document = createDocument(created.name, created.width, created.height, created.colorMode)
  const timeline = ensureAnimationDocument(document)
  const maxFrameNumber = Math.max(1, ...created.layers.map((layer) => layer.frameNumber))
  while (timeline.frames.length < maxFrameNumber) {
    timeline.frames.push({ id: createId('frame'), duration: timeline.frames[0]?.duration ?? 100 })
  }
  document.layers = []
  timeline.cels = []
  for (const createdLayer of created.layers) {
    const layer = rasterLayerFromScript(createdLayer, created.colorMode)
    const frame = timeline.frames[createdLayer.frameNumber - 1] ?? timeline.frames[0]!
    document.layers.push(layer)
    timeline.cels.push({
      id: createId('cel'),
      layerId: layer.id,
      frameId: frame.id,
      opacity: layer.opacity,
      surface: animationSurfaceFromLayer(layer)
    })
  }
  document.activeLayerId = document.layers.at(-1)!.id
  timeline.activeFrameId = timeline.frames[0]!.id
  document.dirty = true
  return document
}

const commitSurfaceChange = (
  target: LuaScriptTarget,
  before: LuaScriptSurfaceSnapshot,
  after: LuaScriptSurfaceSnapshot,
  label: string
): number => {
  const session = activeTargetSession(target)
  const beforeSnapshot = cloneSnapshot(before)
  const afterSnapshot = cloneSnapshot(after)
  applySnapshotAtTargetFrame(session.document, target, afterSnapshot)
  const entry: HistoryEntry = {
    label,
    bytes: (beforeSnapshot.pixels.length + afterSnapshot.pixels.length) * 4 + 64,
    undo: () => applySnapshotAtTargetFrame(session.document, target, beforeSnapshot),
    redo: () => applySnapshotAtTargetFrame(session.document, target, afterSnapshot),
    invalidation: { kind: 'full' },
    affectedLayerIds: [target.layerId],
    contentChanged: true,
    requiresAnimationSync: false
  }
  useWorkspace.getState().pushHistory(entry)
  target.expected = cloneSnapshot(afterSnapshot)
  const updated = useWorkspace.getState().sessions.find((candidate) => candidate.document.id === target.documentId)
  if (!updated) throw new Error(tr('script.targetChanged'))
  target.revision = updated.revision
  return changedPixelCountForSurface(beforeSnapshot, afterSnapshot)
}

const focusScriptTarget = (target: LuaScriptTarget): DocumentSession => {
  const workspace = useWorkspace.getState()
  if (workspace.activeId !== target.documentId) workspace.setActive(target.documentId)
  const session = workspace.sessions.find((candidate) => candidate.document.id === target.documentId)
  if (!session || !session.document.layers.some((layer) => layer.id === target.layerId)) throw new Error(tr('script.targetChanged'))
  if (session.document.activeLayerId !== target.layerId) workspace.selectLayer(target.layerId, 'replace')
  if (target.frameId && session.document.animation?.activeFrameId !== target.frameId) workspace.setActiveAnimationFrame(target.frameId)
  return activeTargetSession(target, false)
}

const historyPositions = (): Map<string, number> => new Map(
  useWorkspace.getState().sessions.map((session) => [session.document.id, session.history.position])
)

const addedHistoryEntries = (before: ReadonlyMap<string, number>): number => useWorkspace.getState().sessions.reduce((count, session) => (
  count + Math.max(0, session.history.position - (before.get(session.document.id) ?? 0))
), 0)

interface LuaBatchSessionBaseline {
  dirty: boolean
  updatedAt: string
  revision: number
  contentRevision: number
  layersPanelRevision: number
  contentInvalidation: DocumentSession['contentInvalidation']
  recoverySuppressed: boolean
}

const captureLuaBatchSessionBaseline = (session: DocumentSession): LuaBatchSessionBaseline => ({
  dirty: session.document.dirty,
  updatedAt: session.document.updatedAt,
  revision: session.revision,
  contentRevision: session.contentRevision,
  layersPanelRevision: session.layersPanelRevision,
  contentInvalidation: session.contentInvalidation?.kind === 'region'
    ? { ...session.contentInvalidation, rect: { ...session.contentInvalidation.rect } }
    : session.contentInvalidation ? { ...session.contentInvalidation } : null,
  recoverySuppressed: session.recoverySuppressed
})

const restoreLuaBatchSessionBaseline = (session: DocumentSession, baseline: LuaBatchSessionBaseline): void => {
  session.document.dirty = baseline.dirty
  session.document.updatedAt = baseline.updatedAt
  session.revision = baseline.revision
  session.contentRevision = baseline.contentRevision
  session.layersPanelRevision = baseline.layersPanelRevision
  session.contentInvalidation = baseline.contentInvalidation?.kind === 'region'
    ? { ...baseline.contentInvalidation, rect: { ...baseline.contentInvalidation.rect } }
    : baseline.contentInvalidation ? { ...baseline.contentInvalidation } : null
  session.recoverySuppressed = baseline.recoverySuppressed
}

const applyResult = async (
  target: LuaScriptTarget,
  result: LuaScriptRunResult,
  api: Partial<MoonSpriteApi>
): Promise<Pick<LuaScriptRunSummary, 'transactionCount' | 'changedPixelCount'> & { documentBoundary: boolean }> => {
  validateResult(target, result)
  activeTargetSession(target)
  const positionsBefore = historyPositions()
  let changedPixelCount = 0
  let documentBoundary = false
  for (const batch of result.batches) {
    const batchSession = focusScriptTarget(target)
    const batchBaseline = captureLuaBatchSessionBaseline(batchSession)
    batchSession.history.beginCompound()
    let batchCompleted = false
    try {
    if (batch.surfaceChange) {
      changedPixelCount += commitSurfaceChange(
        target,
        batch.surfaceChange.before,
        batch.surfaceChange.after,
        batch.label || result.fileName || tr('script.historyLabel')
      )
    } else if (batch.changes.length > 0) {
      const session = activeTargetSession(target, false)
      const layer = getLayer(session.document, target.layerId)
      const edit = beginPixelEdit(target.layerId)
      if (target.frameId) edit.frameId = target.frameId
      let batchChangeCount = 0
      for (const change of batch.changes) {
        if (recordPixel(session.document, layer, edit, change.index, change.after >>> 0)) batchChangeCount += 1
      }
      if (batchChangeCount > 0 && useWorkspace.getState().commitPixelEdit(edit, batch.label || result.fileName || tr('script.historyLabel'))) {
        changedPixelCount += batchChangeCount
        for (const change of batch.changes) target.expected.pixels[change.index] = change.after >>> 0
      }
    }
    for (const operation of batch.operations ?? []) {
      const applied = await applyLuaScriptOperation(operation, api)
      changedPixelCount += applied.changedPixelCount
      documentBoundary ||= applied.documentBoundary
    }
    batchSession.history.endCompound(batch.label || result.fileName || tr('script.historyLabel'))
    batchCompleted = true
    } finally {
      if (!batchCompleted) {
        batchSession.history.abortCompound()
        restoreLuaBatchSessionBaseline(batchSession, batchBaseline)
        useWorkspace.setState((state) => ({ sessions: [...state.sessions] }))
      }
    }
    const updated = useWorkspace.getState().sessions.find((candidate) => candidate.document.id === target.documentId)
    const targetLayer = updated?.document.layers.find((candidate) => candidate.id === target.layerId)
    if (updated && targetLayer) {
      target.expected = snapshotFromLayer(updated.document, layerForFrame(updated.document, target))
      target.revision = updated.revision
    }
  }
  for (const created of result.createdLayers) {
    changedPixelCount += commitCreatedLayer(target, created, result.fileName || tr('script.historyLabel'))
  }
  for (const created of result.createdDocuments) {
    const document = createScriptDocument(created)
    useWorkspace.getState().addSession(document)
    changedPixelCount += created.layers.reduce((count, layer) => count + createdLayerPixelCount(layer), 0)
    documentBoundary = true
  }
  if (!documentBoundary) {
    const workspace = useWorkspace.getState()
    const session = workspace.sessions.find((candidate) => candidate.document.id === target.documentId)
    if (session) {
      if (result.activeLayerId && session.document.layers.some((layer) => layer.id === result.activeLayerId)) {
        workspace.selectLayer(result.activeLayerId, 'replace')
      }
      if (result.activeFrameNumber && session.document.animation) {
        const frame = session.document.animation.frames[result.activeFrameNumber - 1]
        if (frame) workspace.setActiveAnimationFrame(frame.id)
      }
    }
  }
  return { transactionCount: addedHistoryEntries(positionsBefore) + result.createdDocuments.length, changedPixelCount, documentBoundary }
}

const outcomeFromResult = async (target: LuaScriptTarget, result: LuaScriptRunResult, api: Partial<MoonSpriteApi>): Promise<LuaScriptRunOutcome> => {
  const applied = await applyResult(target, result, api)
  if (applied.documentBoundary && !result.finished) throw new Error(tr('script.targetChanged'))
  const summary: LuaScriptRunSummary = {
    fileName: result.fileName,
    filePath: result.filePath,
    output: result.output,
    transactionCount: applied.transactionCount,
    changedPixelCount: applied.changedPixelCount,
    elapsedMs: result.elapsedMs
  }
  const session = !result.finished && result.sessionId
    ? {
        sessionId: result.sessionId,
        fileName: result.fileName,
        filePath: result.filePath,
        dialogs: result.dialogs,
        target
      }
    : null
  return { summary, session }
}

export async function runLuaScriptForActiveDocument(
  api: Pick<MoonSpriteApi, 'runLuaScript'> & Partial<MoonSpriteApi>,
  scriptId: string
): Promise<LuaScriptRunOutcome> {
  const state = useWorkspace.getState()
  const session = state.sessions.find((candidate) => candidate.document.id === state.activeId)
  if (!session) throw new Error(tr('script.documentRequired'))
  const storedBrushes = api.listBrushes ? (await api.listBrushes().catch(() => ({ directoryPath: '', brushes: [], folders: [] }))).brushes : []
  const { context, target } = buildInvocation(session, storedBrushes)
  const result = await api.runLuaScript(scriptId, context)
  try {
    return await outcomeFromResult(target, result, api)
  } catch (error) {
    if (result.sessionId && api.closeLuaScriptSession) await api.closeLuaScriptSession(result.sessionId).catch(() => undefined)
    throw error
  }
}

export async function dispatchLuaScriptDialogForActiveDocument(
  api: Pick<MoonSpriteApi, 'dispatchLuaScriptDialog'> & Partial<MoonSpriteApi>,
  session: LuaScriptClientSession,
  action: LuaScriptDialogAction
): Promise<LuaScriptRunOutcome> {
  const storedBrushes = api.listBrushes ? (await api.listBrushes().catch(() => ({ directoryPath: '', brushes: [], folders: [] }))).brushes : []
  const context = rebaseTarget(session.target, storedBrushes)
  const result = await api.dispatchLuaScriptDialog(session.sessionId, action, context)
  try {
    return await outcomeFromResult(session.target, result, api)
  } catch (error) {
    if (api.closeLuaScriptSession) await api.closeLuaScriptSession(session.sessionId).catch(() => undefined)
    throw error
  }
}

export async function closeLuaScriptClientSession(
  api: Pick<MoonSpriteApi, 'closeLuaScriptSession'>,
  session: LuaScriptClientSession
): Promise<void> {
  await api.closeLuaScriptSession(session.sessionId)
}
