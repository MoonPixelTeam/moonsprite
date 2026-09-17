import type { AnimationCel, AnimationLoopDirection, AnimationLoopSection, AnimationTimeline } from '@shared/types-animation'
import type { LayerMask, RasterLayer } from '@shared/types-layer'
import type { SpriteDocument } from '@shared/types-document'
import { createId, isGroupEffectivelyLocked, isLayerEffectivelyLocked } from '@/core/document-model'
import { activateAnimationFrame, animationCelHasContent, animationCelKey, ensureAnimationDocument, firstPlayableAnimationFrameId, parseAnimationCelKey, resolveAnimationCel } from '@/core/animation'
import { animationLoopSectionAtFrame, cloneAnimationLoopSections, resolveAnimationLoopSectionRange } from '@/core/animation-loop-sections'
import { buildLayerPanelTree } from '@/core/layer-panel-layout'
import { loadEditorPreferences, saveEditorPreferences } from '@/core/file-preferences'
import type { AnimationPlaybackMode, DocumentSession } from './workspace-types'
import { clearAnimationLoopPlayback } from './workspace-animation-selection'
import { tr } from './workspace-translation'
import { AnimationMaskOwnerKind, cloneAnimationMaskForOwner, animationMaskOwnerKind } from './workspace-animation-mask-slots'


export type LayerContentKind = 'raster' | 'text' | 'tilemap' | 'free-tile'

export const layerContentKind = (layer: RasterLayer | undefined): LayerContentKind => layer?.kind ?? 'raster'

export const animationCelContentKind = (cel: AnimationCel): LayerContentKind => (cel.tilemap ? 'tilemap' : cel.freeTiles ? 'free-tile' : cel.text ? 'text' : 'raster')

export const setTimelineActiveFrame = (session: DocumentSession, frameId: string): void => {
  if (session.timelineActiveContext.frameId === frameId) return
  session.timelineActiveContext = { ...session.timelineActiveContext, frameId }
}

export const setAnimationLoopPlaybackSection = (session: DocumentSession, section: AnimationLoopSection): void => {
  session.animationPlaybackLoopSectionId = section.id
  session.animationPlaybackLoopIteration = 0
  session.animationPlaybackLoopSectionRepeatIndefinitely = section.repeatCount === null
}

export const retargetAnimationLoopPlaybackAtFrame = (session: DocumentSession, frameId: string): void => {
  if (!session.animationPlaying || session.animationPlaybackMode !== 'tag') return
  const timeline = session.document.animation
  const loopSection = timeline ? animationLoopSectionAtFrame(timeline, frameId) : null
  clearAnimationLoopPlayback(session)
  if (!loopSection) return
  setAnimationLoopPlaybackSection(session, loopSection)
}

export const activateAnimationPlaybackFrame = (session: DocumentSession, frameId: string): boolean => {
  const fromContentRevision = session.contentRevision
  if (!activateAnimationFrame(session.document, frameId)) return false
  const preserveMaskContext = (session.selectedAnimationMaskRowKeys?.length ?? 0) > 0 || (session.selectedAnimationMaskCellKeys?.length ?? 0) > 0 || session.activeLayerMaskId !== null
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
  session.contentInvalidation = {
    kind: 'full',
    fromRevision: fromContentRevision,
    revision: session.contentRevision
  }
  return true
}

export const animationLoopSectionContainsFrame = (timeline: AnimationTimeline, section: AnimationLoopSection, frameId: string): boolean => {
  const range = resolveAnimationLoopSectionRange(timeline, section)
  const frameIndex = timeline.frames.findIndex((frame) => frame.id === frameId)
  return Boolean(range && frameIndex >= range.startIndex && frameIndex <= range.endIndex)
}

export const nestedAnimationLoopSectionAtFrame = (timeline: AnimationTimeline, parent: AnimationLoopSection, frameId: string): AnimationLoopSection | null => {
  const parentRange = resolveAnimationLoopSectionRange(timeline, parent)
  const frameIndex = timeline.frames.findIndex((frame) => frame.id === frameId)
  if (!parentRange || frameIndex < parentRange.startIndex || frameIndex > parentRange.endIndex) return null
  return (
    (timeline.loopSections ?? [])
      .map((section) => ({
        section,
        range: resolveAnimationLoopSectionRange(timeline, section)
      }))
      .filter(({ section, range }) =>
        Boolean(
          range &&
            section.id !== parent.id &&
            range.startIndex >= parentRange.startIndex &&
            range.endIndex <= parentRange.endIndex &&
            range.endIndex - range.startIndex < parentRange.endIndex - parentRange.startIndex &&
            frameIndex >= range.startIndex &&
            frameIndex <= range.endIndex
        )
      )
      .sort((left, right) => left.range!.endIndex - left.range!.startIndex - (right.range!.endIndex - right.range!.startIndex))
      .at(0)?.section ?? null
  )
}

