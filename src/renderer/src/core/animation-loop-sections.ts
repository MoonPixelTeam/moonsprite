import type { AnimationFrame, AnimationLoopDirection, AnimationLoopSection, AnimationTimeline } from '@shared/types-animation'

export const MAX_ANIMATION_LOOP_REPEAT_COUNT = 9_999
export const MAX_ANIMATION_LOOP_SECTION_NAME_LENGTH = 64

export interface AnimationLoopSectionRange {
  startIndex: number
  endIndex: number
  startFrameId: string
  endFrameId: string
}

export interface AnimationLoopPlaybackStep {
  frameId: string
  completedIterations: number
  completed: boolean
}

const normalizedRepeatCount = (value: unknown): number | null => {
  if (value === null || value === undefined) return null
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return null
  return Math.max(1, Math.min(MAX_ANIMATION_LOOP_REPEAT_COUNT, Math.trunc(numeric)))
}

export const cloneAnimationLoopSections = (sections: readonly AnimationLoopSection[] | undefined): AnimationLoopSection[] =>
  (sections ?? []).map((section) => ({ ...section }))

export const normalizeAnimationLoopSections = (value: unknown, frames: readonly AnimationFrame[]): AnimationLoopSection[] => {
  if (!Array.isArray(value) || frames.length === 0) return []
  const frameIndexes = new Map(frames.map((frame, index) => [frame.id, index]))
  const usedIds = new Set<string>()
  const result: AnimationLoopSection[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object') continue
    const candidate = item as Partial<AnimationLoopSection>
    if (typeof candidate.id !== 'string' || !candidate.id || usedIds.has(candidate.id)) continue
    const rawStartIndex = typeof candidate.startFrameId === 'string' ? frameIndexes.get(candidate.startFrameId) : undefined
    const rawEndIndex = typeof candidate.endFrameId === 'string' ? frameIndexes.get(candidate.endFrameId) : undefined
    if (rawStartIndex === undefined || rawEndIndex === undefined) continue
    const startIndex = Math.min(rawStartIndex, rawEndIndex)
    const endIndex = Math.max(rawStartIndex, rawEndIndex)
    const name = typeof candidate.name === 'string'
      ? candidate.name.trim().slice(0, MAX_ANIMATION_LOOP_SECTION_NAME_LENGTH)
      : ''
    usedIds.add(candidate.id)
    result.push({
      id: candidate.id,
      name: name || `Loop ${result.length + 1}`,
      startFrameId: frames[startIndex].id,
      endFrameId: frames[endIndex].id,
      direction: candidate.direction === 'reverse' ? 'reverse' : 'forward',
      repeatCount: normalizedRepeatCount(candidate.repeatCount)
    })
  }
  return result
}

export const resolveAnimationLoopSectionRange = (
  timeline: Pick<AnimationTimeline, 'frames'>,
  section: AnimationLoopSection
): AnimationLoopSectionRange | null => {
  const rawStartIndex = timeline.frames.findIndex((frame) => frame.id === section.startFrameId)
  const rawEndIndex = timeline.frames.findIndex((frame) => frame.id === section.endFrameId)
  if (rawStartIndex < 0 || rawEndIndex < 0) return null
  const startIndex = Math.min(rawStartIndex, rawEndIndex)
  const endIndex = Math.max(rawStartIndex, rawEndIndex)
  return {
    startIndex,
    endIndex,
    startFrameId: timeline.frames[startIndex].id,
    endFrameId: timeline.frames[endIndex].id
  }
}

export const animationLoopSectionAtFrame = (
  timeline: Pick<AnimationTimeline, 'frames' | 'loopSections'>,
  frameId: string
): AnimationLoopSection | null => {
  const frameIndex = timeline.frames.findIndex((frame) => frame.id === frameId)
  if (frameIndex < 0) return null
  let match: { section: AnimationLoopSection; span: number } | null = null
  for (const section of timeline.loopSections ?? []) {
    const range = resolveAnimationLoopSectionRange(timeline, section)
    if (!range || frameIndex < range.startIndex || frameIndex > range.endIndex) continue
    const span = range.endIndex - range.startIndex + 1
    if (!match || span < match.span) match = { section, span }
  }
  return match?.section ?? null
}

