import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ensureAnimationDocument } from '@/core/animation'
import { createDocument } from '@/core/document'
import { useWorkspace } from '@/store/workspace'
import { useAnimationPlaybackClock } from './useAnimationPlaybackClock'

beforeEach(() => {
  vi.useFakeTimers()
  localStorage.clear()
  useWorkspace.setState({ sessions: [], activeId: null, message: null, dialog: null })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

const PlaybackClock = ({ documentId }: { documentId: string }) => {
  useAnimationPlaybackClock(documentId)
  return null
}

describe('useAnimationPlaybackClock', () => {
  it('does not accumulate a late timer callback into the next frame', () => {
    const document = createDocument('deadline playback', 1, 1, 'rgba')
    useWorkspace.getState().addSession(document)
    useWorkspace.getState().duplicateAnimationFrame()
    const timeline = ensureAnimationDocument(document)
    timeline.frames[0].duration = 100
    timeline.frames[1].duration = 100
    useWorkspace.getState().setActiveAnimationFrame(timeline.frames[0].id)
    useWorkspace.getState().setAnimationPlaybackMode('all')
    useWorkspace.getState().setAnimationPlaying(true)
    let now = 0
    vi.spyOn(performance, 'now').mockImplementation(() => now)
    render(<PlaybackClock documentId={document.id} />)

    act(() => {
      vi.advanceTimersByTime(100)
      now = 130
    })
    expect(timeline.activeFrameId).toBe(timeline.frames[0].id)
    act(() => { vi.advanceTimersToNextFrame() })
    expect(timeline.activeFrameId).toBe(timeline.frames[1].id)

    act(() => { vi.advanceTimersByTime(69) })
    expect(timeline.activeFrameId).toBe(timeline.frames[1].id)
    act(() => { vi.advanceTimersByTime(1) })
    expect(timeline.activeFrameId).toBe(timeline.frames[1].id)
    act(() => { vi.advanceTimersToNextFrame() })
    expect(timeline.activeFrameId).toBe(timeline.frames[0].id)
  })
})
