import type { SpriteDocument } from '@shared/types-document'
import type { MoonSpriteApi } from '@shared/types-platform'
import type { TimelapseSnapshot } from '@shared/types-timelapse'
import { validTimelapseReference } from '@/core/timelapse-reference'
import { recordRuntimeDiagnostic } from '@/core/runtime-diagnostics'
import { readTimelapseFrame } from '@/platform/timelapse-library'

const stores = new WeakMap<SpriteDocument, string>()
const writes = new WeakMap<TimelapseSnapshot, Promise<void>>()
const empty = new Uint8Array()

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
  })()
  writes.set(frame, operation)
  try { await operation } finally { writes.delete(frame) }
}

export async function persistTimelapseFrames(document: SpriteDocument, api: MoonSpriteApi, frames = document.timelapse?.snapshots ?? []): Promise<void> {
  try {
    for (const frame of frames) if (frame.data.byteLength) await persistFrame(document, frame, api)
  } catch (error) {
    recordRuntimeDiagnostic('error', 'timelapse.persist', { documentId: document.id, message: String(error) })
    throw error
  }
}

/** Capture the generation after persistence; never clone pixel data on the UI thread. */
export async function prepareLocalTimelapseSave(document: SpriteDocument, api: MoonSpriteApi): Promise<void> {
  const frames = document.timelapse?.snapshots ?? []
  await persistTimelapseFrames(document, api, frames)
}

/** Explicit portable save only. Normal saves never hydrate historical bytes. */
export async function portableTimelapseDocument(document: SpriteDocument, api: MoonSpriteApi): Promise<SpriteDocument> {
  if (!document.timelapse) return document
  const settings = document.timelapse
  const snapshots = []
  for (const frame of settings.snapshots) snapshots.push({ ...frame, local: undefined, data: await readTimelapseFrame(frame, api) })
  return { ...document, timelapse: { ...settings, snapshots } }
}
