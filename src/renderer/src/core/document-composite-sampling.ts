import { normalizeDocumentColor } from './document-model'
import { createGradientMapSampler } from './gradient-map'
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
import type { PropertyCompositeMemo } from './layer-property-composite-cache'
import {
  unionSelectionRects,
  type CompositeStackItem,
  buildCompositeStack,
  activeCelMasksByLayer,
  activeGroupMasksByGroup
} from './document-composite-plan'

type CompositePointReplacementSampler = (x: number, y: number, replacement: RgbaColor | undefined) => RgbaColor

export const compileCompositePointSampler = (document: SpriteDocument, layerId?: string, styleCache?: DocumentCompositeCache, revision = 0, sourceDirtyRect?: SelectionRect, geometryBoundsOnly = false,
  cacheStaticSource?: (read: (x: number, y: number) => RgbaColor) => (x: number, y: number) => RgbaColor,
  propertyMemo?: PropertyCompositeMemo
): CompositePointReplacementSampler => {
  const paletteById = new Map(document.palette.map((entry) => [entry.id, entry.color]))
  type CompiledItem = {
    adjustment?: ReturnType<typeof createGradientMapSampler>
    containsAdjustment?: boolean
    styleReader?: (x: number, y: number) => RgbaColor
    sourceReader?: (x: number, y: number) => RgbaColor
    colorReader?: (x: number, y: number) => RgbaColor
    replacementDependent?: boolean
    propertyDependent?: boolean
    propertySourceDependent?: boolean
  } & (
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
    if (layer.kind === 'adjustment') readSource = () => TRANSPARENT
    const resolveStyleColor = (styleColor: RgbaColor): RgbaColor => resolveLayerCanvasColor(document, layer, styleColor)
    const styles = hasEnabledLayerStyles(layer.layerStyles)
      ? mapLayerStyleColors(resolveLayerStyles(layer.layerStyles), resolveStyleColor, color => normalizeDocumentColor(document, color))
      : undefined
    const adjustment = layer.kind === 'adjustment' && layer.adjustment?.enabled ? createGradientMapSampler({ ...layer.adjustment.gradientMap, stops: layer.adjustment.gradientMap.stops.map(stop => ({ ...stop, color: normalizeDocumentColor(document, stop.color) })) }) : undefined
    const outputBounds = layer.kind === 'adjustment' ? { x: 0, y: 0, width: document.width, height: document.height } : geometryBoundsOnly
      ? { x: layer.offsetX, y: layer.offsetY, width: layer.width, height: layer.height }
      : layerStyleOutputBounds(styleCache ? styleCache.compositeSourceBounds(document, layer, sourceDirtyRect) : layerContentBounds(document, layer), styles)
    if (layer.id !== layerId) return { kind: 'layer', layer, adjustment, containsAdjustment: Boolean(adjustment), read: readSource, resolveStyleColor, ...(styles ? { styles } : {}), outputBounds }
    return {
      kind: 'layer',
      layer, adjustment, containsAdjustment: Boolean(adjustment),
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
      ? mapLayerStyleColors(resolveLayerStyles(item.group.layerStyles), resolveStyleColor, color => normalizeDocumentColor(document, color))
      : undefined
    return { kind: 'group', group: item.group, children, containsAdjustment: children.some(child => child.containsAdjustment), resolveStyleColor, ...(styles ? { styles } : {}), geometry, outputBounds: layerStyleOutputBounds(sourceBounds, styles) }
  })
  const itemVisibleBeforeCompile = (item: CompiledItem): boolean => item.kind === 'layer'
    ? item.layer.visible && item.layer.opacity > 0
    : item.group.visible && item.group.opacity > 0

  const root = compileContainer(buildCompositeStack(document))
  // A neutral mask can become non-neutral at the point being previewed.
  const activeMasks = activeCelMasksByLayer(document, layerId, geometryBoundsOnly)
  const activeGroupMasks = activeGroupMasksByGroup(document, layerId, geometryBoundsOnly)
  const itemMask = (item: CompiledItem): LayerMask | undefined => item.kind === 'layer' ? activeMasks.get(item.layer.id) : activeGroupMasks.get(item.group.id)
  const markReplacementDependencies = (item: CompiledItem): boolean => {
    // Visit every child even after finding a dependency: each branch needs its
    // own flag, including layer/group masks being previewed as replacements.
    const children = item.kind === 'group' ? item.children.map(markReplacementDependencies) : []
    return item.replacementDependent = itemMask(item)?.id === layerId
      || (item.kind === 'layer' ? item.layer.id === layerId : children.some(Boolean))
  }
  if (cacheStaticSource) root.forEach(markReplacementDependencies)
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
  const prefixes = new Map<CompiledItem[], { end: number; read: (x: number, y: number) => RgbaColor }>()
  if (propertyMemo) {
    const prepare = (items: CompiledItem[], owner: object): boolean => {
      for (const item of items) {
        item.propertySourceDependent = item.kind === 'group' && prepare(item.children, item.group)
        item.propertyDependent = item.propertySourceDependent || propertyMemo.targets.has(item.kind === 'layer' ? item.layer.id : item.group.id)
      }
      let end = items.findIndex(item => item.propertyDependent)
      if (end < 0) end = items.length
      // A clipping chain is one blend operation; never cache its base alone.
      while (end > 0 && end < items.length && clipsToLowerSibling(items[end])) end--
      if (end > 0) {
        const prefix = items.slice(0, end)
        prefixes.set(items, { end, read: propertyMemo.read(owner, 'backdrop', (x, y) => compositeContainer(prefix, x, y, undefined)) })
      }
      return items.some(item => item.propertyDependent)
    }
    prepare(root, document)
  }
  function isolatedItemSource(item: CompiledItem, x: number, y: number, replacement: RgbaColor | undefined): RgbaColor {
    if (cacheStaticSource && (replacement === undefined || !item.replacementDependent)) {
      item.sourceReader ??= cacheStaticSource((sx, sy) => uncachedItemSource(item, sx, sy, undefined))
      return item.sourceReader(x, y)
    }
    return uncachedItemSource(item, x, y, replacement)
  }
  function uncachedItemSource(item: CompiledItem, x: number, y: number, replacement: RgbaColor | undefined): RgbaColor {
    if (!itemVisible(item)) return TRANSPARENT
    return item.kind === 'group'
      ? applyItemMask(item, compositeContainer(item.children, x, y, replacement), x, y, replacement)
      : applyItemMask(item, item.read(x, y, replacement), x, y, replacement)
  }
  function isolatedItemColor(item: CompiledItem, x: number, y: number, replacement: RgbaColor | undefined): RgbaColor {
    if (propertyMemo && !item.propertySourceDependent && replacement === undefined) {
      item.colorReader ??= propertyMemo.read(item.kind === 'layer' ? item.layer : item.group, 'source', (sx, sy) => uncachedItemColor(item, sx, sy, undefined))
      return item.colorReader(x, y)
    }
    if (cacheStaticSource && (replacement === undefined || !item.replacementDependent)) {
      item.colorReader ??= cacheStaticSource((sx, sy) => uncachedItemColor(item, sx, sy, undefined))
      return item.colorReader(x, y)
    }
    return uncachedItemColor(item, x, y, replacement)
  }
  function uncachedItemColor(item: CompiledItem, x: number, y: number, replacement: RgbaColor | undefined): RgbaColor {
    const inCanvas = (sx: number, sy: number): boolean => sx >= 0 && sy >= 0 && sx < document.width && sy < document.height
    // Preserve editable overflow pixels, but neither generate effects there
    // nor use them as a source for effects inside the canvas.
    if (item.styles && !inCanvas(x, y)) return isolatedItemSource(item, x, y, replacement)
    const readStyleSource = (sx: number, sy: number): RgbaColor => inCanvas(sx, sy)
      ? isolatedItemSource(item, sx, sy, undefined) : TRANSPARENT
    if (item.styles && styleCache && replacement === undefined) {
      if (!item.styleReader) {
        const owner = item.kind === 'layer' ? item.layer : item.group
        const geometry = item.kind === 'layer' ? { x: item.layer.offsetX, y: item.layer.offsetY, width: item.layer.width, height: item.layer.height } : item.geometry
        item.styleReader = styleCache.isolatedStyleReader(document, owner, geometry, item.styles,
          readStyleSource, item.resolveStyleColor, revision, sourceDirtyRect)
      }
      return item.styleReader(x, y)
    }
    const source = isolatedItemSource(item, x, y, replacement)
    if (!item.styles) return source
    const geometry = item.kind === 'layer' ? item.layer : item.geometry
    return applyLayerStylesAt(geometry, item.styles, x, y, source, readStyleSource, item.resolveStyleColor)
  }
  function compositeIsolatedSource(backdrop: RgbaColor, item: CompiledItem, source: RgbaColor): RgbaColor {
    const opacity = itemOpacity(item)
    if (source.a === 0 || opacity <= 0) return backdrop
    const blendMode = itemBlendMode(item)
    return opacity === 1 && (backdrop.a === 0 || (blendMode === 'normal' && source.a === 255))
      ? source
      : blendWithMode(backdrop, source, opacity, blendMode)
  }
  function compositeAdjustment(backdrop: RgbaColor, item: CompiledItem, x: number, y: number, replacement: RgbaColor | undefined): RgbaColor {
    if (!item.adjustment || backdrop.a === 0 || x < 0 || y < 0 || x >= document.width || y >= document.height) return backdrop
    const mask = itemMask(item)
    const amount = itemOpacity(item) * (mask ? readMaskCoverage(mask, x, y, replacement) / 255 : 1)
    const mapped = normalizeDocumentColor(document, item.adjustment(backdrop, x, y))
    if (itemBlendMode(item) === 'normal') return {
      r: Math.round(backdrop.r * (1 - amount) + mapped.r * amount),
      g: Math.round(backdrop.g * (1 - amount) + mapped.g * amount),
      b: Math.round(backdrop.b * (1 - amount) + mapped.b * amount), a: backdrop.a
    }
    const blended = blendWithMode({ ...backdrop, a: 255 }, { ...mapped, a: 255 }, amount, itemBlendMode(item))
    return { ...blended, a: backdrop.a }
  }
  function compositeRegularItem(backdrop: RgbaColor, item: CompiledItem, x: number, y: number, replacement: RgbaColor | undefined): RgbaColor {
    if (!itemVisible(item) || itemOpacity(item) <= 0) return backdrop
    if (item.adjustment) return compositeAdjustment(backdrop, item, x, y, replacement)
    if (item.kind === 'layer') return compositeIsolatedSource(backdrop, item, isolatedItemColor(item, x, y, replacement))
    if (item.group.cumulativeBlend === true && !item.styles && !item.containsAdjustment) {
      const isolatedColor = isolatedItemColor(item, x, y, replacement)
      if (isolatedColor.a === 0) return backdrop
      const cumulativeColor = applyItemMask(item, compositeContainer(item.children, x, y, replacement, backdrop), x, y, replacement)
      return blendWithMode(backdrop, cumulativeColor, item.group.opacity, item.group.blendMode)
    }
    if (item.group.blendMode === 'normal' && item.group.opacity === 1 && !itemMask(item) && !item.styles && !item.containsAdjustment) return compositeContainer(item.children, x, y, replacement, backdrop)
    return compositeIsolatedSource(backdrop, item, isolatedItemColor(item, x, y, replacement))
  }
  function compositeClippedMember(backdrop: RgbaColor, item: CompiledItem, x: number, y: number, replacement: RgbaColor | undefined): RgbaColor {
    if (!itemVisible(item) || itemOpacity(item) <= 0) return backdrop
    if (item.adjustment) return compositeAdjustment(backdrop, item, x, y, replacement)
    if (item.kind === 'layer') return compositeIsolatedSource(backdrop, item, isolatedItemColor(item, x, y, replacement))
    if (item.group.cumulativeBlend === true && !item.styles && !item.containsAdjustment) {
      const isolatedColor = isolatedItemColor(item, x, y, replacement)
      if (isolatedColor.a === 0) return backdrop
      const cumulativeColor = applyItemMask(item, compositeContainer(item.children, x, y, replacement, backdrop), x, y, replacement)
      return blendWithMode(backdrop, cumulativeColor, item.group.opacity, item.group.blendMode)
    }
    return compositeIsolatedSource(backdrop, item, isolatedItemColor(item, x, y, replacement))
  }
  function compositeContainer(items: CompiledItem[], x: number, y: number, replacement: RgbaColor | undefined, backdrop: RgbaColor = TRANSPARENT): RgbaColor {
    // Passthrough/cumulative groups inherit a live backdrop and cannot use an
    // isolated prefix without changing per-layer rounding and blend semantics.
    const prefix = replacement === undefined && backdrop === TRANSPARENT ? prefixes.get(items) : undefined
    let color = prefix ? prefix.read(x, y) : backdrop
    for (let itemIndex = prefix?.end ?? 0; itemIndex < items.length; itemIndex += 1) {
      const item = items[itemIndex]
      if (!item.adjustment && items[itemIndex + 1] && clipsToLowerSibling(items[itemIndex + 1])) {
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

/** Composites document coordinates while accepting a different replacement color for every point. */
export function createCompositePointReplacementSampler(document: SpriteDocument, layerId: string): (x: number, y: number, replacement: RgbaColor) => RgbaColor {
  const sample = compileCompositePointSampler(document, layerId)
  return (x, y, replacement) => sample(x, y, replacement)
}

/** Composites document coordinates through the same compiled layer tree. */
export function createCompositeSampler(document: SpriteDocument, layerId?: string, replacement?: RgbaColor): (index: number) => RgbaColor {
  const samplePoint = createCompositePointSampler(document, layerId, replacement)
  return (index) => samplePoint(index % document.width, Math.floor(index / document.width))
}

export { createNormalCompositePointSampler, createNormalCompositePointReplacementSampler } from './document-composite-normal-sampling'
