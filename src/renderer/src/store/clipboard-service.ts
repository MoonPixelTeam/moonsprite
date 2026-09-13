import type { AnimationCel, AnimationGroupMask, AnimationLayerMask, BackgroundLayerSettings, ClipboardImage, ClipboardImageSize, FreeTileCelData, FreeTileSourceLayer, LayerGroup, RasterLayer, TextCelData, TilemapCelData, Tileset } from '@shared/types'
import { unpackColor } from '@/core/raster'
import { cloneLayerStyles } from '@/core/layer-styles'
import { cloneAnimationCel, cloneAnimationGroupMask, cloneAnimationLayerMask } from '@/core/animation'

export interface SelectionClipboard {
  width: number
  height: number
  originX?: number
  originY?: number
  pixels: Uint32Array
  mask?: Uint8Array
}

export interface LayerClipboard {
  name: string
  linkedContentId?: string
  kind?: 'text' | 'tilemap' | 'free-tile'
  tilemapTilesetId?: string
  freeTileSetId?: string
  freeTileSources?: FreeTileSourceLayer[]
  width: number
  height: number
  offsetX: number
  offsetY: number
  visible: boolean
  locked: boolean
  opacity: number
  blendMode: RasterLayer['blendMode']
  clippingMask?: boolean
  layerStyles?: RasterLayer['layerStyles']
  background?: BackgroundLayerSettings
  displayColor?: RasterLayer['displayColor']
  description?: string
  groupKey?: string | null
  pixels: Uint8ClampedArray
  animationCels?: Array<{
    frameIndex: number
    width: number
    height: number
    offsetX: number
    offsetY: number
    storageOriginX?: number
    storageOriginY?: number
    zIndex?: number
    opacity?: number
    text?: TextCelData
    tilemap?: TilemapCelData
    freeTiles?: FreeTileCelData
    pixels: Uint8ClampedArray
    mask?: LayerMaskClipboard
  }>
}

export interface LayerGroupClipboard {
  key: string
  name: string
  visible: boolean
  locked: boolean
  opacity: number
  blendMode: RasterLayer['blendMode']
  clippingMask?: boolean
  layerStyles?: LayerGroup['layerStyles']
  cumulativeBlend?: boolean
  displayColor?: RasterLayer['displayColor']
  description?: string
  parentKey?: string | null
  collapsed?: boolean
}

export interface LayerMaskClipboard {
  width: number
  height: number
  offsetX: number
  offsetY: number
  pixels: Uint8ClampedArray
}

export interface LayerCollectionClipboard {
  sourceDocumentId?: string
  animationFrames?: Array<{ duration: number }>
  tilesets?: Tileset[]
  layers: LayerClipboard[]
  groups: LayerGroupClipboard[]
}

/** A document-independent animation cel payload. IDs are retained for diagnostics only;
 * placement is expressed by source layer/frame indexes so it can be pasted into another document. */
export interface AnimationCelClipboardSnapshot {
  sourceDocumentId: string
  anchorLayerIndex: number
  anchorFrameIndex: number
  items: Array<{ layerIndex: number; frameIndex: number; cel: AnimationCel; mask?: AnimationLayerMask }>
}

export interface AnimationFrameClipboardSnapshot {
  sourceDocumentId: string
  layers: Array<{
    name: string
    kind?: RasterLayer['kind']
    width: number
    height: number
    offsetX: number
    offsetY: number
    visible: boolean
    locked: boolean
    opacity: number
    blendMode: RasterLayer['blendMode']
    clippingMask?: boolean
  }>
  frames: Array<{
    duration: number
    disabled?: boolean
    cels: Array<{ layerIndex: number; cel: AnimationCel }>
    layerMasks: Array<{ layerIndex: number; mask: AnimationLayerMask }>
    groupMasks: Array<{ groupIndex: number; mask: AnimationGroupMask }>
  }>
}

const MAX_CLIPBOARD_PIXELS = 16 * 1024 * 1024

const cloneSelectionClipboard = (clipboard: SelectionClipboard): SelectionClipboard => ({
  width: clipboard.width,
  height: clipboard.height,
  originX: clipboard.originX,
  originY: clipboard.originY,
  pixels: clipboard.pixels.slice(),
  mask: clipboard.mask?.slice()
})

