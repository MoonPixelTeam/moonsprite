import type { BlendMode } from '@shared/types-color'
import type { LayerMask, RasterLayer } from '@shared/types-layer'
import type { SelectionQuad, SelectionRect } from '@shared/types-selection'
import type { SpriteDocument } from '@shared/types-document'
import type { ViewState } from '@shared/types-view'
import {
  compositeRegion
} from '@/core/document-composite-region'
import {
  DocumentCompositeCache
} from '@/core/document-composite-cache'
import {
  expandLayerStyleInvalidationRect,
  type CompositeStackItem
} from '@/core/document-composite-plan'
import { getLayerContentRevision, rasterContentBounds, readLayerPackedAt, renderLayerMaskRegion } from '@/core/document-model'
import { applyRelativeLuminance } from '@/core/raster'
import { rasterStorageIdentity, readSurfacePackedRegion, readSurfaceRgbaRegion } from '@/core/runtime-raster'
import {
  selectionTransformPreviewPacked,
  selectionTransformPreviewRasterPacked
} from '@/core/tools-selection-transform-raster'
import {
  type SelectionTransformSource
} from '@/core/tools-selection-transform-types'
import { selectionQuadBounds, transformedSelectionBounds } from '@/core/selection'
import {
  translatedSelectionRect
} from '@/core/canvas-input-preview'
import { normalizeSelectionForTileRepeatPreview, tileRepeatDocumentOffsets } from '@/core/tilemap'
import { initialDocumentCompositePending, initialDocumentCompositeSurface, registerInitialDocumentCompositeSurface } from '@/core/initial-document-composite'
import { deviceAlignedCanvasRect, deviceAlignedDocumentRect, deviceAlignedPixelRuns, type CanvasDeviceScaleInput } from '@/core/canvas-render-plan'
import { hasEnabledLayerStyles } from '@/core/layer-styles'
import type { CanvasPreviewInvalidation, CanvasPreviewSelection } from '@/core/canvas-preview-lifecycle'
import type { RasterContext2D } from './canvas-selection-renderer'
export const intersectRect = (left: SelectionRect, right: SelectionRect): SelectionRect | null => {
  const x = Math.max(left.x, right.x)
  const y = Math.max(left.y, right.y)
  const toX = Math.min(left.x + left.width, right.x + right.width)
  const toY = Math.min(left.y + left.height, right.y + right.height)
  return toX > x && toY > y ? { x, y, width: toX - x, height: toY - y } : null
}

export const unionRect = (left: SelectionRect, right: SelectionRect): SelectionRect => {
  const x = Math.min(left.x, right.x)
  const y = Math.min(left.y, right.y)
  const toX = Math.max(left.x + left.width, right.x + right.width)
  const toY = Math.max(left.y + left.height, right.y + right.height)
  return { x, y, width: toX - x, height: toY - y }
}

const MAX_LOCAL_PATCH_MERGE_PIXELS = 64 * 1024

/** Style rendering makes unused pixels more costly than a few extra uploads. */
export const compositePatchMergeLimit = (document: SpriteDocument | null): number | undefined =>
  document && (document.layers.some(layer => hasEnabledLayerStyles(layer.layerStyles))
    || document.groups.some(group => hasEnabledLayerStyles(group.layerStyles))) ? 0 : undefined

export const mergeOverlappingRects = (rects: readonly SelectionRect[], maxLocalPatchMergePixels = MAX_LOCAL_PATCH_MERGE_PIXELS): SelectionRect[] => {
  // A long brush stroke produces a chain of slightly overlapping stamps. A
  // plain transitive merge turns that chain into one huge bounding box, which
  // makes a large multi-layer canvas recompose thousands of times more pixels
  // than were actually touched. Keep the rectangles separate when the union
  // has a large amount of untouched area; every rectangle is still processed,
  // so this only changes the work shape, never the painted result.
  const maxUnionWasteRatio = 3
  const merged: SelectionRect[] = []
  for (const source of rects) {
    let candidate = source
    for (let index = merged.length - 1; index >= 0; index -= 1) {
      const previous = merged[index]
      const union = unionRect(candidate, previous)
      const candidateArea = Math.max(1, candidate.width * candidate.height)
      const previousArea = Math.max(1, previous.width * previous.height)
      const unionArea = Math.max(1, union.width * union.height)
      const overlaps = Boolean(intersectRect(candidate, previous))
      // Large solid brushes expose several narrow, disjoint edge strips as a
      // stamp moves. Uploading every strip separately is cheap in JavaScript
      // but creates many GPU texture updates per pointer sample. Batch any
      // fragments whose complete local patch remains small; for larger areas,
      // retain the low-waste overlap rule so diagonal strokes stay sparse.
      if (!overlaps && unionArea > maxLocalPatchMergePixels) continue
      if (unionArea > maxLocalPatchMergePixels && unionArea > (candidateArea + previousArea) * maxUnionWasteRatio) continue
      candidate = union
      merged.splice(index, 1)
      index = merged.length
    }
    merged.push(candidate)
  }
  return merged
}

