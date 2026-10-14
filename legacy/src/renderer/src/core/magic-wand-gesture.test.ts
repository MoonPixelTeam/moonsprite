import { describe, expect, it, vi } from 'vitest'
import { MagicWandGesture } from './magic-wand-gesture'

describe('asynchronous magic wand gesture', () => {
  const setup = () => {
    const preview = vi.fn(), commit = vi.fn(), discard = vi.fn()
    return { preview, commit, discard, gesture: new MagicWandGesture<number>(preview, commit, discard) }
  }
  it('commits exactly once when released before the worker replies', () => {
    const { gesture, preview, commit } = setup()
    const reply = gesture.request()
    gesture.release()
    expect(commit).not.toHaveBeenCalled()
    reply(7)
    gesture.release()
    expect(preview).not.toHaveBeenCalled()
    expect(commit.mock.calls).toEqual([[7]])
  })
  it('waits for the last moved-to point even if an older preview is ready', () => {
    const { gesture, preview, commit, discard } = setup()
    gesture.request()(1)
    const stale = gesture.request()
    const latest = gesture.request()
    gesture.release()
    stale(2)
    expect(commit).not.toHaveBeenCalled()
    latest(3)
    expect(preview.mock.calls).toEqual([[1]])
    expect(discard.mock.calls).toEqual([[2]])
    expect(commit.mock.calls).toEqual([[3]])
  })
  it('cannot resurrect a cancelled selection or commit twice', () => {
    const { gesture, preview, commit, discard } = setup()
    const reply = gesture.request()
    gesture.cancel()
    gesture.release()
    reply(4)
    expect(preview).not.toHaveBeenCalled()
    expect(commit).not.toHaveBeenCalled()
    expect(discard).toHaveBeenCalledWith(4)
  })
})
