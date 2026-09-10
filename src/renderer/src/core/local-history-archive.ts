import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from 'fflate'
import type { SpriteDocument } from '@shared/types'
import { decodeProject } from './project-format'
import { compileLocalHistoryDelta, prepareHistoryDocument, type LocalHistoryDelta } from './local-history-delta'

export interface ArchivedHistorySnapshot { archive: Uint8Array }
export type LocalHistorySnapshot = SpriteDocument | ArchivedHistorySnapshot
export interface LocalHistoryManifest {
  version: number
  projectKey: string
  labels: string[]
  position: number
  deltaVersion?: number
  deltas?: boolean[]
}
export interface LocalHistoryPackRequest {
  manifest: LocalHistoryManifest
  snapshots: Uint8Array[]
  cachedDeltas: Array<Uint8Array | null | undefined>
}
export interface LocalHistoryPackResult {
  archive: Uint8Array
  deltas: Array<Uint8Array | null>
  decodedSnapshots: number
  compiledDeltas: number
}

export function encodeHistoryDelta(delta: LocalHistoryDelta): Uint8Array {
  const files: Zippable = {}
  let index = 0
  const encodeValue = (value: unknown): unknown => {
    if (!ArrayBuffer.isView(value)) return value
    const file = `buffers/${index++}`
    files[file] = new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
    return { bufferFile: file, type: Object.prototype.toString.call(value).slice(8, -1) }
  }
  files['delta.json'] = strToU8(JSON.stringify({ ...delta, patches: delta.patches.map(patch => ({ ...patch, before: encodeValue(patch.before), after: encodeValue(patch.after) })) }))
  return zipSync(files, { level: 6 })
}

export function decodeHistoryDelta(archive: Uint8Array): LocalHistoryDelta {
  const files = unzipSync(archive)
  const delta = JSON.parse(strFromU8(files['delta.json'])) as LocalHistoryDelta
  const constructors = { Uint8Array, Uint8ClampedArray, Uint16Array, Uint32Array, Int8Array, Int16Array, Int32Array, Float32Array, Float64Array }
  const decodeValue = (value: unknown): unknown => {
    if (!value || typeof value !== 'object') return value
    const descriptor = value as { bufferFile: string; type: keyof typeof constructors }
    if (!Object.hasOwn(constructors, descriptor.type) || !files[descriptor.bufferFile]) throw new Error('无效的历史差分数据')
    const bytes = files[descriptor.bufferFile].slice()
    return new constructors[descriptor.type](bytes.buffer)
  }
  const validPath = (path: unknown): path is string[] => Array.isArray(path) && path.length > 0 && path.every(key => typeof key === 'string' && !['__proto__', 'constructor', 'prototype'].includes(key))
  if (!Array.isArray(delta.patches) || !Array.isArray(delta.affectedLayerIds) || !Number.isFinite(delta.bytes) || delta.bytes < 0 || !delta.invalidation || !['full', 'region'].includes(delta.invalidation.kind)) throw new Error('无效的历史差分索引')
  for (const side of ['before', 'after'] as const) {
    if (!Array.isArray(delta.origins?.[side]) || delta.origins[side].some(origin => !Number.isFinite(origin.x) || !Number.isFinite(origin.y))) throw new Error('无效的历史差分坐标')
  }
  for (const patch of delta.patches) {
    if (!validPath(patch.path) || (patch.aliases && (!Array.isArray(patch.aliases) || !patch.aliases.every(validPath))) || (patch.offset !== undefined && (!Number.isSafeInteger(patch.offset) || patch.offset < 0))) throw new Error('无效的历史差分路径')
    patch.before = decodeValue(patch.before); patch.after = decodeValue(patch.after)
    if (patch.offset !== undefined && (!(patch.before instanceof Uint8Array) || !(patch.after instanceof Uint8Array) || patch.before.byteLength !== patch.after.byteLength)) throw new Error('无效的历史差分像素')
  }
  return delta
}

/** Worker-owned migration/packing. Already prepared transitions need no decoding. */
export function packLocalHistory(request: LocalHistoryPackRequest): LocalHistoryPackResult {
  const { manifest, snapshots, cachedDeltas } = request
  if (snapshots.length !== manifest.labels.length + 1) throw new Error('本地历史数据不完整')
  let decodedSnapshots = 0, compiledDeltas = 0
  let previous: { index: number; document: SpriteDocument } | null = null
  const decode = (index: number): SpriteDocument => {
    if (previous?.index === index) return previous.document
    decodedSnapshots++
    return prepareHistoryDocument(decodeProject(snapshots[index]))
  }
  const deltas = manifest.labels.map((label, index) => {
    if (cachedDeltas[index] !== undefined) return cachedDeltas[index]!
    const before = decode(index), after = decode(index + 1)
    previous = { index: index + 1, document: after }
    compiledDeltas++
    const delta = compileLocalHistoryDelta(before, after, label)
    return delta ? encodeHistoryDelta(delta) : null
  })
  const files: Zippable = { 'manifest.json': strToU8(JSON.stringify({ ...manifest, deltaVersion: 1, deltas: deltas.map(delta => delta !== null) })) }
  snapshots.forEach((snapshot, index) => { files[`snapshots/${index}.moonsprite`] = snapshot })
  deltas.forEach((delta, index) => { if (delta) files[`deltas/${index}.zip`] = delta })
  return { archive: zipSync(files, { level: 0 }), deltas, decodedSnapshots, compiledDeltas }
}
