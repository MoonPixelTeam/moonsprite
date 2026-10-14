import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ensureAnimationDocument } from '@/core/animation'
import * as animation from '@/core/animation'
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
  it('plays a short section in a 240-frame timeline without normalizing on reads or ticks', () => {
    const document = createDocument('large timeline playback', 1, 1, 'rgba')
    const timeline = ensureAnimationDocument(document)
    const layer = document.layers[0]
    timeline.frames = Array.from({ length: 240 }, (_, i) => ({ id: `f${i}`, duration: 100 }))
    timeline.activeFrameId = 'f120'
    timeline.cels = timeline.frames.map((frame, i) => ({
      id: `c${i}`, layerId: layer.id, frameId: frame.id,
      surface: { format: 'rgba' as const, width: 1, height: 1, offsetX: 0, offsetY: 0,
        pixels: new Uint8ClampedArray([i, 0, 0, 255]) }
    }))
    timeline.cels[121].linkedCelId = 'c120'
    timeline.loopSections = [{ id: 'short', name: 'Short', startFrameId: 'f120', endFrameId: 'f122', direction: 'forward', repeatCount: null }]
    animation.refreshActiveAnimationFrame(document)
    useWorkspace.getState().addSession(document)
    useWorkspace.getState().playAnimationLoopSection('short')
    const session = useWorkspace.getState().sessions[0]
    const history = session.history.position
    const cels = timeline.cels
    const normalize = vi.spyOn(animation, 'ensureAnimationDocument')
    let now = 0
    vi.spyOn(performance, 'now').mockImplementation(() => now)
    render(<PlaybackClock documentId={document.id} />)
    act(() => useWorkspace.setState({ message: 'unrelated UI update' }))
    for (const zoom of [2, 4, 8, 1]) act(() => useWorkspace.getState().setView({ zoom }))
    for (const index of [121, 122, 120, 121, 122, 120]) {
      now += 100
      act(() => { vi.advanceTimersByTime(100) })
      act(() => { vi.advanceTimersToNextFrame() })
      expect(timeline.activeFrameId).toBe(`f${index}`)
      expect(layer.pixels[0]).toBe(index === 121 ? 120 : index)
      expect(timeline.cels).toBe(cels)
    }
    expect(normalize).not.toHaveBeenCalled()
    expect(session.history.position).toBe(history)
    expect(session.animationPlaying).toBe(true)
    expect(session.contentInvalidation?.kind).toBe('full')
    act(() => useWorkspace.getState().setAnimationPlaying(false))
    normalize.mockClear()
    const stoppedCels = timeline.cels
    for (const zoom of [2, 4, 8, 1]) act(() => useWorkspace.getState().setView({ zoom }))
    expect(normalize).not.toHaveBeenCalled()
    expect(timeline.cels).toBe(stoppedCels)
  })

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
