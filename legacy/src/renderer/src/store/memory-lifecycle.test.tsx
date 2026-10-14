import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import type { ComponentProps, FunctionComponent } from 'react'
import { CanvasCompositeCache } from '@/components/canvas-composite-cache'
import { DocumentCompositeCache } from '@/core/document-composite-cache'
import { globalCacheManager } from '@/core/global-cache-manager'
import { PreviewPanel } from '@/components/panels/PreviewPanel'
import { createDocument, markRasterStorageContentChanged } from '@/core/document'
import { sessionFromDocument } from '@/store/workspace-session'
import { deleteTextFont, loadTextFontCatalog, resetTextFontServiceForTests } from '@/platform/font-service'
import { animationCelSurfaceHasContent } from '@/core/animation-cel-content-cache'
import type { PaletteEntry } from '@shared/types-color'
import type { MoonSpriteApi } from '@shared/types-platform'
import { DEFAULT_EDITOR_PREFERENCES, saveEditorPreferences } from '@/core/file-preferences'
import { persistLocalHistory } from '@/store/local-history-service'
import { RecoveryService } from '@/store/recovery-service'
import { exportLayersInWorker } from '@/core/layer-export-worker-client'
import { commitPreparedTimelapseSnapshot, createTimelapseCaptureCache, retainTimelapseSnapshotsWithinBytes } from '@/core/timelapse'
import { persistTimelapseFrames } from '@/store/timelapse-library-service'
import { detectDocumentPixelScale } from '@/core/image-scale-detection'
import { BudgetedStyleBlockMap, LayerStyleCacheBudget } from '@/core/layer-style-cache-budget'
import { GlobalCacheManager } from '@/core/global-cache-manager'
import { TIMELAPSE_FULL_FRAME_LIMIT, TIMELAPSE_SNAPSHOT_BYTE_BUDGET } from '@/core/timelapse'
import { createWorkspaceRecording } from './workspace-recording'
import { unpackLocalHistorySnapshots, materializeLocalHistorySnapshot } from '@/core/local-history-archive'
import { unzipSync, strFromU8 } from 'fflate'

// Resource lifecycle regression probes derived from the recorded audit.
// No real GPU/FontFace heap is measured.
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); localStorage.clear() })
const providers = () => globalCacheManager.snapshot().length

