import { layerStyleCoverageTile } from './layer-style-coverage'
import { LayerStyleTileCache } from './layer-style-tile-cache'
import type { PaletteEntry, RgbaColor } from '@shared/types-color'
import type { LayerGroup, RasterLayer } from '@shared/types-layer'
import type { LayerStyles } from '@shared/types-layer-style'
import type { SelectionRect } from '@shared/types-selection'
import type { SpriteDocument } from '@shared/types-document'
import { packColor, TRANSPARENT, unpackColor, writeRgbaPixel } from './raster'
import {
  lazyRuntimeRasterForSurface,
  rasterStorageIdentity,
  readSurfacePackedLocal,
  runtimeRasterForSurface,
  runtimeTileHasVisiblePixels
} from './runtime-raster'
import {
  applyLayerStylesAt,
  applySimpleLayerStylesPacked,
  hasEnabledLayerStyles,
  layerStyleAffectedRect,
  layerStyleBinaryStrokeMetric,
  layerStyleOutputBounds,
  layerStylesSignature,
  mapLayerStyleColors,
  resolveLayerStyles,
  type LayerStyleGeometry
} from './layer-styles'
import {
  animationMaskAt,
  rasterContentBounds,
  getLayerContentRevision,
  rasterContentPaletteKey,
  isGroupEffectivelyVisible,
  isLayerEffectivelyVisible,
  resolveLayerCanvasColor,
  cacheRasterContentBounds
} from './document-model'
import {
  type CompositeStackItem,
  activeCelMasksByLayer,
  activeGroupMasksByGroup,
  unionSelectionRects,
  normalCompositeLayers,
  opacityGroupCompositeStack
} from './document-composite-plan'
import {
  type StyledLayerBlockCache,
  styledLayerBlockCacheFor,
  STYLED_LAYER_BLOCK_SIZE,
  EMPTY_STYLED_LAYER_PIXELS,
  STYLED_LAYER_PROXY,
  type StyledLayerBlock
} from './document-composite-style-types'
import {
  localRectForLayer,
  visibleBoundsWithinLocalRect,
  incrementalContentBounds,
  intersectRect,
  localBinaryStyleFields,
  hasCompleteBinaryStyleCoverage,
  distanceFieldAt
} from './document-composite-style-geometry'
import { compositeRgbaRowWithOpaqueSpans, compositeNormalLayers, compositeMovePreviewLayersInto } from './document-composite-raster'

export class DocumentCompositeCache {
  private rowRanges = new WeakMap<object, Map<string, { contentRevision: number; ranges: Int32Array }>>()
  private visibleTiles = new WeakMap<object, Map<string, Map<number, boolean>>>()
  private normalLayerPlans = new WeakMap<SpriteDocument, { revision: number; frameId: string; layers: RasterLayer[] | null }>()
  private movePreviewLayerPlans = new WeakMap<SpriteDocument, { revision: number; frameId: string; layers: RasterLayer[] | null }>()
  private styledLayerPlans = new WeakMap<SpriteDocument, { revision: number; frameId: string; layers: RasterLayer[] | null }>()
  private opacityGroupPlans = new WeakMap<SpriteDocument, { revision: number; frameId: string; items: CompositeStackItem[] | null }>()
  private styledLayerBlocks = new WeakMap<RasterLayer, StyledLayerBlockCache>()
  private isolatedStyleTiles = new LayerStyleTileCache()
  private trackedStyleDocuments = new WeakSet<SpriteDocument>()
  private pendingStyleSources = new WeakMap<object, SelectionRect>()
  private styleSourceBounds = new WeakMap<RasterLayer, { storage: object; key: string; revision: number; bounds: SelectionRect | null }>()

  private compiledStyleSourceBounds(document: SpriteDocument, layer: RasterLayer, fallback?: SelectionRect): SelectionRect | null {
    const dirty = this.trackedStyleDocuments.has(document) ? this.pendingStyleSources.get(layer) : fallback
    const storage = rasterStorageIdentity(layer), revision = getLayerContentRevision(layer)
    const key = `${layer.width}:${layer.height}:${rasterContentPaletteKey(layer, document.palette)}`
    const cached = this.styleSourceBounds.get(layer)
    let bounds: SelectionRect | null
    if (!cached || cached.storage !== storage || cached.key !== key) bounds = rasterContentBounds(layer, document.palette)
    else if (dirty) {
      const local = localRectForLayer(dirty, layer), previous = cached.bounds
      // An interior edit cannot change the exact outer bounds. At an edge,
      // recompute exactly: group gradient geometry must also shrink on erase.
      bounds = previous && local.x > previous.x && local.y > previous.y
        && local.x + local.width < previous.x + previous.width && local.y + local.height < previous.y + previous.height
        ? previous : visibleBoundsWithinLocalRect(document, layer, { x: 0, y: 0, width: layer.width, height: layer.height })
    } else bounds = cached.revision === revision ? cached.bounds : rasterContentBounds(layer, document.palette)
    this.styleSourceBounds.set(layer, { storage, key, revision, bounds })
    return bounds ? { ...bounds, x: layer.offsetX + bounds.x, y: layer.offsetY + bounds.y } : null
  }

