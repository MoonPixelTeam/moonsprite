import { describe, expect, it } from 'vitest'
import { createOpenProgressController } from './open-progress'

describe('open progress lifecycle', () => {
  it('can be dismissed and reused for a later open', () => {
    const callbacks: FrameRequestCallback[] = []
    const progress = createOpenProgressController((callback) => {
      callbacks.push(callback)
      return callbacks.length
    })
    const finishFirst = progress.begin()
    callbacks.splice(0).forEach((callback) => callback(0))
    expect(progress.getSnapshot().phase).toBe('running')
    progress.dismiss()
    expect(progress.getSnapshot().phase).toBe('hidden')
    finishFirst()

    const finishSecond = progress.begin()
    callbacks.splice(0).forEach((callback) => callback(0))
    expect(progress.getSnapshot().phase).toBe('running')
    finishSecond()
    expect(progress.getSnapshot().phase).toBe('hidden')
  })
})
