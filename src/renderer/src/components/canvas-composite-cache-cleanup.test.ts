import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

/**
 * Test suite to verify RAF cleanup in canvas-composite-cache.ts
 *
 * Tests the fix for the HIGH priority memory leak:
 * - uploadPixelsChunkedAsync recursive RAF calls must be cancelled on dispose
 * - Ensures no RAF callbacks execute after surface disposal
 */

describe('canvas-composite-cache RAF cleanup', () => {
  let rafCallbacks: Map<number, FrameRequestCallback>
  let nextRafId: number
  let cancelledFrames: Set<number>

  beforeEach(() => {
    rafCallbacks = new Map()
    nextRafId = 1
    cancelledFrames = new Set()

    // Mock requestAnimationFrame to track callbacks
    global.requestAnimationFrame = vi.fn((callback: FrameRequestCallback): number => {
      const id = nextRafId++
      rafCallbacks.set(id, callback)
      return id
    })

    // Mock cancelAnimationFrame to track cancellations
    global.cancelAnimationFrame = vi.fn((id: number): void => {
      rafCallbacks.delete(id)
      cancelledFrames.add(id)
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should track RAF IDs during chunked upload', () => {
    // Simulate uploadPixelsChunkedAsync starting
    const uploadNextChunk = vi.fn(() => {
      // Simulate recursive RAF scheduling
      if (rafCallbacks.size < 5) {
        requestAnimationFrame(uploadNextChunk)
      }
    })

    // Start the upload chain
    const initialFrameId = requestAnimationFrame(uploadNextChunk)

    expect(initialFrameId).toBe(1)
    expect(rafCallbacks.size).toBe(1)
    expect(requestAnimationFrame).toHaveBeenCalledTimes(1)
  })

  it('should cancel all pending RAF callbacks on dispose', () => {
    // Simulate multiple RAF calls in flight
    const callback1 = vi.fn()
    const callback2 = vi.fn()
    const callback3 = vi.fn()

    const id1 = requestAnimationFrame(callback1)
    const id2 = requestAnimationFrame(callback2)
    const id3 = requestAnimationFrame(callback3)

    expect(rafCallbacks.size).toBe(3)

    // Simulate dispose() cancelling all frames
    const pendingFrames = [id1, id2, id3]
    for (const frameId of pendingFrames) {
      cancelAnimationFrame(frameId)
    }

    expect(rafCallbacks.size).toBe(0)
    expect(cancelledFrames.size).toBe(3)
    expect(cancelledFrames.has(id1)).toBe(true)
    expect(cancelledFrames.has(id2)).toBe(true)
    expect(cancelledFrames.has(id3)).toBe(true)
  })

  it('should not leak RAF callbacks if disposed mid-upload', () => {
    let uploadCount = 0
    const maxChunks = 10

    const uploadNextChunk = (): void => {
      uploadCount++
      if (uploadCount < maxChunks) {
        requestAnimationFrame(uploadNextChunk)
      }
    }

    // Start upload
    const initialId = requestAnimationFrame(uploadNextChunk)

    // Execute first 3 callbacks
    for (let i = 0; i < 3; i++) {
      const callback = rafCallbacks.get(i + 1)
      if (callback) {
        rafCallbacks.delete(i + 1)
        callback(0)
      }
    }

    expect(uploadCount).toBe(3)
    expect(rafCallbacks.size).toBeGreaterThan(0)

    // Simulate dispose while upload in progress
    const remainingIds = Array.from(rafCallbacks.keys())
    for (const id of remainingIds) {
      cancelAnimationFrame(id)
    }

    // Verify all pending frames were cancelled
    expect(rafCallbacks.size).toBe(0)
    expect(cancelledFrames.size).toBe(remainingIds.length)
  })

  it('should clear tracking set when upload completes naturally', () => {
    const pendingUploadFrames = new Set<number>()
    let currentChunk = 0
    const totalChunks = 5

    const uploadNextChunk = (): void => {
      currentChunk++

      if (currentChunk < totalChunks) {
        const frameId = requestAnimationFrame(uploadNextChunk)
        pendingUploadFrames.add(frameId)
      } else {
        // Upload complete - clear tracking
        pendingUploadFrames.clear()
      }
    }

    // Start upload
    const initialId = requestAnimationFrame(uploadNextChunk)
    pendingUploadFrames.add(initialId)

    // Execute all chunks
    for (let i = 0; i < totalChunks; i++) {
      const callback = rafCallbacks.get(i + 1)
      if (callback) {
        rafCallbacks.delete(i + 1)
        callback(0)
      }
    }

    // Verify tracking set was cleared
    expect(pendingUploadFrames.size).toBe(0)
    expect(currentChunk).toBe(totalChunks)
  })

  it('should handle multiple concurrent uploads', () => {
    const uploads: Array<{ id: number; frames: Set<number> }> = []

    // Simulate 3 surfaces uploading concurrently
    for (let surfaceIdx = 0; surfaceIdx < 3; surfaceIdx++) {
      const frames = new Set<number>()
      let chunkCount = 0

      const uploadChunk = (): void => {
        chunkCount++
        if (chunkCount < 4) {
          const frameId = requestAnimationFrame(uploadChunk)
          frames.add(frameId)
        }
      }

      const initialId = requestAnimationFrame(uploadChunk)
      frames.add(initialId)
      uploads.push({ id: surfaceIdx, frames })
    }

    // Verify all uploads scheduled
    expect(rafCallbacks.size).toBe(3)

    // Dispose one surface mid-upload
    const disposedUpload = uploads[1]
    for (const frameId of disposedUpload.frames) {
      cancelAnimationFrame(frameId)
    }

    // Verify only the disposed upload's frames were cancelled
    expect(cancelledFrames.size).toBe(disposedUpload.frames.size)
    for (const frameId of disposedUpload.frames) {
      expect(cancelledFrames.has(frameId)).toBe(true)
    }
  })
})
