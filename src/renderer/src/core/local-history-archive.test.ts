import { expect, it } from 'vitest'
import { strFromU8, strToU8, unzipSync, zipSync, Zip, ZipPassThrough } from 'fflate'
import { createDocument } from './document'
import { encodeProject } from './project-format'
import { compileLocalHistoryDelta, cloneHistoryDocument, hydrateLocalHistoryDelta } from './local-history-delta'
import { decodeHistoryDelta, encodeHistoryDelta, packLocalHistory, unpackLocalHistorySnapshots, type ArchivedHistorySnapshot } from './local-history-archive'

it.each(['rgba', 'indexed'] as const)('round-trips %s delta buffers without numeric JSON arrays or losing aliases', mode => {
  const before = createDocument('codec', 4, 4, mode), after = cloneHistoryDocument(before)
  after.layers[0].pixels[13] = 123
  const target = cloneHistoryDocument(after)
  const encoded = encodeHistoryDelta(compileLocalHistoryDelta(before, after, 'paint')!)
  const delta = decodeHistoryDelta(encoded)
  const entry = hydrateLocalHistoryDelta(target, delta)
  entry.undo(); expect(target.layers[0].pixels[13]).toBe(0)
  entry.redo(); expect(target.layers[0].pixels[13]).toBe(123)
  expect(target.animation!.cels[0].surface!.pixels).toBe(target.layers[0].pixels)
})

it('packs cached transitions without decoding or scanning the old snapshots again', () => {
  const before = createDocument('cache', 4, 4, 'rgba'), after = cloneHistoryDocument(before)
  after.name = 'changed'
  const request = { manifest: { version: 2, projectKey: 'project-test', labels: ['rename'], position: 1 }, snapshots: [encodeProject(before), encodeProject(after)], cachedDeltas: [] }
  const initial = packLocalHistory(request)
  expect(initial.decodedSnapshots).toBe(2)
  expect(initial.compiledDeltas).toBe(1)
  const cached = packLocalHistory({ ...request, cachedDeltas: initial.deltas })
  expect(cached.decodedSnapshots).toBe(0)
  expect(cached.compiledDeltas).toBe(0)
  const files = unzipSync(cached.archive)
  const restored = unpackLocalHistorySnapshots(files, JSON.parse(strFromU8(files['manifest.json']))) as ArchivedHistorySnapshot[]
  expect(restored[0].archive).toEqual(request.snapshots[0])
})

it.each([false, true])('shares shifted ZIP records (streaming=%s) and preserves every original byte', streaming => {
  const recording = Uint8Array.from({ length: 32768 }, (_, index) => index % 251)
  const encode = (files: Record<string, Uint8Array>): Uint8Array => {
    if (!streaming) return zipSync(files, { level: 0 })
    const chunks: Uint8Array[] = []
    const zip = new Zip((error, data) => { if (error) throw error; chunks.push(data) })
    for (const [name, bytes] of Object.entries(files)) {
      const file = new ZipPassThrough(name); zip.add(file); file.push(bytes, true)
    }
    zip.end()
    const result = new Uint8Array(chunks.reduce((sum, bytes) => sum + bytes.length, 0))
    let offset = 0
    for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length }
    return result
  }
  const snapshots = Array.from({ length: 8 }, (_, index) => encode({
    'layer.rgba': new Uint8Array(100 + index * 23).fill(index),
    'timelapse/frame.png': recording
  }))
  // Each save can carry a different ZIP timestamp even for unchanged PNGs.
  snapshots.forEach((snapshot, index) => { snapshot[10] = index })
  const packed = packLocalHistory({ manifest: { version: 2, projectKey: 'shared', labels: snapshots.slice(1).map(() => 'paint'), position: 5 }, snapshots, cachedDeltas: snapshots.slice(1).map(() => null) })
  expect(packed.archive.length).toBeLessThan(snapshots.reduce((sum, bytes) => sum + bytes.length, 0) / 4)
  const files = unzipSync(packed.archive)
  const manifest = JSON.parse(strFromU8(files['manifest.json']))
  const restored = unpackLocalHistorySnapshots(files, manifest) as ArchivedHistorySnapshot[]
  expect(manifest.version).toBe(3)
  expect(manifest.position).toBe(5)
  restored.forEach((snapshot, index) => expect(snapshot.archive).toEqual(snapshots[index]))
  expect(() => unpackLocalHistorySnapshots(files, { ...manifest, chunkLengths: [-1] })).toThrow()
  expect(() => unpackLocalHistorySnapshots(files, { ...manifest, snapshotChunks: snapshots.map(() => [999999]) })).toThrow()
})

it('preserves opaque records and never deduplicates different bytes on a hash collision', () => {
  const first = zipSync({ 'same': new Uint8Array([1, 2, 3]) }, { level: 0 })
  const second = first.slice()
  second[34] ^= 1 // Keep the header/CRC identical while changing a payload byte.
  const snapshots = [first, second, new Uint8Array([7, 8, 9])]
  const packed = packLocalHistory({ manifest: { version: 2, projectKey: 'opaque', labels: ['a', 'b'], position: 2 }, snapshots, cachedDeltas: [null, null] })
  const files = unzipSync(packed.archive)
  const restored = unpackLocalHistorySnapshots(files, JSON.parse(strFromU8(files['manifest.json']))) as ArchivedHistorySnapshot[]
  restored.forEach((snapshot, index) => expect(snapshot.archive).toEqual(snapshots[index]))
})

it('rejects cached paths that could modify object prototypes', () => {
  const before = createDocument('invalid', 4, 4, 'rgba'), after = cloneHistoryDocument(before)
  after.name = 'change'
  const files = unzipSync(encodeHistoryDelta(compileLocalHistoryDelta(before, after, 'rename')!))
  const delta = JSON.parse(strFromU8(files['delta.json']))
  delta.patches[0].path = ['__proto__', 'polluted']
  files['delta.json'] = strToU8(JSON.stringify(delta))
  expect(() => decodeHistoryDelta(zipSync(files))).toThrow('无效的历史差分路径')
  expect(({} as Record<string, unknown>).polluted).toBeUndefined()
})