  compositeSourceBounds(document: SpriteDocument, layer: RasterLayer, dirty?: SelectionRect): SelectionRect | null {
    return this.compiledStyleSourceBounds(document, layer, dirty)
  }

  /** Keep source ownership and every edit until the relevant cache consumes it. */
  invalidateStyleSources(document: SpriteDocument, rect: SelectionRect, ownerIds?: readonly string[]): void {
    this.trackedStyleDocuments.add(document)
    const ids = ownerIds ? new Set(ownerIds) : null
    if (ids) for (const [ownerId, mask] of [...activeCelMasksByLayer(document), ...activeGroupMasksByGroup(document)]) {
      if (ids.has(mask.id)) ids.add(ownerId)
    }
    const owners: Array<RasterLayer | LayerGroup> = [...document.layers, ...document.groups]
    for (const owner of owners) {
      if (ids && !ids.has(owner.id)) continue
      let current: RasterLayer | LayerGroup | undefined = owner
      let affected = rect
      const visited = new Set<string>()
      while (current && !visited.has(current.id)) {
        visited.add(current.id)
        const previous = this.pendingStyleSources.get(current)
        this.pendingStyleSources.set(current, previous ? unionSelectionRects(previous, affected) : { ...affected })
        affected = layerStyleAffectedRect(affected, current.layerStyles)
        const parentId: string | null | undefined = 'parentGroupId' in current ? current.parentGroupId : (current as RasterLayer).groupId
        current = document.groups.find(group => group.id === parentId)
      }
    }
  }

  private takeStyleSourceDirty(document: SpriteDocument, owner: object, fallback?: SelectionRect): SelectionRect | undefined {
    if (!this.trackedStyleDocuments.has(document)) return fallback
    const rect = this.pendingStyleSources.get(owner)
    this.pendingStyleSources.delete(owner)
    return rect
  }

  isolatedStyleReader(document: SpriteDocument, owner: RasterLayer | LayerGroup, geometry: LayerStyleGeometry, styles: LayerStyles,
    read: (x: number, y: number) => RgbaColor, resolve: (color: RgbaColor) => RgbaColor, revision: number, fallback?: SelectionRect): (x: number, y: number) => RgbaColor {
    const dirty = this.takeStyleSourceDirty(document, owner, fallback)
    const key = `${document.animation?.activeFrameId ?? 'static'}:${document.colorMode}:${geometry.x},${geometry.y},${geometry.width},${geometry.height}:${layerStylesSignature(styles)}:${document.palette.map(entry => `${entry.id},${entry.color.r},${entry.color.g},${entry.color.b},${entry.color.a}`).join(';')}`
    return this.isolatedStyleTiles.prepare(owner, key, revision, dirty, geometry, styles, read, resolve)
  }

  invalidateAll(): void {
    this.rowRanges = new WeakMap()
    this.visibleTiles = new WeakMap()
    this.normalLayerPlans = new WeakMap()
    this.movePreviewLayerPlans = new WeakMap()
    this.styledLayerPlans = new WeakMap()
    this.opacityGroupPlans = new WeakMap()
    this.styledLayerBlocks = new WeakMap()
    this.isolatedStyleTiles = new LayerStyleTileCache()
    this.pendingStyleSources = new WeakMap()
    this.trackedStyleDocuments = new WeakSet()
    this.styleSourceBounds = new WeakMap()
  }

  /** Drop source-derived visibility indexes while a live stroke mutates pixels. */
  invalidateLiveSourceCaches(): void {
    this.rowRanges = new WeakMap()
    this.visibleTiles = new WeakMap()
  }

  /** A translation preserves a layer's own style pixels, but changes the
   * composite inside ancestor groups and masks that do not follow the owner. */
  invalidateLayerPlacementSources(document: SpriteDocument, rect: SelectionRect, layerIds?: readonly string[]): void {
    const ids = layerIds ? new Set(layerIds) : null
    const affected = new Set<string>()
    for (const layer of document.layers) {
      if (ids && !ids.has(layer.id)) continue
      if (layer.groupId) affected.add(layer.groupId)
      const mask = document.animation ? animationMaskAt(document.animation, layer.id, document.animation.activeFrameId) : null
      if (layer.clippingMask || mask?.moveWithOwner === false) affected.add(layer.id)
    }
    if (affected.size) this.invalidateStyleSources(document, rect, [...affected])
  }

