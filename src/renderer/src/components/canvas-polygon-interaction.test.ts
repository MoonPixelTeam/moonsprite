import { expect, it, vi } from 'vitest'
import { CanvasInputState } from '@/core/canvas-input-controller'
import { shouldClosePolygonLasso } from '@/core/canvas-input-path'
import type { CanvasDragState } from '@/core/canvas-input-contracts'
import type { DocumentSession } from '@/store/workspace'
import { createSelectionCanvasInput } from './canvas-input-selection'
import { createShapeCanvasInput } from './canvas-input-shape'

const point = (x: number, y: number) => ({ x, y })
const click = (button: number, detail = 1) => ({ button, detail, preventDefault: vi.fn() }) as unknown as React.PointerEvent<HTMLCanvasElement>

it.each(['polygon-lasso', 'polygon-shape'] as const)('%s uses left to add, right to undo and left double-click to finish', kind => {
  const input = new CanvasInputState()
  const drag: CanvasDragState = { kind, start: point(1, 1), last: point(1, 1), path: [point(1, 1)] }
  input.drag = drag
  const commit = vi.fn()
  const ports = { inputRef: { current: input }, gridSnapActive: false, scheduleDraw: vi.fn(), commitPolygonLasso: commit, commitPolygonShape: commit }
  const selection = createSelectionCanvasInput(ports as unknown as Parameters<typeof createSelectionCanvasInput>[0])
  const shape = createShapeCanvasInput(ports as unknown as Parameters<typeof createShapeCanvasInput>[0])
  const session = { tool: kind === 'polygon-lasso' ? 'selection' : 'shape' } as DocumentSession
  const extend = (event: React.PointerEvent<HTMLCanvasElement>, at: { x: number; y: number }) => {
    if (kind === 'polygon-lasso') selection.extendPolygonLasso({ session, activePolygon: input.drag, event, point: at })
    else shape.extendPolygonShape({ session, activePolygon: input.drag, event, point: at })
  }
  extend(click(0), point(5, 1))
  extend(click(0), point(5, 5))
  expect(drag.path).toHaveLength(3)
  extend(click(2, 2), point(2, 3))
  expect(drag.path).toHaveLength(2)
  expect(commit).not.toHaveBeenCalled()
  extend(click(0), point(5, 5))
  extend(click(0), point(1, 1))
  expect(commit).not.toHaveBeenCalled()
  extend(click(0, 2), point(1, 1))
  expect(commit).toHaveBeenCalledOnce()
})

it('only a left double-click closes a path with enough vertices', () => {
  const path = [point(1, 1), point(5, 1), point(5, 5)]
  expect(shouldClosePolygonLasso(path, 0, 1)).toBe(false)
  expect(shouldClosePolygonLasso(path, 2, 2)).toBe(false)
  expect(shouldClosePolygonLasso(path, 0, 2)).toBe(true)
  expect(shouldClosePolygonLasso(path.slice(0, 2), 0, 2)).toBe(false)
})
