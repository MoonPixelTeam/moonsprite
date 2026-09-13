import type { AnimationCel, AnimationCelSurface, AnimationLoopDirection, AnimationLoopSection, AnimationTimeline } from '@shared/types-animation'
import type { LayerMask, RasterLayer } from '@shared/types-layer'
import type { SpriteDocument } from '@shared/types-document'
import { type HistoryEntry } from '@/core/history'
import { animationMaskAt, createAnimationMaskLookup, createId, createLayer, isGroupEffectivelyLocked, isLayerEffectivelyLocked, paletteColorIdForCanvas, resolveAnimationMask } from '@/core/document-model'
import { activateAnimationFrame, addBlankAnimationFrame, animationCelContentSelection, animationCelHasContent, animationCelKey, cloneAnimationCel, cloneAnimationCelSurface, cloneAnimationGroupMask, cloneAnimationLayerMask, connectAnimationCels, createAnimationCelLookup, deleteAnimationFrame, disconnectAnimationCels, duplicateAnimationFrame, ensureAnimationDocument, firstPlayableAnimationFrameId, inheritAnimationFrameCelLinks, linkAnimationFrameCels, mapAnimationCelBlock, nextAnimationFrameId, normalizeAnimationCelZIndex, parseAnimationCelKey, refreshActiveAnimationFrame, resolveAnimationCel, restoreAnimationCels, setAnimationFrameDuration, setAnimationLoop, stepAnimationFrameId, syncActiveAnimationFrame } from '@/core/animation'
import { advanceAnimationLoopSectionPlayback, animationLoopSectionAtFrame, animationLoopSectionStartFrameId, cloneAnimationLoopSections, normalizeAnimationLoopSections, reconcileAnimationLoopSectionsAfterFrameReorder, resolveAnimationLoopSectionRange, stepAnimationLoopSectionFrameId } from '@/core/animation-loop-sections'
import { applyRelativeLuminance } from '@/core/raster'
import { combineSelection } from '@/core/selection'
import { buildLayerPanelTree } from '@/core/layer-panel-layout'
import { loadEditorPreferences, saveEditorPreferences } from '@/core/file-preferences'
import { cloneTextCelData } from '@/core/text-raster'
import { cloneTilemapCelData } from '@/core/tilemap'
import { cloneFreeTileCelData } from '@/core/free-tile'
import { clipboardService, type AnimationCelClipboardSnapshot, type AnimationFrameClipboardSnapshot } from './clipboard-service'
import { captureDocumentStructureSnapshot, documentStructureDeltaBytes, restoreDocumentStructureSnapshot } from './workspace-document-history'
import { cloneSelectionMask, enterLayerMaskEditing, exitLayerMaskEditing } from './workspace-session'
import type { AnimationFrameClipboardItem, AnimationMaskClipboardItem, AnimationPlaybackMode, DocumentSession } from './workspace-types'
import type { WorkspaceAnimationCommands } from './workspace-state'
import type { WorkspaceCommandContext } from './workspace-command-context'
import { clearAnimationLoopPlayback, setTimelineActiveContext, animationLayerPanelSelectionRows, AnimationLayerPanelSelectionRow, clearAnimationItemSelection, applyLayerRowSelection } from './workspace-animation-selection'
import { tr } from './workspace-translation'
import { AnimationMaskOwnerKind, cloneAnimationMaskForOwner, animationMaskOwnerKind, animationMaskSlotSnapshot, AnimationMaskSlotSnapshot, setAnimationMaskSlot, restoreAnimationMaskSlots } from './workspace-animation-mask-slots'
import { activeSession } from './workspace-access'
import { clearFreeTileInstanceSelection } from './workspace-free-tile-selection'
import { requestTilesetPanelForLayer } from './workspace-tileset-panel'
import { captureAnimationSelectionHistory, historyEntryWithAnimationSelection, restoreAnimationSelectionHistory } from './workspace-animation-selection-history'
import { cloneAnimationCelsForLayerIds } from './workspace-animation-clone'

type LayerContentKind = 'raster' | 'text' | 'tilemap' | 'free-tile'

const layerContentKind = (layer: RasterLayer | undefined): LayerContentKind => layer?.kind ?? 'raster'

