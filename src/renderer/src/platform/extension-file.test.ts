import { setRuntimeAppLocale } from '@/core/localization'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { saveExtensionFile } from './extension-file'

const mock = vi.hoisted(() => ({ invoke: vi.fn(), write: vi.fn() }))
vi.mock('@tauri-apps/api/core', () => ({ invoke: mock.invoke }))
beforeEach(() => {
  vi.resetAllMocks()
  setRuntimeAppLocale('zh-CN')
  window.moonSprite = { writeBinaryAtomic: mock.write } as unknown as typeof window.moonSprite
})
it('writes only to the path selected by the user', async () => {
  mock.invoke.mockResolvedValue({ canceled: false, filePath: 'D:/pets/cat.mspet' })
  expect(await saveExtensionFile({ name: 'cat.mspet', bytes: [0, 255, 42] })).toBe(true)
  expect(mock.invoke).toHaveBeenCalledWith('save_extension_data_file', { fileName: 'cat.mspet', language: 'zh-CN' })
  expect(mock.write).toHaveBeenCalledWith('D:/pets/cat.mspet', new Uint8Array([0, 255, 42]))
})
it('cancellation does not write and save errors propagate', async () => {
  mock.invoke.mockResolvedValue({ canceled: true })
  expect(await saveExtensionFile({ name: 'cat.mspet', bytes: [1] })).toBe(false)
  expect(mock.write).not.toHaveBeenCalled()
  mock.invoke.mockResolvedValue({ canceled: false, filePath: 'cat.mspet' })
  mock.write.mockRejectedValue(new Error('disk full'))
  await expect(saveExtensionFile({ name: 'cat.mspet', bytes: [1] })).rejects.toThrow('disk full')
})
it('rejects invalid paths and bytes before opening the dialog', async () => {
  for (const file of [{ name: '../cat.mspet', bytes: [1] }, { name: 'cat.mspet', bytes: [256] }, { name: 'cat.mspet', bytes: new Array(12 * 1024 * 1024 + 1).fill(1) }]) {
    await expect(saveExtensionFile(file)).rejects.toThrow('导出文件无效')
  }
  expect(mock.invoke).not.toHaveBeenCalled()
})

afterEach(() => setRuntimeAppLocale(null))
it('uses the selected language for native dialogs and validation errors', async () => {
  setRuntimeAppLocale('de-DE')
  mock.invoke.mockResolvedValue({ canceled: true })
  await saveExtensionFile({ name: 'cat.mspet', bytes: [1] })
  expect(mock.invoke).toHaveBeenCalledWith('save_extension_data_file', { fileName: 'cat.mspet', language: 'de-DE' })
  await expect(saveExtensionFile({ name: '../cat.mspet', bytes: [1] })).rejects.toThrow('Die Exportdatei ist ungültig')
})

it('exports pet assets above the former 1 MiB limit', async () => {
  mock.invoke.mockResolvedValue({ canceled: false, filePath: 'cat.mspet' })
  const bytes = new Array(2 * 1024 * 1024).fill(1)
  expect(await saveExtensionFile({ name: 'cat.mspet', bytes })).toBe(true)
  expect(mock.write.mock.calls[0][1].length).toBe(bytes.length)
})
