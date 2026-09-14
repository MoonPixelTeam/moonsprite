import type { SelectionRect } from '@shared/types-selection'
import type { SpriteDocument } from '@shared/types-document'
import type { TimelapseExportFormat, TimelapseQuality, TimelapseRecordingMode, TimelapseSettings, TimelapseSnapshot, TimelapseVideoFormat } from '@shared/types-timelapse'
import { compositeRegion, createCompositePointSampler, createNormalCompositePointSampler, DocumentCompositeCache } from './document-composite'
import { createId } from './document-model'
import { encodePng } from './png-encode'
import { normalizeTimelapseSettings } from './project-metadata'
import { translateCurrent as tr } from './localization'
import { recordRuntimeDiagnostic, runtimeDiagnosticsActive } from './runtime-diagnostics'

export type TimelapseExportMode = 'duration' | 'speed'

export interface TimelapseExportOptions {
  mode: TimelapseExportMode
  durationSeconds: number
  scalePercent?: number
  quality?: TimelapseQuality
  speed?: number
  name?: string
  directory?: string
}

export interface TimelapseVideoFrame {
  snapshotIndex: number
  durationMs: number
}

export interface TimelapseCaptureInvalidation {
  kind: 'full' | 'region'
  fromRevision: number
  revision: number
  rect?: SelectionRect
}

export interface TimelapseCaptureCache {
  sourceWidth: number
  sourceHeight: number
  width: number
  height: number
  frameId: string | null
  revision: number
  pixels: Uint8ClampedArray | null
  composite: DocumentCompositeCache
  /** In-memory adaptive sampling state used only by smart recording. */
  smartMode: TimelapseRecordingMode | null
  smartStride: number
  smartSamplingPhase: number
  smartCompactionArmed: boolean
}

export interface TimelapseCaptureOptions {
  cache?: TimelapseCaptureCache
  contentRevision?: number
  contentInvalidation?: TimelapseCaptureInvalidation | null
  shouldCommit?: () => boolean
}

export interface PreparedTimelapseSnapshot {
  /** Recording policy at the edit boundary, before a later settings change. */
  mode?: TimelapseRecordingMode
  capturedAt: number
  width: number
  height: number
  changeScore: number
  pixels: Uint8ClampedArray
  cache?: TimelapseCaptureCache
}

const qualityMaxDimension: Record<TimelapseQuality, number> = {
  low: 640,
  medium: 1280,
  high: 2400
}

interface TimelapseOutputGeometry {
  width: number
  height: number
  scale: number
  drawWidth: number
  drawHeight: number
}

const timelapseOutputGeometry = (settings: Pick<TimelapseSettings, 'quality' | 'snapshots'>): TimelapseOutputGeometry => {
  const reference = settings.snapshots.reduce(
    (largest, snapshot) => Math.max(snapshot.width, snapshot.height) > Math.max(largest.width, largest.height) ? snapshot : largest,
    { width: 1, height: 1 }
  )
  const scale = Math.max(1, Math.floor(qualityMaxDimension[settings.quality] / Math.max(reference.width, reference.height)))
  const drawWidth = reference.width * scale
  const drawHeight = reference.height * scale
  const evenCeil = (value: number): number => value + (value & 1)
  return { width: evenCeil(drawWidth), height: evenCeil(drawHeight), scale, drawWidth, drawHeight }
}

export const timelapseOutputScale = (settings: Pick<TimelapseSettings, 'quality' | 'snapshots'>): number => timelapseOutputGeometry(settings).scale

export const timelapseOutputDimensions = (settings: Pick<TimelapseSettings, 'quality' | 'snapshots'>): { width: number; height: number } => {
  const { width, height } = timelapseOutputGeometry(settings)
  return { width, height }
}

export const timelapseImageOutputDimensions = (
  snapshots: readonly TimelapseSnapshot[],
  scalePercent: number
): { width: number; height: number } => {
  const reference = snapshots.reduce(
    (largest, snapshot) => Math.max(snapshot.width, snapshot.height) > Math.max(largest.width, largest.height) ? snapshot : largest,
    { width: 0, height: 0 }
  )
  const ratio = Math.max(0.01, Math.min(64, scalePercent / 100))
  return {
    width: reference.width > 0 ? Math.max(1, Math.round(reference.width * ratio)) : 0,
    height: reference.height > 0 ? Math.max(1, Math.round(reference.height * ratio)) : 0
  }
}

