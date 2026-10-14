import { afterEach, expect, it } from 'vitest'
import { createDocument, createLayer, getActiveLayer, readLayerColorAt, writeLayerColor } from '@/core/document'
import { addBlankAnimationFrame, animationCelKey, ensureAnimationDocument, syncActiveAnimationFrame } from '@/core/animation'
import { useWorkspace } from './workspace'

afterEach(() => useWorkspace.setState({ sessions: [], activeId: null }))

it.each(['horizontal', 'vertical'] as const)('keeps a small %s flip local on an 81-layer large canvas', (axis) => {
  const document = createDocument('large flip', 4850, 1767, 'rgba')
  const layer = getActiveLayer(document)
  for (let i = 1; i < 81; i++) document.layers.push(createLayer(`background ${i}`, 1, 1, 'rgba'))
  document.activeLayerId = layer.id
  const color = { r: 255, g: 35, b: 12, a: 255 }
  writeLayerColor(document, layer, 40 * layer.width + 30, color)
  syncActiveAnimationFrame(document)
  const commands = useWorkspace.getState()
  commands.addSession(document)
  commands.setSelection({ x: 30, y: 40, width: 100, height: 80 })
  const session = useWorkspace.getState().sessions[0]
  const revision = session.contentRevision
  const position = session.history.position
  commands.flipActiveSelection(axis)
  const dx = axis === 'horizontal' ? 129 : 30
  const dy = axis === 'vertical' ? 119 : 40
  expect(readLayerColorAt(document, layer, dx, dy)).toEqual(color)
  expect(readLayerColorAt(document, layer, 30, 40).a).toBe(0)
  expect(session.contentInvalidation).toMatchObject({ kind: 'region', fromRevision: revision, revision: revision + 1 })
  if (session.contentInvalidation?.kind !== 'region') throw new Error('Expected local flip invalidation')
  const rect = session.contentInvalidation.rect
  expect(rect.x).toBeGreaterThanOrEqual(30)
  expect(rect.y).toBeGreaterThanOrEqual(40)
  expect(rect.x + rect.width).toBeLessThanOrEqual(130)
  expect(rect.y + rect.height).toBeLessThanOrEqual(120)
  expect(session.history.position).toBe(position + 1)
  commands.undo()
  expect(readLayerColorAt(document, layer, 30, 40)).toEqual(color)
  expect(readLayerColorAt(document, layer, dx, dy).a).toBe(0)
  commands.redo()
  expect(readLayerColorAt(document, layer, dx, dy)).toEqual(color)
})

it('retains full invalidation for flips spanning multiple frames', () => {
  const document = createDocument('multi-frame flip', 4, 2, 'rgba')
  const layer = getActiveLayer(document)
  writeLayerColor(document, layer, 0, { r: 255, g: 0, b: 0, a: 255 })
  const timeline = ensureAnimationDocument(document)
  const first = timeline.activeFrameId
  const second = addBlankAnimationFrame(document)
  writeLayerColor(document, layer, 0, { r: 0, g: 255, b: 0, a: 255 })
  syncActiveAnimationFrame(document)
  const commands = useWorkspace.getState()
  commands.addSession(document)
  commands.setSelection({ x: 0, y: 0, width: 4, height: 2 })
  commands.selectAnimationCell(animationCelKey(layer.id, first))
  commands.selectAnimationCell(animationCelKey(layer.id, second), 'toggle')
  commands.flipActiveSelection('horizontal')
  expect(useWorkspace.getState().sessions[0].contentInvalidation?.kind).toBe('full')
})
