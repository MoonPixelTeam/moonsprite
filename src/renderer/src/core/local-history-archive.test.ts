import { expect, it } from 'vitest'
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'
import { createDocument } from './document'
import { encodeProject } from './project-format'
import { compileLocalHistoryDelta, cloneHistoryDocument, hydrateLocalHistoryDelta } from './local-history-delta'
import { decodeHistoryDelta, encodeHistoryDelta, packLocalHistory } from './local-history-archive'

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
  expect(unzipSync(cached.archive)['snapshots/0.moonsprite']).toEqual(request.snapshots[0])
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
