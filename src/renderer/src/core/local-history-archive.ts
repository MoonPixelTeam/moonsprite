import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from 'fflate'
import type { SpriteDocument } from '@shared/types-document'
import { decodeProject } from './project-format'
import { cloneHistoryDocument, hydrateLocalHistoryDelta, compileLocalHistoryDelta, prepareHistoryDocument, type LocalHistoryDelta } from './local-history-delta'

export interface ArchivedHistorySnapshot { archive: Uint8Array }
export interface IncrementalHistorySnapshot { base: LocalHistorySnapshot; delta: LocalHistoryDelta }
export type LocalHistorySnapshot = SpriteDocument | ArchivedHistorySnapshot | IncrementalHistorySnapshot
export function materializeLocalHistorySnapshot(snapshot: LocalHistorySnapshot): SpriteDocument {
  const changes: LocalHistoryDelta[] = []
  while ('base' in snapshot) { changes.push(snapshot.delta); snapshot = snapshot.base }
  const document = 'archive' in snapshot ? decodeProject(snapshot.archive) : cloneHistoryDocument(snapshot)
  for (let index = changes.length - 1; index >= 0; index--) hydrateLocalHistoryDelta(document, changes[index]).redo()
  return document
}
export interface LocalHistoryManifest {
  version: number
  projectKey: string
  labels: string[]
  position: number
  deltaVersion?: number
  deltas?: boolean[]
  snapshotChunks?: number[][]
  chunkLengths?: number[]
  snapshotDeltas?: boolean[]
}
export interface LocalHistoryPackRequest {
  manifest: LocalHistoryManifest
  snapshots: Uint8Array[]
  cachedDeltas: Array<Uint8Array | null | undefined>
  incrementalDeltas?: Array<LocalHistoryDelta | null>
}
export interface LocalHistoryPackResult {
  archive: Uint8Array
  deltas: Array<Uint8Array | null>
  decodedSnapshots: number
  compiledDeltas: number
}

// Split ZIP payloads from their headers: layer changes shift later offsets and
// each save changes ZIP timestamps, but the compressed PNG bytes stay identical.
// Unknown ZIP layouts remain opaque; concatenation always preserves every byte.
function snapshotParts(archive: Uint8Array): Array<{ bytes: Uint8Array; hash?: number }> {
  const view = new DataView(archive.buffer, archive.byteOffset, archive.byteLength)
  const opaque = (): Array<{ bytes: Uint8Array }> => archive.length ? [{ bytes: archive }] : []
  // Streaming ZIP writers leave sizes in trailing descriptors, not in local
  // headers. Use the central directory for boundaries in both writer modes.
  let end = archive.length - 22
  const earliest = Math.max(0, end - 0xffff)
  while (end >= earliest && (view.getUint32(end, true) !== 0x06054b50 || end + 22 + view.getUint16(end + 20, true) !== archive.length)) end--
  if (end < earliest) return opaque()
  const count = view.getUint16(end + 10, true), central = view.getUint32(end + 16, true)
  if (!count || count === 0xffff || central > end || view.getUint16(end + 4, true) || view.getUint16(end + 6, true)) return opaque()
  const offsets: number[] = []
  const payloads = new Map<number, { end: number; hash: number }>()
  let cursor = central
  for (let index = 0; index < count; index++) {
    if (cursor + 46 > end || view.getUint32(cursor, true) !== 0x02014b50) return opaque()
    const offset = view.getUint32(cursor + 42, true)
    if (offset + 30 > central || view.getUint32(offset, true) !== 0x04034b50) return opaque()
    const payload = offset + 30 + view.getUint16(offset + 26, true) + view.getUint16(offset + 28, true)
    const payloadEnd = payload + view.getUint32(cursor + 20, true)
    if (payload > central || payloadEnd > central) return opaque()
    offsets.push(offset, payload, payloadEnd)
    payloads.set(payload, { end: payloadEnd, hash: view.getUint32(cursor + 16, true) ^ (payloadEnd - payload) })
    cursor += 46 + view.getUint16(cursor + 28, true) + view.getUint16(cursor + 30, true) + view.getUint16(cursor + 32, true)
  }
  if (cursor > end) return opaque()
  const boundaries = [...new Set([0, ...offsets, central, archive.length])].sort((a, b) => a - b)
  return boundaries.slice(1).map((offset, index) => {
    const start = boundaries[index], payload = payloads.get(start)
    return { bytes: archive.subarray(start, offset), hash: payload?.end === offset ? payload.hash : undefined }
  })
}