export const createTimelapseCaptureCache = (): TimelapseCaptureCache => ({
  sourceWidth: 0,
  sourceHeight: 0,
  width: 0,
  height: 0,
  frameId: null,
  revision: Number.NaN,
  pixels: null,
  composite: new DocumentCompositeCache(),
  smartMode: null,
  smartStride: 1,
  smartSamplingPhase: 0,
  smartCompactionArmed: false
})

/** Target number of retained frames before the next adaptive compaction. */
export const TIMELAPSE_SMART_TARGET_FRAMES = 180
const TIMELAPSE_SMART_COMPACT_TARGET_FRAMES = 120
const TIMELAPSE_SMART_RECENT_FRAMES = 60
/** Prevent integer overflow after extremely long recordings. */
export const TIMELAPSE_SMART_MAX_STRIDE = 2 ** 30

export const resetTimelapseSmartCapture = (cache: TimelapseCaptureCache): void => {
  cache.smartMode = null
  cache.smartStride = 1
  cache.smartSamplingPhase = 0
  cache.smartCompactionArmed = false
}

// Public capture helpers may be called without an explicit workspace cache.
// Keep their adaptive sampling state per document so smart mode remains smart.
const implicitTimelapseCaptureCaches = new WeakMap<SpriteDocument, TimelapseCaptureCache>()

const timelapseCaptureCacheFor = (document: SpriteDocument, provided?: TimelapseCaptureCache): TimelapseCaptureCache => {
  if (provided) return provided
  const existing = implicitTimelapseCaptureCaches.get(document)
  if (existing) return existing
  const created = createTimelapseCaptureCache()
  implicitTimelapseCaptureCaches.set(document, created)
  return created
}

const captureDimensions = (sourceWidth: number, sourceHeight: number, maximumDimension: number): { width: number; height: number } => {
  const ratio = Math.min(1, maximumDimension / Math.max(sourceWidth, sourceHeight))
  const width = Math.max(1, Math.round(sourceWidth * ratio))
  const height = Math.max(1, Math.round(sourceHeight * ratio))
  return { width, height }
}

const targetRangeForSourceRange = (start: number, end: number, sourceSize: number, targetSize: number): { start: number; end: number } => ({
  start: Math.max(0, Math.min(targetSize, Math.ceil(start * targetSize / sourceSize))),
  end: Math.max(0, Math.min(targetSize, Math.ceil(end * targetSize / sourceSize)))
})

const renderScaledRows = (
  document: SpriteDocument,
  output: Uint8ClampedArray,
  outputWidth: number,
  outputHeight: number,
  fromY: number,
  toY: number,
  fromX: number,
  toX: number,
  composite: DocumentCompositeCache,
  revision: number
): void => {
  if (toX <= fromX || toY <= fromY) return
  const sourceLeft = Math.floor(fromX * document.width / outputWidth)
  const sourceRight = Math.min(document.width, Math.floor((toX - 1) * document.width / outputWidth) + 1)
  const sourceTop = Math.floor(fromY * document.height / outputHeight)
  const sourceBottom = Math.min(document.height, Math.floor((toY - 1) * document.height / outputHeight) + 1)
  const sourceWidth = sourceRight - sourceLeft
  const source = compositeRegion(document, sourceLeft, sourceTop, sourceWidth, sourceBottom - sourceTop, composite, revision)
  for (let targetY = fromY; targetY < toY; targetY += 1) {
    const sourceY = Math.min(document.height - 1, Math.floor(targetY * document.height / outputHeight)) - sourceTop
    for (let targetX = fromX; targetX < toX; targetX += 1) {
      const sourceX = Math.min(document.width - 1, Math.floor(targetX * document.width / outputWidth)) - sourceLeft
      const sourceOffset = (sourceY * sourceWidth + sourceX) * 4
      const targetOffset = (targetY * outputWidth + targetX) * 4
      output[targetOffset] = source[sourceOffset]
      output[targetOffset + 1] = source[sourceOffset + 1]
      output[targetOffset + 2] = source[sourceOffset + 2]
      output[targetOffset + 3] = source[sourceOffset + 3]
    }
  }
}

const yieldToMainThread = (): Promise<void> => new Promise((resolve) => globalThis.setTimeout(resolve, 0))