export const animationLoopSectionStartFrameId = (
  timeline: Pick<AnimationTimeline, 'frames'>,
  section: AnimationLoopSection
): string | null => {
  const range = resolveAnimationLoopSectionRange(timeline, section)
  if (!range) return null
  const frames = timeline.frames.slice(range.startIndex, range.endIndex + 1)
  if (section.direction === 'reverse') frames.reverse()
  return frames.find((frame) => frame.disabled !== true)?.id ?? null
}

export const stepAnimationLoopSectionFrameId = (
  timeline: Pick<AnimationTimeline, 'frames'>,
  section: AnimationLoopSection,
  frameId: string,
  direction: -1 | 1,
  skipDisabledFrames = false
): string | null => {
  const range = resolveAnimationLoopSectionRange(timeline, section)
  if (!range) return null
  const frames = timeline.frames.slice(range.startIndex, range.endIndex + 1)
  const candidates = skipDisabledFrames ? frames.filter((frame) => frame.disabled !== true) : frames
  if (candidates.length === 0) return null
  const currentIndex = candidates.findIndex((frame) => frame.id === frameId)
  const startIndex = currentIndex >= 0 ? currentIndex : direction > 0 ? -1 : 0
  return candidates[(startIndex + direction + candidates.length) % candidates.length]?.id ?? null
}

export const advanceAnimationLoopSectionPlayback = (
  timeline: Pick<AnimationTimeline, 'frames'>,
  section: AnimationLoopSection,
  frameId: string,
  completedIterations: number
): AnimationLoopPlaybackStep | null => {
  const range = resolveAnimationLoopSectionRange(timeline, section)
  if (!range) return null
  const direction: AnimationLoopDirection = section.direction === 'reverse' ? 'reverse' : 'forward'
  const playableFrames = timeline.frames
    .slice(range.startIndex, range.endIndex + 1)
    .filter((frame) => frame.disabled !== true)
  if (direction === 'reverse') playableFrames.reverse()
  if (playableFrames.length === 0) return null
  const currentIndex = playableFrames.findIndex((frame) => frame.id === frameId)
  if (currentIndex < 0) return { frameId: playableFrames[0].id, completedIterations, completed: false }
  if (currentIndex + 1 < playableFrames.length) {
    return { frameId: playableFrames[currentIndex + 1].id, completedIterations, completed: false }
  }
  const nextCompletedIterations = completedIterations + 1
  if (section.repeatCount !== null && nextCompletedIterations >= section.repeatCount) {
    return { frameId: playableFrames[playableFrames.length - 1].id, completedIterations: nextCompletedIterations, completed: true }
  }
  return { frameId: playableFrames[0].id, completedIterations: nextCompletedIterations, completed: false }
}

export const reconcileAnimationLoopSectionsAfterFrameInsertion = (
  sections: readonly AnimationLoopSection[] | undefined,
  previousFrames: readonly AnimationFrame[],
  sourceFrameId: string,
  insertedFrameId: string
): AnimationLoopSection[] => (sections ?? []).map((section) => {
  const range = resolveAnimationLoopSectionRange({ frames: [...previousFrames] }, section)
  if (!range || previousFrames[range.endIndex]?.id !== sourceFrameId) return { ...section }
  if (section.endFrameId === sourceFrameId) return { ...section, endFrameId: insertedFrameId }
  if (section.startFrameId === sourceFrameId) return { ...section, startFrameId: insertedFrameId }
  return { ...section }
})

/**
 * Reconcile named ranges after a frame reorder. A frame dropped on a loop
 * boundary is part of that loop even when the visual order does not change
 * (for example, dropping the last frame on its own left edge).
 */
