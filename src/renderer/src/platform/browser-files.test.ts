import { getBrowserRecoveryStatus } from './browser-recovery-status'
import 'fake-indexeddb/auto'
import { Blob, File } from 'node:buffer'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { browserStorage, createBrowserFiles } from './browser-files'
import { createDocument } from '@/core/document'
import { encodeProject, decodeProject } from '@/core/project-format'

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe('Web trial file boundary', () => {
  it('imports same-name files without collisions and reads their actual bytes', async () => {
    const api = createBrowserFiles()
    const first = new File([new Uint8Array([1, 2])], 'sprite.png') as unknown as globalThis.File
    const second = new File([new Uint8Array([3])], 'sprite.png') as unknown as globalThis.File
    const path = api.pathForFile(first)
    expect(api.pathForFile(first)).toBe(path)
    expect(api.pathForFile(second)).not.toBe(path)
    expect(await api.readBinary(path)).toEqual(new Uint8Array([1, 2]))
    await expect(api.readBinary('missing')).rejects.toThrow('重新导入')
  })

  it('downloads complete bytes on every save and updates the read baseline', async () => {
    vi.stubGlobal('Blob', Blob)
    const blobs: Blob[] = []
    vi.stubGlobal('URL', { createObjectURL: (blob: Blob) => { blobs.push(blob); return 'blob:test' }, revokeObjectURL: vi.fn() })
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    const api = createBrowserFiles()
    const result = await api.saveProject('C:\\art\\test.moonsprite')
    await api.writeBinaryAtomic(result.filePath, new Uint8Array([1, 2, 3]))
    await api.writeBinaryAtomic(result.filePath, new Uint8Array([4, 5]))
    expect(click).toHaveBeenCalledTimes(2)
    expect(new Uint8Array(await blobs[0].arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]))
    expect(await api.readBinary(result.filePath)).toEqual(new Uint8Array([4, 5]))
    await expect(api.exportImage('old.moonsprite', 'png')).rejects.toThrow('仅支持保存')
    await expect(api.writeBinaryAtomic('downloads/test.png', new Uint8Array([1]))).rejects.toThrow('仅支持保存')
    expect(click).toHaveBeenCalledTimes(2)
  })

  it('persists recovery and local history across adapter recreation', async () => {
    const first = createBrowserFiles()
    const bytes = encodeProject(createDocument('Artwork', 16, 24, 'rgba'))
    await first.writeRecovery('project', 'Artwork', bytes)
    await first.writeLocalHistory('project', bytes)
    const reopened = createBrowserFiles()
    const recovered = await reopened.readRecovery('project')
    expect(Array.from(recovered)).toEqual(Array.from(bytes))
    expect(decodeProject(recovered)).toMatchObject({ name: 'Artwork', width: 16, height: 24 })
    expect(Array.from(await reopened.readLocalHistory('project'))).toEqual(Array.from(bytes))
    expect(await reopened.listRecoveries(30)).toEqual([expect.objectContaining({ id: 'project', name: 'Artwork' })])
    await reopened.deleteRecovery('project')
    await reopened.deleteLocalHistory('project')
    await expect(first.readRecovery('project')).rejects.toThrow('not found')
  })

  it('surfaces failed storage transactions', async () => {
    await expect(browserStorage((store) => {
      const request = store.put('data', 'aborted')
      store.transaction.abort()
      return request
    })).rejects.toBeTruthy()
  })

  it('settles a canceled file picker and removes its input', async () => {
    vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(function (this: HTMLInputElement) { this.dispatchEvent(new Event('cancel')) })
    expect(await createBrowserFiles().openFiles()).toEqual({ canceled: true, filePaths: [] })
    expect(document.querySelector('input[type=file]')).toBeNull()
  })
})


it('reports successful recovery writes and surfaces quota failures without claiming a new backup', async () => {
  const api = createBrowserFiles()
  await api.writeRecovery('status-check', 'Artwork', new Uint8Array([1]))
  const previous = getBrowserRecoveryStatus().updatedAt
  expect(previous).toBeTruthy()
  vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementationOnce(() => { throw new DOMException('Full', 'QuotaExceededError') })
  await expect(api.writeRecovery('status-check', 'Artwork', new Uint8Array([2]))).rejects.toThrow('Full')
  expect(getBrowserRecoveryStatus()).toMatchObject({ updatedAt: previous, error: expect.stringContaining('写入失败') })
})
