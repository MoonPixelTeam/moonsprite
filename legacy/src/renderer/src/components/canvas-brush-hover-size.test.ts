import { expect, it } from 'vitest'
import { cloneBrushDynamicsSettings, DEFAULT_BRUSH_DYNAMICS_SETTINGS } from '@/core/pressure'
import { canvasBrushHoverSize } from './canvas-brush-hover-size'

it.each(['direct', 'inverse'] as const)('uses the minimum pressure size independent of %s mapping', direction => {
  const brushDynamics = cloneBrushDynamicsSettings(DEFAULT_BRUSH_DYNAMICS_SETTINGS)
  Object.assign(brushDynamics.effects.size, { sensor: 'pressure', outputMin: 20, direction })
  expect(canvasBrushHoverSize({ brushSize: 30, brushDynamics })).toBe(6)
  expect(canvasBrushHoverSize({ brushSize: 2, brushDynamics })).toBe(1)
  brushDynamics.effects.size.outputMin = 0
  expect(canvasBrushHoverSize({ brushSize: 30, brushDynamics })).toBe(1)
})

it('keeps full size for opacity-only pressure and speed dynamics', () => {
  const brushDynamics = cloneBrushDynamicsSettings(DEFAULT_BRUSH_DYNAMICS_SETTINGS)
  brushDynamics.effects.strength.sensor = 'pressure'
  expect(canvasBrushHoverSize({ brushSize: 30, brushDynamics })).toBe(30)
  brushDynamics.effects.size.sensor = 'speed'
  expect(canvasBrushHoverSize({ brushSize: 30, brushDynamics })).toBe(30)
})
