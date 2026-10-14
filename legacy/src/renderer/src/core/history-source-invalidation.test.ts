import { expect, it } from 'vitest'
import { HistoryStack, historyEntryInvalidation, type HistoryEntry } from './history'

const entry = (ids?: string[]): HistoryEntry => ({
  label: 'edit', bytes: 0, undo() {}, redo() {}, affectedLayerIds: ids,
  invalidation: { kind: 'region', rect: { x: 0, y: 0, width: 2, height: 2 } }
})

it('combines known owners without narrowing compounds containing unknown source edits', () => {
  for (const known of [true, false]) {
    const history = new HistoryStack()
    history.beginCompound()
    history.push(entry(['a']))
    history.push(entry(known ? ['b'] : undefined))
    history.endCompound('combined')
    const result = historyEntryInvalidation(history.undo()!)
    expect(result?.kind === 'region' ? result.sourceLayerIds : null).toEqual(known ? ['a', 'b'] : undefined)
  }
})

it('preserves full, property and explicit source invalidations', () => {
  expect(historyEntryInvalidation({ ...entry(['a']), invalidation: { kind: 'full' } })).toEqual({ kind: 'full' })
  const property = { ...entry(['a']), invalidation: { kind: 'region' as const, rect: { x: 0, y: 0, width: 2, height: 2 }, compositeOnly: true as const } }
  expect(historyEntryInvalidation(property)).toBe(property.invalidation)
  const explicit = { ...entry(['a']), invalidation: { kind: 'region' as const, rect: { x: 0, y: 0, width: 2, height: 2 }, sourceLayerIds: ['mask'] } }
  expect(historyEntryInvalidation(explicit)).toBe(explicit.invalidation)
})
