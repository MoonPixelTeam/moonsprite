import { expect, it } from 'vitest'
import { extendTweenPath } from './animation-tween-path'
import { perfectPixelPathPoints } from '@/core/tools-shapes'

it('removes the same redundant corners as the main canvas perfect-pixel brush', () => {
  let path: readonly { x: number; y: number }[] = [{ x: 0, y: 0 }]
  for (const point of [{ x: 1, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 1 }, { x: 2, y: 2 }]) path = extendTweenPath(path, point)
  expect(perfectPixelPathPoints(path)).toEqual([{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 }])
})
it('keeps long straight pixel runs exact without decimating bends', () => {
  const path = extendTweenPath([{ x: 0, y: 0 }], { x: 4096, y: 0 })
  expect(path).toEqual([{ x: 0, y: 0 }, { x: 4096, y: 0 }])
  expect(extendTweenPath(path, { x: 4096, y: 2 }).at(-1)).toEqual({ x: 4096, y: 2 })
})
it('reuses canvas direction constraints for Ctrl+Shift', () => {
  expect(extendTweenPath([{ x: 0, y: 0 }], { x: 8, y: 2 }, true).at(-1)).toEqual({ x: 8, y: 0 })
})
