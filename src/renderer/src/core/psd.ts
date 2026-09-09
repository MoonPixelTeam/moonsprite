import {
  initializeCanvas,
  readPsd,
  writePsdUint8Array,
  type BlendMode as PsdBlendMode,
  type Layer as PsdLayer,
  type LayerEffectsInfo,
  type LayerMaskData,
  type PixelData,
  type Psd
} from 'ag-psd'
import { BLEND_MODES, type AnimationCel, type BlendMode, type LayerGroup, type LayerMask, type LayerStyles, type RasterLayer, type RgbaColor, type SpriteDocument } from '@shared/types'
import { cloneDocumentForAnimationFrame, refreshActiveAnimationFrame } from './animation'
import { animationMaskAt, compositeDocument, createDocument, createId, createLayer, createLayerMask, getPaletteEntry, layerContentBounds, readLayerPacked } from './document'
import { applyImportedRgbaPalette } from './imported-palette'
import { buildLayerPanelTree } from './layer-panel-layout'
import { hasEnabledLayerStyles } from './layer-styles'
import { translateCurrent as tr } from './localization'
import { unpackColor } from './raster'

const MAX_PSD_DIMENSION = 30_000

const clampUnit = (value: number): number => Math.max(0, Math.min(1, value))
const pixels = (value: number): { units: 'Pixels'; value: number } => ({ units: 'Pixels', value: Math.max(0, value) })
const effectColor = (color: RgbaColor): { r: number; g: number; b: number } => ({ r: color.r, g: color.g, b: color.b })
const normalizedAngle = (angle: number): number => (angle % 360 + 360) % 360

const psdBlendMode = (blendMode: BlendMode): PsdBlendMode => blendMode.replace(/-/g, ' ') as PsdBlendMode
const moonSpriteBlendMode = (blendMode: PsdBlendMode | undefined): BlendMode => {
  const normalized = (blendMode ?? 'normal').replace(/ /g, '-') as BlendMode
  return BLEND_MODES.includes(normalized) ? normalized : 'normal'
}

const unitOpacity = (value: number | undefined): number => Math.max(0, Math.min(1, value ?? 1))
const isPsdLayerLocked = (layer: PsdLayer): boolean => layer.transparencyProtected === true
  || Boolean(layer.protected && Object.values(layer.protected).some(Boolean))

const initializePsdImageData = (): void => initializeCanvas(
  (width, height) => ({ width, height } as HTMLCanvasElement),
  (width, height) => ({ data: new Uint8ClampedArray(width * height * 4), width, height, colorSpace: 'srgb' } as ImageData)
)

function rgbaPixels(imageData: PixelData): Uint8ClampedArray {
  const pixelCount = imageData.width * imageData.height
  if (!Number.isSafeInteger(pixelCount) || pixelCount < 1 || imageData.data.length < pixelCount * 4) {
    throw new Error('PSD image data is incomplete.')
  }
  if (imageData.data instanceof Uint8ClampedArray) return imageData.data.slice(0, pixelCount * 4)
  const output = new Uint8ClampedArray(pixelCount * 4)
  if (imageData.data instanceof Uint16Array) {
    for (let index = 0; index < output.length; index += 1) output[index] = Math.round(imageData.data[index] / 257)
  } else if (imageData.data instanceof Float32Array) {
    for (let index = 0; index < output.length; index += 1) output[index] = Math.round(clampUnit(imageData.data[index]) * 255)
  } else output.set(imageData.data.subarray(0, output.length))
  return output
}

