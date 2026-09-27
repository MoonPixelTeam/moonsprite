import { afterEach, expect, it, vi } from 'vitest'
import { acceptsExtensionFileDrop, clearExtensionFileDrop, routeExtensionFileDrops, setExtensionFileDrop } from './extension-file-drop'
import { extensionRuntimeAllows, registerExtensionRuntime } from './extension-runtime'
import { normalizeDroppedDocumentPaths } from './document-drop'

afterEach(() => clearExtensionFileDrop('test'))
it('routes only registered dropped files and retains normal document paths', async () => {
  const receive = vi.fn(), read = vi.fn(async () => new Uint8Array([1, 2])), report = vi.fn()
  const stop = registerExtensionRuntime('test', receive)
  try {
    setExtensionFileDrop('test', ['.custom'])
    const paths = normalizeDroppedDocumentPaths(['C:/pet.CUSTOM', 'C:/art.png', 'C:/secret.txt'], acceptsExtensionFileDrop)
    expect(await routeExtensionFileDrops(paths, read, report)).toEqual(['C:/art.png'])
    expect(read).toHaveBeenCalledExactlyOnceWith('C:/pet.CUSTOM')
    expect(receive).toHaveBeenCalledExactlyOnceWith({ type: 'files-dropped', files: [{ name: 'pet.CUSTOM', bytes: [1, 2] }] })
    expect(report).not.toHaveBeenCalled()
    clearExtensionFileDrop('test')
    expect(acceptsExtensionFileDrop('C:/pet.custom')).toBe(false)
  } finally { stop() }
})
it('requires io permission and rejects invalid registration', () => {
  expect(extensionRuntimeAllows(['runtime'], 'runtime.setFileDropTypes')).toBe(false)
  expect(extensionRuntimeAllows(['io'], 'runtime.setFileDropTypes')).toBe(true)
  expect(() => setExtensionFileDrop('test', ['*'])).toThrow()
})
it('reports failed or oversized reads without opening them as documents', async () => {
  setExtensionFileDrop('test', ['.custom'])
  for (const read of [async () => { throw new Error('read failed') }, async () => new Uint8Array(12 * 1024 * 1024 + 1)]) {
    const report = vi.fn()
    expect(await routeExtensionFileDrops(['C:/pet.custom'], read, report)).toEqual([])
    expect(report).toHaveBeenCalledOnce()
  }
})
it('does not deliver a pending read after extension removal', async () => {
  const receive = vi.fn(), stop = registerExtensionRuntime('test', receive)
  try {
    setExtensionFileDrop('test', ['.custom'])
    const report = vi.fn()
    await routeExtensionFileDrops(['C:/pet.custom'], async () => { clearExtensionFileDrop('test'); return new Uint8Array([1]) }, report)
    expect(receive).not.toHaveBeenCalled()
    expect(report).toHaveBeenCalledOnce()
  } finally { stop() }
})