const cloneLayerClipboard = (clipboard: LayerClipboard): LayerClipboard => ({
  ...clipboard,
  layerStyles: cloneLayerStyles(clipboard.layerStyles),
  background: clipboard.background ? { ...clipboard.background } : undefined,
  displayColor: clipboard.displayColor ? { ...clipboard.displayColor } : undefined,
  freeTileSources: clipboard.freeTileSources?.map((source) => ({ ...source, displayColor: source.displayColor ? { ...source.displayColor } : undefined })),
  pixels: clipboard.pixels.slice(),
  animationCels: clipboard.animationCels?.map((cel) => ({
    ...cel,
    tilemap: cel.tilemap ? { ...cel.tilemap, cells: cel.tilemap.cells.map((cell) => cell ? { ...cell } : null) } : undefined,
    freeTiles: cel.freeTiles ? { instances: cel.freeTiles.instances.map((instance) => ({ ...instance })) } : undefined,
    pixels: cel.pixels.slice(),
    mask: cel.mask ? { ...cel.mask, pixels: cel.mask.pixels.slice() } : undefined
  }))
})

const cloneLayerCollectionClipboard = (clipboard: LayerCollectionClipboard): LayerCollectionClipboard => ({
  sourceDocumentId: clipboard.sourceDocumentId,
  animationFrames: clipboard.animationFrames?.map((frame) => ({ ...frame })),
  tilesets: clipboard.tilesets?.map((tileset) => ({ ...tileset, tileIds: [...tileset.tileIds], tileSlots: tileset.tileSlots ? [...tileset.tileSlots] : undefined, pixels: tileset.pixels.slice() })),
  layers: clipboard.layers.map(cloneLayerClipboard),
  groups: clipboard.groups.map((group) => ({ ...group, layerStyles: cloneLayerStyles(group.layerStyles), displayColor: group.displayColor ? { ...group.displayColor } : undefined }))
})

export const selectionClipboardFromImage = (image: ClipboardImage): SelectionClipboard | null => {
  const pixelCount = image.width * image.height
  if (!Number.isSafeInteger(pixelCount) || pixelCount < 1 || pixelCount > MAX_CLIPBOARD_PIXELS || image.data.length !== pixelCount * 4) return null

  let mask: Uint8Array | undefined
  let selected = 0
  for (let index = 0; index < pixelCount; index += 1) {
    if (image.data[index * 4 + 3] === 0) {
      if (!mask) {
        mask = new Uint8Array(pixelCount)
        mask.fill(1, 0, index)
      }
      continue
    }
    if (mask) mask[index] = 1
    selected += 1
  }
  if (selected === 0) return null

  let pixels: Uint32Array
  const littleEndian = new Uint8Array(new Uint32Array([1]).buffer)[0] === 1
  if (littleEndian && image.data.byteOffset % 4 === 0) {
    pixels = new Uint32Array(image.data.buffer, image.data.byteOffset, pixelCount)
  } else {
    pixels = new Uint32Array(pixelCount)
    for (let index = 0; index < pixelCount; index += 1) {
      const offset = index * 4
      pixels[index] = (image.data[offset]
        | image.data[offset + 1] << 8
        | image.data[offset + 2] << 16
        | image.data[offset + 3] << 24) >>> 0
    }
  }
  return { width: image.width, height: image.height, pixels, mask }
}

export const selectionClipboardImage = (clipboard: SelectionClipboard): ClipboardImage => {
  const data = new Uint8Array(clipboard.width * clipboard.height * 4)
  for (let index = 0; index < clipboard.pixels.length; index += 1) {
    if (clipboard.mask && clipboard.mask[index] !== 1) continue
    const color = unpackColor(clipboard.pixels[index])
    const offset = index * 4
    data[offset] = color.r
    data[offset + 1] = color.g
    data[offset + 2] = color.b
    data[offset + 3] = color.a
  }
  return { width: clipboard.width, height: clipboard.height, data }
}

export class ClipboardService {
  private selection: SelectionClipboard | null = null
  private layers: LayerCollectionClipboard | null = null
  private layerCopySystemBaseline: Promise<SelectionClipboard | null> | null = null
  private layerCopySystemBaselineSize: Promise<ClipboardImageSize | null> | null = null
  private animationCopySystemBaseline: Promise<SelectionClipboard | null> | null = null
  private animationCells: AnimationCelClipboardSnapshot | null = null
  private animationFrames: AnimationFrameClipboardSnapshot | null = null

  clearSelection(): void {
    this.selection = null
    this.animationCopySystemBaseline = null
  }

