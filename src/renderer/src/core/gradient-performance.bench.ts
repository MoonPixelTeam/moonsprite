import { bench, describe } from 'vitest'
import type { GradientStop, RgbaColor } from '@shared/types'
import { createDocument, getActiveLayer, markLayerContentChanged } from './document'
import { applyGradient, gradientRegionSelection } from './gradient'

const size = 2048
const start = { x: 512, y: 1024 }
const end = { x: 1536, y: 1024 }
const blue: RgbaColor = { r: 41, g: 121, b: 255, a: 255 }
const red: RgbaColor = { r: 245, g: 86, b: 74, a: 255 }

const selectionDocument = createDocument('gradient region benchmark', size, size, 'rgba')
const selectionLayer = getActiveLayer(selectionDocument)

const gradientDocument = createDocument('gradient apply benchmark', size, size, 'rgba')
const gradientLayer = getActiveLayer(gradientDocument)
const paintRegion = gradientRegionSelection(gradientDocument, gradientLayer, start, 0, true)!
const blueToRed: GradientStop[] = [{ position: 0, color: blue }, { position: 1, color: red }]
const redToBlue: GradientStop[] = [{ position: 0, color: red }, { position: 1, color: blue }]
let reverse = false

describe('large gradients', () => {
  bench('resolve 2048x2048 uniform paint region', () => {
    gradientRegionSelection(selectionDocument, selectionLayer, start, 0, true)
  }, { iterations: 10, warmupIterations: 2, time: 0, warmupTime: 0 })

  bench('apply 2048x2048 opaque linear gradient', () => {
    reverse = !reverse
    applyGradient(
      gradientDocument,
      gradientLayer,
      start,
      end,
      reverse ? red : blue,
      reverse ? blue : red,
      null,
      'none',
      paintRegion,
      'linear',
      {},
      reverse ? redToBlue : blueToRed
    )
  }, { iterations: 10, warmupIterations: 2, time: 0, warmupTime: 0 })

  bench('apply first 2048x2048 opaque gradient to a blank layer', () => {
    gradientLayer.pixels.fill(0)
    markLayerContentChanged(gradientLayer)
    applyGradient(
      gradientDocument,
      gradientLayer,
      start,
      end,
      blue,
      red,
      null,
      'none',
      paintRegion,
      'linear',
      {},
      blueToRed
    )
  }, { iterations: 10, warmupIterations: 2, time: 0, warmupTime: 0 })
})