const renderScaledRowsAsync = async (
  document: SpriteDocument,
  output: Uint8ClampedArray,
  outputWidth: number,
  outputHeight: number,
  fromY: number,
  toY: number,
  fromX: number,
  toX: number,
  composite: DocumentCompositeCache,
  revision: number,
  shouldContinue: () => boolean
): Promise<boolean> => {
  const sample = createNormalCompositePointSampler(document) ?? createCompositePointSampler(document)
  for (let targetY = fromY; targetY < toY; targetY += 1) {
    if (!shouldContinue()) return false
    const sourceY = Math.min(document.height - 1, Math.floor(targetY * document.height / outputHeight))
    for (let targetX = fromX; targetX < toX; targetX += 1) {
      const sourceX = Math.min(document.width - 1, Math.floor(targetX * document.width / outputWidth))
      const color = sample(sourceX, sourceY)
      const targetOffset = (targetY * outputWidth + targetX) * 4
      output[targetOffset] = color.r
      output[targetOffset + 1] = color.g
      output[targetOffset + 2] = color.b
      output[targetOffset + 3] = color.a
    }
    if ((targetY - fromY + 1) % 4 === 0) await yieldToMainThread()
  }
  return shouldContinue()
}

const compositeTimelapsePixels = (document: SpriteDocument, maximumDimension: number, options: TimelapseCaptureOptions): { pixels: Uint8ClampedArray; width: number; height: number } => {
  const cache = options.cache
  const revision = options.contentRevision ?? Number.NaN
  const frameId = document.animation?.activeFrameId ?? null
  const { width, height } = captureDimensions(document.width, document.height, maximumDimension)
  if (!cache
    || !cache.pixels
    || cache.sourceWidth !== document.width
    || cache.sourceHeight !== document.height
    || cache.width !== width
    || cache.height !== height
    || cache.frameId !== frameId
    || !Number.isFinite(revision)) {
    const pixels = new Uint8ClampedArray(width * height * 4)
    const composite = cache?.composite ?? new DocumentCompositeCache()
    renderScaledRows(document, pixels, width, height, 0, height, 0, width, composite, revision)
    if (cache) {
      cache.sourceWidth = document.width
      cache.sourceHeight = document.height
      cache.width = width
      cache.height = height
      cache.frameId = frameId
      cache.revision = revision
      cache.pixels = pixels
    }
    return { pixels, width, height }
  }
  const cachedPixels = cache.pixels
  if (cache.revision === revision) return { pixels: cachedPixels, width, height }

  const invalidation = options.contentInvalidation
  const patchRect = invalidation?.kind === 'region'
    && invalidation.fromRevision === cache.revision
    && invalidation.revision === revision
    ? invalidation.rect
    : undefined
  if (!patchRect) {
    renderScaledRows(document, cachedPixels, width, height, 0, height, 0, width, cache.composite, revision)
  } else {
    const left = Math.max(0, Math.floor(patchRect.x))
    const top = Math.max(0, Math.floor(patchRect.y))
    const right = Math.min(document.width, Math.ceil(patchRect.x + patchRect.width))
    const bottom = Math.min(document.height, Math.ceil(patchRect.y + patchRect.height))
    if (right > left && bottom > top) {
      const targetX = targetRangeForSourceRange(left, right, document.width, width)
      const targetY = targetRangeForSourceRange(top, bottom, document.height, height)
      renderScaledRows(document, cachedPixels, width, height, targetY.start, targetY.end, targetX.start, targetX.end, cache.composite, revision)
    }
  }
  cache.revision = revision
  return { pixels: cachedPixels, width, height }
}

