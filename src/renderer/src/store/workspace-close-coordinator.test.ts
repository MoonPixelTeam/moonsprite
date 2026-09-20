import { describe, expect, it, vi } from 'vitest'
import { createDocument } from '@/core/document-model'
import { sessionFromDocument } from './workspace-session'
import { createApplicationCloseCoordinator, resolveDocumentClose, type ApplicationClosePorts } from './workspace-close-coordinator'
import { runDocumentSave, waitForDocumentSaves } from './document-save-tasks'

function ports(): ApplicationClosePorts {
  return {
    hasDialog: () => false,
    sessions: () => [],
    prepare: vi.fn(async () => {}),
    waitForSaves: vi.fn(async () => true),
    flushRecordings: vi.fn(async () => {}),
    confirm: vi.fn(async () => 'discard' as const),
    discardRecovery: vi.fn(async () => {}),
    waitForDocumentCloses: vi.fn(async () => {}),
    flushHistory: vi.fn(async () => {}),
    approve: vi.fn(), cancel: vi.fn(), reportError: vi.fn()
  }
}

describe('document and application close coordination', () => {
  it.each([false, true])('waits for an existing save before checking dirty state (initial dirty: %s)', async dirty => {
    const p = ports(), session = sessionFromDocument(createDocument('saving', 2, 2, 'rgba'))
    session.document.dirty = dirty
    p.sessions = () => [session]
    p.waitForSaves = waitForDocumentSaves
    let finish!: () => void
    const save = runDocumentSave(session.document.id, async () => {
      await new Promise<void>(resolve => { finish = resolve })
      session.document.dirty = false
      return true
    })
    const close = createApplicationCloseCoordinator(p)
    const closing = close()
    await vi.waitFor(() => expect(p.prepare).toHaveBeenCalledTimes(1))
    await close()
    expect(p.confirm).not.toHaveBeenCalled()
    expect(p.approve).not.toHaveBeenCalled()
    finish()
    await Promise.all([save, closing])
    expect(p.confirm).not.toHaveBeenCalled()
    expect(p.approve).toHaveBeenCalledTimes(1)
  })

  it('waits for a save started during the final history flush', async () => {
    const p = ports(), session = sessionFromDocument(createDocument('late save', 2, 2, 'rgba'))
    session.document.dirty = false
    p.sessions = () => [session]
    p.waitForSaves = waitForDocumentSaves
    let finish!: () => void
    p.flushHistory = vi.fn(async () => {
      void runDocumentSave(session.document.id, () => new Promise(resolve => { finish = () => resolve(true) }))
    })
    const closing = createApplicationCloseCoordinator(p)()
    await vi.waitFor(() => expect(p.flushHistory).toHaveBeenCalledTimes(1))
    expect(p.approve).not.toHaveBeenCalled()
    finish()
    await closing
    expect(p.approve).toHaveBeenCalledTimes(1)
  })

  it('cancels exit if an ongoing save fails', async () => {
    const p = ports()
    p.waitForSaves = waitForDocumentSaves
    let finish!: () => void
    const save = runDocumentSave('failed save', () => new Promise(resolve => { finish = () => resolve(false) }))
    const closing = createApplicationCloseCoordinator(p)()
    await vi.waitFor(() => expect(p.prepare).toHaveBeenCalledTimes(1))
    finish()
    await Promise.all([save, closing])
    expect(p.approve).not.toHaveBeenCalled()
    expect(p.cancel).toHaveBeenCalledTimes(1)
  })

  it('uses the same save-failure and unknown-choice cancellation rule for both close paths', async () => {
    const save = vi.fn(async () => false)
    expect(await resolveDocumentClose(true, async () => 'save', save)).toBe('cancel')
    expect(await resolveDocumentClose(true, async () => 'unexpected', save)).toBe('cancel')
    expect(save).toHaveBeenCalledTimes(1)
  })

  it('waits for history persistence and coalesces duplicate exit requests', async () => {
    const p = ports(), session = sessionFromDocument(createDocument('saved', 2, 2, 'rgba'))
    session.document.dirty = false
    p.sessions = () => [session]
    let finish!: () => void
    p.flushHistory = vi.fn(() => new Promise<void>((resolve) => { finish = resolve }))
    const close = createApplicationCloseCoordinator(p)
    const task = close()
    await vi.waitFor(() => expect(p.flushHistory).toHaveBeenCalledTimes(1))
    await close()
    expect(p.approve).not.toHaveBeenCalled()
    finish()
    await task
    expect(p.waitForDocumentCloses).toHaveBeenCalledTimes(2)
    expect(p.approve).toHaveBeenCalledTimes(1)
  })

  it('reports a recovery failure, cancels exit and allows retry', async () => {
    const p = ports(), session = sessionFromDocument(createDocument('dirty', 2, 2, 'rgba'))
    session.document.dirty = true
    p.sessions = () => [session]
    p.discardRecovery = vi.fn().mockRejectedValueOnce(new Error('disk failed')).mockResolvedValue(undefined)
    const close = createApplicationCloseCoordinator(p)
    await close()
    expect(p.reportError).toHaveBeenCalledTimes(1)
    expect(p.cancel).toHaveBeenCalledTimes(1)
    expect(p.approve).not.toHaveBeenCalled()
    await close()
    expect(p.approve).toHaveBeenCalledTimes(1)
  })
})
