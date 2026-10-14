import type { SpriteDocument } from '@shared/types-document'
import { animationLoopFrameIdsForExport, resolveAnimationLoopSectionRange } from './animation-loop-sections'
import { gifFrameSequence, type GifDirection } from './gif'

interface FrameRangeOptions {
  gifFrameRange?: 'all' | 'range' | 'loop-section'
  gifFrameStart?: number
  gifFrameEnd?: number
  gifLoopSectionId?: string
  gifDirection?: GifDirection
}

/** Shared by destination planning and worker encoding so numbered files stay aligned. */
export function exportFrameIds(document: SpriteDocument, options: FrameRangeOptions): Array<string | null> {
  const timeline = document.animation
  if (!timeline?.frames.length) return [null]
  if (options.gifFrameRange === 'loop-section') {
    const section = timeline.loopSections?.find(item => item.id === options.gifLoopSectionId)
    const range = section && resolveAnimationLoopSectionRange(timeline, section)
    if (range) return gifFrameSequence(animationLoopFrameIdsForExport(timeline, range.startIndex, range.endIndex, section.id), options.gifDirection ?? 'forward')
  }
  const clamp = (value: number | undefined, fallback: number) => Math.max(0, Math.min(timeline.frames.length - 1, Math.round(Number.isFinite(value) ? value! : fallback) - 1))
  const start = options.gifFrameRange === 'range' ? clamp(options.gifFrameStart, 1) : 0
  const end = options.gifFrameRange === 'range' ? Math.max(start, clamp(options.gifFrameEnd, timeline.frames.length)) : timeline.frames.length - 1
  return gifFrameSequence(timeline.frames.slice(start, end + 1).map(frame => frame.id), options.gifDirection ?? 'forward')
}
