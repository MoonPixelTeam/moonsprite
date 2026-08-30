import { describe, expect, it } from 'vitest'
import {
  DEFAULT_BRUSH_DYNAMICS_SETTINGS,
  brushPressureFromDynamics,
  calibrateBrushPressure,
  cloneBrushDynamicsSettings,
  hasReliableBrushPressure,
  isPressurePointerType,
  migrateBrushPressureSettings,
  normalizeBrushDynamicsSettings,
  patchBrushDynamicsGradientDither,
  patchBrushDynamicsMapping,
  resolveBrushDynamics,
  smoothBrushSizeEnvelope
} from './pressure'

describe('brush dynamics', () => {
  it('uses new sensor defaults and clamps speed ranges to 4000', () => {
    expect(patchBrushDynamicsMapping(DEFAULT_BRUSH_DYNAMICS_SETTINGS, 'size', { sensor: 'pressure' }).effects.size).toMatchObject({ inputMin: 0, inputMax: 70, curve: 'hard' })
    expect(patchBrushDynamicsMapping(DEFAULT_BRUSH_DYNAMICS_SETTINGS, 'strength', { sensor: 'speed' }).effects.strength).toMatchObject({ inputMin: 50, inputMax: 2400, curve: 'linear' })

    const normalized = normalizeBrushDynamicsSettings({
      version: 3,
      effects: {
        size: { sensor: 'pressure', outputMin: 140, outputMax: -10, inputMin: 120, inputMax: -20, curve: 'invalid' as 'linear', direction: 'invalid' as 'direct' },
        strength: { sensor: 'speed', outputMin: 80, outputMax: 20, inputMin: 5000, inputMax: -1, curve: 'soft', direction: 'inverse' },
        gradient: DEFAULT_BRUSH_DYNAMICS_SETTINGS.effects.gradient
      }
    })

    expect(normalized.effects.size).toEqual({ sensor: 'pressure', outputMin: 0, outputMax: 100, inputMin: 0, inputMax: 100, curve: 'hard', direction: 'direct' })
    expect(normalized.effects.strength).toEqual({ sensor: 'speed', outputMin: 20, outputMax: 80, inputMin: 0, inputMax: 4000, curve: 'soft', direction: 'inverse' })
  })

  it('calibrates pen pressure before applying mappings', () => {
    expect(calibrateBrushPressure(0.02)).toBe(0)
    expect(calibrateBrushPressure(1)).toBe(100)
    expect(calibrateBrushPressure(0.5)).toBeCloseTo(29.75, 1)

    const settings = patchBrushDynamicsMapping(DEFAULT_BRUSH_DYNAMICS_SETTINGS, 'size', {
      sensor: 'pressure', outputMin: 0, outputMax: 100, inputMin: 0, inputMax: 100, curve: 'linear'
    })
    expect(resolveBrushDynamics(settings, { pointerType: 'pen', pressure: 0.5 }, 10)).toEqual({ size: 3, opacityScale: 1, gradientAmount: null, angle: 0 })
  })



  it('accepts vendor stylus types and explicit capability overrides', () => {
    const settings = patchBrushDynamicsMapping(DEFAULT_BRUSH_DYNAMICS_SETTINGS, 'size', {
      sensor: 'pressure', outputMin: 0, outputMax: 100, inputMin: 0, inputMax: 100, curve: 'linear'
    })
    expect(resolveBrushDynamics(settings, { pointerType: 'stylus', pressure: 0.5 }, 10).size).toBe(3)
    expect(resolveBrushDynamics(settings, { pointerType: 'mouse', pressure: 0.5, pressureAvailable: true }, 10).size).toBe(3)
    expect(resolveBrushDynamics(settings, { pointerType: 'pen', pressure: 0.5, pressureAvailable: false }, 10).size).toBe(10)
  })



  it('bypasses unavailable pressure and resolves gradient independently', () => {
    let settings = patchBrushDynamicsMapping(DEFAULT_BRUSH_DYNAMICS_SETTINGS, 'size', {
      sensor: 'pressure', outputMin: 0, outputMax: 100
    })
    settings = patchBrushDynamicsMapping(settings, 'gradient', {
      sensor: 'speed', outputMin: 0, outputMax: 100, inputMin: 0, inputMax: 1000, curve: 'linear'
    })

    expect(resolveBrushDynamics(settings, { pointerType: 'mouse', pressure: 0, speed: 500 }, 7)).toEqual({ size: 7, opacityScale: 1, gradientAmount: 0.5, angle: 0 })
    expect(resolveBrushDynamics(settings, { pointerType: 'pen', speed: 500 }, 7)).toEqual({ size: 7, opacityScale: 1, gradientAmount: 0.5, angle: 0 })
    expect(resolveBrushDynamics(settings, { pointerType: 'pen', pressure: 0, speed: 0 }, 7)).toEqual({ size: 1, opacityScale: 1, gradientAmount: 0, angle: 0 })
  })

  it('maps pressure and speed to brush angle in degrees', () => {
    let settings = patchBrushDynamicsMapping(DEFAULT_BRUSH_DYNAMICS_SETTINGS, 'angle', {
      sensor: 'pressure', outputMin: -90, outputMax: 90, inputMin: 0, inputMax: 100, curve: 'linear'
    })
    expect(resolveBrushDynamics(settings, { pointerType: 'pen', pressure: 1 }, 8).angle).toBe(90)
    settings = patchBrushDynamicsMapping(settings, 'angle', { sensor: 'speed', outputMin: -180, outputMax: 180, inputMin: 0, inputMax: 1000, curve: 'linear' })
    expect(resolveBrushDynamics(settings, { pointerType: 'mouse', speed: 500 }, 8).angle).toBe(0)
  })


})