  /** Drop placement plans while a live move mutates layer offsets in place. */
  invalidateLayerPlacementCaches(): void {
    // Normal and GPU move plans keep references to the live layer objects, so
    // their offsets are read on every composite. Styled plans, however,
    // contain derived proxy objects whose offsets must be rebuilt.
    this.styledLayerPlans = new WeakMap()
  }

  normalLayersFor(document: SpriteDocument, revision: number, sourceDirtyRect?: SelectionRect): RasterLayer[] | null {
    const frameId = document.animation?.activeFrameId ?? 'static'
    const cached = this.normalLayerPlans.get(document)
    if (cached && cached.revision === revision && cached.frameId === frameId) {
      return cached.layers
    }
    const layers = normalCompositeLayers(document)
    this.normalLayerPlans.set(document, { revision, frameId, layers })
    return layers
  }

  renderLayersFor(document: SpriteDocument, revision: number, sourceDirtyRect?: SelectionRect): RasterLayer[] | null {
    const normal = this.normalLayersFor(document, revision, sourceDirtyRect)
    if (normal) return normal
    const frameId = document.animation?.activeFrameId ?? 'static'
    const cached = this.styledLayerPlans.get(document)
    // Live paint mutates the active surface before the document revision is
    // committed. A dirty source region must therefore refresh styled proxies
    // even while the outer revision remains unchanged.
    const cachedSourcesAreCurrent = cached?.layers === null || cached?.layers?.every((layer) => {
      const styled = styledLayerBlockCacheFor(layer)
      return !styled || styled.contentRevision === getLayerContentRevision(styled.sourceLayer)
    })
    if (cached && cached.revision === revision && cached.frameId === frameId && !sourceDirtyRect && cachedSourcesAreCurrent
      && !document.layers.some(layer => this.pendingStyleSources.has(layer))) return cached.layers
    const unsupportedGroup = document.groups.some((group) => isGroupEffectivelyVisible(document, group) && (group.blendMode !== 'normal'
      || group.opacity !== 1
      || group.cumulativeBlend === true
      || group.clippingMask === true
      || hasEnabledLayerStyles(group.layerStyles)))
    const unsupportedLayer = document.layers.some((layer) => isLayerEffectivelyVisible(document, layer) && layer.opacity > 0 && (layer.clippingMask === true || layer.blendMode !== 'normal'))
    const hasMasks = activeCelMasksByLayer(document).size > 0 || activeGroupMasksByGroup(document).size > 0
    if (unsupportedGroup || unsupportedLayer || hasMasks) {
      this.styledLayerPlans.set(document, { revision, frameId, layers: null })
      return null
    }
    const preparedLayers = document.layers.map((layer) => hasEnabledLayerStyles(layer.layerStyles)
      ? this.styledLayer(document, layer, sourceDirtyRect)
      : layer)
    const layers = normalCompositeLayers({ ...document, layers: preparedLayers })
    this.styledLayerPlans.set(document, { revision, frameId, layers })
    return layers
  }

  /**
   * Returns a flat, bottom-to-top stack for move previews. Unlike the normal
   * render plan this permits a layer blend mode, but still rejects every
   * group/layer feature whose result depends on the surrounding stack.
   */
  movePreviewLayersFor(document: SpriteDocument, revision: number): RasterLayer[] | null {
    const frameId = document.animation?.activeFrameId ?? 'static'
    const cached = this.movePreviewLayerPlans.get(document)
    if (cached && cached.revision === revision && cached.frameId === frameId) return cached.layers
    const layers = normalCompositeLayers(document, true)
    this.movePreviewLayerPlans.set(document, { revision, frameId, layers })
    return layers
  }

  /** Returns the editable source behind a styled render proxy. */
  sourceLayerFor(layer: RasterLayer): RasterLayer {
    return styledLayerBlockCacheFor(layer)?.sourceLayer ?? layer
  }

  opacityGroupStackFor(document: SpriteDocument, revision: number): CompositeStackItem[] | null {
    const frameId = document.animation?.activeFrameId ?? 'static'
    const cached = this.opacityGroupPlans.get(document)
    if (cached && cached.revision === revision && cached.frameId === frameId) return cached.items
    const items = opacityGroupCompositeStack(document)
    this.opacityGroupPlans.set(document, { revision, frameId, items })
    return items
  }

  private invalidateStyledLayerBlocks(cache: StyledLayerBlockCache, rect: SelectionRect): void {
    const affected = rect
    const fromX = Math.floor(affected.x / STYLED_LAYER_BLOCK_SIZE)
    const fromY = Math.floor(affected.y / STYLED_LAYER_BLOCK_SIZE)
    const toX = Math.floor((affected.x + affected.width - 1) / STYLED_LAYER_BLOCK_SIZE)
    const toY = Math.floor((affected.y + affected.height - 1) / STYLED_LAYER_BLOCK_SIZE)
    for (let blockY = fromY; blockY <= toY; blockY += 1) for (let blockX = fromX; blockX <= toX; blockX += 1) {
      cache.blocks.delete(`${blockX}:${blockY}`)
    }
  }

