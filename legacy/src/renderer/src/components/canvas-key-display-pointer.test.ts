import { afterEach, expect, it, vi } from 'vitest'
import { registerCanvasKeyDisplayPointer } from './canvas-key-display-pointer'

const unregistrations: Array<() => void> = []
afterEach(() => {
  unregistrations.splice(0).forEach((unregister) => unregister())
  document.body.replaceChildren()
})

function pointer(type: string, target: Element, pointerId: number, ctrlKey: boolean): void {
  const event = new Event(type, { bubbles: true })
  Object.assign(event, { pointerId, pointerType: 'mouse', button: 0, ctrlKey, metaKey: false, altKey: false, shiftKey: false })
  target.dispatchEvent(event)
}

it('shows the layer-selection action for every Ctrl+left click in the layer panel', () => {
  const panel = document.createElement('div')
  panel.className = 'layers-panel'
  const row = document.createElement('button')
  row.className = 'layer-row'
  const cell = document.createElement('button')
  cell.className = 'layer-animation-cel'
  panel.append(row, cell)
  document.body.append(panel)
  const emit = vi.fn()
  unregistrations.push(registerCanvasKeyDisplayPointer({
    enabled: true, locale: 'zh-CN', activeDocument: true,
    chords: new Map(), emit, clearKeyboardGesture: vi.fn(), canvasSelectsLayer: () => false
  }))
  pointer('pointerdown', row, 1, true)
  pointer('pointerup', row, 1, true)
  pointer('pointerdown', cell, 2, true)
  pointer('pointerup', cell, 2, true)
  expect(emit).toHaveBeenCalledTimes(2)
  expect(emit).toHaveBeenNthCalledWith(1, ['Control', 'MouseLeft'], '选择图层')
  expect(emit).toHaveBeenNthCalledWith(2, ['Control', 'MouseLeft'], '选择动画单元格')
})

it('names Ctrl+left on the canvas when automatic layer selection is active', () => {
  const canvas = document.createElement('canvas')
  canvas.className = 'stage-canvas'
  document.body.append(canvas)
  const emit = vi.fn()
  unregistrations.push(registerCanvasKeyDisplayPointer({
    enabled: true, locale: 'zh-CN', activeDocument: true,
    chords: new Map(), emit, clearKeyboardGesture: vi.fn(), canvasSelectsLayer: () => true
  }))
  pointer('pointerdown', canvas, 3, true)
  pointer('pointerup', canvas, 3, true)
  expect(emit).toHaveBeenCalledWith(['Control', 'MouseLeft'], '选择图层')
})
