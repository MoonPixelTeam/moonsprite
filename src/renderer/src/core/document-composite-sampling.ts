import type { BlendMode, RgbaColor } from '@shared/types-color'
import type { LayerGroup, LayerMask, RasterLayer } from '@shared/types-layer'
import type { SelectionRect } from '@shared/types-selection'
import type { SpriteDocument } from '@shared/types-document'
import { blendWithMode, TRANSPARENT, unpackColor } from './raster'
import { readSurfacePackedLocal } from './runtime-raster'
import {
  applyLayerStylesAt,
  hasEnabledLayerStyles,
  layerStyleOutputBounds,
  mapLayerStyleColors,
  resolveLayerStyles,
  type LayerStyleGeometry
} from './layer-styles'
import { maskCoverageFromColor, layerContentBounds, resolveLayerCanvasColor, layerIndexAt, resolveDocumentCanvasColor } from './document-model'
import { type DocumentCompositeCache } from './document-composite-cache'
import {
  unionSelectionRects,
  type CompositeStackItem,
  buildCompositeStack,
  activeCelMasksByLayer,
  activeGroupMasksByGroup,
  normalCompositeLayers
} from './document-composite-plan'

type CompositePointReplacementSampler = (x: number, y: number, replacement: RgbaColor | undefined) => RgbaColor

