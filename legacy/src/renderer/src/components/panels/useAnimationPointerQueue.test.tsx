import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { useAnimationPointerQueue } from './useAnimationPointerQueue'

afterEach(() => { cleanup(); vi.restoreAllMocks() })

function setup() {
  let nextId = 0
  const callbacks = new Map<number, FrameRequestCallback>()
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => {
    callbacks.set(++nextId, callback)
    return nextId
  })
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(id => { callbacks.delete(id) })
  const move = vi.fn()
  const hook = renderHook(useAnimationPointerQueue, { initialProps: move })
  const tick = () => act(() => {
    for (const [id, callback] of [...callbacks]) if (callbacks.delete(id)) callback(16)
  })
  return { ...hook, callbacks, move, tick }
}

it('processes only the latest of 200 pointer positions before each paint', () => {
  const { result, move, tick, callbacks } = setup()
  const pointers = Array.from({ length: 200 }, (_, clientX) => ({ clientX }) as PointerEvent)
  act(() => { for (const event of pointers) result.current.schedule(event) })
  expect(move).not.toHaveBeenCalled()
  expect(callbacks.size).toBe(1)
  tick()
  expect(move).toHaveBeenCalledExactlyOnceWith(pointers[199])
  const next = { clientX: 300 } as PointerEvent
  act(() => result.current.schedule(next))
  tick()
  expect(move).toHaveBeenCalledTimes(2)
  expect(move).toHaveBeenLastCalledWith(next)
})

it('returns the final position on release and cancels the queued callback', () => {
  const { result, move, tick, callbacks } = setup()
  const last = { clientX: 200 } as PointerEvent
  result.current.schedule({ clientX: 10 } as PointerEvent)
  result.current.schedule(last)
  expect(result.current.take()).toBe(last)
  expect(callbacks.size).toBe(0)
  tick()
  expect(move).not.toHaveBeenCalled()
  expect(result.current.take()).toBeNull()
})

it('uses the current gesture callback after a render', () => {
  const { result, move, rerender, tick } = setup()
  const event = { clientX: 50 } as PointerEvent
  result.current.schedule(event)
  const latestMove = vi.fn()
  rerender(latestMove)
  tick()
  expect(move).not.toHaveBeenCalled()
  expect(latestMove).toHaveBeenCalledExactlyOnceWith(event)
})
