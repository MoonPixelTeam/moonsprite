import { beforeEach, describe, expect, it } from 'vitest'
import { createDocument, getActiveLayer, readLayerColorAt, writeLayerColor } from '@/core/document'
import { applySelectionTransform, applySelectionTranslationPreview, captureSelectionTransform } from '@/core/tools'
import { useWorkspace } from './workspace'

const red = { r: 255, g: 0, b: 0, a: 255 }
const blue = { r: 0, g: 80, b: 255, a: 255 }
const transparent = { r: 0, g: 0, b: 0, a: 0 }

/**
 * A selection content move is materialized into the document while the drag
 * ends: the CanvasStage finish handler writes the translation and then still
 * hands the drag over as a deferred floating paste. Rolling that move back used
 * to skip the materialized edit entirely, so cancel and undo left the moved
 * pixels in the document (the overlay kept drawing them at the new position)
 * until an unrelated edit such as toggling a layer's eye forced a repaint.
 */
const beginMaterializedMove = (name: string, previewDeferred = true) => {
  const document = createDocument(name, 200, 1, 'rgba')
  const layer = getActiveLayer(document)
  // `writeLayerColor` takes a linear pixel index; `readLayerColorAt` takes x/y.
  for (let index = 0; index < 100; index += 1) writeLayerColor(document, layer, index, index % 2 === 0 ? red : blue)
  useWorkspace.getState().addSession(document)
  const selection = { x: 0, y: 0, width: 100, height: 1 }
  useWorkspace.getState().setSelection(selection)
  const source = captureSelectionTransform(document, selection, layer)!
  const target = { x: 100, y: 0, width: 100, height: 1 }
  const previewEdit = applySelectionTransform(document, source, target, 0, false, undefined, undefined, undefined, layer)
  if (!previewEdit) throw new Error('expected a materialized selection translation edit')
  useWorkspace.getState().beginFloatingSelectionTransform(
    source,
    previewEdit,
    selection,
    { ...selection, x: 100 },
    false,
    'moveSelectionContent',
    null,
    target,
    0,
    undefined,
    previewDeferred
  )
  const session = useWorkspace.getState().sessions.find((candidate) => candidate.document === document)!
  return { document, layer, session }
}

describe('floating selection rollback', () => {
  beforeEach(() => {
    useWorkspace.setState({ sessions: [], activeId: null, message: null })
  })

  it('restores the materialized pixels when a deferred floating move is cancelled', () => {
    const { document, layer, session } = beginMaterializedMove('cancel materialized move')
    expect(session.pendingPaste).not.toBeNull()
    expect(session.pendingPaste?.previewDeferred).toBe(true)
    expect(readLayerColorAt(document, layer, 0, 0)).toEqual(transparent)
    expect(readLayerColorAt(document, layer, 100, 0)).toEqual(red)

    useWorkspace.getState().cancelFloatingPaste()

    const afterCancel = useWorkspace.getState().sessions.find((candidate) => candidate.document === document)!
    expect(afterCancel.pendingPaste).toBeNull()
    expect(readLayerColorAt(document, layer, 0, 0)).toEqual(red)
    expect(readLayerColorAt(document, layer, 1, 0)).toEqual(blue)
    expect(readLayerColorAt(document, layer, 100, 0)).toEqual(transparent)
  })

  it('restores the materialized pixels when a deferred floating move is undone', () => {
    const { document, layer, session } = beginMaterializedMove('undo materialized move')
    expect(session.pendingPaste).not.toBeNull()
    const beforeUndo = session.revision

    useWorkspace.getState().undo()

    const afterUndo = useWorkspace.getState().sessions.find((candidate) => candidate.document === document)!
    expect(afterUndo.pendingPaste).toBeNull()
    expect(afterUndo.selection).toMatchObject({ x: 0, y: 0, width: 100, height: 1 })
    expect(readLayerColorAt(document, layer, 0, 0)).toEqual(red)
    expect(readLayerColorAt(document, layer, 1, 0)).toEqual(blue)
    expect(readLayerColorAt(document, layer, 100, 0)).toEqual(transparent)
    // The canvas repaint effect keys on `session.revision`, so the rollback has
    // to advance it or the stale frame stays on screen.
    expect(afterUndo.revision).toBeGreaterThan(beforeUndo)
  })

  it('still restores the materialized pixels when the floating move is not flagged deferred', () => {
    const { document, layer, session } = beginMaterializedMove('undo plain floating move', false)
    expect(session.pendingPaste?.previewDeferred).toBe(false)
    const beforeUndo = session.revision

    useWorkspace.getState().undo()

    const afterUndo = useWorkspace.getState().sessions.find((candidate) => candidate.document === document)!
    expect(readLayerColorAt(document, layer, 0, 0)).toEqual(red)
    expect(readLayerColorAt(document, layer, 100, 0)).toEqual(transparent)
    expect(afterUndo.revision).toBeGreaterThan(beforeUndo)
  })

  it('leaves document pixels untouched when only the deferred overlay moved', () => {
    const document = createDocument('cancel overlay only', 200, 1, 'rgba')
    const layer = getActiveLayer(document)
    writeLayerColor(document, layer, 0, red)
    writeLayerColor(document, layer, 1, blue)
    useWorkspace.getState().addSession(document)
    const selection = { x: 0, y: 0, width: 2, height: 1 }
    useWorkspace.getState().setSelection(selection)
    const source = captureSelectionTransform(document, selection, layer)!
    useWorkspace.getState().beginFloatingSelectionTransform(
      source,
      null,
      selection,
      { ...selection, x: 100 },
      false,
      'moveSelectionContent',
      null,
      { x: 100, y: 0, width: 2, height: 1 },
      0,
      undefined,
      true
    )

    useWorkspace.getState().cancelFloatingPaste()

    expect(readLayerColorAt(document, layer, 0, 0)).toEqual(red)
    expect(readLayerColorAt(document, layer, 1, 0)).toEqual(blue)
    expect(readLayerColorAt(document, layer, 100, 0)).toEqual(transparent)
  })

  it('does not apply a materialized translucent overlap twice on commit', () => {
    const document = createDocument('commit materialized translucent overlap', 4, 1, 'rgba')
    const layer = getActiveLayer(document)
    const first = { r: 240, g: 40, b: 20, a: 128 }
    const second = { r: 40, g: 220, b: 80, a: 128 }
    writeLayerColor(document, layer, 0, first)
    writeLayerColor(document, layer, 1, second)
    useWorkspace.getState().addSession(document)
    const selection = { x: 0, y: 0, width: 2, height: 1 }
    useWorkspace.getState().setSelection(selection)
    const source = captureSelectionTransform(document, selection, layer)!
    const preview = applySelectionTranslationPreview(document, source, { x: 1, y: 0, width: 2, height: 1 }, false, null, layer)
    useWorkspace.getState().beginFloatingSelectionTransform(
      source,
      null,
      selection,
      { ...selection, x: 1 },
      false,
      'moveSelectionContent',
      preview,
      { x: 1, y: 0, width: 2, height: 1 },
      0,
      undefined,
      true
    )
    useWorkspace.getState().commitFloatingPaste()

    const session = useWorkspace.getState().sessions.find((candidate) => candidate.document === document)!
    expect(session.pendingPaste).toBeNull()
    expect(readLayerColorAt(document, layer, 1, 0)).toEqual(first)
  })
})
