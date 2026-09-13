import type { AnimationCel, AnimationCelSurface } from '@shared/types-animation'
import type { AnimationGroupMask, LayerGroup, RasterLayer } from '@shared/types-layer'
import type { SpriteDocument } from '@shared/types-document'
import { cloneDocumentForAnimationFrame, ensureAnimationDocument, refreshActiveAnimationFrame, syncActiveAnimationFrame } from '@/core/animation'
import { createCompositePointSampler } from '@/core/document-composite'
import { createId, createLayer, createLayerMask, isLayerEffectivelyLocked, layerContentBounds, paletteColorIdForCanvas, resolveLayerCanvasColor } from '@/core/document-model'
import type { HistoryEntry } from '@/core/history'
import { cloneLayerStyles, enabledLayerStyleParts, hasEnabledLayerStyles, layerStyleOutputBounds, mapLayerStyleColors, resolveLayerStyles, sampleLayerStyleParts, type LayerStylePart } from '@/core/layer-styles'
import { translateCurrent as tr } from '@/core/localization'
import { captureDocumentStructureSnapshot, documentStructureDeltaBytes, restoreDocumentStructureSnapshot } from './workspace-document-history'

const interior = (part: LayerStylePart): boolean => part !== 'shadow' && part !== 'outerStroke'
const partName = (part: LayerStylePart, both: boolean): string => {
  switch (part) {
    case 'shadow': return tr('layers.splitStyleShadow')
    case 'outerStroke': return tr(both ? 'layers.splitStyleOuterStroke' : 'layers.layerStyleStroke')
    case 'innerStroke': return tr('layers.splitStyleInnerStroke')
    case 'innerGlow': return tr('layers.layerStyleInnerGlow')
    case 'colorOverlay': return tr('layers.layerStyleColorOverlay')
    case 'gradientOverlay': return tr('layers.layerStyleGradientOverlay')
  }
}

/** Low-frequency document command. Render every frame before replacing document
 * structure. The wrapper blends/attenuates the base and exterior effects together;
 * clipped interior layers preserve source alpha without duplicating its pixels. */
