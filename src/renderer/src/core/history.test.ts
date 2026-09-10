import { describe, expect, it } from 'vitest'
import { createDocument, createLayer, expandLayerToRect, getActiveLayer, readLayerPacked } from './document'
import { beginPixelEdit, commitPixelEdit, HistoryStack, recordPixel, recordPixelKnownCurrent } from './history'

const entry = (state: { value: number }, next: number, label = 'edit') => ({
  label,
  bytes: 10,
  undo: () => { state.value -= 1 },
  redo: () => { state.value = next }
})

describe('HistoryStack', () => {
  it('commits known-current pixel writes without retaining reverted pixels', () => {
    const document = createDocument('pixel history', 3, 2, 'rgba')
    const layer = getActiveLayer(document)
    const edit = beginPixelEdit(layer.id)
    const blue = 0xfff07929

    recordPixelKnownCurrent(document, layer, edit, 0, 0, blue)
    recordPixel(document, layer, edit, 1, blue)
    recordPixel(document, layer, edit, 0, 0)

    expect(edit.dirtyRect).toEqual({ x: 0, y: 0, width: 2, height: 1 })
    const committed = commitPixelEdit(document, edit, 'paint')!
    expect(committed.bytes).toBe(16)
    expect(committed.affectedLayerIds).toEqual([layer.id])
    expect(committed.invalidation).toEqual({ kind: 'region', frameId: document.animation?.activeFrameId, rect: { x: 0, y: 0, width: 2, height: 1 } })

    committed.undo()
    expect(readLayerPacked(document, layer, 0)).toBe(0)
    expect(readLayerPacked(document, layer, 1)).toBe(0)
    committed.redo()
    expect(readLayerPacked(document, layer, 0)).toBe(0)
    expect(readLayerPacked(document, layer, 1)).toBe(blue)
  })

  it('stores dense RGBA edits as contiguous row patches across later layer expansion', () => {
    const document = createDocument('dense rgba history', 64, 64, 'rgba')
    const layer = getActiveLayer(document)
    const edit = beginPixelEdit(layer.id)
    const blue = 0xfff07929

    for (let y = 12; y < 36; y += 1) for (let x = 10; x < 42; x += 1) {
      recordPixel(document, layer, edit, y * layer.width + x, blue)
    }
    const committed = commitPixelEdit(document, edit, 'dense paint')!
    expect(committed.bytes).toBe(32 * 24 * 8)

    expect(expandLayerToRect(layer, -8, -6, 64, 64)).toBe(true)
    committed.undo()
    expect(readLayerPacked(document, layer, (12 - layer.offsetY) * layer.width + 10 - layer.offsetX)).toBe(0)
    committed.redo()
    expect(readLayerPacked(document, layer, (35 - layer.offsetY) * layer.width + 41 - layer.offsetX)).toBe(blue)
  })

  it('stores dense indexed edits in native row patches', () => {
    const document = createDocument('dense indexed history', 48, 48, 'indexed')
    const layer = getActiveLayer(document)
    const edit = beginPixelEdit(layer.id)

    for (let y = 8; y < 28; y += 1) for (let x = 6; x < 34; x += 1) {
      recordPixel(document, layer, edit, y * layer.width + x, 1)
    }
    const committed = commitPixelEdit(document, edit, 'dense indexed paint')!
    expect(committed.bytes).toBe(28 * 20 * 8)

    committed.undo()
    expect(readLayerPacked(document, layer, 8 * layer.width + 6)).toBe(0)
    committed.redo()
    expect(readLayerPacked(document, layer, 27 * layer.width + 33)).toBe(1)
  })

  it('keeps memory accounting consistent across undo and redo', () => {
    const state = { value: 1 }
    const history = new HistoryStack()
    history.push(entry(state, 2))
    expect(history.memoryBytes).toBe(10)
    history.undo()
    expect(history.memoryBytes).toBe(0)
    history.redo()
    expect(history.memoryBytes).toBe(10)
  })

  it('notifies local-history observers only after committed stack transitions', () => {
    const history = new HistoryStack()
    const changes: string[] = []
    history.setChangeListener((change) => changes.push(change.kind))
    history.beginCompound()
    history.push(entry({ value: 0 }, 1, 'first'))
    expect(changes).toEqual([])
    history.endCompound('compound')
    history.undo()
    history.redo()
    history.clear()
    expect(changes).toEqual(['push', 'undo', 'redo', 'clear'])
  })

  it('preserves an entry when undo or redo throws', () => {
    const history = new HistoryStack()
    history.push({ label: 'bad undo', bytes: 7, undo: () => { throw new Error('undo') }, redo: () => undefined })
    expect(() => history.undo()).toThrow('undo')
    expect(history.canUndo).toBe(true)
    expect(history.memoryBytes).toBe(7)

    history.clear()
    history.push({ label: 'bad redo', bytes: 9, undo: () => undefined, redo: () => { throw new Error('redo') } })
    history.undo()
    expect(() => history.redo()).toThrow('redo')
    expect(history.canRedo).toBe(true)
    expect(history.memoryBytes).toBe(0)
  })







  it('rolls back every buffered entry when a compound transaction aborts', () => {
    const state = { value: 2 }
    const history = new HistoryStack()
    history.beginCompound()
    history.push(entry(state, 1, 'first'))
    history.push(entry(state, 2, 'second'))
    history.abortCompound()

    expect(state.value).toBe(0)
    expect(history.canUndo).toBe(false)
    expect(history.canRedo).toBe(false)
  })






})