describe('bounded resource lifecycles', () => {
  it('cache disposal and abandoned empty instances do not register providers', () => {
    const before = providers()
    for (let i = 0; i < 200; i++) new DocumentCompositeCache().dispose()
    const afterCore = providers()
    for (let i = 0; i < 200; i++) new CanvasCompositeCache().dispose()
    const afterCanvas = providers()
    console.log('AUDIT ' + JSON.stringify({ probe: 'cache-disposal', iterations: 200, directCoreProviderGrowth: afterCore - before, canvasProviderGrowth: afterCanvas - afterCore }))
    expect(afterCore - before).toBe(0)
    expect(afterCanvas - afterCore).toBe(0)
  })

  it('executes the actual PreviewPanel hooks on repeated renders, without attaching a canvas', () => {
    const component = (PreviewPanel as unknown as { type: FunctionComponent<ComponentProps<typeof PreviewPanel>> }).type
    const session = sessionFromDocument(createDocument('audit preview', 2, 2, 'rgba', false))
    let renders = 0
    const before = providers()
    const { rerender, unmount } = renderHook(() => {
      renders++
      return component({ session, onClose: () => {}, docked: true })
    })
    for (let i = 0; i < 100; i++) rerender()
    unmount()
    const growth = providers() - before
    console.log('AUDIT ' + JSON.stringify({ probe: 'preview-hook-renders', requestedRerenders: 100, actualRenders: renders, providerGrowthAfterUnmount: growth, canvasMounted: false }))
    expect(growth).toBe(0)
    expect(renders).toBeGreaterThanOrEqual(101)
  })

  it('concurrent font catalog loads share registration and deletion releases every face', async () => {
    const faces = new Set<object>()
    const originalFonts = Object.getOwnPropertyDescriptor(document, 'fonts')
    const originalApi = Object.getOwnPropertyDescriptor(window, 'moonSprite')
    const font = { id: 'audit-font', family: 'AuditFont', filePath: 'audit-font.ttf', imported: true }
    class FakeFontFace {
      constructor(readonly family: string, readonly source: ArrayBuffer) {}
      async load() { return this }
    }
    resetTextFontServiceForTests()
    vi.stubGlobal('FontFace', FakeFontFace)
    Object.defineProperty(document, 'fonts', { configurable: true, value: faces })
    Object.defineProperty(window, 'moonSprite', { configurable: true, value: {
      listFonts: async () => ({ fonts: [font] }),
      readBinary: async () => new Uint8Array(1024),
      deleteFont: async () => undefined
    } })
    const residualFaces: number[] = []
    try {
      for (let i = 0; i < 10; i++) {
        await Promise.all([loadTextFontCatalog(), loadTextFontCatalog()])
        await deleteTextFont({ ...font, source: 'imported' })
        residualFaces.push(faces.size)
      }
      console.log('AUDIT ' + JSON.stringify({ probe: 'concurrent-font-register-delete', cycles: 10, residualFaces, mockFontBytes: 1024 }))
      expect(residualFaces).toEqual(Array(10).fill(0))
    } finally {
      resetTextFontServiceForTests()
      if (originalFonts) Object.defineProperty(document, 'fonts', originalFonts)
      else Reflect.deleteProperty(document, 'fonts')
      if (originalApi) Object.defineProperty(window, 'moonSprite', originalApi)
      else Reflect.deleteProperty(window, 'moonSprite')
    }
  })

  it('indexed cel content variants remain bounded for live storage', () => {
    const pixels = new Uint32Array([1, 0, 0, 0])
    markRasterStorageContentChanged(pixels)
    const surface = { format: 'indexed' as const, width: 2, height: 2, offsetX: 0, offsetY: 0, pixels }
    let retainedVariants = 0
    const originalSet = Map.prototype.set
    const spy = vi.spyOn(Map.prototype, 'set').mockImplementation(function(this: Map<unknown, unknown>, key: unknown, value: unknown) {
      const result = originalSet.call(this, key, value)
      if (typeof key === 'string' && key.startsWith('indexed:') && typeof value === 'object' && value && 'revision' in value && 'value' in value) retainedVariants = this.size
      return result
    })
    try {
      for (let signature = 1; signature <= 200; signature++) {
        const palette: PaletteEntry[] = Array.from({ length: 8 }, (_, index) => ({ id: index + 1, name: String(index), color: { r: 0, g: 0, b: 0, a: signature & (1 << index) ? 255 : 0 } }))
        animationCelSurfaceHasContent(surface, palette)
      }
    } finally { spy.mockRestore() }
    console.log('AUDIT ' + JSON.stringify({ probe: 'indexed-cel-live-storage', uniqueVisibilitySignatures: 200, retainedVariants }))
    expect(retainedVariants).toBeLessThanOrEqual(8)
  })

  it('local history coalesces pending generations behind a blocked write', async () => {
    saveEditorPreferences({ ...DEFAULT_EDITOR_PREFERENCES, localHistoryEnabled: true })
    const session = sessionFromDocument(createDocument('audit local history', 2, 2, 'rgba', false))
    let release!: () => void
    const gate = new Promise<void>(resolve => { release = resolve })
    let lastArchive: Uint8Array = new Uint8Array()
    const write = vi.fn(async (_id: string, bytes: Uint8Array) => { lastArchive = bytes; if (write.mock.calls.length === 1) await gate })
    const api = { writeLocalHistory: write } as unknown as MoonSpriteApi
    const requests: Promise<void>[] = []
    for (let generation = 0; generation < 20; generation++) {
      // Replacing the live timeline models old generations being discarded while
      // immutable queued generations are still required by the persistence chain.
      session.localHistory = { snapshots: [createDocument(`generation-${generation}`, 2, 2, 'rgba', false)], labels: [], position: 0 }
      requests.push(persistLocalHistory(api, session, generation === 1))
    }
    await vi.waitFor(() => expect(write).toHaveBeenCalledTimes(1))
    const writesWhileBlocked = write.mock.calls.length
    release()
    await Promise.all(requests)
    console.log('AUDIT ' + JSON.stringify({ probe: 'local-history-slow-write', submittedGenerations: 20, writesWhileBlocked, writesAfterDrain: write.mock.calls.length, liveGenerations: 1 }))
    expect(write).toHaveBeenCalledTimes(2)
    const files = unzipSync(lastArchive), manifest = JSON.parse(strFromU8(files['manifest.json']))
    expect(manifest.documentFingerprint).toBeDefined()
    expect(materializeLocalHistorySnapshot(unpackLocalHistorySnapshots(files, manifest)[0])).toMatchObject({ name: 'generation-19' })
  })

  it('recovery cancels pending revisions when discard follows a blocked write', async () => {
    const service = new RecoveryService()
    const document = createDocument('audit recovery', 2, 2, 'rgba', false)
    let release!: () => void
    const gate = new Promise<void>(resolve => { release = resolve })
    const events: string[] = []
    const write = vi.fn(async () => { events.push('write'); if (write.mock.calls.length === 1) await gate })
    const api = { writeRecovery: write, deleteRecovery: async () => { events.push('delete') } } as unknown as MoonSpriteApi
    const requests = [service.autosave(api, [{ id: document.id, document, revision: 0 }])]
    await vi.waitFor(() => expect(write).toHaveBeenCalledTimes(1))
    for (let revision = 1; revision < 20; revision++) requests.push(service.autosave(api, [{ id: document.id, document, revision }]))
    const discard = service.discard(api, document.id)
    const writesWhileBlocked = write.mock.calls.length
    release()
    await Promise.all([...requests, discard])
    console.log('AUDIT ' + JSON.stringify({ probe: 'recovery-slow-write', submittedRevisions: 20, writesWhileBlocked, writesAfterDrain: write.mock.calls.length, discardPosition: events.indexOf('delete') }))
    expect(write).toHaveBeenCalledTimes(1)
    expect(events.at(-1)).toBe('delete')
  })

  it('layer export waits for each consumer before acknowledging the next result', async () => {
    let worker!: FakeWorker
    class FakeWorker {
      onmessage: ((event: MessageEvent) => void) | null = null
      onerror: ((event: ErrorEvent) => void) | null = null
      messages: { id: number }[] = []
      terminated = false
      emitted = 0
      constructor() { worker = this }
      postMessage(message: { id: number; acknowledgedIndex?: number }) {
        this.messages.push(message)
        const index = message.acknowledgedIndex === undefined ? 0 : message.acknowledgedIndex + 1
        queueMicrotask(() => {
          if (this.terminated) return
          if (index === count) { this.emit({ id: message.id, done: true }); return }
          this.emitted++
          this.emit({ id: message.id, result: { index, bytes: new Uint8Array(bytesPerResult), extension: 'png', indexed: false } })
        })
      }
      terminate() { this.terminated = true }
      emit(data: object) { this.onmessage?.({ data } as MessageEvent) }
    }
    vi.stubGlobal('Worker', FakeWorker)
    let release!: () => void
    const gate = new Promise<void>(resolve => { release = resolve })
    const consume = vi.fn(async () => { if (consume.mock.calls.length === 1) await gate })
    const count = 20, bytesPerResult = 1024 * 1024
    const operation = exportLayersInWorker(createDocument('audit export', 2, 2, 'rgba', false), Array.from({ length: count }, (_, i) => `layer-${i}`), { format: 'png-rgba', scalePercent: 100 }, { onResult: consume })
    await vi.waitFor(() => expect(consume).toHaveBeenCalledTimes(1))
    const messagesBeforeDrain = worker.messages.length
    const consumersBeforeDrain = consume.mock.calls.length
    expect(worker.emitted).toBe(1)
    release()
    await operation
    console.log('AUDIT ' + JSON.stringify({ probe: 'layer-export-slow-consumer', totalResults: count, totalResultBytes: count * bytesPerResult, queuedResultsWhileBlocked: 1, queuedResultBytesWhileBlocked: bytesPerResult, consumersBeforeDrain, clientMessagesBeforeDrain: messagesBeforeDrain, consumersAfterDrain: consume.mock.calls.length, terminatedAfterDrain: worker.terminated }))
    expect(messagesBeforeDrain).toBe(1)
    expect(consume).toHaveBeenCalledTimes(count)
    expect(worker.messages).toHaveLength(count + 1)
    expect(worker.terminated).toBe(true)
  })

  it('full timelapse retains metadata after successful durable frame persistence', async () => {
    const document = createDocument('audit full recording', 2, 2, 'rgba', true)
    document.timelapse!.mode = 'full'
    const cache = createTimelapseCaptureCache()
    let appendCalls = 0
    const api = { appendTimelapseFrame: async (store: string, data: Uint8Array) => ({ store, chunk: 'audit-chunk-1', offset: appendCalls++ * 128, length: data.byteLength, checksum: 0 }) } as unknown as MoonSpriteApi
    try {
      for (let index = 0; index < 500; index++) {
        await commitPreparedTimelapseSnapshot(document, { mode: 'full', capturedAt: index + 1, width: 2, height: 2, changeScore: 1, pixels: new Uint8ClampedArray(16), cache })
        await persistTimelapseFrames(document, api)
      }
      const frames = document.timelapse!.snapshots
      const dataBytes = frames.reduce((sum, frame) => sum + frame.data.byteLength, 0)
      const framesAfterZeroByteBudget = retainTimelapseSnapshotsWithinBytes(frames, 0).length
      console.log('AUDIT ' + JSON.stringify({ probe: 'full-timelapse-metadata', committedFrames: 500, appendCalls, retainedMetadataFrames: frames.length, retainedEncodedBytes: dataBytes, framesAfterZeroByteBudget }))
      expect(frames.length).toBe(500)
      expect(dataBytes).toBe(0)
      expect(framesAfterZeroByteBudget).toBe(500)
      // Acknowledged history must never be revisited by ordinary append/flush.
      const historicalRead = vi.fn(() => new Uint8Array())
      Object.defineProperty(frames[0], 'data', { get: historicalRead, configurable: true })
      for (let index = 500; index < 1000; index++) {
        await commitPreparedTimelapseSnapshot(document, { mode: 'full', capturedAt: index + 1, width: 2, height: 2, changeScore: 1, pixels: new Uint8ClampedArray(16), cache })
        await persistTimelapseFrames(document, api)
      }
      expect(frames).toHaveLength(1000)
      expect(document.timelapse!.snapshots).toBe(frames)
      expect(historicalRead).not.toHaveBeenCalled()
    } finally { cache.composite.dispose() }
  }, 20_000)

  it('pixel-scale detection releases its temporary provider', () => {
    const document = createDocument('audit scale detection', 2, 2, 'rgba', false)
    const before = providers()
    for (let i = 0; i < 20; i++) detectDocumentPixelScale(document)
    const growth = providers() - before
    console.log('AUDIT ' + JSON.stringify({ probe: 'pixel-scale-detection', completedOperations: 20, providerGrowth: growth }))
    expect(growth).toBe(0)
  })

  it('style budgets unregister and can be reused after cleanup', () => {
    const before = providers(), budget = new LayerStyleCacheBudget(1024)
    const blocks = new BudgetedStyleBlockMap(budget)
    const block = { x: 0, y: 0, width: 1, height: 1, pixels: new Uint8ClampedArray(4) }
    blocks.set('first', block as Parameters<typeof blocks.set>[1])
    expect(providers()).toBe(before + 1)
    budget.dispose()
    expect(providers()).toBe(before)
    blocks.set('reactivated', block as Parameters<typeof blocks.set>[1])
    expect(providers()).toBe(before + 1)
    budget.clear()
    expect(providers()).toBe(before)
  })

  it('cache manager prunes collected owners without retaining their provider', () => {
    const references: { deref: () => object | undefined }[] = []
    class FakeWeakRef {
      value: object | undefined
      constructor(value: object) { this.value = value; references.push(this) }
      deref() { return this.value }
    }
    vi.stubGlobal('WeakRef', FakeWeakRef)
    const manager = new GlobalCacheManager()
    const unregister = manager.register({ name: 'test', snapshot: () => ({ name: 'test', cachedBytes: 10, itemCount: 1 }) })
    expect(manager.totalBytes()).toBe(10)
    ;(references[0] as FakeWeakRef).value = undefined
    expect(manager.snapshot()).toEqual([])
    unregister()
    expect(manager.snapshot()).toEqual([])
  })

  it.each(['metadata', 'bytes'])('full recording pauses at the %s limit without trimming old frames', async limit => {
    const document = createDocument('recording capacity', 1, 1, 'rgba', true)
    document.timelapse!.mode = 'full'
    const prior = { id: 'old', capturedAt: 0, elapsedMs: 0, width: 1, height: 1, data: new Uint8Array() }
    document.timelapse!.snapshots = limit === 'metadata' ? Array(TIMELAPSE_FULL_FRAME_LIMIT).fill(prior) : [{ ...prior, data: { byteLength: TIMELAPSE_SNAPSHOT_BYTE_BUDGET } as Uint8Array }]
    const frames = document.timelapse!.snapshots, before = frames.length
    await expect(commitPreparedTimelapseSnapshot(document, { mode: 'full', capturedAt: 1, width: 1, height: 1, changeScore: 1, pixels: new Uint8ClampedArray(4) })).rejects.toThrow('暂停录制')
    expect(document.timelapse!.enabled).toBe(false)
    expect(document.timelapse!.snapshots).toBe(frames)
    expect(frames).toHaveLength(before)
  })

  it('recovery keeps only the latest pending revision and retries failed writes', async () => {
    const document = createDocument('latest recovery', 1, 1, 'rgba', false)
    const service = new RecoveryService()
    let release!: () => void
    const gate = new Promise<void>(resolve => { release = resolve })
    const write = vi.fn(async () => { if (write.mock.calls.length === 1) await gate })
    const api = { writeRecovery: write } as unknown as MoonSpriteApi
    const operations = [service.autosave(api, [{ id: document.id, document, revision: 0 }])]
    await vi.waitFor(() => expect(write).toHaveBeenCalledTimes(1))
    for (let revision = 1; revision <= 20; revision++) operations.push(service.autosave(api, [{ id: document.id, document, revision }]))
    release()
    await Promise.all(operations)
    expect(write).toHaveBeenCalledTimes(2)
    await service.autosave(api, [{ id: document.id, document, revision: 20 }])
    expect(write).toHaveBeenCalledTimes(2)
    write.mockRejectedValueOnce(new Error('disk full'))
    await expect(service.autosave(api, [{ id: document.id, document, revision: 21 }])).rejects.toThrow('自动恢复保存失败')
    await service.autosave(api, [{ id: document.id, document, revision: 21 }])
    expect(write).toHaveBeenCalledTimes(4)
  })

  it('capacity suspension remains flushable and does not retain a failed recording task', async () => {
    const session = sessionFromDocument(createDocument('capacity flush', 1, 1, 'rgba', true))
    session.document.timelapse!.mode = 'full'
    const frame = { id: 'old', capturedAt: 0, elapsedMs: 0, width: 1, height: 1, data: new Uint8Array() }
    session.document.timelapse!.snapshots = Array(TIMELAPSE_FULL_FRAME_LIMIT).fill(frame)
    const committed = vi.fn(), error = vi.fn()
    const recording = createWorkspaceRecording(committed, error)
    recording.recordDocumentOperation(session)
    await recording.flushTimelapseCapture(session)
    expect(recording.pendingCount(session.document)).toBe(0)
    expect(session.document.timelapse!.enabled).toBe(false)
    expect(session.document.timelapse!.snapshots).toHaveLength(TIMELAPSE_FULL_FRAME_LIMIT)
    expect(error).toHaveBeenCalledWith(expect.stringContaining('暂停录制'))
    await expect(recording.flushTimelapseCapture(session)).resolves.toBeUndefined()
  })

  it('a failed durable frame followed by capacity suspension remains flushable after disk recovery', async () => {
    const session = sessionFromDocument(createDocument('capacity retry', 1, 1, 'rgba', true))
    session.document.timelapse!.mode = 'full'
    session.document.timelapse!.snapshots = Array(TIMELAPSE_FULL_FRAME_LIMIT - 1).fill({ id: 'old', capturedAt: 0, elapsedMs: 0, width: 1, height: 1, data: new Uint8Array() })
    const originalApi = Object.getOwnPropertyDescriptor(window, 'moonSprite')
    const append = vi.fn(async (store: string, bytes: Uint8Array) => ({ store, chunk: 'capacity-retry', offset: 0, length: bytes.length, checksum: 1 }))
    append.mockRejectedValueOnce(new Error('disk full'))
    Object.defineProperty(window, 'moonSprite', { configurable: true, value: { appendTimelapseFrame: append } })
    const report = vi.fn(), recording = createWorkspaceRecording(() => {}, report)
    try {
      recording.recordDocumentOperation(session)
      recording.recordDocumentOperation(session)
      await vi.waitFor(() => expect(append).toHaveBeenCalledTimes(1))
      await new Promise(resolve => setTimeout(resolve, 0))
      expect(recording.pendingCount(session.document)).toBe(2)
      await recording.flushTimelapseCapture(session)
      expect(recording.pendingCount(session.document)).toBe(0)
      expect(session.document.timelapse!.snapshots).toHaveLength(TIMELAPSE_FULL_FRAME_LIMIT)
      expect(session.document.timelapse!.enabled).toBe(false)
      expect(report).toHaveBeenCalledWith(expect.stringContaining('暂停录制'))
      await expect(recording.flushTimelapseCapture(session)).resolves.toBeUndefined()
    } finally {
      recording.cancelPending(session.document)
      if (originalApi) Object.defineProperty(window, 'moonSprite', originalApi); else Reflect.deleteProperty(window, 'moonSprite')
    }
  })

  it('deletion invalidates an in-flight font load without registering its stale result', async () => {
    const faces = new Set<object>(), originalFonts = Object.getOwnPropertyDescriptor(document, 'fonts'), originalApi = Object.getOwnPropertyDescriptor(window, 'moonSprite')
    const font = { id: 'slow-font', family: 'SlowFont', filePath: 'slow.ttf', imported: true }
    let release!: () => void
    const gate = new Promise<void>(resolve => { release = resolve })
    class FakeFontFace { async load() { await gate; return this } }
    vi.stubGlobal('FontFace', FakeFontFace)
    Object.defineProperty(document, 'fonts', { configurable: true, value: faces })
    Object.defineProperty(window, 'moonSprite', { configurable: true, value: { listFonts: async () => ({ fonts: [font] }), readBinary: async () => new Uint8Array(1), deleteFont: async () => undefined } })
    try {
      const loading = loadTextFontCatalog()
      await Promise.resolve(); await Promise.resolve()
      await deleteTextFont({ ...font, source: 'imported' })
      release()
      await loading
      expect(faces.size).toBe(0)
    } finally {
      release()
      resetTextFontServiceForTests()
      if (originalFonts) Object.defineProperty(document, 'fonts', originalFonts); else Reflect.deleteProperty(document, 'fonts')
      if (originalApi) Object.defineProperty(window, 'moonSprite', originalApi); else Reflect.deleteProperty(window, 'moonSprite')
    }
  })
})