export function splitLayerStyles(document: SpriteDocument, layerId: string): HistoryEntry | null {
  const source = document.layers.find((layer) => layer.id === layerId)
  if (!source || isLayerEffectivelyLocked(document, source) || !hasEnabledLayerStyles(source.layerStyles)) return null
  syncActiveAnimationFrame(document)
  const timeline = ensureAnimationDocument(document)
  const styles = resolveLayerStyles(source.layerStyles)
  const parts = enabledLayerStyleParts(styles)
  const before = captureDocumentStructureSnapshot(document)
  const original = {
    layerStyles: cloneLayerStyles(source.layerStyles), visible: source.visible,
    blendMode: source.blendMode, clippingMask: source.clippingMask, opacity: source.opacity
  }
  const group: LayerGroup = {
    id: createId('group'), name: `${source.name}-${tr('layers.layerStyle')}`,
    parentGroupId: source.groupId ?? null, visible: source.visible, locked: false,
    opacity: source.opacity, blendMode: source.blendMode, clippingMask: source.clippingMask
  }
  const layers = parts.map((part) => {
    const layer = createLayer(`${source.name}-${partName(part, styles.stroke.position === 'both')}`, 1, 1, document.colorMode)
    layer.groupId = group.id
    layer.clippingMask = interior(part)
    return layer
  })
  const cels: AnimationCel[] = []
  const frameData: Array<{ frameId: string; opacity: number; x: number; y: number; width: number; height: number }> = []
  // Stage palette additions so a failed allocation cannot partially mutate it.
  const paletteDocument = { ...document, palette: document.palette.map((entry) => ({ ...entry, color: { ...entry.color } })), paletteOrder: [...document.paletteOrder], paletteSlots: document.paletteSlots ? [...document.paletteSlots] : undefined }
  for (const frame of timeline.frames) {
    const preview = cloneDocumentForAnimationFrame(document, frame.id)
    const base = preview.layers.find((layer) => layer.id === source.id)!
    const opacity = base.opacity
    const resolveColor = (color: Parameters<typeof resolveLayerCanvasColor>[2]) => resolveLayerCanvasColor(preview, base, color)
    const resolved = mapLayerStyleColors(styles, resolveColor)
    const bounds = layerStyleOutputBounds(layerContentBounds(preview, base), resolved)
      ?? { x: base.offsetX, y: base.offsetY, width: 1, height: 1 }
    const x = Math.floor(bounds.x)
    const y = Math.floor(bounds.y)
    const width = Math.max(1, Math.ceil(bounds.x + bounds.width) - x)
    const height = Math.max(1, Math.ceil(bounds.y + bounds.height) - y)
    frameData.push({ frameId: frame.id, opacity, x, y, width, height })
    // Use the canonical sampler, including the resolved linked layer mask.
    preview.layers = [base]
    preview.groups = []
    base.groupId = null
    base.visible = true
    base.opacity = 1
    base.blendMode = 'normal'
    delete base.clippingMask
    delete base.layerStyles
    const read = createCompositePointSampler(preview)
    const geometry = { x: base.offsetX, y: base.offsetY, width: base.width, height: base.height }
    const surfaces: AnimationCelSurface[] = layers.map((layer) => layer.format === 'rgba'
      ? { format: 'rgba', width, height, offsetX: x, offsetY: y, pixels: new Uint8ClampedArray(width * height * 4) }
      : { format: 'indexed', width, height, offsetX: x, offsetY: y, pixels: new Uint32Array(width * height) })
    for (let localY = 0; localY < height; localY += 1) for (let localX = 0; localX < width; localX += 1) {
      const colors = sampleLayerStyleParts(geometry, resolved, x + localX, y + localY, read(x + localX, y + localY), read, resolveColor)
      const index = localY * width + localX
      for (let partIndex = 0; partIndex < parts.length; partIndex += 1) {
        const color = colors[parts[partIndex]]
        if (!color || color.a === 0) continue
        const surface = surfaces[partIndex]
        if (surface.format === 'rgba') surface.pixels.set([color.r, color.g, color.b, color.a], index * 4)
        else surface.pixels[index] = paletteColorIdForCanvas(paletteDocument, color)
      }
    }
    surfaces.forEach((surface, index) => cels.push({ id: createId('cel'), layerId: layers[index].id, frameId: frame.id, surface, opacity: 1 }))
  }
  const groupMasks: AnimationGroupMask[] = []
  const animatedOpacity = frameData.some((frame) => frame.opacity !== frameData[0].opacity)
  group.opacity = animatedOpacity ? 1 : frameData[0].opacity
  if (animatedOpacity) for (const frame of frameData) {
    // Groups have no per-frame opacity; a frame mask carries cel opacity over
    // the entire effect stack. Uniform opacity remains exact group metadata.
    const mask = createLayerMask(group.id, frame.width, frame.height, 'group')
    mask.offsetX = frame.x
    mask.offsetY = frame.y
    const value = Math.round(frame.opacity * 255)
    for (let offset = 0; offset < mask.pixels.length; offset += 4) mask.pixels.set([value, value, value, 255], offset)
    groupMasks.push({ groupId: group.id, frameId: frame.frameId, mask })
  }
  const splitSource = { layerStyles: undefined, visible: true, blendMode: 'normal' as const, clippingMask: false, opacity: 1 }
  Object.assign(source, splitSource)
  source.groupId = group.id
  const below: RasterLayer[] = []
  const above: RasterLayer[] = []
  layers.forEach((layer, index) => (interior(parts[index]) ? above : below).push(layer))
  document.layers.splice(document.layers.indexOf(source), 1, ...below, source, ...above)
  document.groups.push(group)
  timeline.cels = [...timeline.cels.map((cel) => cel.layerId === source.id ? { ...cel, opacity: 1 } : cel), ...cels]
  timeline.groupMasks = [...(timeline.groupMasks ?? []), ...groupMasks]
  document.palette = paletteDocument.palette
  document.paletteOrder = paletteDocument.paletteOrder
  document.paletteSlots = paletteDocument.paletteSlots
  document.nextColorId = paletteDocument.nextColorId
  refreshActiveAnimationFrame(document)
  const after = captureDocumentStructureSnapshot(document)
  return {
    label: tr('layers.splitLayerStyles'), bytes: documentStructureDeltaBytes(before, after),
    undo: () => { Object.assign(source, original, { layerStyles: cloneLayerStyles(original.layerStyles) }); restoreDocumentStructureSnapshot(document, before) },
    redo: () => { Object.assign(source, splitSource); restoreDocumentStructureSnapshot(document, after) },
    invalidation: { kind: 'full' }, affectedLayerIds: [source.id, ...layers.map((layer) => layer.id)],
    requiresAnimationSync: false, requiresAnimationSelectionNormalization: true
  }
}
