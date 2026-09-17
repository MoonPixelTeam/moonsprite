import { expect, it, vi } from 'vitest'
import type { MoonSpriteApi } from '@shared/types-platform'
import { createDocument } from '@/core/document'
import { encodePng } from '@/core/png-encode'
import { encodeProject, decodeProject } from '@/core/project-format'
import { unzipSync, strFromU8, strToU8, zipSync } from 'fflate'
import { persistTimelapseFrames, portableTimelapseDocument } from './timelapse-library-service'
import { RecoveryService } from './recovery-service'
import { readTimelapseFrame } from '@/platform/timelapse-library'

function fixture(count = 2) {
  const document = createDocument('local recording', 8, 8, 'rgba', true)
  const bytes = encodePng(new Uint8ClampedArray([220, 10, 20, 255]), 1, 1).bytes
  document.timelapse!.snapshots = Array.from({ length: count }, (_, i) => ({ id: `frame-${i}`, capturedAt: i, elapsedMs: 1, width: 1, height: 1, data: bytes.slice() }))
  const frames = new Map<number, Uint8Array>()
  const append = vi.fn(async (store: string, data: Uint8Array) => {
    const offset = frames.size * 1000
    frames.set(offset, data.slice())
    return { store, chunk: 'chunk-1', offset, length: data.length, checksum: 123 }
  })
  const bridge = { appendTimelapseFrame: append, readTimelapseFrame: async (r: { offset: number }) => {
    const data = frames.get(r.offset)
    if (!data) throw new Error('Recording unavailable')
    return data
  } } as unknown as MoonSpriteApi
  return { document, bytes, bridge, append }
}

it('writes each historical frame once, releases bytes, and saves only references through repeated recovery', async () => {
  const f = fixture(4718)
  let archive: Uint8Array = new Uint8Array()
  f.bridge.writeRecovery = async (_id, _name, data) => { archive = data }
  const service = new RecoveryService()
  const targets = [{ id: f.document.id, document: f.document }]
  await service.autosave(f.bridge, targets)
  await service.autosave(f.bridge, targets)
  expect(f.append).toHaveBeenCalledTimes(4718)
  expect(f.document.timelapse!.snapshots.every(frame => frame.data.byteLength === 0)).toBe(true)
  expect(Object.keys(unzipSync(archive)).some(path => path.startsWith('timelapse/'))).toBe(false)
  const reopened = decodeProject(archive)
  expect(reopened.timelapse!.snapshots).toHaveLength(4718)
  expect(await readTimelapseFrame(reopened.timelapse!.snapshots[0], f.bridge)).toEqual(f.bytes)
})

it('coalesces overlapping capture and save writes of the same frame', async () => {
  const f = fixture(2)
  await Promise.all([persistTimelapseFrames(f.document, f.bridge), persistTimelapseFrames(f.document, f.bridge)])
  expect(f.append).toHaveBeenCalledTimes(2)
  expect(f.document.timelapse!.snapshots.every(frame => frame.data.byteLength === 0)).toBe(true)
})

it('does not release bytes or publish a recovery reference when frame persistence fails', async () => {
  const f = fixture(1)
  f.append.mockRejectedValueOnce(new Error('Disk full'))
  const write = vi.fn()
  f.bridge.writeRecovery = write
  await expect(new RecoveryService().autosave(f.bridge, [{ id: f.document.id, document: f.document }])).rejects.toThrow()
  expect(write).not.toHaveBeenCalled()
  expect(f.document.timelapse!.snapshots[0].data).toEqual(f.bytes)
  expect(f.document.timelapse!.snapshots[0].local).toBeUndefined()
  await persistTimelapseFrames(f.document, f.bridge)
  expect(f.document.timelapse!.snapshots[0].local).toBeDefined()
})

it('migrates embedded recordings, supports portable archives, and leaves live references intact', async () => {
  const f = fixture()
  const legacy = unzipSync(encodeProject(f.document))
  const manifest = JSON.parse(strFromU8(legacy['manifest.json']))
  manifest.schemaVersion = manifest.document.schemaVersion = 19
  legacy['manifest.json'] = strToU8(JSON.stringify(manifest))
  const reopened = decodeProject(zipSync(legacy))
  await persistTimelapseFrames(reopened, f.bridge)
  const portable = await portableTimelapseDocument(reopened, f.bridge)
  const archive = encodeProject(portable)
  expect(Object.keys(unzipSync(archive)).filter(path => path.startsWith('timelapse/'))).toHaveLength(2)
  expect(decodeProject(archive).timelapse!.snapshots[0].data).toEqual(f.bytes)
  expect(reopened.timelapse!.snapshots[0].data.byteLength).toBe(0)
})

it('forks new recording writes for document copies without overwriting shared frames', async () => {
  const f = fixture(1)
  await persistTimelapseFrames(f.document, f.bridge)
  const copy = decodeProject(encodeProject(f.document))
  copy.timelapse!.snapshots.push({ id: 'copy-new', capturedAt: 5, elapsedMs: 1, width: 1, height: 1, data: f.bytes })
  await persistTimelapseFrames(copy, f.bridge)
  expect(copy.timelapse!.snapshots[0].local).toEqual(f.document.timelapse!.snapshots[0].local)
  expect(copy.timelapse!.snapshots[1].local!.store).not.toBe(f.document.timelapse!.snapshots[0].local!.store)
})

it('opens artwork with an unavailable local recording but fails preview/export explicitly', async () => {
  const f = fixture(1)
  await persistTimelapseFrames(f.document, f.bridge)
  const opened = decodeProject(encodeProject(f.document))
  expect(opened.width).toBe(8)
  await expect(readTimelapseFrame(opened.timelapse!.snapshots[0], {} as MoonSpriteApi)).rejects.toThrow()
  await expect(portableTimelapseDocument(opened, {} as MoonSpriteApi)).rejects.toThrow()
})