const compositeTimelapsePixelsAsync = async (document: SpriteDocument, maximumDimension: number, options: TimelapseCaptureOptions): Promise<{ pixels: Uint8ClampedArray; width: number; height: number } | null> => {
  const cache = options.cache
  const revision = options.contentRevision ?? Number.NaN
  const frameId = document.animation?.activeFrameId ?? null
  const { width, height } = captureDimensions(document.width, document.height, maximumDimension)
  const shouldContinue = options.shouldCommit ?? (() => true)
  if (!cache
    || !cache.pixels
    || cache.sourceWidth !== document.width
    || cache.sourceHeight !== document.height
    || cache.width !== width
    || cache.height !== height
    || cache.frameId !== frameId
    || !Number.isFinite(revision)) {
    const pixels = new Uint8ClampedArray(width * height * 4)
    const composite = cache?.composite ?? new DocumentCompositeCache()
    if (!await renderScaledRowsAsync(document, pixels, width, height, 0, height, 0, width, composite, revision, shouldContinue)) return null
    if (cache) {
      cache.sourceWidth = document.width
      cache.sourceHeight = document.height
      cache.width = width
      cache.height = height
      cache.frameId = frameId
      cache.revision = revision
      cache.pixels = pixels
    }
    return { pixels, width, height }
  }
  const cachedPixels = cache.pixels
  if (cache.revision === revision) return { pixels: cachedPixels, width, height }

  const invalidation = options.contentInvalidation
  const patchRect = invalidation?.kind === 'region'
    && invalidation.fromRevision === cache.revision
    && invalidation.revision === revision
    ? invalidation.rect
    : undefined
  let completed: boolean
  if (!patchRect) completed = await renderScaledRowsAsync(document, cachedPixels, width, height, 0, height, 0, width, cache.composite, revision, shouldContinue)
  else {
    const left = Math.max(0, Math.floor(patchRect.x))
    const top = Math.max(0, Math.floor(patchRect.y))
    const right = Math.min(document.width, Math.ceil(patchRect.x + patchRect.width))
    const bottom = Math.min(document.height, Math.ceil(patchRect.y + patchRect.height))
    if (right > left && bottom > top) {
      const targetX = targetRangeForSourceRange(left, right, document.width, width)
      const targetY = targetRangeForSourceRange(top, bottom, document.height, height)
      completed = await renderScaledRowsAsync(document, cachedPixels, width, height, targetY.start, targetY.end, targetX.start, targetX.end, cache.composite, revision, shouldContinue)
    } else completed = shouldContinue()
  }
  if (!completed) {
    cache.revision = Number.NaN
    cache.pixels = null
    return null
  }
  cache.revision = revision
  return { pixels: cachedPixels, width, height }
}

const appendTimelapseSnapshot = (settings: TimelapseSettings, now: number, width: number, height: number, changeScore: number, data: Uint8Array): void => {
  const previous = settings.snapshots.at(-1)
  const snapshot: TimelapseSnapshot = {
    id: createId('timelapse'),
    capturedAt: now,
    elapsedMs: previous ? Math.max(0, now - previous.capturedAt) : 0,
    width,
    height,
    changeScore: Math.max(0, Math.min(1, changeScore)),
    data
  }
  settings.snapshots = [...settings.snapshots, snapshot]
}

interface SmartTimelapsePlan {
  mode: TimelapseRecordingMode
  keep: boolean
  transition: boolean
  nextStride: number
  nextSamplingPhase: number
}

const compactTimelapseSnapshots = (snapshots: TimelapseSnapshot[]): TimelapseSnapshot[] => {
  if (snapshots.length <= TIMELAPSE_SMART_COMPACT_TARGET_FRAMES) return snapshots
  const recent = snapshots.slice(-TIMELAPSE_SMART_RECENT_FRAMES)
  const older = snapshots.slice(0, -TIMELAPSE_SMART_RECENT_FRAMES)
  const targetOlder = TIMELAPSE_SMART_COMPACT_TARGET_FRAMES - recent.length
  const selected: TimelapseSnapshot[] = []
  for (let slot = 0; slot < targetOlder; slot += 1) {
    const start = Math.floor(slot * older.length / targetOlder)
    const end = Math.max(start + 1, Math.floor((slot + 1) * older.length / targetOlder))
    let best = older[start]
    for (let index = start + 1; index < end; index += 1) {
      if ((older[index].changeScore ?? 0) > (best.changeScore ?? 0)) best = older[index]
    }
    selected.push(best)
  }
  return [...selected, ...recent]
}

const timelapseChangeScore = (document: SpriteDocument, invalidation?: TimelapseCaptureInvalidation | null): number => {
  if (!invalidation || invalidation.kind === 'full' || !invalidation.rect) return 1
  const area = Math.max(0, invalidation.rect.width) * Math.max(0, invalidation.rect.height)
  return Math.max(0.01, Math.min(1, area / Math.max(1, document.width * document.height)))
}

/**
 * Plans one source operation without mutating the document or cache. The
 * caller applies the plan only after the operation has successfully committed.
 */