function sharedSnapshotData(snapshots: Uint8Array[]): { data: Uint8Array; snapshotChunks: number[][]; chunkLengths: number[] } {
  const chunks: Uint8Array[] = []
  const buckets = new Map<number, number[]>()
  const snapshotChunks = snapshots.map(snapshot => snapshotParts(snapshot).map(({ bytes: part, hash: payloadHash }) => {
    const view = new DataView(part.buffer, part.byteOffset, part.byteLength)
    const localRecord = part.length >= 30 && view.getUint32(0, true) === 0x04034b50
    // A local header contains the payload CRC/size. Hash that small header and
    // name, then verify candidates below instead of hashing every PNG repeatedly.
    const hashLength = localRecord ? Math.min(part.length, 30 + view.getUint16(26, true) + view.getUint16(28, true)) : part.length
    // Reuse the ZIP payload checksum as a candidate key. Byte verification below
    // remains mandatory, including for corrupt archives and checksum collisions.
    let hash = payloadHash ?? (0x811c9dc5 ^ part.length)
    if (payloadHash === undefined) for (let index = 0; index < hashLength; index++) hash = Math.imul(hash ^ part[index], 0x01000193)
    const candidates = buckets.get(hash) ?? []
    // Hashes only narrow the search. Verify bytes so a collision cannot corrupt history.
    for (const id of candidates) {
      const existing = chunks[id]
      if (existing.length !== part.length) continue
      let index = 0
      while (index < part.length && existing[index] === part[index]) index++
      if (index === part.length) return id
    }
    const id = chunks.length
    chunks.push(part)
    candidates.push(id)
    buckets.set(hash, candidates)
    return id
  }))
  const chunkLengths = chunks.map(chunk => chunk.length)
  const data = new Uint8Array(chunkLengths.reduce((total, length) => total + length, 0))
  let offset = 0
  for (const chunk of chunks) { data.set(chunk, offset); offset += chunk.length }
  return { data, snapshotChunks, chunkLengths }
}

/** Both legacy full snapshots and shared records reconstruct the original ZIP bytes. */
export function unpackLocalHistorySnapshots(files: Record<string, Uint8Array>, manifest: LocalHistoryManifest): LocalHistorySnapshot[] {
  if (manifest.version === 2) return Array.from({ length: manifest.labels.length + 1 }, (_, index) => {
    const archive = files[`snapshots/${index}.moonsprite`]
    if (!archive) throw new Error('本地历史数据不完整')
    return { archive }
  })
  const data = files['snapshots.bin'], lengths = manifest.chunkLengths, indices = manifest.snapshotChunks
  if (![3, 4].includes(manifest.version) || !data || !Array.isArray(lengths) || !Array.isArray(indices) || indices.length !== manifest.labels.length + 1) throw new Error('本地历史共享数据不完整')
  let offset = 0
  const chunks = lengths.map(length => {
    if (!Number.isSafeInteger(length) || length <= 0 || length > data.length - offset) throw new Error('无效的本地历史数据块')
    const chunk = data.subarray(offset, offset + length)
    offset += length
    return chunk
  })
  if (offset !== data.length) throw new Error('无效的本地历史数据块')
  const archived = indices.map(ids => {
    if (!Array.isArray(ids) || !ids.length) throw new Error('无效的本地历史快照索引')
    let size = 0
    for (const id of ids) {
      if (!Number.isSafeInteger(id) || id < 0 || id >= chunks.length) throw new Error('无效的本地历史快照索引')
      size += chunks[id].length
      if (!Number.isSafeInteger(size) || size > 0x7fffffff) throw new Error('本地历史快照过大')
    }
    let archive: Uint8Array | undefined
    return { get archive() {
      if (!archive) {
        archive = new Uint8Array(size)
        let position = 0
        for (const id of ids) { archive.set(chunks[id], position); position += chunks[id].length }
      }
      return archive
    } }
  })
  if (manifest.version === 3) return archived
  const kinds = manifest.snapshotDeltas
  if (!Array.isArray(kinds) || kinds.length !== archived.length || kinds[0] !== false || kinds.some(kind => typeof kind !== 'boolean')) throw new Error('无效的增量历史索引')
  const snapshots: LocalHistorySnapshot[] = []
  archived.forEach((snapshot, index) => snapshots.push(kinds[index]
    ? { base: snapshots[index - 1], delta: decodeHistoryDelta(snapshot.archive) }
    : snapshot))
  return snapshots
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
  const increments = request.incrementalDeltas
  if (increments && (increments.length !== snapshots.length || increments[0])) throw new Error('无效的增量历史索引')
  const encoded = snapshots.map((snapshot, index) => increments?.[index] ? encodeHistoryDelta(increments[index]!) : snapshot)
  let decodedSnapshots = 0, compiledDeltas = 0
  let previous: { index: number; document: SpriteDocument } | null = null
  const decode = (index: number): SpriteDocument => {
    if (previous?.index === index) return previous.document
    decodedSnapshots++
    if (increments?.[index]) {
      const document = cloneHistoryDocument(decode(index - 1))
      hydrateLocalHistoryDelta(document, increments[index]!).redo()
      return document
    }
    return prepareHistoryDocument(decodeProject(snapshots[index]))
  }
  const deltas = manifest.labels.map((label, index) => {
    if (increments?.[index + 1]) return encoded[index + 1]
    if (cachedDeltas[index] !== undefined) return cachedDeltas[index]!
    const before = decode(index), after = decode(index + 1)
    previous = { index: index + 1, document: after }
    compiledDeltas++
    const delta = compileLocalHistoryDelta(before, after, label)
    return delta ? encodeHistoryDelta(delta) : null
  })
  const shared = sharedSnapshotData(encoded)
  const files: Zippable = {
    'manifest.json': [strToU8(JSON.stringify({ ...manifest, version: increments ? 4 : 3, snapshotDeltas: increments?.map(Boolean), deltaVersion: 1, deltas: deltas.map(delta => delta !== null), snapshotChunks: shared.snapshotChunks, chunkLengths: shared.chunkLengths })), { level: 6 }],
    'snapshots.bin': shared.data
  }
  deltas.forEach((delta, index) => { if (delta) files[`deltas/${index}.zip`] = delta })
  return { archive: zipSync(files, { level: 0 }), deltas, decodedSnapshots, compiledDeltas }
}
