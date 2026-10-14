import { describe, expect, it } from 'vitest'
import { DocumentTransactionRegistry } from './document-transactions'

describe('document transaction cancellation', () => {
  it.each(['single', 'document', 'kind'] as const)('retains a failed %s cancellation for retry', (mode) => {
    const registry = new DocumentTransactionRegistry<{ value: number }>()
    const session = { value: 2 }
    let fail = true
    const first = registry.begin('doc', 'preview', 0, (state, before) => { if (fail) throw new Error('injected'); state.value = before })
    if (mode !== 'single') registry.begin('doc', 'preview', 1, (state, before) => { state.value = before })
    const cancel = () => mode === 'single' ? registry.cancel(first, session) : mode === 'document' ? registry.cancelDocument('doc', session) : registry.cancelKind('doc', 'preview', session)
    expect(cancel).toThrow('injected')
    expect(registry.get(first, 'doc', 'preview')).not.toBeNull()
    expect(session.value).toBe(mode === 'single' ? 2 : 1)
    fail = false
    expect(cancel()).toBe(true)
    expect(session.value).toBe(0)
    expect(registry.get(first, 'doc', 'preview')).toBeNull()
  })
})