export const animationLoopSectionBoundaryFrameId = (timeline: AnimationTimeline, section: AnimationLoopSection, direction: AnimationLoopDirection): string | null => {
  const range = resolveAnimationLoopSectionRange(timeline, section)
  if (!range) return null
  return timeline.frames[direction === 'forward' ? range.endIndex : range.startIndex]?.id ?? null
}

export const updateSelectedAnimationFramesDisabled = (session: DocumentSession, update: boolean | 'toggle'): void => {
  const timeline = ensureAnimationDocument(session.document)
  const selected = new Set(session.selectedAnimationFrameIds.length ? session.selectedAnimationFrameIds : [timeline.activeFrameId])
  const frames = timeline.frames.filter((frame) => selected.has(frame.id))
  const before = frames.map((frame) => ({
    id: frame.id,
    disabled: frame.disabled === true
  }))
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

export const setAnimationLoopSections = (session: DocumentSession, sections: readonly AnimationLoopSection[]): void => {
  ensureAnimationDocument(session.document).loopSections = cloneAnimationLoopSections(sections)
  if (
    (session.animationPlaybackLoopSectionId && !sections.some((section) => section.id === session.animationPlaybackLoopSectionId)) ||
    (session.animationPlaybackTagCycleSectionId && !sections.some((section) => section.id === session.animationPlaybackTagCycleSectionId))
  ) {
    session.animationPlaying = false
    session.animationPlaybackStartFrameId = null
    clearAnimationLoopPlayback(session)
  }
}

export const persistAnimationPlaybackPreferences = (patch: { animationPlaybackRate?: number; animationPlaybackMode?: AnimationPlaybackMode | null; animationReturnToStart?: boolean }): void => {
  const preferences = loadEditorPreferences()
  saveEditorPreferences({ ...preferences, ...patch })
}

export const whiteAnimationMaskForOwner = (source: LayerMask, ownerKind: AnimationMaskOwnerKind, ownerStorageId: string): LayerMask => {
  const mask = cloneAnimationMaskForOwner(source, ownerKind, ownerStorageId, {
    id: createId('mask'),
    preserveLink: false
  })
  for (let index = 0; index < mask.pixels.length; index += 4) {
    mask.pixels[index] = 255
    mask.pixels[index + 1] = 255
    mask.pixels[index + 2] = 255
    mask.pixels[index + 3] = 255
  }
  return mask
}

export const animationMaskOwnerIds = (session: DocumentSession): string[] =>
  buildLayerPanelTree({
    layers: session.document.layers,
    groups: session.document.groups,
    collapsedGroupIds: []
  }).map((node) => node.id)

export const mapAnimationMaskBlock = (session: DocumentSession, sourceKeys: readonly string[], sourceAnchorKey: string, targetOwnerId: string, targetFrameId: string): Array<{ sourceKey: string; targetKey: string }> => {
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
    return destinationOwner && destinationFrame
      ? [
          {
            sourceKey,
            targetKey: animationCelKey(destinationOwner, destinationFrame.id)
          }
        ]
      : []
  })
  return placements.length === sourceKeys.length && new Set(placements.map((placement) => placement.targetKey)).size === placements.length ? placements : []
}

export const animationMaskPlacementsTargetEmptyLayerCel = (session: DocumentSession, placements: readonly { targetKey: string }[]): boolean => {
  const timeline = ensureAnimationDocument(session.document)
  const celByKey = new Map(timeline.cels.map((cel) => [animationCelKey(cel.layerId, cel.frameId), cel]))
  return placements.some(({ targetKey }) => {
    const target = parseAnimationCelKey(targetKey)
    if (!target || animationMaskOwnerKind(session.document, target.layerId) !== 'layer') return false
    const cel = celByKey.get(targetKey) ?? null
    return !animationCelHasContent(resolveAnimationCel(timeline, cel), session.document.palette)
  })
}

export const animationMaskOwnerLocked = (document: SpriteDocument, ownerId: string): boolean => {
  const layer = document.layers.find((candidate) => candidate.id === ownerId)
  if (layer) return isLayerEffectivelyLocked(document, layer)
  const group = document.groups.find((candidate) => candidate.id === ownerId)
  return group ? isGroupEffectivelyLocked(document, group) : true
}
