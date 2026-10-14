import type { SpriteDocument } from '@shared/types-document'
import type { MoonSpriteApi } from '@shared/types-platform'
import type { TimelapseSnapshot } from '@shared/types-timelapse'
import { validTimelapseReference } from '@/core/timelapse-reference'
import { recordRuntimeDiagnostic } from '@/core/runtime-diagnostics'
import { readTimelapseFrame } from '@/platform/timelapse-library'
import { releasePersistedTimelapseBytes } from '@/core/timelapse'

const stores = new WeakMap<SpriteDocument, string>()
const writes = new WeakMap<TimelapseSnapshot, Promise<void>>()
const empty = new Uint8Array()
const cursors = new WeakMap<SpriteDocument, { frames: TimelapseSnapshot[]; next: number; lastId?: string }>()

/** Converts one frame only after durable acknowledgement. Immutable chunk ranges
 * can be shared by copies; every live document writes new ranges in its own store. */
async function persistFrame(document: SpriteDocument, frame: TimelapseSnapshot, api: MoonSpriteApi): Promise<void> {
  if (validTimelapseReference(frame.local) && !frame.data.byteLength) return
  const pending = writes.get(frame)
  if (pending) return pending
  if (!api?.appendTimelapseFrame) return // Browser-only fallback retains embedded frames.
  if (!stores.has(document)) stores.set(document, crypto.randomUUID())
  const operation = (async () => {
    const data = frame.data
    const local = await api.appendTimelapseFrame!(stores.get(document)!, data)
    if (!validTimelapseReference(local)) throw new Error('Invalid recording storage acknowledgement')
    frame.local = local
    frame.data = empty
    if (document.timelapse) releasePersistedTimelapseBytes(document.timelapse.snapshots, frame, data.byteLength)
  })()
  writes.set(frame, operation)
  try { await operation } finally { writes.delete(frame) }
}

export async function persistTimelapseFrames(document: SpriteDocument, api: MoonSpriteApi, requestedFrames?: TimelapseSnapshot[]): Promise<void> {
  const frames = requestedFrames ?? document.timelapse?.snapshots ?? []
  const end = frames.length
  let cursor = !requestedFrames ? cursors.get(document) : undefined
  if (!requestedFrames && (!cursor || cursor.frames !== frames || cursor.next > end || (cursor.next > 0 && frames[cursor.next - 1]?.id !== cursor.lastId))) {
    cursor = { frames, next: 0 }
    cursors.set(document, cursor)
  }
  try {
    for (let index = cursor?.next ?? 0; index < end; index++) {
      const frame = frames[index]
      if (frame.data.byteLength) await persistFrame(document, frame, api)
      // Browser fallback retains bytes and must be eligible after a bridge is
      // available. Only advance past durably acknowledged frames.
      if (cursor && !frame.data.byteLength && index === cursor.next) { cursor.next = index + 1; cursor.lastId = frame.id }
    }
  } catch (error) {
    recordRuntimeDiagnostic('error', 'timelapse.persist', { documentId: document.id, message: String(error) })
    throw error
  }
}

/** Capture the generation after persistence; never clone pixel data on the UI thread. */
export async function prepareLocalTimelapseSave(document: SpriteDocument, api: MoonSpriteApi): Promise<void> {
  await persistTimelapseFrames(document, api)
}

/** Explicit portable save only. Normal saves never hydrate historical bytes. */
export async function portableTimelapseDocument(document: SpriteDocument, api: MoonSpriteApi): Promise<SpriteDocument> {
  if (!document.timelapse) return document
  const settings = { ...document.timelapse, snapshots: document.timelapse.snapshots.slice() }
  const snapshots = []
  for (const frame of settings.snapshots) snapshots.push({ ...frame, local: undefined, data: await readTimelapseFrame(frame, api) })
  return { ...document, timelapse: { ...settings, snapshots } }
}
