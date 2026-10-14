import type { AnimationLoopSection, AnimationTimeline } from '@shared/types-animation'
import { resolveAnimationLoopSectionRange } from '@/core/animation-loop-sections'

export interface AnimationLoopSectionLayout { section: AnimationLoopSection; startIndex: number; span: number; lane: number; laneSpan: number }

export interface AnimationLoopSectionResizePreview { sectionId: string; startIndex: number; endIndex: number }

export const layoutAnimationLoopSections = (timeline: AnimationTimeline): { items: AnimationLoopSectionLayout[]; laneCount: number } => {
  const candidates = (timeline.loopSections ?? []).flatMap((section) => {
    const range = resolveAnimationLoopSectionRange(timeline, section)
    return range ? [{ section, startIndex: range.startIndex, endIndex: range.endIndex, span: range.endIndex - range.startIndex + 1, parentIndex: -1, lane: 0 }] : []
  }).sort((left, right) => left.startIndex - right.startIndex || right.span - left.span || left.section.name.localeCompare(right.section.name))
  const contains = (parent: typeof candidates[number], child: typeof candidates[number]): boolean =>
    parent.startIndex <= child.startIndex && parent.endIndex >= child.endIndex && (parent.startIndex < child.startIndex || parent.endIndex > child.endIndex)
  const overlaps = (left: typeof candidates[number], right: typeof candidates[number]): boolean =>
    left.startIndex <= right.endIndex && right.startIndex <= left.endIndex
  const laneItems: Array<Array<typeof candidates[number]>> = []
  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index]
    for (let parentIndex = 0; parentIndex < index; parentIndex += 1) {
      const parent = candidates[parentIndex]
      if (!contains(parent, candidate)) continue
      if (candidate.parentIndex < 0 || parent.span < candidates[candidate.parentIndex].span) candidate.parentIndex = parentIndex
    }
    let lane = candidate.parentIndex >= 0 ? candidates[candidate.parentIndex].lane + 1 : 0
    while (laneItems[lane]?.some((item) => overlaps(item, candidate))) lane += 1
    candidate.lane = lane
    if (!laneItems[lane]) laneItems[lane] = []
    laneItems[lane].push(candidate)
  }
  const items = candidates.map(({ section, startIndex, span, lane }) => ({ section, startIndex, span, lane, laneSpan: 1 }))
  const laneCount = items.reduce((count, item) => Math.max(count, item.lane + 1), 0)
  const parentIndexes = new Set(candidates.map((candidate) => candidate.parentIndex).filter((index) => index >= 0))
  const leafIndexes = candidates
    .map((_, index) => index)
    .filter((index) => !parentIndexes.has(index))
  const placedLeafIndexes = new Set<number>()
  for (const index of leafIndexes) {
    const parentLane = candidates[index].parentIndex >= 0 ? items[candidates[index].parentIndex].lane : -1
    for (let lane = laneCount - 1; lane > parentLane; lane -= 1) {
      const blocked = items.some((item, itemIndex) =>
        itemIndex !== index &&
        (parentIndexes.has(itemIndex) || placedLeafIndexes.has(itemIndex)) &&
        item.lane === lane &&
        overlaps(candidates[itemIndex], candidates[index])
      )
      if (blocked) continue
      items[index].lane = lane
      break
    }
    placedLeafIndexes.add(index)
  }
  for (let index = 0; index < candidates.length; index += 1) {
    let parentIndex = candidates[index].parentIndex
    while (parentIndex >= 0) {
      items[parentIndex].laneSpan = Math.max(items[parentIndex].laneSpan, items[index].lane - items[parentIndex].lane + 1)
      parentIndex = candidates[parentIndex].parentIndex
    }
  }
  for (const item of items) item.laneSpan = Math.max(item.laneSpan, laneCount - item.lane)
  return { items, laneCount }
}

export const timelineWithLoopSectionPreview = (timeline: AnimationTimeline, preview: AnimationLoopSectionResizePreview | null): AnimationTimeline => {
  if (!preview) return timeline
  const startFrame = timeline.frames[preview.startIndex]
  const endFrame = timeline.frames[preview.endIndex]
  if (!startFrame || !endFrame) return timeline
  return {
    ...timeline,
    loopSections: (timeline.loopSections ?? []).map((section) => section.id === preview.sectionId
      ? { ...section, startFrameId: startFrame.id, endFrameId: endFrame.id }
      : section)
  }
}