  clearLayer(): void {
    this.layers = null
    this.layerCopySystemBaseline = null
    this.layerCopySystemBaselineSize = null
    this.animationCopySystemBaseline = null
  }

  setSelection(clipboard: SelectionClipboard): void {
    this.selection = cloneSelectionClipboard(clipboard)
    this.layers = null
    this.clearAnimation()
    this.layerCopySystemBaseline = null
    this.layerCopySystemBaselineSize = null
    this.animationCopySystemBaseline = null
  }

  getSelection(): SelectionClipboard | null {
    return this.selection ? cloneSelectionClipboard(this.selection) : null
  }

  setLayer(clipboard: LayerClipboard): void {
    this.setLayers({ layers: [clipboard], groups: [] })
  }

  setLayers(clipboard: LayerCollectionClipboard): void {
    this.layers = cloneLayerCollectionClipboard(clipboard)
    this.selection = null
    this.clearAnimation()
    this.layerCopySystemBaseline = null
    this.layerCopySystemBaselineSize = null
    this.animationCopySystemBaseline = null
  }

  captureLayerCopySystemBaseline(readSystemImage: () => Promise<ClipboardImage | null>): void {
    this.layerCopySystemBaseline = this.readSystemSelection(readSystemImage)
  }

  captureLayerCopySystemBaselineSize(readSystemSize: () => Promise<ClipboardImageSize | null>): void {
    this.layerCopySystemBaselineSize = readSystemSize().catch(() => null)
  }

  captureAnimationCopySystemBaseline(readSystemImage?: () => Promise<ClipboardImage | null>): void {
    this.selection = null
    this.layers = null
    this.layerCopySystemBaseline = null
    this.layerCopySystemBaselineSize = null
    this.animationCopySystemBaseline = readSystemImage ? this.readSystemSelection(readSystemImage) : Promise.resolve(null)
  }

  setAnimationCells(snapshot: AnimationCelClipboardSnapshot): void {
    this.animationCells = cloneAnimationCelClipboardSnapshot(snapshot)
    this.animationFrames = null
  }

  getAnimationCells(): AnimationCelClipboardSnapshot | null {
    return this.animationCells ? cloneAnimationCelClipboardSnapshot(this.animationCells) : null
  }

  setAnimationFrames(snapshot: AnimationFrameClipboardSnapshot): void {
    this.animationFrames = cloneAnimationFrameClipboardSnapshot(snapshot)
    this.animationCells = null
  }

  getAnimationFrames(): AnimationFrameClipboardSnapshot | null {
    return this.animationFrames ? cloneAnimationFrameClipboardSnapshot(this.animationFrames) : null
  }

  clearAnimation(): void {
    this.animationCells = null
    this.animationFrames = null
    this.animationCopySystemBaseline = null
  }

  getLayer(): LayerClipboard | null {
    return this.layers?.layers.length === 1 && this.layers.groups.length === 0 ? cloneLayerClipboard(this.layers.layers[0]) : null
  }

  getLayers(): LayerCollectionClipboard | null {
    return this.layers ? cloneLayerCollectionClipboard(this.layers) : null
  }

  async readSelection(readSystemImage: () => Promise<ClipboardImage | null>): Promise<SelectionClipboard | null> {
    const internal = this.selection
    try {
      const image = await readSystemImage()
      const system = image ? selectionClipboardFromImage(image) : null
      if (system && internal && system.width === internal.width && system.height === internal.height
        && system.pixels.every((value, index) => value === internal.pixels[index])
        && masksEqual(system.mask, internal.mask, system.width * system.height)) return cloneSelectionClipboard(internal)
      return system ?? (internal ? cloneSelectionClipboard(internal) : null)
    } catch {
      return internal ? cloneSelectionClipboard(internal) : null
    }
  }

  async readSystemSelection(readSystemImage: () => Promise<ClipboardImage | null>): Promise<SelectionClipboard | null> {
    try {
      const image = await readSystemImage()
      return image ? selectionClipboardFromImage(image) : null
    } catch {
      return null
    }
  }

  async preferInternalLayers(currentSystemSelection: SelectionClipboard | null): Promise<boolean> {
    if (!this.layers) return false
    const baseline = this.layerCopySystemBaseline ? await this.layerCopySystemBaseline : null
    if (!baseline) return currentSystemSelection === null
    if (!currentSystemSelection) return true
    return selectionClipboardsEqual(currentSystemSelection, baseline)
  }