export const compileCompositePointSampler = (document: SpriteDocument, layerId?: string, styleCache?: DocumentCompositeCache, revision = 0, sourceDirtyRect?: SelectionRect): CompositePointReplacementSampler => {
  const paletteById = new Map(document.palette.map((entry) => [entry.id, entry.color]))
  type CompiledItem = { styleReader?: (x: number, y: number) => RgbaColor } & (
    | { kind: 'layer'; layer: RasterLayer; read: CompositePointReplacementSampler; resolveStyleColor: (color: RgbaColor) => RgbaColor; styles?: ReturnType<typeof resolveLayerStyles>; outputBounds: SelectionRect | null }
    | { kind: 'group'; group: LayerGroup; children: CompiledItem[]; resolveStyleColor: (color: RgbaColor) => RgbaColor; styles?: ReturnType<typeof resolveLayerStyles>; geometry: LayerStyleGeometry; outputBounds: SelectionRect | null })
  const mergeBounds = (bounds: readonly (SelectionRect | null)[]): SelectionRect | null => {
    let result: SelectionRect | null = null
    for (const boundsEntry of bounds) if (boundsEntry) result = result ? unionSelectionRects(result, boundsEntry) : { ...boundsEntry }
    return result
  }
  const compileLayer = (layer: RasterLayer): CompiledItem => {
    const readIndex = (x: number, y: number): number | null => layerIndexAt(layer, x, y)
    let readSource: CompositePointReplacementSampler
    if (layer.format === 'rgba') {
      readSource = (x, y) => { const local = readIndex(x, y); return local === null ? TRANSPARENT : unpackColor(readSurfacePackedLocal(layer, local % layer.width, Math.floor(local / layer.width))) }
    } else {
      readSource = (x, y) => { const local = readIndex(x, y); return local === null ? TRANSPARENT : (paletteById.get(readSurfacePackedLocal(layer, local % layer.width, Math.floor(local / layer.width))) ?? TRANSPARENT) }
    }
    const resolveStyleColor = (styleColor: RgbaColor): RgbaColor => resolveLayerCanvasColor(document, layer, styleColor)
    const styles = hasEnabledLayerStyles(layer.layerStyles)
      ? mapLayerStyleColors(resolveLayerStyles(layer.layerStyles), resolveStyleColor)
      : undefined
    const outputBounds = layerStyleOutputBounds(styleCache ? styleCache.compositeSourceBounds(document, layer, sourceDirtyRect) : layerContentBounds(document, layer), styles)
    if (layer.id !== layerId) return { kind: 'layer', layer, read: readSource, resolveStyleColor, ...(styles ? { styles } : {}), outputBounds }
    return {
      kind: 'layer',
      layer,
      resolveStyleColor,
      ...(styles ? { styles } : {}),
      outputBounds,
      read: (x, y, replacement) => replacement === undefined
        ? readSource(x, y, replacement)
        : x >= 0 && y >= 0 && x < document.width && y < document.height ? replacement : TRANSPARENT
    }
  }
  const compileContainer = (items: readonly CompositeStackItem[]): CompiledItem[] => items.map((item) => {
    if (item.kind === 'layer') return compileLayer(item.layer)
    const children = compileContainer(item.children)
    const sourceBounds = mergeBounds(children.filter((child) => itemVisibleBeforeCompile(child)).map((child) => child.outputBounds))
    const geometry = sourceBounds ?? { x: 0, y: 0, width: document.width, height: document.height }
    const resolveStyleColor = (styleColor: RgbaColor): RgbaColor => resolveDocumentCanvasColor(document, styleColor)
    const styles = hasEnabledLayerStyles(item.group.layerStyles)
      ? mapLayerStyleColors(resolveLayerStyles(item.group.layerStyles), resolveStyleColor)
      : undefined
    return { kind: 'group', group: item.group, children, resolveStyleColor, ...(styles ? { styles } : {}), geometry, outputBounds: layerStyleOutputBounds(sourceBounds, styles) }
  })
  const itemVisibleBeforeCompile = (item: CompiledItem): boolean => item.kind === 'layer'
    ? item.layer.visible && item.layer.opacity > 0
    : item.group.visible && item.group.opacity > 0

  const root = compileContainer(buildCompositeStack(document))
  // A neutral mask can become non-neutral at the point being previewed.
  const activeMasks = activeCelMasksByLayer(document, layerId)
  const activeGroupMasks = activeGroupMasksByGroup(document, layerId)
  const itemMask = (item: CompiledItem): LayerMask | undefined => item.kind === 'layer' ? activeMasks.get(item.layer.id) : activeGroupMasks.get(item.group.id)
  const readMaskCoverage = (mask: LayerMask, x: number, y: number, replacement: RgbaColor | undefined): number => {
    if (mask.id === layerId && replacement !== undefined) return maskCoverageFromColor(replacement)
    const index = layerIndexAt(mask, x, y)
    if (index === null) return 255
    const offset = index * 4
    return mask.pixels[offset + 3] === 0 ? 255 : mask.pixels[offset]
  }
  const applyItemMask = (item: CompiledItem, source: RgbaColor, x: number, y: number, replacement: RgbaColor | undefined): RgbaColor => {
    const mask = itemMask(item)
    if (!mask || source.a === 0) return source
    return { ...source, a: Math.round(source.a * readMaskCoverage(mask, x, y, replacement) / 255) }
  }
  const clipsToLowerSibling = (item: CompiledItem): boolean => item.kind === 'layer' ? item.layer.clippingMask === true : item.group.clippingMask === true
  const itemVisible = (item: CompiledItem): boolean => item.kind === 'layer' ? item.layer.visible : item.group.visible
  const itemOpacity = (item: CompiledItem): number => item.kind === 'layer' ? item.layer.opacity : item.group.opacity
  const itemBlendMode = (item: CompiledItem): BlendMode => item.kind === 'layer' ? item.layer.blendMode : item.group.blendMode
  function isolatedItemSource(item: CompiledItem, x: number, y: number, replacement: RgbaColor | undefined): RgbaColor {
    if (!itemVisible(item)) return TRANSPARENT
    return item.kind === 'group'
      ? applyItemMask(item, compositeContainer(item.children, x, y, replacement), x, y, replacement)
      : applyItemMask(item, item.read(x, y, replacement), x, y, replacement)
  }
  function isolatedItemColor(item: CompiledItem, x: number, y: number, replacement: RgbaColor | undefined): RgbaColor {
    if (item.styles && styleCache && replacement === undefined) {
      if (!item.styleReader) {
        const owner = item.kind === 'layer' ? item.layer : item.group
        const geometry = item.kind === 'layer' ? { x: item.layer.offsetX, y: item.layer.offsetY, width: item.layer.width, height: item.layer.height } : item.geometry
        item.styleReader = styleCache.isolatedStyleReader(document, owner, geometry, item.styles,
          (sx, sy) => isolatedItemSource(item, sx, sy, undefined), item.resolveStyleColor, revision, sourceDirtyRect)
      }
      return item.styleReader(x, y)
    }
    const source = isolatedItemSource(item, x, y, replacement)
    if (!item.styles) return source
    const geometry = item.kind === 'layer' ? item.layer : item.geometry
    return applyLayerStylesAt(geometry, item.styles, x, y, source, (sourceX, sourceY) => isolatedItemSource(item, sourceX, sourceY, undefined), item.resolveStyleColor)
  }
  function compositeIsolatedSource(backdrop: RgbaColor, item: CompiledItem, source: RgbaColor): RgbaColor {
    const opacity = itemOpacity(item)
    if (source.a === 0 || opacity <= 0) return backdrop
    const blendMode = itemBlendMode(item)
    return opacity === 1 && (backdrop.a === 0 || (blendMode === 'normal' && source.a === 255))
      ? source
      : blendWithMode(backdrop, source, opacity, blendMode)
  }
  function compositeRegularItem(backdrop: RgbaColor, item: CompiledItem, x: number, y: number, replacement: RgbaColor | undefined): RgbaColor {
    if (!itemVisible(item) || itemOpacity(item) <= 0) return backdrop
    if (item.kind === 'layer') return compositeIsolatedSource(backdrop, item, isolatedItemColor(item, x, y, replacement))
    if (item.group.cumulativeBlend === true && !item.styles) {
      const isolatedColor = isolatedItemColor(item, x, y, replacement)
      if (isolatedColor.a === 0) return backdrop
      const cumulativeColor = applyItemMask(item, compositeContainer(item.children, x, y, replacement, backdrop), x, y, replacement)
      return blendWithMode(backdrop, cumulativeColor, item.group.opacity, item.group.blendMode)
    }
    if (item.group.blendMode === 'normal' && item.group.opacity === 1 && !itemMask(item) && !item.styles) return compositeContainer(item.children, x, y, replacement, backdrop)
    return compositeIsolatedSource(backdrop, item, isolatedItemColor(item, x, y, replacement))
  }
  function compositeClippedMember(backdrop: RgbaColor, item: CompiledItem, x: number, y: number, replacement: RgbaColor | undefined): RgbaColor {
    if (!itemVisible(item) || itemOpacity(item) <= 0) return backdrop
    if (item.kind === 'layer') return compositeIsolatedSource(backdrop, item, isolatedItemColor(item, x, y, replacement))
    if (item.group.cumulativeBlend === true && !item.styles) {
      const isolatedColor = isolatedItemColor(item, x, y, replacement)
      if (isolatedColor.a === 0) return backdrop
      const cumulativeColor = applyItemMask(item, compositeContainer(item.children, x, y, replacement, backdrop), x, y, replacement)
      return blendWithMode(backdrop, cumulativeColor, item.group.opacity, item.group.blendMode)
    }
    return compositeIsolatedSource(backdrop, item, isolatedItemColor(item, x, y, replacement))
  }
  function compositeContainer(items: CompiledItem[], x: number, y: number, replacement: RgbaColor | undefined, backdrop: RgbaColor = TRANSPARENT): RgbaColor {
    let color = backdrop
    for (let itemIndex = 0; itemIndex < items.length; itemIndex += 1) {
      const item = items[itemIndex]
      if (items[itemIndex + 1] && clipsToLowerSibling(items[itemIndex + 1])) {
        let lastClippedIndex = itemIndex
        while (items[lastClippedIndex + 1] && clipsToLowerSibling(items[lastClippedIndex + 1])) lastClippedIndex += 1
        const baseSource = isolatedItemColor(item, x, y, replacement)
        if (baseSource.a > 0 && itemVisible(item) && itemOpacity(item) > 0) {
          let stackColor: RgbaColor = { ...baseSource, a: 255 }
          for (let clippedIndex = itemIndex + 1; clippedIndex <= lastClippedIndex; clippedIndex += 1) {
            stackColor = compositeClippedMember(stackColor, items[clippedIndex], x, y, replacement)
          }
          color = compositeIsolatedSource(color, item, { ...stackColor, a: baseSource.a })
        }
        itemIndex = lastClippedIndex
      } else {
        color = compositeRegularItem(color, item, x, y, replacement)
      }
    }
    return color
  }
  return (x, y, replacement) => compositeContainer(root, x, y, replacement)
}

