import { expect, it, vi } from 'vitest'
import { createDocument } from '@/core/document'
import { encodePng } from '@/core/png-encode'
import type { MoonSpriteApi } from '@shared/types-platform'
import { saveDocumentFile } from './document-file-service'

function fixture() {
  const document = createDocument('save queue', 2, 2, 'rgba')
  document.filePath = 'D:/save-queue.moonsprite'
  let revision = 1
  let release!: () => void
  let entered!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  const writing = new Promise<void>(resolve => { entered = resolve })
  const write = vi.fn(async () => { if (write.mock.calls.length === 1) { entered(); await gate } })
  const api = {
    writeBinaryAtomic: write, writeProjectIncremental: write,
    saveProject: vi.fn(async () => ({ canceled: false, filePath: 'D:/save-copy.moonsprite' }))
  } as unknown as MoonSpriteApi
  const request = { api, documentId: document.id, getDocument: () => ({ document, revision }), saveAs: false, preferredImageFormat: null }
  return { document, request, write, writing, release, edit: () => { revision++ } }
}

it('coalesces queued saves of the same document generation into one write', async () => {
  const f = fixture()
  const first = saveDocumentFile(f.request)
  await f.writing
  const second = saveDocumentFile(f.request)
  const third = saveDocumentFile(f.request)
  f.release()
  const results = await Promise.all([first, second, third])
  expect(f.write).toHaveBeenCalledTimes(1)
  expect(results[1]).toBe(results[0])
  expect(results[2]).toBe(results[0])
})

it.each(['revision', 'recording', 'metadata'] as const)('saves again when %s changes while the prior write is pending', async change => {
  const f = fixture()
  const first = saveDocumentFile(f.request)
  await f.writing
  if (change === 'revision') f.edit()
  if (change === 'recording') f.document.timelapse!.snapshots = [...f.document.timelapse!.snapshots, {
    id: 'new-frame', capturedAt: 100, elapsedMs: 100, width: 1, height: 1,
    data: encodePng(new Uint8ClampedArray([255, 0, 0, 255]), 1, 1).bytes
  }]
  if (change === 'metadata') f.document.name = 'new metadata'
  const second = saveDocumentFile(f.request)
  f.release()
  const [, result] = await Promise.all([first, second])
  expect(f.write).toHaveBeenCalledTimes(2)
  expect(result?.revision).toBe(change === 'revision' ? 2 : 1)
})

it('keeps Save As separate from a pending ordinary save', async () => {
  const f = fixture()
  const first = saveDocumentFile(f.request)
  await f.writing
  const copy = saveDocumentFile({ ...f.request, saveAs: true })
  f.release()
  await first
  expect((await copy)?.filePath).toBe('D:/save-copy.moonsprite')
  expect(f.write).toHaveBeenCalledTimes(2)
})

it('retries after a failed pending write', async () => {
  const f = fixture()
  f.write.mockImplementationOnce(async () => { throw new Error('disk failure') })
  const first = saveDocumentFile(f.request)
  const rejected = expect(first).rejects.toThrow('disk failure')
  const retry = saveDocumentFile(f.request)
  f.release()
  await rejected
  expect(await retry).not.toBeNull()
  expect(f.write).toHaveBeenCalledTimes(2)
})
