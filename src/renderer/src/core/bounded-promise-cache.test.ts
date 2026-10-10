import { expect, it, vi } from 'vitest'
import { BoundedPromiseCache } from './bounded-promise-cache'

it('bounds retained promises and refreshes recent entries', async () => {
  const cache = new BoundedPromiseCache<string, string>(64)
  const first = cache.getOrCreate('0', () => Promise.resolve('0'))
  for (let index = 1; index < 64; index++) cache.getOrCreate(String(index), () => Promise.resolve(String(index)))
  expect(cache.getOrCreate('0', () => Promise.resolve('wrong'))).toBe(first)
  for (let index = 64; index < 1000; index++) cache.getOrCreate(String(index), () => Promise.resolve(String(index)))
  expect(cache.size).toBe(64)
  await expect(first).resolves.toBe('0')
  const load = vi.fn(() => Promise.resolve('reloaded'))
  await expect(cache.getOrCreate('1', load)).resolves.toBe('reloaded')
  expect(load).toHaveBeenCalledOnce()
})

it('lets evicted in-flight requests complete and retries rejected requests', async () => {
  const cache = new BoundedPromiseCache<string, string>(1)
  let resolve!: (value: string) => void
  const pending = cache.getOrCreate('old', () => new Promise<string>(done => { resolve = done }))
  cache.getOrCreate('new', () => Promise.resolve('new'))
  resolve('old')
  await expect(pending).resolves.toBe('old')
  await expect(cache.getOrCreate('failed', () => Promise.reject(new Error('asset failed')))).rejects.toThrow('asset failed')
  await expect(cache.getOrCreate('failed', () => Promise.resolve('retry'))).resolves.toBe('retry')
})