/** Composites a pixel while optionally substituting one layer's source color. */
export function createCompositePointSampler(document: SpriteDocument, layerId?: string, replacement?: RgbaColor): (x: number, y: number) => RgbaColor {
  const sample = compileCompositePointSampler(document, layerId)
  return (x, y) => sample(x, y, replacement)
}

/** Uses spatial buckets when the document can be composited as ordinary visible layers. */
export function createNormalCompositePointSampler(document: SpriteDocument): ((x: number, y: number) => RgbaColor) | null {
  const layers = normalCompositeLayers(document)
  if (!layers) return null
  const tileSize = 512
  const columns = Math.max(1, Math.ceil(document.width / tileSize))
  const rows = Math.max(1, Math.ceil(document.height / tileSize))
  const buckets = Array.from({ length: columns * rows }, () => [] as RasterLayer[])
  for (const layer of layers) {
    const left = Math.max(0, layer.offsetX)
    const top = Math.max(0, layer.offsetY)
    const right = Math.min(document.width, layer.offsetX + layer.width)
    const bottom = Math.min(document.height, layer.offsetY + layer.height)
    if (right <= left || bottom <= top) continue
    const fromColumn = Math.floor(left / tileSize)
    const toColumn = Math.min(columns - 1, Math.floor((right - 1) / tileSize))
    const fromRow = Math.floor(top / tileSize)
    const toRow = Math.min(rows - 1, Math.floor((bottom - 1) / tileSize))
    for (let row = fromRow; row <= toRow; row += 1) for (let column = fromColumn; column <= toColumn; column += 1) buckets[row * columns + column].push(layer)
  }
  const paletteById = new Map(document.palette.map((entry) => [entry.id, entry.color]))
  return (x, y) => {
    if (x < 0 || y < 0 || x >= document.width || y >= document.height) return TRANSPARENT
    let outputR = 0
    let outputG = 0
    let outputB = 0
    let outputA = 0
    const column = Math.min(columns - 1, Math.floor(x / tileSize))
    const row = Math.min(rows - 1, Math.floor(y / tileSize))
    for (const layer of buckets[row * columns + column]) {
      const index = layerIndexAt(layer, x, y)
      if (index === null) continue
      const packed = readSurfacePackedLocal(layer, index % layer.width, Math.floor(index / layer.width))
      const source = layer.format === 'rgba' ? unpackColor(packed) : (paletteById.get(packed) ?? TRANSPARENT)
      if (source.a === 0 || layer.opacity <= 0) continue
      if (layer.opacity === 1 && (outputA === 0 || source.a === 255)) {
        outputR = source.r
        outputG = source.g
        outputB = source.b
        outputA = source.a
        continue
      }
      const topAlpha = source.a / 255 * layer.opacity
      const bottomAlpha = outputA / 255
      const nextAlpha = topAlpha + bottomAlpha * (1 - topAlpha)
      if (nextAlpha <= 0) continue
      outputR = Math.round((source.r * topAlpha + outputR * bottomAlpha * (1 - topAlpha)) / nextAlpha)
      outputG = Math.round((source.g * topAlpha + outputG * bottomAlpha * (1 - topAlpha)) / nextAlpha)
      outputB = Math.round((source.b * topAlpha + outputB * bottomAlpha * (1 - topAlpha)) / nextAlpha)
      outputA = Math.round(nextAlpha * 255)
    }
    return { r: outputR, g: outputG, b: outputB, a: outputA }
  }
}