  private styledLayerBlockProxy(document: SpriteDocument, sourceLayer: RasterLayer, sourceDirtyRect?: SelectionRect): RasterLayer {
    sourceDirtyRect = this.takeStyleSourceDirty(document, sourceLayer, sourceDirtyRect)
    const styleKey = layerStylesSignature(sourceLayer.layerStyles)
    const paletteKey = sourceLayer.format === 'indexed'
      ? document.palette.map((entry) => `${entry.id}:${entry.color.r}:${entry.color.g}:${entry.color.b}:${entry.color.a}`).join(',')
      : ''
    const storage = rasterStorageIdentity(sourceLayer)
    const contentRevision = getLayerContentRevision(sourceLayer)
    let cached = this.styledLayerBlocks.get(sourceLayer)
    if (!cached
      || cached.storage !== storage
      || cached.colorMode !== document.colorMode
      || cached.styleKey !== styleKey
      || cached.paletteKey !== paletteKey
      || cached.sourceWidth !== sourceLayer.width
      || cached.sourceHeight !== sourceLayer.height
      || cached.sourceLayer.format !== sourceLayer.format) {
      const styles = resolveLayerStyles(sourceLayer.layerStyles)
      const resolvedStyles = mapLayerStyleColors(styles, (color) => resolveLayerCanvasColor(document, sourceLayer, color))
      const sourceContentBounds = rasterContentBounds(sourceLayer, document.palette)
      const outputBounds = layerStyleOutputBounds(sourceContentBounds, resolvedStyles)
      const localX = outputBounds?.x ?? 0
      const localY = outputBounds?.y ?? 0
      const width = Math.max(1, outputBounds?.width ?? 1)
      const height = Math.max(1, outputBounds?.height ?? 1)
      const layer = {
        ...sourceLayer,
        format: 'rgba' as const,
        width,
        height,
        offsetX: sourceLayer.offsetX + localX,
        offsetY: sourceLayer.offsetY + localY,
        pixels: EMPTY_STYLED_LAYER_PIXELS,
        runtimeRaster: undefined,
        layerStyles: undefined
      } as RasterLayer
      cached = {
        sourceLayer,
        storage,
        colorMode: document.colorMode,
        styleKey,
        paletteKey,
        styles,
        resolvedStyles,
        resolveStyleColor: (color) => resolveLayerCanvasColor(document, sourceLayer, color),
        palette: sourceLayer.format === 'indexed' ? new Map(document.palette.map((entry) => [entry.id, entry.color])) : null,
        palettePacked: sourceLayer.format === 'indexed' ? new Map(document.palette.map((entry) => [entry.id, packColor(entry.color)])) : null,
        contentRevision,
        sourceContentBounds,
        sourceWidth: sourceLayer.width,
        sourceHeight: sourceLayer.height,
        localX,
        localY,
        width,
        height,
        blocks: new Map(),
        layer
      }
      this.styledLayerBlocks.set(sourceLayer, cached)
    }
    if (!cached) throw new Error('styled layer cache was not created')
    if (cached.contentRevision !== contentRevision || sourceDirtyRect) {
      let localBounds: SelectionRect | null
      if (sourceDirtyRect) {
        const dirtyLocal = localRectForLayer(sourceDirtyRect, sourceLayer)
        localBounds = incrementalContentBounds(document, sourceLayer, cached.sourceContentBounds, dirtyLocal)
        const outputBounds = layerStyleOutputBounds(localBounds, cached.resolvedStyles)
        const localX = outputBounds?.x ?? 0
        const localY = outputBounds?.y ?? 0
        const width = Math.max(1, outputBounds?.width ?? 1)
        const height = Math.max(1, outputBounds?.height ?? 1)
        // Unchanged fixed tiles remain valid when the visible output grows.
        this.invalidateStyledLayerBlocks(cached, layerStyleAffectedRect(dirtyLocal, cached.resolvedStyles))
        cached.localX = localX
        cached.localY = localY
        cached.width = width
        cached.height = height
      } else {
        localBounds = rasterContentBounds(sourceLayer, document.palette)
        const outputBounds = layerStyleOutputBounds(localBounds, cached.resolvedStyles)
        const localX = outputBounds?.x ?? 0
        const localY = outputBounds?.y ?? 0
        const width = Math.max(1, outputBounds?.width ?? 1)
        const height = Math.max(1, outputBounds?.height ?? 1)
        cached.blocks.clear()
        cached.localX = localX
        cached.localY = localY
        cached.width = width
        cached.height = height
      }
      cached.sourceContentBounds = localBounds
      cached.contentRevision = contentRevision
    }

    cached.sourceLayer = sourceLayer
    Object.assign(cached.layer, {
      ...sourceLayer,
      format: 'rgba' as const,
      width: cached.width,
      height: cached.height,
      offsetX: sourceLayer.offsetX + cached.localX,
      offsetY: sourceLayer.offsetY + cached.localY,
      pixels: EMPTY_STYLED_LAYER_PIXELS,
      runtimeRaster: undefined,
      layerStyles: undefined
    })
    Object.defineProperty(cached.layer, STYLED_LAYER_PROXY, {
      configurable: true,
      enumerable: true,
      value: cached
    })
    return cached.layer
  }

