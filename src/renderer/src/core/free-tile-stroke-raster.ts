import type { ImageBrush } from '@shared/types-brush'
import type { SpriteDocument } from '@shared/types-document'
import type { RasterLayer } from '@shared/types-layer'
import type { SelectionMask, SelectionRect } from '@shared/types-selection'
import { expandLayerToRect, setLayerStorageOrigin } from './document-model'
import type { PixelEdit } from './history'
import {
  brushCoverageByEdit, brushPaintBaselineByEdit, lastBrushStampByEdit, solidPointRecorderByEdit,
  BRUSH_COVERAGE_CHUNK_BITS, BRUSH_COVERAGE_CHUNK_MASK, BRUSH_COVERAGE_CHUNK_SIZE
} from './tools-pixel-edit'

type Point = { x: number; y: number }
interface StrokeRaster {
  freeTileEditDocument?: SpriteDocument
  freeTileEditLayer?: RasterLayer
  freeTileEditOrigin?: Point
  freeTileEditSourceOffset?: Point
  freeTileEditSelection?: SelectionMask | null
  freeTileLastLocal?: Point
  patternOrigin?: Point
  edit?: PixelEdit
}

/** Grow only the private source-edit raster; document-space stroke points stay fixed. */
export function growFreeTileStrokeRaster(
  stroke: StrokeRaster, from: Point, to: Point, size: number, imageBrush: ImageBrush | null = null
): Point {
  const document = stroke.freeTileEditDocument, layer = stroke.freeTileEditLayer
  const origin = stroke.freeTileEditOrigin, sourceOffset = stroke.freeTileEditSourceOffset, edit = stroke.edit
  if (!document || !layer || !origin || !sourceOffset || !edit) return { x: 0, y: 0 }
  // The diagonal covers every intermediate rotation, including intrinsic image brushes.
  const margin = Math.ceil(imageBrush?.intrinsicSize ? Math.hypot(imageBrush.width, imageBrush.height) : Math.SQRT2 * size) + 2
  const minX = Math.floor(Math.min(from.x, to.x) - origin.x - margin)
  const minY = Math.floor(Math.min(from.y, to.y) - origin.y - margin)
  const maxX = Math.ceil(Math.max(from.x, to.x) - origin.x + margin + 1)
  const maxY = Math.ceil(Math.max(from.y, to.y) - origin.y + margin + 1)
  if (minX >= 0 && minY >= 0 && maxX <= document.width && maxY <= document.height) return { x: 0, y: 0 }
  // Spare capacity avoids reallocating on every successive pointer sample.
  const padX = Math.max(128, Math.ceil(document.width / 4)), padY = Math.max(128, Math.ceil(document.height / 4))
  const left = minX < 0 ? minX - padX : 0, top = minY < 0 ? minY - padY : 0
  const right = maxX > document.width ? maxX + padX : document.width
  const bottom = maxY > document.height ? maxY + padY : document.height
  const oldWidth = layer.width
  if (!expandLayerToRect(layer, left, top, right, bottom)) throw new Error('Unable to expand free-tile source edit raster')
  const dx = -left, dy = -top
  const remap = (index: number): number => (Math.floor(index / oldWidth) + dy) * layer.width + index % oldWidth + dx
  const remapValues = (values: Map<number, number>): void => {
    const entries = [...values]
    values.clear()
    for (const [index, value] of entries) values.set(remap(index), value)
  }
  remapValues(edit.before)
  remapValues(edit.after)
  if (edit.points) for (let i = 0; i < edit.points.count; i++) edit.points.indices[i] = remap(edit.points.indices[i])
  if (edit.runs) edit.runs = edit.runs.flatMap(run => {
    const runs: NonNullable<PixelEdit['runs']> = []
    for (let offset = 0; offset < run.length;) {
      const index = run.index + offset, length = Math.min(run.length - offset, oldWidth - index % oldWidth)
      runs.push({ ...run, index: remap(index), length })
      offset += length
    }
    return runs
  })
  const shifted = new Set<Point>()
  const shift = (point: Point | SelectionRect | undefined | null): void => {
    if (point && !shifted.has(point)) { point.x += dx; point.y += dy; shifted.add(point) }
  }
  shift(edit.denseRegion)
  shift(edit.dirtyRect)
  const baseline = brushPaintBaselineByEdit.get(edit)
  if (baseline) remapValues(baseline)
  const coverages = brushCoverageByEdit.get(edit)
  if (coverages) for (const coverage of coverages.values()) {
    const chunks = new Map<number, Uint16Array>()
    for (const [chunkIndex, chunk] of coverage.chunks) for (let i = 0; i < chunk.length; i++) {
      if (!chunk[i]) continue
      const index = remap((chunkIndex << BRUSH_COVERAGE_CHUNK_BITS) + i), key = index >> BRUSH_COVERAGE_CHUNK_BITS
      let target = chunks.get(key)
      if (!target) { target = new Uint16Array(BRUSH_COVERAGE_CHUNK_SIZE); chunks.set(key, target) }
      target[index & BRUSH_COVERAGE_CHUNK_MASK] = chunk[i]
    }
    coverage.chunks = chunks
  }
  // These geometry caches refer to the old stride/local coordinates.
  lastBrushStampByEdit.delete(edit)
  solidPointRecorderByEdit.delete(edit)
  document.width = layer.width
  document.height = layer.height
  layer.offsetX = 0
  layer.offsetY = 0
  setLayerStorageOrigin(layer, { x: 0, y: 0 })
  origin.x -= dx
  origin.y -= dy
  shift(sourceOffset)
  shift(stroke.freeTileEditSelection)
  shift(stroke.freeTileLastLocal)
  shift(stroke.patternOrigin)
  return { x: dx, y: dy }
}
