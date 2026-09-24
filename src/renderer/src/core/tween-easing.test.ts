import { expect, it } from 'vitest'
import { tweenProgress, validTweenCurve, TWEEN_PRESET_CURVES } from './tween-easing'
import { createDocument, writeLayerColor } from './document-model'
import { syncActiveAnimationFrame } from './animation'
import { DEFAULT_ANIMATION_TWEEN, prepareAnimationTween, validateAnimationTween } from './animation-tween'

it('converts every preset to editable controls without changing the curve', () => {
  for (const easing of ['linear', 'ease-in', 'ease-out', 'ease-in-out'] as const) {
    for (let i = 0; i <= 100; i++) {
      expect(tweenProgress(i / 100, 'custom', TWEEN_PRESET_CURVES[easing])).toBeCloseTo(tweenProgress(i / 100, easing), 7)
    }
  }
})

it('solves time rather than treating the Bezier parameter as time', () => {
  for (const t of [0, 0.1, 0.25, 0.5, 0.9, 1]) expect(tweenProgress(t, 'custom', [0, 0, 1, 1])).toBeCloseTo(t, 7)
  expect(tweenProgress(0.25, 'custom', [0.42, 0, 1, 1])).toBeLessThan(0.25)
  expect(tweenProgress(0.25, 'custom', [0, 0, 0.58, 1])).toBeGreaterThan(0.25)
})

it('keeps endpoints, bounds and monotonic progress even for extreme controls', () => {
  for (const curve of [[0, 1, 0, 1], [1, 0, 1, 0], [1, 1, 0, 0]] as const) {
    let previous = 0
    for (let i = 0; i <= 100; i++) {
      const value = tweenProgress(i / 100, 'custom', curve)
      expect(value).toBeGreaterThanOrEqual(previous)
      expect(value).toBeLessThanOrEqual(1)
      previous = value
    }
    expect(tweenProgress(0, 'custom', curve)).toBe(0)
    expect(tweenProgress(1, 'custom', curve)).toBe(1)
  }
  expect(validTweenCurve([NaN, 0, 1, 1])).toBe(false)
  expect(() => validateAnimationTween({ ...DEFAULT_ANIMATION_TWEEN, easing: 'custom', easingCurve: [2, 0, 1, 1] })).toThrow()
})

it('changes generated motion spacing without changing frame count or duration', () => {
  const document = createDocument('curve', 8, 8, 'rgba', false)
  const layer = document.layers[0]
  writeLayerColor(document, layer, 0, { r: 255, g: 0, b: 0, a: 255 })
  syncActiveAnimationFrame(document)
  const options = { ...DEFAULT_ANIMATION_TWEEN, frameCount: 4, duration: 125, offsetX: 100 }
  const linear = prepareAnimationTween(document, document.animation!.activeFrameId, layer.id, options)
  const eased = prepareAnimationTween(document, document.animation!.activeFrameId, layer.id, { ...options, easing: 'custom', easingCurve: [0.42, 0, 1, 1] })
  expect(eased.frames.map(frame => frame.duration)).toEqual([125, 125, 125, 125])
  expect(eased.cels[0].surface!.offsetX).toBeLessThan(linear.cels[0].surface!.offsetX)
  expect(eased.cels.at(-1)!.surface!.offsetX).toBe(linear.cels.at(-1)!.surface!.offsetX)
})