/** Composites document coordinates while accepting a different replacement color for every point. */
export function createCompositePointReplacementSampler(document: SpriteDocument, layerId: string): (x: number, y: number, replacement: RgbaColor) => RgbaColor {
  const sample = compileCompositePointSampler(document, layerId)
  return (x, y, replacement) => sample(x, y, replacement)
}

/** Uses spatially bucketed normal layers when replacement preview compositing does not need the full group tree. */
export function createNormalCompositePointReplacementSampler(document: SpriteDocument, layerId: string): ((x: number, y: number, replacement: RgbaColor) => RgbaColor) | null {
  const layers = normalCompositeLayers(document)
  if (!layers?.some((layer) => layer.id === layerId)) return null
  const tileSize = 512
  const columns = Math.max(1, Math.ceil(document.width / tileSize))
  const rows = Math.max(1, Math.ceil(document.height / tileSize))
  const buckets = Array.from({ length: columns * rows }, () => [] as RasterLayer[])
  for (const layer of layers) {
    const left = layer.id === layerId ? 0 : Math.max(0, layer.offsetX)
    const top = layer.id === layerId ? 0 : Math.max(0, layer.offsetY)
    const right = layer.id === layerId ? document.width : Math.min(document.width, layer.offsetX + layer.width)
    const bottom = layer.id === layerId ? document.height : Math.min(document.height, layer.offsetY + layer.height)
    if (right <= left || bottom <= top) continue
    const fromColumn = Math.floor(left / tileSize)
    const toColumn = Math.min(columns - 1, Math.floor((right - 1) / tileSize))
    const fromRow = Math.floor(top / tileSize)
    const toRow = Math.min(rows - 1, Math.floor((bottom - 1) / tileSize))
    for (let row = fromRow; row <= toRow; row += 1) for (let column = fromColumn; column <= toColumn; column += 1) {
      buckets[row * columns + column].push(layer)
    }
  }
  const paletteById = new Map(document.palette.map((entry) => [entry.id, entry.color]))
  const readSource = (layer: RasterLayer, x: number, y: number, replacement: RgbaColor): RgbaColor => {
    if (layer.id === layerId) return replacement
    const index = layerIndexAt(layer, x, y)
    if (index === null) return TRANSPARENT
    const packed = readSurfacePackedLocal(layer, index % layer.width, Math.floor(index / layer.width))
    return layer.format === 'rgba' ? unpackColor(packed) : (paletteById.get(packed) ?? TRANSPARENT)
  }
  return (x, y, replacement) => {
    if (x < 0 || y < 0 || x >= document.width || y >= document.height) return TRANSPARENT
    let outputR = 0
    let outputG = 0
    let outputB = 0
    let outputA = 0
    const column = Math.min(columns - 1, Math.floor(x / tileSize))
    const row = Math.min(rows - 1, Math.floor(y / tileSize))
    for (const layer of buckets[row * columns + column]) {
      const source = readSource(layer, x, y, replacement)
      if (source.a === 0 || layer.opacity <= 0) continue
      if (layer.opacity === 1 && (outputA === 0 || source.a === 255)) {
        outputR = source.r
        outputG = source.g
        outputB = source.b
        outputA = source.a
        continue
      }
      const topAlpha = source.a / 255 * layer.opacity
      const bottomAlpha = outputA / 255
      const nextAlpha = topAlpha + bottomAlpha * (1 - topAlpha)
      if (nextAlpha <= 0) continue
      outputR = Math.round((source.r * topAlpha + outputR * bottomAlpha * (1 - topAlpha)) / nextAlpha)
      outputG = Math.round((source.g * topAlpha + outputG * bottomAlpha * (1 - topAlpha)) / nextAlpha)
      outputB = Math.round((source.b * topAlpha + outputB * bottomAlpha * (1 - topAlpha)) / nextAlpha)
      outputA = Math.round(nextAlpha * 255)
    }
    return { r: outputR, g: outputG, b: outputB, a: outputA }
  }
}

/** Composites document coordinates through the same compiled layer tree. */
export function createCompositeSampler(document: SpriteDocument, layerId?: string, replacement?: RgbaColor): (index: number) => RgbaColor {
  const samplePoint = createCompositePointSampler(document, layerId, replacement)
  return (index) => samplePoint(index % document.width, Math.floor(index / document.width))
}
