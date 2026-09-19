import { beforeEach, expect, it } from 'vitest'
import { createCanvasBrushConfig } from './createCanvasBrushConfig'
import { createDocument } from '@/core/document-model'
import { DEFAULT_EDITOR_PREFERENCES, DEFAULT_ISO_VIEW_PREFERENCES } from '@/core/file-preferences'
import type { CanvasDragState } from '@/core/canvas-input'
import { useWorkspace } from '@/store/workspace'
const modifiers = { altKey: false, ctrlKey: false, metaKey: false, shiftKey: false }
beforeEach(() => { localStorage.clear(); useWorkspace.setState({ sessions: [], activeId: null }) })
const setup = () => {
  useWorkspace.getState().addSession(createDocument('gradient', 64, 64, 'rgba'))
  const session = useWorkspace.getState().sessions[0]
  session.gradientType = 'radial'
  const config = createCanvasBrushConfig({ session, isoViewPreferences: DEFAULT_ISO_VIEW_PREFERENCES, canvasPreferences: DEFAULT_EDITOR_PREFERENCES, alignmentPreferences: { gridAlignmentEnabled: false, smartAlignmentEnabled: false, alignmentGuidesVisible: false, alignmentThreshold: 4 }, balancedShiftLineEnabled: false, lineDirectionStep: 45 })
  const drag = { kind: 'gradient', start: { x: 0, y: 0 }, last: { x: 20, y: 10 } } as CanvasDragState
  config.updateGradientDragGeometry(drag, drag.last, modifiers)
  return { config, drag }
}
it('moves the whole radial ellipse and keeps its size when Space is released', () => {
  const { config, drag } = setup()
  const before = structuredClone(drag.gradientRadialGeometry!)
  drag.transformMoveStart = { pointer: { ...drag.last }, offset: { x: 0, y: 0 } }
  config.updateGradientDragGeometry(drag, { x: 25, y: 17 }, modifiers)
  expect(drag.gradientRadialGeometry).toEqual({ ...before, center: { x: before.center.x + 5, y: before.center.y + 7 } })
  drag.transformMoveStart = undefined
  const moved = structuredClone(drag.gradientRadialGeometry)
  config.updateGradientDragGeometry(drag, { x: 25, y: 17 }, modifiers)
  expect(drag.gradientRadialGeometry).toEqual(moved)
})
it('retains ellipse geometry after releasing Alt and resumes resizing', () => {
  const { config, drag } = setup()
  config.updateGradientDragGeometry(drag, { x: 20, y: 10 }, { ...modifiers, altKey: true })
  config.updateGradientDragGeometry(drag, { x: 5, y: 15 }, { ...modifiers, altKey: true })
  const rotated = structuredClone(drag.gradientRadialGeometry)
  const angle = drag.gradientAngle
  expect(angle).not.toBe(0)
  config.updateGradientDragGeometry(drag, { x: 5, y: 15 }, modifiers)
  expect(drag.gradientRadialGeometry).toEqual(rotated)
  expect(drag.gradientAngle).toBe(angle)
  config.updateGradientDragGeometry(drag, { x: 5, y: 20 }, modifiers)
  expect(drag.gradientRadialGeometry).not.toEqual(rotated)
})

it('does not resize or reset the rotated ellipse on an Alt release with a different pointer sample', () => {
  const { config, drag } = setup()
  config.updateGradientDragGeometry(drag, { x: 20, y: 10 }, { ...modifiers, altKey: true })
  config.updateGradientDragGeometry(drag, { x: 5, y: 15 }, { ...modifiers, altKey: true })
  const geometry = structuredClone(drag.gradientRadialGeometry)
  const angle = drag.gradientAngle
  config.updateGradientDragGeometry(drag, { x: 20, y: 10 }, modifiers)
  expect(drag.gradientRadialGeometry).toEqual(geometry)
  expect(drag.gradientAngle).toBe(angle)
  config.updateGradientDragGeometry(drag, { x: 20, y: 10 }, modifiers)
  expect(drag.gradientRadialGeometry).toEqual(geometry)
})