  private renderStyledLayerBlock(document: SpriteDocument, cache: StyledLayerBlockCache, block: StyledLayerBlock): Uint8ClampedArray {
    const pixels = new Uint8ClampedArray(block.width * block.height * 4)
    const sourceLayer = cache.sourceLayer
    const styles = cache.resolvedStyles
    const sourceBounds = { x: 0, y: 0, width: sourceLayer.width, height: sourceLayer.height }
    const rendersOutsideSource = styles.shadow.enabled
      || (styles.stroke.enabled && styles.stroke.position !== 'inside')
    if (!rendersOutsideSource && !intersectRect(block, sourceBounds)) return pixels

    const readSourcePacked = (x: number, y: number): number => {
      if (x < 0 || y < 0 || x >= sourceLayer.width || y >= sourceLayer.height) return 0
      const packed = readSurfacePackedLocal(sourceLayer, x, y)
      return sourceLayer.format === 'rgba' ? packed : (cache.palettePacked!.get(packed) ?? 0)
    }
    const readSource = (x: number, y: number): RgbaColor => {
      if (x < 0 || y < 0 || x >= sourceLayer.width || y >= sourceLayer.height) return TRANSPARENT
      const packed = readSurfacePackedLocal(sourceLayer, x, y)
      return sourceLayer.format === 'rgba' ? unpackColor(packed) : (cache.palette!.get(packed) ?? TRANSPARENT)
    }
    const binaryStrokeMetric = styles.stroke.enabled ? layerStyleBinaryStrokeMetric(styles.stroke) : null
    const localFields = localBinaryStyleFields(document, sourceLayer, block, styles, binaryStrokeMetric)
    const alphaCoverage = localFields ? undefined : layerStyleCoverageTile(block, styles, (x, y) => readSourcePacked(x, y) >>> 24)
    const completeCoverage = localFields ? hasCompleteBinaryStyleCoverage(styles, localFields)
      : Boolean(alphaCoverage && (!styles.stroke.enabled || ((styles.stroke.position === 'inside' || alphaCoverage.outsideStroke) && (styles.stroke.position === 'outside' || alphaCoverage.insideStroke))))
    const canUsePackedStyle = completeCoverage
      && !styles.stroke.enabled
      && !styles.stroke.smartHue
      && !styles.colorOverlay.enabled
      && !styles.gradientOverlay.enabled
      && (styles.shadow.enabled || styles.innerGlow.enabled || styles.stroke.enabled)

    const geometry = { x: 0, y: 0, width: sourceLayer.width, height: sourceLayer.height }

    for (let y = 0; y < block.height; y += 1) for (let x = 0; x < block.width; x += 1) {
      const sourceX = block.x + x
      const sourceY = block.y + y
      const sourcePacked = readSourcePacked(sourceX, sourceY)
      const sourceColor = sourceLayer.format === 'rgba' ? unpackColor(sourcePacked) : (cache.palette!.get(sourcePacked) ?? TRANSPARENT)
      if (!rendersOutsideSource && sourceColor.a === 0) continue
      const shadowDistanceAtPixel = localFields?.shadow
        ? distanceFieldAt(localFields.shadow, sourceX - styles.shadow.offsetX, sourceY - styles.shadow.offsetY)
        : 0
      const innerGlowDistanceAtPixel = localFields?.innerGlow
        ? distanceFieldAt(localFields.innerGlow, sourceX, sourceY)
        : 0
      const shadowCoverage = localFields?.shadow
        ? shadowDistanceAtPixel <= styles.shadow.blur ? 1 - shadowDistanceAtPixel / (styles.shadow.blur + 1) : 0
        : alphaCoverage?.shadow?.[y * block.width + x]
      const innerGlowCoverage = localFields?.innerGlow
        ? innerGlowDistanceAtPixel <= styles.innerGlow.size
          ? (styles.innerGlow.size - innerGlowDistanceAtPixel + 1) / styles.innerGlow.size
          : 0
        : alphaCoverage?.innerGlow?.[y * block.width + x]
      const outsideStrokeCoverage = localFields?.strokeOutside
        ? distanceFieldAt(localFields.strokeOutside, sourceX, sourceY) <= styles.stroke.size ? 1 : 0
        : alphaCoverage?.outsideStroke?.[y * block.width + x]
      const insideStrokeCoverage = localFields?.strokeInside
        ? distanceFieldAt(localFields.strokeInside, sourceX, sourceY) <= styles.stroke.size ? 1 : 0
        : alphaCoverage?.insideStroke?.[y * block.width + x]
      if (canUsePackedStyle) {
        const packed = applySimpleLayerStylesPacked(
          styles,
          sourceX,
          sourceY,
          sourcePacked,
          readSource,
          shadowCoverage,
          innerGlowCoverage,
          outsideStrokeCoverage,
          insideStrokeCoverage
        )
        if (packed !== null) {
          writeRgbaPixel(pixels, y * block.width + x, unpackColor(packed))
          continue
        }
      }
      writeRgbaPixel(pixels, y * block.width + x, applyLayerStylesAt(
        geometry,
        styles,
        sourceX,
        sourceY,
        sourceColor,
        readSource,
        cache.resolveStyleColor,
        {
          shadow: shadowCoverage,
          innerGlow: innerGlowCoverage,
          // The directed stroke sampler owns both geometry and the optional
          // follow-opacity alpha. Coverage tiles cannot represent that
          // source choice without changing the result at diagonal corners.
          outsideStroke: styles.stroke.enabled ? undefined : outsideStrokeCoverage,
          insideStroke: styles.stroke.enabled ? undefined : insideStrokeCoverage
        }
      ))
    }
    return pixels
  }