export const reconcileAnimationLoopSectionsAfterFrameReorder = (
  sections: readonly AnimationLoopSection[] | undefined,
  previousFrames: readonly AnimationFrame[],
  remainingFrames: readonly AnimationFrame[],
  reorderedFrames: readonly AnimationFrame[],
  movingFrameIds: readonly string[],
  insertionIndex: number,
  dropSide: 'before' | 'after' | null = null
): AnimationLoopSection[] => {
  if (!sections?.length || !reorderedFrames.length || !movingFrameIds.length) return cloneAnimationLoopSections(sections)
  const movingIds = new Set(movingFrameIds)
  const orderUnchanged = previousFrames.length === reorderedFrames.length
    && previousFrames.every((frame, index) => frame.id === reorderedFrames[index]?.id)
  return normalizeAnimationLoopSections((sections ?? []).flatMap((section) => {
    const range = resolveAnimationLoopSectionRange({ frames: [...previousFrames] }, section)
    if (!range) return []
    const sectionIds = previousFrames.slice(range.startIndex, range.endIndex + 1).map((frame) => frame.id)
    const remainingSectionIds = sectionIds.filter((id) => !movingIds.has(id))
    const selectedSectionIds = sectionIds.filter((id) => movingIds.has(id))
    const movingIndexes = previousFrames
      .map((frame, index) => movingIds.has(frame.id) ? index : -1)
      .filter((index) => index >= 0)
    const movingStartIndex = movingIndexes.length > 0 ? Math.min(...movingIndexes) : -1
    const movingEndIndex = movingIndexes.length > 0 ? Math.max(...movingIndexes) : -1
    const remainingIndexes = remainingFrames
      .map((frame, index) => sectionIds.includes(frame.id) ? index : -1)
      .filter((index) => index >= 0)
    const includesDroppedFrames = orderUnchanged && dropSide
      ? dropSide === 'before'
        ? range.endIndex + 1 === movingStartIndex
        : range.startIndex === movingEndIndex + 1
      : remainingIndexes.length > 0
        ? insertionIndex >= Math.min(...remainingIndexes) && insertionIndex <= Math.max(...remainingIndexes) + 1
        : false
    // When the drop target is one of the moving frames, the visual order can
    // stay unchanged. In that case preserve the section's existing members;
    // only the side of the boundary may add an outside frame to the range.
    const memberIds = orderUnchanged
      ? includesDroppedFrames
        ? [...sectionIds, ...movingFrameIds]
        : sectionIds
      : remainingSectionIds.length === 0
      ? selectedSectionIds
      : includesDroppedFrames
        ? [...remainingSectionIds, ...movingFrameIds]
        : remainingSectionIds
    const memberIndexes = memberIds
      .map((id) => reorderedFrames.findIndex((frame) => frame.id === id))
      .filter((index) => index >= 0)
    if (memberIndexes.length === 0) return []
    const startIndex = Math.min(...memberIndexes)
    const endIndex = Math.max(...memberIndexes)
    return [{ ...section, startFrameId: reorderedFrames[startIndex].id, endFrameId: reorderedFrames[endIndex].id }]
  }), reorderedFrames)
}

export const reconcileAnimationLoopSectionsAfterFrameDeletion = (
  sections: readonly AnimationLoopSection[] | undefined,
  previousFrames: readonly AnimationFrame[],
  remainingFrames: readonly AnimationFrame[],
  deletedFrameId: string
): AnimationLoopSection[] => {
  if (!sections?.length || remainingFrames.length === 0) return []
  const remainingIds = new Set(remainingFrames.map((frame) => frame.id))
  const previousIndexes = new Map(previousFrames.map((frame, index) => [frame.id, index]))
  const adjusted = sections.flatMap((section) => {
    const rawStartIndex = previousIndexes.get(section.startFrameId)
    const rawEndIndex = previousIndexes.get(section.endFrameId)
    if (rawStartIndex === undefined || rawEndIndex === undefined) return []
    const startIndex = Math.min(rawStartIndex, rawEndIndex)
    const endIndex = Math.max(rawStartIndex, rawEndIndex)
    if (deletedFrameId !== section.startFrameId && deletedFrameId !== section.endFrameId) return [{ ...section }]
    if (startIndex === endIndex) return []
    let leftFrameId = previousFrames[startIndex].id
    let rightFrameId = previousFrames[endIndex].id
    if (!remainingIds.has(leftFrameId)) {
      leftFrameId = previousFrames.slice(startIndex + 1, endIndex + 1).find((frame) => remainingIds.has(frame.id))?.id ?? ''
    }
    if (!remainingIds.has(rightFrameId)) {
      rightFrameId = previousFrames.slice(startIndex, endIndex).reverse().find((frame) => remainingIds.has(frame.id))?.id ?? ''
    }
    return leftFrameId && rightFrameId ? [{ ...section, startFrameId: leftFrameId, endFrameId: rightFrameId }] : []
  })
  return normalizeAnimationLoopSections(adjusted, remainingFrames)
}