const planSmartTimelapseCapture = (settings: TimelapseSettings, cache?: TimelapseCaptureCache): SmartTimelapsePlan => {
  const mode = settings.mode ?? 'full'
  if (!cache || mode !== 'smart') return { mode, keep: true, transition: false, nextStride: 1, nextSamplingPhase: 0 }

  const sameMode = cache.smartMode === mode && settings.snapshots.length > 0
  let stride = sameMode ? Math.min(TIMELAPSE_SMART_MAX_STRIDE, Math.max(1, Math.trunc(cache.smartStride))) : 1
  let samplingPhase = sameMode ? Math.max(0, Math.trunc(cache.smartSamplingPhase)) % stride : 0
  const transition = sameMode
    && cache.smartCompactionArmed
    && settings.snapshots.length >= TIMELAPSE_SMART_TARGET_FRAMES
    && stride < TIMELAPSE_SMART_MAX_STRIDE
  if (transition) {
    // Compaction itself reduces the retained history. Keep sampling every
    // subsequent operation so the recent window remains complete.
    stride = 1
    samplingPhase = 0
  }
  const keep = transition || samplingPhase === 0
  return {
    mode,
    keep,
    transition,
    nextStride: stride,
    nextSamplingPhase: (samplingPhase + 1) % stride
  }
}

const applySmartTimelapsePlan = (settings: TimelapseSettings, cache: TimelapseCaptureCache | undefined, plan: SmartTimelapsePlan, documentId: string): void => {
  if (!cache || plan.mode !== 'smart') {
    if (cache) resetTimelapseSmartCapture(cache)
    return
  }
  if (plan.transition) {
    const before = settings.snapshots.length
    settings.snapshots = compactTimelapseSnapshots(settings.snapshots)
    if (runtimeDiagnosticsActive()) recordRuntimeDiagnostic('operation-stage', 'timelapse.compact', {
      documentId, reason: 'smart-sampling', beforeFrames: before, retainedFrames: settings.snapshots.length,
      samplingStride: plan.nextStride, recentFrames: TIMELAPSE_SMART_RECENT_FRAMES
    })
  }
  cache.smartMode = plan.mode
  cache.smartStride = plan.nextStride
  cache.smartSamplingPhase = plan.nextSamplingPhase
}

const markSmartTimelapseSnapshotAdded = (settings: TimelapseSettings, cache: TimelapseCaptureCache | undefined): void => {
  if (!cache || settings.mode !== 'smart') return
  if (settings.snapshots.length >= TIMELAPSE_SMART_TARGET_FRAMES) cache.smartCompactionArmed = true
}

interface TimelapseEncodeWorkerResponse { id: number; data?: Uint8Array; error?: string }
let timelapseEncodeSequence = 0
let timelapseEncodeWorker: Worker | null = null

interface PendingTimelapseEncode {
  resolve: (data: Uint8Array) => void
  reject: (error: Error) => void
}

const pendingTimelapseEncodes = new Map<number, PendingTimelapseEncode>()

const resetTimelapseEncodeWorker = (error?: Error): void => {
  timelapseEncodeWorker?.terminate()
  timelapseEncodeWorker = null
  if (!error) return
  for (const pending of pendingTimelapseEncodes.values()) pending.reject(error)
  pendingTimelapseEncodes.clear()
}

// A recording session encodes hundreds of frames. Creating and terminating a worker
// per frame costs more than the encode itself, so one worker is kept per session and
// requests are matched by id.
const ensureTimelapseEncodeWorker = (): Worker => {
  if (timelapseEncodeWorker) return timelapseEncodeWorker
  const worker = new Worker(new URL('../workers/timelapse-encode.worker.ts', import.meta.url), { type: 'module', name: 'moonsprite-timelapse-encode' })
  worker.onmessage = (event: MessageEvent<TimelapseEncodeWorkerResponse>) => {
    const pending = pendingTimelapseEncodes.get(event.data.id)
    if (!pending) return
    pendingTimelapseEncodes.delete(event.data.id)
    if (event.data.data) pending.resolve(event.data.data)
    else pending.reject(new Error(event.data.error || 'Timelapse encode failed'))
  }
  worker.onerror = (event) => {
    resetTimelapseEncodeWorker(new Error(event.message || 'Timelapse encode worker failed'))
  }
  worker.onmessageerror = () => resetTimelapseEncodeWorker(new Error('Timelapse encode worker message failed'))
  timelapseEncodeWorker = worker
  return worker
}