  async preferInternalAnimation(currentSystemSelection: SelectionClipboard | null): Promise<boolean> {
    if (!this.animationCopySystemBaseline) return false
    const baseline = await this.animationCopySystemBaseline
    if (!baseline) return currentSystemSelection === null
    if (!currentSystemSelection) return true
    return selectionClipboardsEqual(currentSystemSelection, baseline)
  }

  layerClipboardSize(): ClipboardImageSize | null {
    if (!this.layers?.layers.length) return null
    let left = Infinity
    let top = Infinity
    let right = -Infinity
    let bottom = -Infinity
    for (const layer of this.layers.layers) {
      left = Math.min(left, layer.offsetX)
      top = Math.min(top, layer.offsetY)
      right = Math.max(right, layer.offsetX + layer.width)
      bottom = Math.max(bottom, layer.offsetY + layer.height)
    }
    if (!Number.isFinite(left) || right <= left || bottom <= top) return null
    return { width: right - left, height: bottom - top }
  }

  async latestClipboardSize(
    readSystemSize: () => Promise<ClipboardImageSize | null>,
    readSystemImage?: () => Promise<ClipboardImage | null>
  ): Promise<ClipboardImageSize | null> {
    const system = await readSystemSize().catch(() => null)
    const layers = this.layerClipboardSize()
    if (!layers) return system
    const baseline = this.layerCopySystemBaselineSize ? await this.layerCopySystemBaselineSize : null
    if (!baseline) return system ?? layers
    if (system && system.width === baseline.width && system.height === baseline.height) {
      if (!readSystemImage) return layers
      const currentImage = await this.readSystemSelection(readSystemImage)
      const baselineImage = this.layerCopySystemBaseline ? await this.layerCopySystemBaseline : null
      if (currentImage && baselineImage && selectionClipboardsEqual(currentImage, baselineImage)) return layers
      if (!currentImage && !baselineImage) return layers
      return system
    }
    return system ?? layers
  }

  async readSize(
    readSystemSize: () => Promise<ClipboardImageSize | null>,
    readSystemImage?: () => Promise<ClipboardImage | null>
  ): Promise<ClipboardImageSize | null> {
    return this.latestClipboardSize(readSystemSize, readSystemImage)
  }
}

export const clipboardService = new ClipboardService()

const cloneAnimationCelClipboardSnapshot = (snapshot: AnimationCelClipboardSnapshot): AnimationCelClipboardSnapshot => ({
  sourceDocumentId: snapshot.sourceDocumentId,
  anchorLayerIndex: snapshot.anchorLayerIndex,
  anchorFrameIndex: snapshot.anchorFrameIndex,
  items: snapshot.items.map((item) => ({
    layerIndex: item.layerIndex,
    frameIndex: item.frameIndex,
    cel: cloneAnimationCel(item.cel),
    mask: item.mask ? cloneAnimationLayerMask(item.mask) : undefined
  }))
})

const cloneAnimationFrameClipboardSnapshot = (snapshot: AnimationFrameClipboardSnapshot): AnimationFrameClipboardSnapshot => ({
  sourceDocumentId: snapshot.sourceDocumentId,
  layers: snapshot.layers.map((layer) => ({ ...layer })),
  frames: snapshot.frames.map((frame) => ({
    duration: frame.duration,
    ...(frame.disabled === true ? { disabled: true } : {}),
    cels: frame.cels.map((item) => ({ layerIndex: item.layerIndex, cel: cloneAnimationCel(item.cel) })),
    layerMasks: frame.layerMasks.map((item) => ({ layerIndex: item.layerIndex, mask: cloneAnimationLayerMask(item.mask) })),
    groupMasks: frame.groupMasks.map((item) => ({ groupIndex: item.groupIndex, mask: cloneAnimationGroupMask(item.mask) }))
  }))
})

const masksEqual = (left: Uint8Array | undefined, right: Uint8Array | undefined, size: number): boolean => {
  if (left === right) return true
  if (!left) return !right || right.length === size && right.every((value) => value === 1)
  if (!right) return left.length === size && left.every((value) => value === 1)
  return left.length === right.length && left.every((value, index) => value === right[index])
}

const selectionClipboardsEqual = (left: SelectionClipboard, right: SelectionClipboard): boolean => left.width === right.width
  && left.height === right.height
  && left.originX === right.originX
  && left.originY === right.originY
  && left.pixels.length === right.pixels.length
  && left.pixels.every((value, index) => value === right.pixels[index])
  && masksEqual(left.mask, right.mask, left.width * left.height)
