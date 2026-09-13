import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDocument } from '@/core/document'
import type { SpriteSheetExportOptions } from '@/core/sprite-sheet'
import { useWorkspace } from './workspace'

const mocks = vi.hoisted(() => ({ exportFile: vi.fn(), play: vi.fn() }))
vi.mock('./document-file-service', async (original) => ({
  ...await original<typeof import('./document-file-service')>(),
  exportDocumentFile: mocks.exportFile,
  exportSpriteSheetFile: mocks.exportFile,
  exportTimelapseFile: mocks.exportFile
}))
vi.mock('@/platform/export-success-sound', () => ({ playExportSuccessSound: mocks.play }))
vi.mock('@/platform/usage-statistics', () => ({ recordUsageEvent: vi.fn(), recordUsageExport: vi.fn() }))

beforeEach(() => {
  localStorage.clear()
  vi.clearAllMocks()
  // Exercise the sprite-sheet worker route without invoking a real encoder.
  vi.stubGlobal('Worker', class {})
  useWorkspace.setState({ sessions: [], activeId: null, message: null, saveProgress: null })
  useWorkspace.getState().addSession(createDocument('sound export', 2, 2, 'rgba'))
})
afterEach(() => { vi.unstubAllGlobals(); localStorage.clear() })

const spriteSheetOptions: SpriteSheetExportOptions = {
  layout: 'horizontal', constraint: 'none', fixedColumns: 1, fixedWidth: 2, fixedRows: 1, fixedHeight: 2,
  mergeDuplicates: false, ignoreEmpty: false, area: 'canvas', layerScope: 'all', splitLayers: false,
  frameScope: 'all', splitLoopSections: false, outputFile: true, name: 'sheet', directory: 'D:/exports'
}

describe.each(['document', 'timelapse', 'sprite-sheet'] as const)('%s export completion sound', (kind) => {
  it.each(['success', 'cancel', 'failure'] as const)('plays once only after a %s job has finished', async (outcome) => {
    let resolve!: (value: string | null) => void
    let reject!: (reason: Error) => void
    mocks.exportFile.mockReturnValue(new Promise<string | null>((done, fail) => { resolve = done; reject = fail }))
    const store = useWorkspace.getState()
    const pending = kind === 'document' ? store.exportActive({ target: 'frames', format: 'png-rgba', name: 'frames', scalePercent: 100 })
      : kind === 'timelapse' ? store.exportTimelapse('png', { mode: 'duration', durationSeconds: 1 })
        : store.exportSpriteSheet(spriteSheetOptions)
    await vi.waitFor(() => expect(mocks.exportFile).toHaveBeenCalledTimes(1))
    expect(mocks.play).not.toHaveBeenCalled()
    if (outcome === 'failure') reject(new Error('disk full'))
    else resolve(outcome === 'success' ? 'export complete' : null)
    await expect(pending).resolves.toBe(outcome === 'success')
    expect(mocks.play).toHaveBeenCalledTimes(outcome === 'success' ? 1 : 0)
  })
})
