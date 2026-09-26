import { expect, it, vi } from 'vitest'
import { createCursorVisibilitySync } from './cursor-visibility-sync'

it('bounds pending work during sustained input and applies only the latest state after a stalled native call', async () => {
  let release!: () => void
  const apply = vi.fn((_visible: boolean) => new Promise<void>(resolve => { release = resolve }))
  const sync = createCursorVisibilitySync(apply)
  const pending = sync(false)
  await Promise.resolve()
  for (let i = 0; i < 10_000; i++) expect(sync(i % 2 === 0)).toBe(pending)
  expect(sync(true)).toBe(pending)
  expect(apply).toHaveBeenCalledTimes(1)
  release()
  await Promise.resolve()
  expect(apply.mock.calls.map(call => call[0])).toEqual([false, true])
  release()
  await pending
  for (let i = 0; i < 10_000; i++) await sync(true)
  expect(apply).toHaveBeenCalledTimes(2)
})

it('coalesces requests before dispatch and does not replay intermediate toggles', async () => {
  const apply = vi.fn(async (_visible: boolean) => {})
  const sync = createCursorVisibilitySync(apply)
  const pending = sync(false)
  sync(true)
  await pending
  expect(apply).toHaveBeenCalledExactlyOnceWith(true)
})

it('reports failure and permits a subsequent input request to retry without an automatic retry loop', async () => {
  const apply = vi.fn< (visible: boolean) => Promise<void> >()
    .mockRejectedValueOnce(new Error('Window unavailable')).mockResolvedValue(undefined)
  const sync = createCursorVisibilitySync(apply)
  await expect(sync(false)).rejects.toThrow('Window unavailable')
  expect(apply).toHaveBeenCalledTimes(1)
  await sync(false)
  expect(apply).toHaveBeenCalledTimes(2)
})