  private styledLayerBlockFor(document: SpriteDocument, cache: StyledLayerBlockCache, blockX: number, blockY: number): StyledLayerBlock {
    const key = `${blockX}:${blockY}`
    const cached = cache.blocks.get(key)
    if (cached) return cached
    const x = blockX * STYLED_LAYER_BLOCK_SIZE
    const y = blockY * STYLED_LAYER_BLOCK_SIZE
    const block: StyledLayerBlock = {
      x,
      y,
      width: STYLED_LAYER_BLOCK_SIZE,
      height: STYLED_LAYER_BLOCK_SIZE,
      pixels: new Uint8ClampedArray(0)
    }
    block.pixels = this.renderStyledLayerBlock(document, cache, block)
    cache.blocks.set(key, block)
    return block
  }

  compositeStyledLayerInto(document: SpriteDocument, layer: RasterLayer, startX: number, startY: number, width: number, height: number, output: Uint8ClampedArray): void {
    const cache = styledLayerBlockCacheFor(layer)
    if (!cache || !layer.visible || layer.opacity <= 0) return
    const left = Math.max(startX, layer.offsetX)
    const top = Math.max(startY, layer.offsetY)
    const right = Math.min(startX + width, layer.offsetX + cache.width)
    const bottom = Math.min(startY + height, layer.offsetY + cache.height)
    if (right <= left || bottom <= top) return
    const fromBlockX = Math.floor((left - cache.sourceLayer.offsetX) / STYLED_LAYER_BLOCK_SIZE)
    const toBlockX = Math.floor((right - 1 - cache.sourceLayer.offsetX) / STYLED_LAYER_BLOCK_SIZE)
    const fromBlockY = Math.floor((top - cache.sourceLayer.offsetY) / STYLED_LAYER_BLOCK_SIZE)
    const toBlockY = Math.floor((bottom - 1 - cache.sourceLayer.offsetY) / STYLED_LAYER_BLOCK_SIZE)
    const opacity = layer.opacity
    for (let blockY = fromBlockY; blockY <= toBlockY; blockY += 1) for (let blockX = fromBlockX; blockX <= toBlockX; blockX += 1) {
      const block = this.styledLayerBlockFor(document, cache, blockX, blockY)
      const blockLeft = layer.offsetX + block.x - cache.localX
      const blockTop = layer.offsetY + block.y - cache.localY
      const overlapLeft = Math.max(left, blockLeft)
      const overlapTop = Math.max(top, blockTop)
      const overlapRight = Math.min(right, blockLeft + block.width)
      const overlapBottom = Math.min(bottom, blockTop + block.height)
      if (overlapRight <= overlapLeft || overlapBottom <= overlapTop) continue
      for (let documentY = overlapTop; documentY < overlapBottom; documentY += 1) {
        const sourceOffset = ((documentY - blockTop) * block.width + overlapLeft - blockLeft) * 4
        const outputOffset = ((documentY - startY) * width + overlapLeft - startX) * 4
        if (opacity === 1) {
          compositeRgbaRowWithOpaqueSpans(output, block.pixels, sourceOffset, outputOffset, overlapRight - overlapLeft)
          continue
        }
        let sourcePixelOffset = sourceOffset
        let targetPixelOffset = outputOffset
        for (let documentX = overlapLeft; documentX < overlapRight; documentX += 1) {
          const sourceAlpha = block.pixels[sourcePixelOffset + 3]
          if (sourceAlpha > 0) {
            const bottomAlpha = output[targetPixelOffset + 3]
            const topAlpha = sourceAlpha / 255 * opacity
            const baseAlpha = bottomAlpha / 255
            const outputAlpha = topAlpha + baseAlpha * (1 - topAlpha)
            if (outputAlpha > 0) {
              output[targetPixelOffset] = Math.round((block.pixels[sourcePixelOffset] * topAlpha + output[targetPixelOffset] * baseAlpha * (1 - topAlpha)) / outputAlpha)
              output[targetPixelOffset + 1] = Math.round((block.pixels[sourcePixelOffset + 1] * topAlpha + output[targetPixelOffset + 1] * baseAlpha * (1 - topAlpha)) / outputAlpha)
              output[targetPixelOffset + 2] = Math.round((block.pixels[sourcePixelOffset + 2] * topAlpha + output[targetPixelOffset + 2] * baseAlpha * (1 - topAlpha)) / outputAlpha)
              output[targetPixelOffset + 3] = Math.round(outputAlpha * 255)
            }
          }
          sourcePixelOffset += 4
          targetPixelOffset += 4
        }
      }
    }
  }