const encodeTimelapsePngAsync = (pixels: Uint8ClampedArray, width: number, height: number): Promise<Uint8Array> => {
  if (typeof Worker === 'undefined') return Promise.resolve(encodePng(pixels, width, height, true).bytes)
  return new Promise<Uint8Array>((resolve, reject) => {
    const id = ++timelapseEncodeSequence
    // The worker takes ownership of the buffer, so it never receives the shared
    // capture cache.
    const transferredPixels = pixels.slice()
    let worker: Worker
    try {
      worker = ensureTimelapseEncodeWorker()
    } catch (error) {
      reject(error instanceof Error ? error : new Error(String(error)))
      return
    }
    const timeout = setTimeout(() => {
      if (pendingTimelapseEncodes.has(id)) resetTimelapseEncodeWorker(new Error('Timelapse encode worker timed out'))
    }, 30_000)
    pendingTimelapseEncodes.set(id, {
      resolve: (data) => { clearTimeout(timeout); resolve(data) },
      reject: (error) => { clearTimeout(timeout); reject(error) }
    })
    try {
      worker.postMessage({ id, pixels: transferredPixels, width, height }, [transferredPixels.buffer])
    } catch (error) {
      clearTimeout(timeout)
      pendingTimelapseEncodes.delete(id)
      reject(error instanceof Error ? error : new Error(String(error)))
    }
  }).catch((error) => {
    recordRuntimeDiagnostic('error', 'timelapse.encode.fallback', { message: error instanceof Error ? error.message : String(error) })
    // The transferred buffer is a copy. Retain the original so a failed worker
    // does not erase this operation; the exceptional fallback runs only once.
    return encodePng(pixels, width, height, true).bytes
  })
}

const prepareTimelapseCapture = (document: SpriteDocument, options: TimelapseCaptureOptions): { settings: TimelapseSettings; pixels: Uint8ClampedArray; width: number; height: number; cache: TimelapseCaptureCache } | null => {
  const settings = normalizeTimelapseSettings(document.timelapse, document.timelapse?.snapshots ?? [])
  document.timelapse = settings
  if (!settings.enabled) return null
  const cache = timelapseCaptureCacheFor(document, options.cache)
  return { settings, cache, ...compositeTimelapsePixels(document, qualityMaxDimension[settings.quality], { ...options, cache }) }
}

export function prepareTimelapseSnapshot(document: SpriteDocument, now = Date.now(), options: TimelapseCaptureOptions = {}): PreparedTimelapseSnapshot | null {
  const capture = prepareTimelapseCapture(document, options)
  return capture ? { mode: capture.settings.mode, capturedAt: now, width: capture.width, height: capture.height, changeScore: timelapseChangeScore(document, options.contentInvalidation), pixels: capture.pixels.slice(), cache: capture.cache } : null
}

export async function commitPreparedTimelapseSnapshot(document: SpriteDocument, snapshot: PreparedTimelapseSnapshot, shouldCommit: () => boolean = () => true): Promise<void> {
  if (!shouldCommit()) return
  const settings = normalizeTimelapseSettings(document.timelapse, document.timelapse?.snapshots ?? [])
  document.timelapse = settings
  if (!settings.enabled && snapshot.mode === undefined) return
  const plan = planSmartTimelapseCapture({ ...settings, mode: snapshot.mode ?? settings.mode }, snapshot.cache)
  if (!plan.keep) {
    if (shouldCommit()) applySmartTimelapsePlan(settings, snapshot.cache, plan, document.id)
    return
  }
  const data = await encodeTimelapsePngAsync(snapshot.pixels, snapshot.width, snapshot.height)
  if (!shouldCommit()) return
  const latestSettings = normalizeTimelapseSettings(document.timelapse, document.timelapse?.snapshots ?? [])
  document.timelapse = latestSettings
  if (!latestSettings.enabled && snapshot.mode === undefined) return
  // Switching policy affects future edits. Preserve this already captured frame
  // without applying an old policy's compaction to the new recording settings.
  if ((latestSettings.mode ?? 'full') === plan.mode) applySmartTimelapsePlan(latestSettings, snapshot.cache, plan, document.id)
  appendTimelapseSnapshot(latestSettings, snapshot.capturedAt, snapshot.width, snapshot.height, snapshot.changeScore, data)
  markSmartTimelapseSnapshotAdded(latestSettings, snapshot.cache)
}

export function captureTimelapseSnapshot(document: SpriteDocument, now = Date.now(), options: TimelapseCaptureOptions = {}): void {
  const capture = prepareTimelapseCapture(document, options)
  if (!capture) return
  const plan = planSmartTimelapseCapture(capture.settings, capture.cache)
  if (!plan.keep) {
    applySmartTimelapsePlan(capture.settings, capture.cache, plan, document.id)
    return
  }
  const data = encodePng(capture.pixels, capture.width, capture.height, true).bytes
  applySmartTimelapsePlan(capture.settings, capture.cache, plan, document.id)
  appendTimelapseSnapshot(capture.settings, now, capture.width, capture.height, timelapseChangeScore(document, options.contentInvalidation), data)
  markSmartTimelapseSnapshotAdded(capture.settings, capture.cache)
}

