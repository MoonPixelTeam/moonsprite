import { afterEach, expect, it, vi } from 'vitest'
import { pendingGradientFor, setPendingGradient, type PendingGradient } from '@/core/canvas-gradient-confirmation'
import { resolvePendingGradientForIo } from './pending-gradient-io'
import { createApplicationCloseCoordinator, type ApplicationClosePorts } from './workspace-close-coordinator'
import { sessionFromDocument } from './workspace-session'
import { createDocument } from '@/core/document-model'
import { useWorkspace } from './workspace'

afterEach(() => { setPendingGradient('io', null); useWorkspace.setState({ sessions: [], activeId: null }) })
function preview() {
  const pending = { drag: {}, targetLayer: {}, apply: vi.fn(() => { setPendingGradient('io', null); return true }), cancel: vi.fn(() => setPendingGradient('io', null)) } as unknown as PendingGradient
  setPendingGradient('io', pending)
  return pending
}
it.each(['apply', 'discard', 'cancel'])('resolves %s before file IO and preserves editing on cancel', async choice => {
  const pending = preview(), activate = vi.fn()
  expect(await resolvePendingGradientForIo('io', vi.fn(async () => choice), activate)).toBe(choice !== 'cancel')
  expect(pending.apply).toHaveBeenCalledTimes(choice === 'apply' ? 1 : 0)
  expect(pending.cancel).toHaveBeenCalledTimes(choice === 'discard' ? 1 : 0)
  expect(activate).toHaveBeenCalledTimes(choice === 'apply' ? 1 : 0)
  expect(Boolean(pendingGradientFor('io'))).toBe(choice === 'cancel')
})
it('does not continue file IO after failed application or replacement during the dialog', async () => {
  const pending = preview(); pending.apply = vi.fn(() => false)
  expect(await resolvePendingGradientForIo('io', async () => 'apply', vi.fn())).toBe(false)
  expect(pendingGradientFor('io')).toBe(pending)
  expect(await resolvePendingGradientForIo('io', async () => { preview(); return 'apply' }, vi.fn())).toBe(false)
})
it.each(['saveActive', 'exportActive', 'closeDocument'] as const)('%s waits for the gradient decision even on a clean document', async operation => {
  const session = sessionFromDocument(createDocument('io', 2, 2, 'rgba')); session.document.id = 'io'; session.document.dirty = false
  const original = useWorkspace.getState().requestDialog
  const requestDialog = vi.fn(async () => 'cancel')
  useWorkspace.setState({ sessions: [session], activeId: 'io', requestDialog })
  preview()
  try {
    const state = useWorkspace.getState()
    if (operation === 'closeDocument') await state.closeDocument('io')
    else await state[operation]()
    expect(requestDialog).toHaveBeenCalledOnce()
    expect(pendingGradientFor('io')).not.toBeNull()
    expect(useWorkspace.getState().sessions).toContain(session)
  } finally { useWorkspace.setState({ requestDialog: original }) }
})
it('whole-app close asks about pending gradients in clean documents before dirty checks', async () => {
  const session = sessionFromDocument(createDocument('clean', 2, 2, 'rgba')); session.document.dirty = false
  const approve = vi.fn(), cancel = vi.fn(), confirm = vi.fn()
  const resolvePending = vi.fn(async () => false)
  await createApplicationCloseCoordinator({ hasDialog: () => false, sessions: () => [session], prepare: async () => {},
    waitForSaves: async () => true, resolvePending, confirm, approve, cancel,
    reportError: vi.fn() } as unknown as ApplicationClosePorts)()
  expect(resolvePending).toHaveBeenCalledWith(session)
  expect(confirm).not.toHaveBeenCalled(); expect(approve).not.toHaveBeenCalled(); expect(cancel).toHaveBeenCalledOnce()
})