  private styledLayer(document: SpriteDocument, sourceLayer: RasterLayer, sourceDirtyRect?: SelectionRect): RasterLayer {
    return this.styledLayerBlockProxy(document, sourceLayer, sourceDirtyRect)
  }


  normalLayerRegion(document: SpriteDocument, layers: readonly RasterLayer[], startX: number, startY: number, width: number, height: number, revision: number): Uint8ClampedArray {
    return compositeNormalLayers(document, layers, startX, startY, width, height, this, revision)
  }

  compositeNormalLayersInto(document: SpriteDocument, layers: readonly RasterLayer[], startX: number, startY: number, width: number, height: number, revision: number, output: Uint8ClampedArray): void {
    compositeNormalLayers(document, layers, startX, startY, width, height, this, revision, output)
  }

  movePreviewLayerRegion(document: SpriteDocument, layers: readonly RasterLayer[], startX: number, startY: number, width: number, height: number, revision: number): Uint8ClampedArray {
    const output = new Uint8ClampedArray(width * height * 4)
    compositeMovePreviewLayersInto(document, layers, startX, startY, width, height, revision, this, output)
    return output
  }

  compositeMovePreviewLayersInto(document: SpriteDocument, layers: readonly RasterLayer[], startX: number, startY: number, width: number, height: number, revision: number, output: Uint8ClampedArray): void {
    compositeMovePreviewLayersInto(document, layers, startX, startY, width, height, revision, this, output)
  }