export async function captureTimelapseSnapshotAsync(document: SpriteDocument, now = Date.now(), options: TimelapseCaptureOptions = {}): Promise<void> {
  const settings = normalizeTimelapseSettings(document.timelapse, document.timelapse?.snapshots ?? [])
  document.timelapse = settings
  if (!settings.enabled) return
  const cache = timelapseCaptureCacheFor(document, options.cache)
  const capture = await compositeTimelapsePixelsAsync(document, qualityMaxDimension[settings.quality], { ...options, cache })
  if (!capture || options.shouldCommit?.() === false) return
  const plan = planSmartTimelapseCapture(settings, cache)
  if (!plan.keep) {
    if (options.shouldCommit?.() !== false) applySmartTimelapsePlan(settings, cache, plan, document.id)
    return
  }
  const data = await encodeTimelapsePngAsync(capture.pixels, capture.width, capture.height)
  if (options.shouldCommit?.() === false) return
  const latestSettings = normalizeTimelapseSettings(document.timelapse, document.timelapse?.snapshots ?? [])
  document.timelapse = latestSettings
  if (!latestSettings.enabled) return
  if ((latestSettings.mode ?? 'full') !== plan.mode) return
  applySmartTimelapsePlan(latestSettings, cache, plan, document.id)
  appendTimelapseSnapshot(latestSettings, now, capture.width, capture.height, timelapseChangeScore(document, options.contentInvalidation), data)
  markSmartTimelapseSnapshotAdded(latestSettings, cache)
}

// Timelapse export can run in a Worker, where `window` does not exist.
const wait = (duration: number): Promise<void> => new Promise((resolve) => globalThis.setTimeout(resolve, duration))

export const timelapseFrameHoldMs = (_snapshot: TimelapseSnapshot, settings: Pick<TimelapseSettings, 'fps' | 'speed'>): number => 1000 / settings.fps / Math.max(1, settings.speed)

export const timelapseSourceDurationMs = (settings: Pick<TimelapseSettings, 'fps' | 'snapshots'>): number => settings.snapshots.length * 1000 / settings.fps

export const timelapseFrameDurations = (
  settings: Pick<TimelapseSettings, 'fps' | 'speed' | 'snapshots'>,
  options: TimelapseExportOptions
): number[] => {
  if (settings.snapshots.length === 0) return []
  const sourceDuration = timelapseSourceDurationMs(settings)
  const outputDuration = options.mode === 'duration'
    ? Math.max(0.1, Math.min(3600, options.durationSeconds)) * 1000
    : sourceDuration / Math.max(1, Math.min(64, settings.speed))
  const frameDuration = outputDuration / settings.snapshots.length
  return settings.snapshots.map(() => frameDuration)
}

export const timelapseVideoFramePlan = (
  settings: Pick<TimelapseSettings, 'fps' | 'speed' | 'snapshots'>,
  options: TimelapseExportOptions
): TimelapseVideoFrame[] => {
  const snapshotCount = settings.snapshots.length
  if (snapshotCount === 0) return []
  const fps = Math.max(1, Math.min(60, Math.round(settings.fps)))
  const requestedDurationMs = options.mode === 'duration'
    ? Math.max(0.1, Math.min(3600, options.durationSeconds)) * 1000
    : timelapseSourceDurationMs(settings) / Math.max(1, Math.min(64, settings.speed))
  const frameCount = Math.max(1, Math.round(requestedDurationMs * fps / 1000))
  const durationMs = 1000 / fps
  return Array.from({ length: frameCount }, (_, index) => ({
    snapshotIndex: frameCount === 1
      ? snapshotCount - 1
      : Math.round(index * (snapshotCount - 1) / (frameCount - 1)),
    durationMs
  }))
}

/** Preview every retained recording snapshot before export settings are chosen. */
export const timelapsePreviewFramePlan = (
  settings: Pick<TimelapseSettings, 'fps' | 'speed' | 'snapshots'>
): TimelapseVideoFrame[] => settings.snapshots.map((_snapshot, snapshotIndex) => ({
  snapshotIndex,
  durationMs: timelapseFrameHoldMs(_snapshot, settings)
}))

