import { bench, describe } from 'vitest'
import { createDocument, getActiveLayer } from './document'
import { floodFill } from './tools'

const document = createDocument('uniform smart closure benchmark', 2048, 2048, 'rgba')
const layer = getActiveLayer(document)
let blue = false

describe('large uniform fills', () => {
  bench('fill 2048x2048 with smart closure enabled', () => {
    blue = !blue
    floodFill(
      document,
      layer,
      1024,
      1024,
      blue ? { r: 41, g: 121, b: 255, a: 255 } : { r: 245, g: 86, b: 74, a: 255 },
      null,
      true,
      null,
      1,
      undefined,
      'solid',
      1,
      0,
      'paint',
      0,
      2
    )
  }, { iterations: 10, warmupIterations: 2, time: 0, warmupTime: 0 })
})