  rowsFor(layer: RasterLayer, palette: readonly PaletteEntry[], _revision: number, dirtyRect?: SelectionRect): Int32Array {
    const paletteKey = layer.format === 'rgba' ? 'rgba' : palette.map((entry) => `${entry.id}:${entry.color.a}`).join(',')
    const key = `${layer.format}:${layer.width}:${layer.height}:${paletteKey}`
    const storage = rasterStorageIdentity(layer)
    const entries = this.rowRanges.get(storage) ?? new Map<string, { contentRevision: number; ranges: Int32Array }>()
    const cached = entries.get(key)
    const contentRevision = getLayerContentRevision(layer)
    if (cached?.contentRevision === contentRevision && !dirtyRect) return cached.ranges
    const ranges = cached?.ranges ?? new Int32Array(layer.height * 2)
    const opaqueIds = layer.format === 'indexed' ? new Set(palette.filter((entry) => entry.color.a > 0).map((entry) => entry.id)) : null
    const rgbaPixels = layer.format === 'rgba' && !lazyRuntimeRasterForSurface(layer)
      ? layer.pixels
      : null
    const visibleAt = (x: number, y: number): boolean => {
      const index = y * layer.width + x
      return rgbaPixels ? rgbaPixels[index * 4 + 3] > 0 : layer.format === 'rgba'
        ? layer.pixels[index * 4 + 3] > 0
        : opaqueIds!.has(layer.pixels[index])
    }
    const scanRange = (y: number, fromX: number, toX: number): { left: number; right: number } => {
      // Only the first and last visible pixels define the row bounds. A filled
      // 4K row needs two alpha reads, not a scan through all 4000 interior pixels.
      let left = fromX
      while (left < toX && !visibleAt(left, y)) left += 1
      if (left === toX) return { left: toX, right: fromX }
      let right = toX
      while (right > left + 1 && !visibleAt(right - 1, y)) right -= 1
      return { left, right }
    }
    const scanRow = (y: number): void => {
      const result = scanRange(y, 0, layer.width)
      ranges[y * 2] = result.left
      ranges[y * 2 + 1] = result.right
    }
    const updateRow = (y: number, dirtyLeft: number, dirtyRight: number): void => {
      if (dirtyRight <= dirtyLeft) return
      const oldLeft = ranges[y * 2]
      const oldRight = ranges[y * 2 + 1]
      const dirty = scanRange(y, dirtyLeft, dirtyRight)
      if (oldRight <= oldLeft) {
        ranges[y * 2] = dirty.left
        ranges[y * 2 + 1] = dirty.right
        return
      }

      let nextLeft = layer.width
      let nextRight = 0
      const dirtyHasPixels = dirty.right > dirty.left
      // Pixels outside the dirty interval are unchanged. Preserve a known
      // edge immediately when it is outside that interval; only rescan an
      // unchanged tail when an old edge was erased inside the interval.
      if (oldLeft < dirtyLeft || oldLeft >= dirtyRight) nextLeft = oldLeft
      else if (dirtyHasPixels) nextLeft = dirty.left
      else if (oldRight > dirtyRight) nextLeft = scanRange(y, dirtyRight, oldRight).left

      if (oldRight > dirtyRight || oldRight <= dirtyLeft) nextRight = oldRight
      else if (dirtyHasPixels) nextRight = dirty.right
      else if (oldLeft < dirtyLeft) nextRight = scanRange(y, oldLeft, dirtyLeft).right

      ranges[y * 2] = nextLeft
      ranges[y * 2 + 1] = nextRight
    }
    if (cached && dirtyRect) {
      const top = Math.max(0, Math.floor(dirtyRect.y - layer.offsetY))
      const bottom = Math.min(layer.height, Math.ceil(dirtyRect.y + dirtyRect.height - layer.offsetY))
      const dirtyLeft = Math.max(0, Math.floor(dirtyRect.x - layer.offsetX))
      const dirtyRight = Math.min(layer.width, Math.ceil(dirtyRect.x + dirtyRect.width - layer.offsetX))
      for (let y = top; y < bottom; y += 1) updateRow(y, dirtyLeft, dirtyRight)
    } else {
      for (let y = 0; y < layer.height; y += 1) scanRow(y)
    }
    let minX = layer.width
    let minY = layer.height
    let maxX = -1
    let maxY = -1
    for (let y = 0; y < layer.height; y += 1) {
      const left = ranges[y * 2]
      const right = ranges[y * 2 + 1]
      if (right > left) {
        minX = Math.min(minX, left)
        minY = Math.min(minY, y)
        maxX = Math.max(maxX, right - 1)
        maxY = y
      }
    }
    cacheRasterContentBounds(layer, palette, maxX < minX || maxY < minY ? null : { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 })
    if (entries.size >= 4 && !entries.has(key)) entries.clear()
    entries.set(key, { contentRevision, ranges })
    this.rowRanges.set(storage, entries)
    return ranges
  }

  tileHasVisiblePixels(layer: RasterLayer, palette: readonly PaletteEntry[], tileX: number, tileY: number, tileSize: number): boolean {
    const opaqueIds = layer.format === 'indexed' ? new Set(palette.filter((entry) => entry.color.a > 0).map((entry) => entry.id)) : undefined
    if (tileSize === runtimeRasterForSurface(layer)?.tileSize) {
      const visible = runtimeTileHasVisiblePixels(layer, tileX, tileY, opaqueIds)
      if (visible !== null) return visible
    }
    const paletteKey = layer.format === 'rgba' ? 'rgba' : palette.map((entry) => `${entry.id}:${entry.color.a}`).join(',')
    const key = `${layer.format}:${layer.width}:${layer.height}:${getLayerContentRevision(layer)}:${paletteKey}:${tileSize}`
    const storage = rasterStorageIdentity(layer)
    const entries = this.visibleTiles.get(storage) ?? new Map<string, Map<number, boolean>>()
    let tiles = entries.get(key)
    if (!tiles) {
      if (entries.size >= 2) entries.clear()
      tiles = new Map()
      entries.set(key, tiles)
    }
    const columns = Math.ceil(layer.width / tileSize)
    const tileIndex = tileY * columns + tileX
    const cached = tiles.get(tileIndex)
    if (cached !== undefined) return cached
    const fromX = tileX * tileSize
    const fromY = tileY * tileSize
    const toX = Math.min(layer.width, fromX + tileSize)
    const toY = Math.min(layer.height, fromY + tileSize)
    let visible = false
    for (let y = fromY; y < toY && !visible; y += 1) for (let x = fromX; x < toX; x += 1) {
      const index = y * layer.width + x
      if (layer.format === 'rgba' ? layer.pixels[index * 4 + 3] > 0 : opaqueIds!.has(layer.pixels[index])) { visible = true; break }
    }
    tiles.set(tileIndex, visible)
    entries.set(key, tiles)
    this.visibleTiles.set(storage, entries)
    return visible
  }
}