export const isTimelapseVideoFormat = (format: TimelapseExportFormat): format is TimelapseVideoFormat => format === 'mp4' || format === 'webm'

const VIDEO_MIME_TYPES: Record<TimelapseVideoFormat, readonly string[]> = {
  mp4: ['video/mp4;codecs=avc1.42E01E', 'video/mp4'],
  webm: ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']
}

export const resolveTimelapseMimeType = (
  format: TimelapseVideoFormat,
  isSupported: (mimeType: string) => boolean
): string | null => VIDEO_MIME_TYPES[format].find(isSupported) ?? null

const decodeSnapshot = async (snapshot: TimelapseSnapshot): Promise<ImageBitmap> => {
  const buffer = snapshot.data.buffer.slice(snapshot.data.byteOffset, snapshot.data.byteOffset + snapshot.data.byteLength) as ArrayBuffer
  const blob = new Blob([buffer], { type: 'image/png' })
  return createImageBitmap(blob)
}

export async function encodeTimelapseVideo(settings: TimelapseSettings, format: TimelapseVideoFormat, options: TimelapseExportOptions = { mode: 'duration', durationSeconds: 1 }, onProgress?: (value: number) => void): Promise<Uint8Array> {
  if (settings.snapshots.length === 0) throw new Error(tr('timelapse.noFrames'))
  if (typeof MediaRecorder === 'undefined' || typeof HTMLCanvasElement.prototype.captureStream !== 'function' || typeof createImageBitmap !== 'function') {
    throw new Error(tr('timelapse.unsupported'))
  }
  const geometry = timelapseOutputGeometry(settings)
  const { width, height } = geometry
  const canvas = globalThis.document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new Error(tr('timelapse.canvasUnavailable'))
  context.imageSmoothingEnabled = false
  const framePlan = timelapseVideoFramePlan(settings, options)
  const outputFps = Math.max(1, Math.min(60, Math.round(settings.fps)))
  let activeBitmap: ImageBitmap | null = null
  let activeSnapshotIndex = -1
  const drawFrame = async (snapshotIndex: number): Promise<void> => {
    if (activeSnapshotIndex !== snapshotIndex) {
      activeBitmap?.close()
      activeBitmap = await decodeSnapshot(settings.snapshots[snapshotIndex])
      activeSnapshotIndex = snapshotIndex
    }
    const snapshot = settings.snapshots[snapshotIndex]
    context.clearRect(0, 0, width, height)
    const scale = Math.min(geometry.drawWidth / snapshot.width, geometry.drawHeight / snapshot.height)
    const drawWidth = Math.max(1, Math.round(snapshot.width * scale))
    const drawHeight = Math.max(1, Math.round(snapshot.height * scale))
    const bitmap = activeBitmap
    if (!bitmap) throw new Error(tr('timelapse.exportFailed'))
    context.drawImage(bitmap, Math.floor((width - drawWidth) / 2), Math.floor((height - drawHeight) / 2), drawWidth, drawHeight)
  }
  await drawFrame(framePlan[0].snapshotIndex)
  const stream = canvas.captureStream(outputFps)
  const mimeType = resolveTimelapseMimeType(format, (candidate) => MediaRecorder.isTypeSupported(candidate))
  if (!mimeType) throw new Error(tr('timelapse.formatUnsupported', { format: format.toUpperCase() }))
  const bitrate = settings.quality === 'high' ? 8_000_000 : settings.quality === 'low' ? 1_500_000 : 4_000_000
  const chunks: Blob[] = []
  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: bitrate })
  recorder.ondataavailable = (event) => { if (event.data.size > 0) chunks.push(event.data) }
  const stopped = new Promise<void>((resolve, reject) => {
    recorder.onstop = () => resolve()
    recorder.onerror = () => reject(new Error(tr('timelapse.exportFailed')))
  })
  recorder.start()
  try {
    for (const [index, frame] of framePlan.entries()) {
      if (index > 0) await drawFrame(frame.snapshotIndex)
      onProgress?.((index + 1) / framePlan.length * 100)
      await wait(frame.durationMs)
    }
  } finally {
    const bitmapToClose = activeBitmap as ImageBitmap | null
    activeBitmap = null
    bitmapToClose?.close()
    recorder.stop()
    stream.getTracks().forEach((track) => track.stop())
  }
  await stopped
  return new Uint8Array(await new Blob(chunks, { type: mimeType }).arrayBuffer())
}