function importedMask(ownerId: string, ownerKind: LayerMask['ownerKind'], source: PsdLayer, documentWidth: number, documentHeight: number): LayerMask | null {
  const psdMask = source.mask ?? source.realMask
  if (!psdMask) return null
  const imageData = psdMask.imageData
  const relativeX = psdMask.positionRelativeToLayer ? source.left ?? 0 : 0
  const relativeY = psdMask.positionRelativeToLayer ? source.top ?? 0 : 0
  const offsetX = Math.trunc((psdMask.left ?? 0) + relativeX)
  const offsetY = Math.trunc((psdMask.top ?? 0) + relativeY)
  const defaultBlack = psdMask.defaultColor === 0
  const width = defaultBlack ? documentWidth : Math.max(1, imageData?.width ?? 1)
  const height = defaultBlack ? documentHeight : Math.max(1, imageData?.height ?? 1)
  const mask = createLayerMask(ownerId, width, height, ownerKind)
  mask.visible = psdMask.disabled !== true
  mask.offsetX = defaultBlack ? 0 : offsetX
  mask.offsetY = defaultBlack ? 0 : offsetY
  if (defaultBlack) {
    for (let index = 3; index < mask.pixels.length; index += 4) mask.pixels[index] = 255
  }
  if (!imageData) return mask
  const sourcePixels = rgbaPixels(imageData)
  for (let y = 0; y < imageData.height; y += 1) for (let x = 0; x < imageData.width; x += 1) {
    const targetX = defaultBlack ? offsetX + x : x
    const targetY = defaultBlack ? offsetY + y : y
    if (targetX < 0 || targetY < 0 || targetX >= width || targetY >= height) continue
    const sourceOffset = (y * imageData.width + x) * 4
    const targetOffset = (targetY * width + targetX) * 4
    const alpha = sourcePixels[sourceOffset + 3]
    const gray = alpha === 0
      ? (psdMask.defaultColor ?? 255)
      : Math.round((sourcePixels[sourceOffset] * 2126 + sourcePixels[sourceOffset + 1] * 7152 + sourcePixels[sourceOffset + 2] * 722) / 10000)
    mask.pixels[targetOffset] = gray
    mask.pixels[targetOffset + 1] = gray
    mask.pixels[targetOffset + 2] = gray
    mask.pixels[targetOffset + 3] = 255
  }
  return mask
}

export function decodePsd(input: Uint8Array, fallbackName = 'Imported PSD', onProgress?: (value: number) => void): SpriteDocument {
  const reportProgress = (value: number): void => onProgress?.(Math.max(0, Math.min(1, value)))
  reportProgress(0)
  initializePsdImageData()
  const parsed = readPsd(input, {
    useImageData: true,
    skipThumbnail: true,
    skipLinkedFilesData: true,
    logMissingFeatures: false
  })
  if (!Number.isSafeInteger(parsed.width) || !Number.isSafeInteger(parsed.height)
    || parsed.width < 1 || parsed.height < 1 || parsed.width > MAX_PSD_DIMENSION || parsed.height > MAX_PSD_DIMENSION) {
    throw new Error(tr('core.psd.canvasSizeRange'))
  }

  const document = createDocument(fallbackName, 1, 1, 'rgba')
  document.width = parsed.width
  document.height = parsed.height
  document.layers = []
  document.groups = []
  const masks: Array<{ ownerKind: LayerMask['ownerKind']; ownerId: string; mask: LayerMask }> = []
  let visited = 0
  const total = Math.max(1, (() => {
    const count = (children: readonly PsdLayer[] | undefined): number => (children ?? []).reduce((sum, child) => sum + 1 + count(child.children), 0)
    return count(parsed.children)
  })())

  const appendChildren = (children: readonly PsdLayer[] | undefined, parentGroupId: string | null): void => {
    for (const source of children ?? []) {
      if (source.children) {
        const id = createId('group')
        const blendMode = source.blendMode === 'pass through' ? 'normal' : moonSpriteBlendMode(source.blendMode)
        const group: LayerGroup = {
          id,
          name: source.name?.trim() || tr('core.document.group'),
          parentGroupId,
          panelOrder: document.layers.length + 0.5,
          visible: source.hidden !== true,
          locked: isPsdLayerLocked(source),
          opacity: unitOpacity(source.opacity),
          blendMode,
          ...(source.clipping === true ? { clippingMask: true } : {}),
          ...(source.blendMode !== undefined && source.blendMode !== 'pass through' ? { cumulativeBlend: true } : {})
        }
        document.groups.push(group)
        const mask = importedMask(id, 'group', source, parsed.width, parsed.height)
        if (mask) masks.push({ ownerKind: 'group', ownerId: id, mask })
        appendChildren(source.children, id)
      } else {
        const imageData = source.imageData
        const layer = createLayer(source.name?.trim() || tr('core.document.layer'), Math.max(1, imageData?.width ?? 1), Math.max(1, imageData?.height ?? 1), 'rgba')
        if (layer.format !== 'rgba') continue
        layer.groupId = parentGroupId
        layer.visible = source.hidden !== true
        layer.locked = isPsdLayerLocked(source)
        layer.opacity = unitOpacity(source.opacity)
        layer.blendMode = moonSpriteBlendMode(source.blendMode)
        layer.clippingMask = source.clipping === true
        layer.offsetX = Math.trunc(source.left ?? 0)
        layer.offsetY = Math.trunc(source.top ?? 0)
        if (imageData) layer.pixels = rgbaPixels(imageData)
        document.layers.push(layer)
        const mask = importedMask(layer.id, 'cel', source, parsed.width, parsed.height)
        if (mask) masks.push({ ownerKind: 'cel', ownerId: layer.id, mask })
      }
      visited += 1
      reportProgress(0.1 + 0.75 * visited / total)
    }
  }
  appendChildren(parsed.children, null)

  const layersHaveVisiblePixels = document.layers.some((layer) => {
    if (layer.format !== 'rgba') return false
    for (let index = 3; index < layer.pixels.length; index += 4) if (layer.pixels[index] !== 0) return true
    return false
  })
  const compositePixels = parsed.imageData ? rgbaPixels(parsed.imageData) : null
  const compositeHasVisiblePixels = compositePixels?.some((value, index) => index % 4 === 3 && value !== 0) === true
  if (document.layers.length === 0 || (!layersHaveVisiblePixels && compositeHasVisiblePixels)) {
    if (!parsed.imageData) throw new Error('PSD does not contain importable pixel data.')
    const layer = createLayer(fallbackName, parsed.width, parsed.height, 'rgba')
    if (layer.format !== 'rgba') throw new Error('Unable to create PSD raster layer.')
    layer.pixels = compositePixels!
    document.layers = [layer]
    document.groups = []
    masks.length = 0
  }

  const frameId = 'frame-1'
  const cels: AnimationCel[] = document.layers.flatMap((layer) => layer.format === 'rgba' ? [{
    id: createId('cel'),
    layerId: layer.id,
    frameId,
    opacity: layer.opacity,
    surface: { format: 'rgba', width: layer.width, height: layer.height, offsetX: layer.offsetX, offsetY: layer.offsetY, pixels: layer.pixels }
  }] : [])
  document.animation = {
    frames: [{ id: frameId, duration: 100 }],
    cels,
    layerMasks: masks.flatMap((entry) => entry.ownerKind === 'cel' ? [{ layerId: entry.ownerId, frameId, mask: entry.mask }] : []),
    groupMasks: masks.flatMap((entry) => entry.ownerKind === 'group' ? [{ groupId: entry.ownerId, frameId, mask: entry.mask }] : []),
    loopSections: [],
    activeFrameId: frameId,
    loop: true
  }
  document.activeLayerId = document.layers[document.layers.length - 1].id
  document.name = fallbackName
  refreshActiveAnimationFrame(document)
  reportProgress(0.9)
  applyImportedRgbaPalette(document)
  reportProgress(1)
  return document
}

