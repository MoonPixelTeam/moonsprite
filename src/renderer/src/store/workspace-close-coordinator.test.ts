import { describe, expect, it, vi } from 'vitest'
import { createDocument } from '@/core/document-model'
import { sessionFromDocument } from './workspace-session'
import { createApplicationCloseCoordinator, resolveDocumentClose, type ApplicationClosePorts } from './workspace-close-coordinator'

function ports(): ApplicationClosePorts {
  return {
    hasDialog: () => false,
    sessions: () => [],
    prepare: vi.fn(async () => {}),
    confirm: vi.fn(async () => 'discard' as const),
    discardRecovery: vi.fn(async () => {}),
    waitForDocumentCloses: vi.fn(async () => {}),
    flushHistory: vi.fn(async () => {}),
    approve: vi.fn(), cancel: vi.fn(), reportError: vi.fn()
  }
}

describe('document and application close coordination', () => {
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
