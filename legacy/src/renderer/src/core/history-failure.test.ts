import { describe, expect, it } from 'vitest'
import { HistoryStack } from './history'

describe('history replay failure recovery', () => {
  it.each(['undo', 'redo', 'abort', 'discard'] as const)('retains state and records when %s fails mid-operation', (operation) => {
    const history = new HistoryStack()
    let value = 2
    let fail = true
    const first = { label: 'first', bytes: 10, undo: () => { if (fail && operation !== 'redo') throw new Error('injected'); value = 0 }, redo: () => { value = 1 } }
    const second = { label: 'second', bytes: 20, undo: () => { value = 1 }, redo: () => { if (fail && operation === 'redo') throw new Error('injected'); value = 2 } }
    if (operation !== 'discard') history.beginCompound()
    history.push(first)
    history.push(second)
    if (operation === 'undo' || operation === 'redo') history.endCompound('combined')
    if (operation === 'redo') history.undo()
    const replay = () => operation === 'abort' ? history.abortCompound() : operation === 'discard' ? history.discardToPosition(0) : history[operation]()
    const revision = history.revision
    const bytes = history.memoryBytes
    expect(replay).toThrow('injected')
    expect(value).toBe(operation === 'redo' ? 0 : 2)
    expect(history.revision).toBe(revision)
    expect(history.memoryBytes).toBe(bytes)
    fail = false
    replay()
    expect(value).toBe(operation === 'redo' ? 2 : 0)
    if (operation === 'undo') { history.redo(); expect(value).toBe(2) }
  })

  it('reports both replay and compensation failures', () => {
    const history = new HistoryStack()
    history.beginCompound()
    history.push({ label: 'first', bytes: 1, undo: () => { throw new Error('undo failure') }, redo: () => {} })
    history.push({ label: 'second', bytes: 1, undo: () => {}, redo: () => { throw new Error('rollback failure') } })
    history.endCompound('combined')
    expect(() => history.undo()).toThrow(AggregateError)
    expect(history.canUndo).toBe(true)
  })
})