function shadowAngle(offsetX: number, offsetY: number): number {
  if (offsetX === 0 && offsetY === 0) return 90
  return normalizedAngle(Math.atan2(offsetY, -offsetX) * 180 / Math.PI)
}

function psdLayerEffects(styles: LayerStyles | undefined, scale: number): LayerEffectsInfo | undefined {
  if (!styles || !hasEnabledLayerStyles(styles)) return undefined
  const effects: LayerEffectsInfo = { scale: 1 }
  let enabled = false

  if (styles.stroke.enabled) {
    enabled = true
    effects.stroke = [{
      present: true,
      showInDialog: true,
      enabled: true,
      size: pixels(styles.stroke.size * scale),
      position: styles.stroke.position === 'both' ? 'center' : styles.stroke.position,
      fillType: 'color',
      blendMode: 'normal',
      opacity: clampUnit(styles.stroke.color.a / 255),
      color: effectColor(styles.stroke.color)
    }]
  }
  if (styles.shadow.enabled) {
    enabled = true
    effects.dropShadow = [{
      present: true,
      showInDialog: true,
      enabled: true,
      size: pixels(styles.shadow.blur * scale),
      angle: shadowAngle(styles.shadow.offsetX, styles.shadow.offsetY),
      distance: pixels(Math.hypot(styles.shadow.offsetX, styles.shadow.offsetY) * scale),
      color: effectColor(styles.shadow.color),
      blendMode: 'normal',
      opacity: clampUnit(styles.shadow.color.a / 255),
      useGlobalLight: false,
      antialiased: false
    }]
  }
  if (styles.innerGlow.enabled) {
    enabled = true
    effects.innerGlow = {
      present: true,
      showInDialog: true,
      enabled: true,
      size: pixels(styles.innerGlow.size * scale),
      color: effectColor(styles.innerGlow.color),
      blendMode: 'normal',
      opacity: clampUnit(styles.innerGlow.color.a / 255),
      source: 'edge',
      technique: 'precise',
      antialiased: false
    }
  }
  if (styles.colorOverlay.enabled) {
    enabled = true
    effects.solidFill = [{
      present: true,
      showInDialog: true,
      enabled: true,
      blendMode: 'normal',
      color: effectColor(styles.colorOverlay.color),
      opacity: clampUnit(styles.colorOverlay.color.a / 255)
    }]
  }
  if (styles.gradientOverlay.enabled) {
    enabled = true
    effects.gradientOverlay = [{
      present: true,
      showInDialog: true,
      enabled: true,
      blendMode: 'normal',
      opacity: 1,
      align: true,
      scale: 1,
      dither: styles.gradientOverlay.dither !== 'none',
      reverse: false,
      type: 'linear',
      angle: normalizedAngle(styles.gradientOverlay.angle),
      interpolationMethod: 'classic',
      gradient: {
        name: 'MoonSprite',
        type: 'solid',
        smoothness: 1,
        colorStops: [
          { color: effectColor(styles.gradientOverlay.from), location: 0, midpoint: 0.5 },
          { color: effectColor(styles.gradientOverlay.to), location: 1, midpoint: 0.5 }
        ],
        opacityStops: [
          { opacity: clampUnit(styles.gradientOverlay.from.a / 255), location: 0, midpoint: 0.5 },
          { opacity: clampUnit(styles.gradientOverlay.to.a / 255), location: 1, midpoint: 0.5 }
        ]
      }
    }]
  }

  return enabled ? effects : undefined
}

