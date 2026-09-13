import { bench, describe } from 'vitest'
import { createDocument, readLayerColorAt } from '@/core/document'
import { deviceAlignedCanvasRect, deviceAlignedCoordinate } from '@/core/canvas-render-plan'
import { installRuntimeRaster } from '@/core/runtime-raster'
import { buildCanvasClickFlashRaster } from './canvas-click-flash'

// Compare cold CPU raster preparation only, excluding browser upload/paint and
// the previous implementation's asynchronous scheduling delay.
const makeFixture = (sparse: boolean) => {
  const document = createDocument('flash benchmark', 1, 1, 'rgba')
  const layer = document.layers[0]
  const width = 4200, height = 2400
  layer.width = width; layer.height = height
  if (sparse) {
    const tileSize = 64, columns = Math.ceil(width / tileSize), rows = Math.ceil(height / tileSize)
    const tileOffsets = new Int32Array(columns * rows)
    const data: number[] = []
    for (const [tx, ty] of [[0, 0], [columns - 1, 0], [0, rows - 1], [columns - 1, rows - 1]]) {
      const tw = Math.min(tileSize, width - tx * tileSize), th = Math.min(tileSize, height - ty * tileSize)
      tileOffsets[ty * columns + tx] = data.length + 1
      for (let i = 0; i < tw * th; i += 1) data.push(20, 20, 20, 255)
    }
    installRuntimeRaster(layer, { kind: 'sparse-tiles-v1', format: 'rgba', width, height, tileSize, tileOffsets, data: new Uint8Array(data) })
  } else {
    layer.pixels = new Uint8ClampedArray(width * height * 4).fill(255)
  }
  const request = { contentKey: 'bench', layer, palette: document.palette, region: { x: 0, y: 0, width, height }, originX: 0, originY: 0, zoom: 0.25, deviceScale: { x: 1, y: 1 } }
  return { document, request }
}

const previousSamplingRaster = ({ document, request }: ReturnType<typeof makeFixture>) => {
  const { region, layer, zoom } = request
  const boundary = deviceAlignedCanvasRect(0, 0, region.width * zoom, region.height * zoom, 1)
  const width = boundary.width, height = boundary.height
  const pixels = new Uint8ClampedArray(width * height * 4)
  const columns = Array.from({ length: region.width }, (_, x) => Math.min(width - 1, Math.max(0, Math.round(deviceAlignedCoordinate(x * zoom, 1)))))
  for (let cursor = 0; cursor < region.width * region.height; cursor += 1) {
    const x = cursor % region.width, y = Math.floor(cursor / region.width)
    const row = Math.min(height - 1, Math.max(0, Math.round(deviceAlignedCoordinate(y * zoom, 1))))
    const color = readLayerColorAt(document, layer, x, y)
    const offset = (row * width + columns[x]) * 4
    if (!color.a || pixels[offset + 3] > color.a) continue
    const value = color.r * 0.2126 + color.g * 0.7152 + color.b * 0.0722 > 145 ? 0 : 255
    pixels[offset] = pixels[offset + 1] = pixels[offset + 2] = value
    pixels[offset + 3] = color.a
  }
  return pixels
}

for (const sparse of [true, false]) {
  const fixture = makeFixture(sparse)
  describe(`4200x2400 ${sparse ? 'sparse' : 'dense'} full-layer flash at 25%`, () => {
    bench('previous per-pixel sampling', () => { previousSamplingRaster(fixture) }, { iterations: 3, warmupIterations: 1, time: 200, warmupTime: 50 })
    bench('native raster rows', () => { buildCanvasClickFlashRaster(fixture.request) }, { iterations: 3, warmupIterations: 1, time: 200, warmupTime: 50 })
  })
}
