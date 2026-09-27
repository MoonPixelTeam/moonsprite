import 'fake-indexeddb/auto'
import { expect, it } from 'vitest'
import { extensionAssets } from './extension-assets'

it('persists assets larger than configuration quota across clients and isolates extensions', async () => {
  const value = 'x'.repeat(400000)
  await extensionAssets('pet').set('sprite', value)
  expect(await extensionAssets('pet').get('sprite')).toBe(value)
  expect(await extensionAssets('other').get('sprite')).toBeNull()
  await expect(extensionAssets('pet').set('sprite', 'x'.repeat(8 * 1024 * 1024 + 1))).rejects.toThrow('8 MiB')
  expect(await extensionAssets('pet').get('sprite')).toBe(value)
  await extensionAssets('pet').remove('sprite')
  expect(await extensionAssets('pet').get('sprite')).toBeNull()
})
it('enforces aggregate quota atomically and allows replacement without double counting', async () => {
  const assets = extensionAssets('quota'), value = 'x'.repeat(8 * 1024 * 1024)
  await Promise.all(Array.from({ length: 8 }, (_, i) => assets.set(String(i), value)))
  await expect(assets.set('overflow', 'x')).rejects.toThrow('64 MiB')
  await assets.set('0', value)
  expect(await assets.get('overflow')).toBeNull()
  await assets.remove('0')
  await assets.set('overflow', 'ok')
  expect(await assets.get('overflow')).toBe('ok')
})
