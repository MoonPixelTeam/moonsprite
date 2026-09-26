import { beforeEach, describe, expect, it } from 'vitest'
import { createDocument } from '@/core/document'
import { expandLayerToRect } from '@/core/document-model'
import { beginPixelEdit, recordPixel } from '@/core/history'
import { readSurfacePackedLocal } from '@/core/runtime-raster'
import { useWorkspace } from './workspace'

beforeEach(() => {
  localStorage.clear()
  useWorkspace.setState({ sessions: [], activeId: null, message: null, dialog: null })
})

describe('cross-layer drawing history', () => {
  it.each([
    ['rgba', 0, 1], ['rgba', -8, 24],
    ['indexed', 0, 1], ['indexed', -8, 24],
  ] as const)('restores %s drawing at offset %i with edge %i across layer creation', async (format, offset, edge) => {
    const document = createDocument('cross-layer history', 64, 64, format)
    useWorkspace.getState().addSession(document)
    const firstId = document.activeLayerId
    const draw = (color: number) => {
      const layer = document.layers.find(layer => layer.id === document.activeLayerId)!
      expect(expandLayerToRect(layer, offset, offset, 64, 64)).toBe(true)
      const edit = beginPixelEdit(layer.id)
      for (let y = 5; y < 5 + edge; y += 1) for (let x = 5; x < 5 + edge; x += 1) {
        recordPixel(document, layer, edit, (y - layer.offsetY) * layer.width + x - layer.offsetX, color)
      }
      useWorkspace.getState().commitPixelEdit(edit, 'draw')
    }
    const pixels = (id: string) => {
      const layer = document.layers.find(layer => layer.id === id)!
      return Array.from({ length: edge * edge }, (_, index) => readSurfacePackedLocal(layer,
        5 + index % edge - layer.offsetX, 5 + Math.floor(index / edge) - layer.offsetY))
    }
    const a = format === 'rgba' ? 0xff0000ff : 1
    const b = format === 'rgba' ? 0xff00ff00 : 2
    draw(a)
    const atA = useWorkspace.getState().sessions[0].history.position
    await useWorkspace.getState().addLayer()
    const secondId = document.activeLayerId
    draw(b)
    const atB = useWorkspace.getState().sessions[0].history.position
    expect(pixels(firstId)).toEqual(Array(edge * edge).fill(a))
    expect(pixels(secondId)).toEqual(Array(edge * edge).fill(b))
    // Plain undo/redo without removing the layer must remain correct too.
    useWorkspace.getState().undo()
    expect(pixels(secondId)).toEqual(Array(edge * edge).fill(0))
    useWorkspace.getState().selectLayer(firstId)
    useWorkspace.getState().redo()
    expect(pixels(secondId)).toEqual(Array(edge * edge).fill(b))
    for (let cycle = 0; cycle < 3; cycle += 1) {
      useWorkspace.getState().setHistoryPosition(atA)
      expect(document.layers.some(layer => layer.id === secondId)).toBe(false)
      expect(pixels(firstId)).toEqual(Array(edge * edge).fill(a))
      useWorkspace.getState().setHistoryPosition(atB)
      expect(pixels(firstId)).toEqual(Array(edge * edge).fill(a))
      expect(pixels(secondId)).toEqual(Array(edge * edge).fill(b))
      expect(document.activeLayerId).toBe(secondId)
    }
  })
})