export const boundedDirtyRects = (rects: readonly SelectionRect[], limit = 32, maxLocalPatchMergePixels = MAX_LOCAL_PATCH_MERGE_PIXELS): SelectionRect[] => {
  const merged = mergeOverlappingRects(rects, maxLocalPatchMergePixels)
  if (merged.length <= limit) return merged
  // Preserve the newest local regions and collapse the oldest backlog into
  // one conservative rectangle. This is mainly for cached surfaces that are
  // not currently visible; their queue must not grow for the whole gesture.
  const overflow = merged.length - limit + 1
  let oldest = merged[0]
  for (let index = 1; index < overflow; index += 1) oldest = unionRect(oldest, merged[index])
  return [oldest, ...merged.slice(overflow)]
}

export const subtractRect = (source: SelectionRect, removed: SelectionRect): SelectionRect[] => {
  const overlap = intersectRect(source, removed)
  if (!overlap) return [source]
  const result: SelectionRect[] = []
  const sourceRight = source.x + source.width
  const sourceBottom = source.y + source.height
  const overlapRight = overlap.x + overlap.width
  const overlapBottom = overlap.y + overlap.height
  if (overlap.y > source.y)
    result.push({
      x: source.x,
      y: source.y,
      width: source.width,
      height: overlap.y - source.y
    })
  if (overlapBottom < sourceBottom)
    result.push({
      x: source.x,
      y: overlapBottom,
      width: source.width,
      height: sourceBottom - overlapBottom
    })
  if (overlap.x > source.x)
    result.push({
      x: source.x,
      y: overlap.y,
      width: overlap.x - source.x,
      height: overlap.height
    })
  if (overlapRight < sourceRight)
    result.push({
      x: overlapRight,
      y: overlap.y,
      width: sourceRight - overlapRight,
      height: overlap.height
    })
  return result
}

export const visibleDocumentRect = (document: SpriteDocument, fromX: number, fromY: number, toX: number, toY: number): SelectionRect | null => {
  const x = Math.max(0, Math.floor(fromX))
  const y = Math.max(0, Math.floor(fromY))
  const right = Math.min(document.width, Math.ceil(toX))
  const bottom = Math.min(document.height, Math.ceil(toY))
  return right > x && bottom > y ? { x, y, width: right - x, height: bottom - y } : null
}

export const pixelAlignedRect = (rect: SelectionRect): SelectionRect => {
  const x = Math.floor(rect.x)
  const y = Math.floor(rect.y)
  return {
    x,
    y,
    width: Math.ceil(rect.x + rect.width) - x,
    height: Math.ceil(rect.y + rect.height) - y
  }
}

export const selectionQuadKey = (quad?: SelectionQuad): string => (quad ? [quad.nw.x, quad.nw.y, quad.ne.x, quad.ne.y, quad.se.x, quad.se.y, quad.sw.x, quad.sw.y].join(',') : '')

export const translatedSelectionQuad = (quad: SelectionQuad | undefined, offsetX: number, offsetY: number): SelectionQuad | undefined =>
  quad
    ? {
        nw: { x: quad.nw.x + offsetX, y: quad.nw.y + offsetY },
        ne: { x: quad.ne.x + offsetX, y: quad.ne.y + offsetY },
        se: { x: quad.se.x + offsetX, y: quad.se.y + offsetY },
        sw: { x: quad.sw.x + offsetX, y: quad.sw.y + offsetY }
      }
    : undefined

export const selectionQuadForTarget = (selection: SelectionTransformCompositePreview, target: SelectionRect): SelectionQuad | undefined => translatedSelectionQuad(selection.quad, target.x - selection.target.x, target.y - selection.target.y)

export type SelectionTransformCompositePreview = CanvasPreviewSelection
const selectionOptimizedRotationEnabled = (selection: SelectionTransformCompositePreview): boolean => selection.optimizedRotation === true

export const selectionPreviewRasterKey = (selection: SelectionTransformCompositePreview, layerFormat: RasterLayer['format']): string => {
  const { target, shear } = selection
  return [
    target.x - Math.floor(target.x),
    target.y - Math.floor(target.y),
    target.width,
    target.height,
    target.flipHorizontal ? 1 : 0,
    target.flipVertical ? 1 : 0,
    Number.isFinite(target.flipOriginX) ? target.flipOriginX! - target.x : '',
    Number.isFinite(target.flipOriginY) ? target.flipOriginY! - target.y : '',
    selection.angle,
    shear?.axis ?? '',
    shear?.edge ?? '',
    shear?.amount ?? '',
    selectionQuadKey(selection.quad),
    selectionQuadKey(selection.source.sourceQuad),
    selectionOptimizedRotationEnabled(selection) ? 1 : 0,
    layerFormat
  ].join(':')
}