interface ScaledRaster {
  left: number
  top: number
  imageData?: PixelData
}

function scaledRaster(document: SpriteDocument, layer: RasterLayer, scaleX: number, scaleY: number, mask = false): ScaledRaster {
  const bounds = layerContentBounds(document, layer)
  if (!bounds) return { left: 0, top: 0 }
  const left = Math.ceil(bounds.x * scaleX)
  const top = Math.ceil(bounds.y * scaleY)
  const right = Math.ceil((bounds.x + bounds.width) * scaleX)
  const bottom = Math.ceil((bounds.y + bounds.height) * scaleY)
  const width = right - left
  const height = bottom - top
  if (width <= 0 || height <= 0) return { left: 0, top: 0 }
  const data = new Uint8ClampedArray(width * height * 4)
  const maxSourceX = bounds.x + bounds.width - 1
  const maxSourceY = bounds.y + bounds.height - 1

  for (let y = 0; y < height; y += 1) {
    const sourceCanvasY = Math.max(bounds.y, Math.min(maxSourceY, Math.floor((top + y) / scaleY)))
    const sourceY = sourceCanvasY - layer.offsetY
    for (let x = 0; x < width; x += 1) {
      const sourceCanvasX = Math.max(bounds.x, Math.min(maxSourceX, Math.floor((left + x) / scaleX)))
      const sourceX = sourceCanvasX - layer.offsetX
      const packed = readLayerPacked(document, layer, sourceY * layer.width + sourceX)
      const target = (y * width + x) * 4
      if (mask) {
        const color = unpackColor(packed)
        const coverage = color.a === 0 ? 255 : color.r
        data[target] = coverage
        data[target + 1] = coverage
        data[target + 2] = coverage
        data[target + 3] = 255
      } else {
        const color = layer.format === 'rgba' ? unpackColor(packed) : getPaletteEntry(document, packed).color
        data[target] = color.r
        data[target + 1] = color.g
        data[target + 2] = color.b
        data[target + 3] = color.a
      }
    }
  }

  return { left, top, imageData: { data, width, height } }
}

function scaledComposite(document: SpriteDocument, width: number, height: number): PixelData {
  const source = compositeDocument(document)
  if (width === document.width && height === document.height) return { data: source, width, height }
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y += 1) {
    const sourceY = Math.min(document.height - 1, Math.floor(y * document.height / height))
    for (let x = 0; x < width; x += 1) {
      const sourceX = Math.min(document.width - 1, Math.floor(x * document.width / width))
      const sourceOffset = (sourceY * document.width + sourceX) * 4
      data.set(source.subarray(sourceOffset, sourceOffset + 4), (y * width + x) * 4)
    }
  }
  return { data, width, height }
}

function activeMask(document: SpriteDocument, ownerId: string): RasterLayer | null {
  const timeline = document.animation
  return timeline ? animationMaskAt(timeline, ownerId, timeline.activeFrameId) : null
}