const animationCelContentKind = (cel: AnimationCel): LayerContentKind => cel.tilemap ? 'tilemap' : cel.freeTiles ? 'free-tile' : cel.text ? 'text' : 'raster'

const setTimelineActiveFrame = (session: DocumentSession, frameId: string): void => {
  if (session.timelineActiveContext.frameId === frameId) return
  session.timelineActiveContext = { ...session.timelineActiveContext, frameId }
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
  const fromContentRevision = session.contentRevision
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
  // Playback swaps the live layer surfaces in place.  Treat that swap as a
  // full composite change so the canvas cache cannot keep presenting the
  // previous frame (or a blank surface) until an unrelated visibility toggle
  // happens to invalidate it.
  session.contentRevision += 1
  session.contentInvalidation = { kind: 'full', fromRevision: fromContentRevision, revision: session.contentRevision }
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

const persistAnimationPlaybackPreferences = (patch: { animationPlaybackRate?: number; animationPlaybackMode?: AnimationPlaybackMode | null; animationReturnToStart?: boolean }): void => {
  const preferences = loadEditorPreferences()
  saveEditorPreferences({ ...preferences, ...patch })
}

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

const animationMaskOwnerIds = (session: DocumentSession): string[] => buildLayerPanelTree({
  layers: session.document.layers,
  groups: session.document.groups,
  collapsedGroupIds: []
}).map((node) => node.id)

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

export function createWorkspaceAnimationCommands({ get, set }: WorkspaceCommandContext<'advanceAnimationFrame' | 'commitFloatingPaste' | 'commitSelectionChange' | 'deleteAnimationFrame' | 'deleteSelectedLayerMasks' | 'mutateActive' | 'selectAnimationCell' | 'selectAnimationFrame' | 'selectLayer' | 'setActiveAnimationFrame' | 'setAnimationLoop' | 'setAnimationPlaying'>): WorkspaceAnimationCommands {
  return {
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
        const targetLayer = target ? session.document.layers.find((layer) => layer.id === target.layerId) : null
        if (!target || !timeline || !targetLayer || !timeline.frames.some((frame) => frame.id === target.frameId)) return
        if (targetLayer.kind === 'free-tile') {
          session.freeTileInstanceLayerId = null
          clearFreeTileInstanceSelection(session)
        }
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
          if (!activateAnimationPlaybackFrame(current, step.frameId)) return
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

    importGifAnimationLayer(source, startFrameIndex) {
      const current = activeSession(get())
      const sourceTimeline = source.animation
      const sourceLayer = source.layers[0]
      if (!current || !sourceTimeline || !sourceLayer || sourceTimeline.frames.length === 0) return false

      let imported = false
      get().mutateActive((session) => {
        const document = session.document
        const timeline = ensureAnimationDocument(document)
        const beforeDocument = captureDocumentStructureSnapshot(document)
        const beforeSelection = captureAnimationSelectionHistory(session)
        const start = Math.max(0, Math.min(timeline.frames.length, Math.trunc(startFrameIndex)))
        const insertedFrames = sourceTimeline.frames.map((sourceFrame) => ({
          id: createId('frame'),
          duration: sourceFrame.duration,
          ...(sourceFrame.disabled ? { disabled: true } : {})
        }))
        timeline.frames.splice(start, 0, ...insertedFrames)

        const layer = createLayer(source.name || 'GIF', sourceLayer.width, sourceLayer.height, document.colorMode)
        layer.offsetX = sourceLayer.offsetX
        layer.offsetY = sourceLayer.offsetY
        document.layers.push(layer)

        // Add the complete set of layer/frame slots first, then replace the
        // imported slots. This keeps the new layer a normal timeline layer and
        // lets the existing animation normalization handle blank slots.
        ensureAnimationDocument(document)
        const sourceCels = new Map(sourceTimeline.cels.filter((cel) => cel.layerId === sourceLayer.id).map((cel) => [cel.frameId, cel]))
        const importedKeys: string[] = []
        let firstSurface: AnimationCelSurface | null = null

        for (let index = 0; index < sourceTimeline.frames.length; index += 1) {
          const sourceFrame = sourceTimeline.frames[index]
          const sourceCel = sourceCels.get(sourceFrame.id)
          const sourceSurface = sourceCel?.surface
          const targetFrame = insertedFrames[index]
          if (!sourceSurface || !targetFrame) continue
          const rgbaPixels = sourceSurface.format === 'rgba'
            ? new Uint8ClampedArray(sourceSurface.pixels)
            : new Uint8ClampedArray(sourceSurface.width * sourceSurface.height * 4)
          if (sourceSurface.format === 'indexed') {
            for (let pixelIndex = 0; pixelIndex < sourceSurface.pixels.length; pixelIndex += 1) {
              const color = source.palette.find((entry) => entry.id === sourceSurface.pixels[pixelIndex])?.color ?? { r: 0, g: 0, b: 0, a: 0 }
              const offset = pixelIndex * 4
              rgbaPixels[offset] = color.r
              rgbaPixels[offset + 1] = color.g
              rgbaPixels[offset + 2] = color.b
              rgbaPixels[offset + 3] = color.a
            }
          }
          const surface: AnimationCelSurface = document.colorMode === 'indexed'
            ? {
                format: 'indexed',
                width: sourceSurface.width,
                height: sourceSurface.height,
                offsetX: sourceSurface.offsetX,
                offsetY: sourceSurface.offsetY,
                pixels: Uint32Array.from({ length: sourceSurface.width * sourceSurface.height }, (_, pixelIndex) => {
                  const offset = pixelIndex * 4
                  return paletteColorIdForCanvas(document, { r: rgbaPixels[offset], g: rgbaPixels[offset + 1], b: rgbaPixels[offset + 2], a: rgbaPixels[offset + 3] })
                })
              }
            : {
                format: 'rgba',
                width: sourceSurface.width,
                height: sourceSurface.height,
                offsetX: sourceSurface.offsetX,
                offsetY: sourceSurface.offsetY,
                pixels: rgbaPixels
              }
          const targetCel = timeline.cels.find((cel) => cel.layerId === layer.id && cel.frameId === targetFrame.id)
          if (!targetCel) continue
          targetCel.linkedCelId = null
          targetCel.opacity = sourceCel.opacity ?? layer.opacity
          targetCel.zIndex = normalizeAnimationCelZIndex(sourceCel.zIndex)
          targetCel.surface = surface
          delete targetCel.text
          delete targetCel.tilemap
          delete targetCel.freeTiles
          importedKeys.push(animationCelKey(layer.id, targetFrame.id))
          if (!firstSurface) firstSurface = surface
        }

        if (importedKeys.length === 0) return
        if (firstSurface) layer.pixels = firstSurface.pixels instanceof Uint8ClampedArray ? new Uint8ClampedArray(firstSurface.pixels) : new Uint32Array(firstSurface.pixels)
        const firstFrameId = timeline.frames[start]?.id
        if (!firstFrameId) return
        applyLayerRowSelection(session, [layer.id], [], { kind: 'layer', id: layer.id })
        activateAnimationFrame(document, firstFrameId)
        session.activeLayerMaskId = null
        session.layerMaskIsolatedView = false
        session.selectedAnimationFrameIds = []
        session.animationFrameSelectionAnchorId = null
        session.selectedAnimationCellKeys = importedKeys
        session.animationCellSelectionAnchorKey = importedKeys.at(-1) ?? null
        session.animationCellSelectionExplicit = true
        session.selectedAnimationMaskCellKeys = []
        session.selectedAnimationMaskRowKeys = []
        session.animationMaskCellSelectionAnchorKey = null
        setTimelineActiveContext(session, { kind: 'layer', ownerKind: 'layer', ownerId: layer.id }, firstFrameId, null)
        refreshActiveAnimationFrame(document)
        const afterDocument = captureDocumentStructureSnapshot(document)
        const afterSelection = captureAnimationSelectionHistory(session)
        session.history.push({
          label: '导入 GIF 到时间轴',
          bytes: documentStructureDeltaBytes(beforeDocument, afterDocument),
          undo: () => { restoreDocumentStructureSnapshot(document, beforeDocument); restoreAnimationSelectionHistory(session, beforeSelection) },
          redo: () => { restoreDocumentStructureSnapshot(document, afterDocument); restoreAnimationSelectionHistory(session, afterSelection) },
          invalidation: { kind: 'full' },
          requiresAnimationSync: false
        })
        imported = true
      }, true, true)
      if (imported) set({ message: 'GIF 已导入时间轴' })
      return imported
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
    }
  }
}