function psdMask(document: SpriteDocument, ownerId: string, scaleX: number, scaleY: number): LayerMaskData | undefined {
  const mask = activeMask(document, ownerId)
  if (!mask) return undefined
  const raster = scaledRaster(document, mask, scaleX, scaleY, true)
  return {
    top: raster.top,
    left: raster.left,
    defaultColor: 255,
    disabled: mask.visible === false,
    positionRelativeToLayer: false,
    fromVectorData: false,
    ...(raster.imageData ? { imageData: raster.imageData } : {})
  }
}

function lockedProperties(locked: boolean): Pick<PsdLayer, 'transparencyProtected' | 'protected'> {
  return locked
    ? { transparencyProtected: true, protected: { transparency: true, composite: true, position: true } }
    : {}
}

function commonLayerProperties(
  owner: RasterLayer | LayerGroup,
  blendMode: PsdBlendMode,
  mask: LayerMaskData | undefined,
  effects: LayerEffectsInfo | undefined
): PsdLayer {
  return {
    name: owner.name,
    blendMode,
    opacity: clampUnit(owner.opacity),
    hidden: !owner.visible,
    clipping: owner.clippingMask === true,
    ...lockedProperties(owner.locked),
    ...(mask ? { mask } : {}),
    ...(effects ? { effects, effectsOpen: true } : {})
  }
}

function psdRasterLayer(document: SpriteDocument, layer: RasterLayer, scaleX: number, scaleY: number, effectScale: number): PsdLayer {
  const raster = scaledRaster(document, layer, scaleX, scaleY)
  return {
    ...commonLayerProperties(layer, psdBlendMode(layer.blendMode), psdMask(document, layer.id, scaleX, scaleY), psdLayerEffects(layer.layerStyles, effectScale)),
    top: raster.top,
    left: raster.left,
    ...(raster.imageData ? { imageData: raster.imageData } : {})
  }
}

function psdGroupLayer(document: SpriteDocument, group: LayerGroup, scaleX: number, scaleY: number, effectScale: number): PsdLayer {
  const mask = psdMask(document, group.id, scaleX, scaleY)
  const effects = psdLayerEffects(group.layerStyles, effectScale)
  const blendMode: PsdBlendMode = group.blendMode === 'normal'
    && group.opacity === 1
    && group.cumulativeBlend !== true
    && !mask
    && !effects
    ? 'pass through'
    : psdBlendMode(group.blendMode)
  return {
    ...commonLayerProperties(group, blendMode, mask, effects),
    children: [],
    opened: true
  }
}

function psdChildren(document: SpriteDocument, scaleX: number, scaleY: number, effectScale: number): PsdLayer[] {
  const root: PsdLayer[] = []
  const containers: PsdLayer[][] = [root]
  const layers = new Map(document.layers.map((layer) => [layer.id, layer]))
  const groups = new Map(document.groups.map((group) => [group.id, group]))

  for (const node of buildLayerPanelTree({ layers: document.layers, groups: document.groups })) {
    containers.length = Math.min(containers.length, node.depth + 1)
    const target = containers[node.depth] ?? root
    if (node.kind === 'layer') {
      const layer = layers.get(node.id)
      if (layer) target.push(psdRasterLayer(document, layer, scaleX, scaleY, effectScale))
      continue
    }
    const group = groups.get(node.id)
    if (!group) continue
    const psdGroup = psdGroupLayer(document, group, scaleX, scaleY, effectScale)
    target.push(psdGroup)
    containers[node.depth + 1] = psdGroup.children!
  }

  const reverseSiblingOrder = (children: PsdLayer[]): void => {
    children.reverse()
    for (const child of children) if (child.children) reverseSiblingOrder(child.children)
  }
  // The PSD writer serializes sibling records in the opposite visual order used by MoonSprite.
  reverseSiblingOrder(root)
  return root
}

export function encodePsd(document: SpriteDocument, scalePercent = 100): Uint8Array {
  const scale = Math.max(0.01, Math.min(64, scalePercent / 100))
  const width = Math.max(1, Math.round(document.width * scale))
  const height = Math.max(1, Math.round(document.height * scale))
  if (width > MAX_PSD_DIMENSION || height > MAX_PSD_DIMENSION) throw new Error(tr('core.psd.canvasSizeRange'))

  const activeFrameId = document.animation?.activeFrameId
  const frameDocument = activeFrameId ? cloneDocumentForAnimationFrame(document, activeFrameId) : document
  const scaleX = width / frameDocument.width
  const scaleY = height / frameDocument.height
  const psd: Psd = {
    width,
    height,
    imageData: scaledComposite(frameDocument, width, height),
    children: psdChildren(frameDocument, scaleX, scaleY, scale)
  }
  return writePsdUint8Array(psd, { noBackground: true, trimImageData: true })
}
