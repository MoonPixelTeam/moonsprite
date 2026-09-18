import { unzlibSync, zlibSync } from 'fflate'
import type { AnimationCel, AnimationCelSurface } from '@shared/types-animation'
import type { BlendMode, PaletteEntry } from '@shared/types-color'
import type { LayerGroup, RasterLayer } from '@shared/types-layer'
import type { SpriteDocument } from '@shared/types-document'
import { createDocument, createId, createLayer, getPaletteEntry, readLayerPacked } from './document-model'
import { TRANSPARENT, unpackColor } from './raster'
import { translateCurrent as tr } from './localization'
import { animationLayerAtFrame, ensureAnimationDocument, refreshActiveAnimationFrame, syncActiveAnimationFrame } from './animation'
import { hasEnabledLayerStyles } from './layer-styles'
import { compositeDocument } from './document-composite'
import { cloneDocumentForAnimationFrame } from './animation'
import { applyImportedRgbaPalette } from './imported-palette'

const ASE_MAGIC = 0xa5e0
const FRAME_MAGIC = 0xf1fa
const LAYER_CHUNK = 0x2004
const CEL_CHUNK = 0x2005
const PALETTE_CHUNK = 0x2019
const GROUP_LAYER = 1
const TILEMAP_LAYER = 2
const LAYER_OPACITY_VALID = 1
const GROUP_BLEND_OPACITY_VALID = 2
const MAX_DIMENSION = 16384
const MAX_ASE_DIMENSION = 65535

type LayerSpec = {
  index: number
  id: string
  name: string
  group: boolean
  parentGroupId: string | null
  visible: boolean
  locked: boolean
  opacity: number
  blendMode: BlendMode
  childLevel: number
  tilemap: boolean
  tilesetIndex?: number
}

type Cel = {
  layerIndex: number
  x: number
  y: number
  opacity: number
  type: number
  zIndex: number
  width?: number
  height?: number
  data?: Uint8Array
  linkedFrame?: number
  tileMasks?: number[]
}

type DecodedCel = { zIndex: number; x: number; y: number; opacity: number; width: number; height: number; pixels: Uint8ClampedArray; sourceFrame: number }

const blendMode = (value: number): BlendMode => {
  const modes: Record<number, BlendMode> = {
    0: 'normal', 1: 'multiply', 2: 'screen', 3: 'overlay', 4: 'darken', 5: 'lighten',
    6: 'color-dodge', 7: 'color-burn', 8: 'hard-light', 9: 'soft-light', 10: 'difference',
    11: 'exclusion', 12: 'hue', 13: 'saturation', 14: 'color', 15: 'luminosity',
    16: 'linear-dodge', 17: 'subtract', 18: 'divide'
  }
  return modes[value] ?? 'normal'
}

const readString = (view: DataView, offset: number, end: number): { value: string; next: number } => {
  if (offset + 2 > end) throw new Error(tr('core.aseprite.layerNameCorrupt'))
  const length = view.getUint16(offset, true)
  const start = offset + 2
  const finish = start + length
  if (finish > end) throw new Error(tr('core.aseprite.layerNameCorrupt'))
  return { value: new TextDecoder().decode(new Uint8Array(view.buffer, view.byteOffset + start, length)), next: finish }
}

const readPalette = (view: DataView, start: number, end: number, previous: Array<PaletteEntry | undefined>): Array<PaletteEntry | undefined> => {
  if (start + 20 > end) return []
  const count = view.getUint32(start, true)
  const first = view.getUint32(start + 4, true)
  const last = view.getUint32(start + 8, true)
  if (count < 1 || count > 1_000_000 || first >= count || last >= count || last < first) return previous
  let offset = start + 20
  const entries = previous.slice()
  entries.length = Math.max(entries.length, count)
  for (let index = first; index <= last && offset + 6 <= end; index += 1) {
    const flags = view.getUint16(offset, true)
    const color = { r: view.getUint8(offset + 2), g: view.getUint8(offset + 3), b: view.getUint8(offset + 4), a: view.getUint8(offset + 5) }
    offset += 6
    const name = (flags & 1) !== 0 && offset + 2 <= end ? readString(view, offset, end) : { value: tr('core.document.colorName', { id: index }), next: offset }
    offset = name.next
    entries[index] = { id: index, name: name.value || tr('core.document.colorName', { id: index }), color }
  }
  return entries
}

const readOldPalette = (view: DataView, start: number, end: number, previous: Array<PaletteEntry | undefined>): Array<PaletteEntry | undefined> => {
  if (start + 2 > end) return previous
  const packets = view.getUint16(start, true)
  const entries = previous.slice()
  let offset = start + 2
  let index = 0
  for (let packet = 0; packet < packets && offset + 2 <= end; packet += 1) {
    index += view.getUint8(offset)
    let colors = view.getUint8(offset + 1)
    offset += 2
    if (colors === 0) colors = 256
    for (let color = 0; color < colors && offset + 3 <= end; color += 1, index += 1) {
      entries[index] = { id: index, name: tr('core.document.colorName', { id: index }), color: { r: view.getUint8(offset), g: view.getUint8(offset + 1), b: view.getUint8(offset + 2), a: 255 } }
      offset += 3
    }
  }
  return entries
}

const decodePixelData = (bytes: Uint8Array, width: number, height: number, colorDepth: number, palette: Array<PaletteEntry | undefined>, transparentIndex: number): Uint8ClampedArray => {
  const pixels = new Uint8ClampedArray(width * height * 4)
  if (colorDepth === 32) {
    if (bytes.byteLength < pixels.byteLength) throw new Error(tr('core.aseprite.rgbaCelIncomplete'))
    pixels.set(bytes.subarray(0, pixels.length))
    return pixels
  }
  if (colorDepth === 16) {
    if (bytes.byteLength < width * height * 2) throw new Error(tr('core.aseprite.grayCelIncomplete'))
    for (let index = 0; index < width * height; index += 1) {
      const value = index * 2
      pixels[index * 4] = bytes[value]
      pixels[index * 4 + 1] = bytes[value]
      pixels[index * 4 + 2] = bytes[value]
      pixels[index * 4 + 3] = bytes[value + 1]
    }
    return pixels
  }
  if (colorDepth !== 8) throw new Error(tr('core.aseprite.unsupportedColorDepth', { depth: colorDepth }))
  for (let index = 0; index < width * height; index += 1) {
    const color = palette[bytes[index]]?.color ?? TRANSPARENT
    const alpha = bytes[index] === transparentIndex ? 0 : color.a
    pixels.set([color.r, color.g, color.b, alpha], index * 4)
  }
  return pixels
}

export function decodeAseprite(input: Uint8Array, fallbackName = tr('core.document.importedAseprite'), onProgress?: (value: number) => void): SpriteDocument {
  const reportProgress = (value: number): void => onProgress?.(Math.max(0, Math.min(1, value)))
  reportProgress(0)
  if (input.byteLength < 128) throw new Error(tr('core.aseprite.fileCorrupt'))
  const view = new DataView(input.buffer, input.byteOffset, input.byteLength)
  if (view.getUint16(4, true) !== ASE_MAGIC) throw new Error(tr('core.aseprite.invalidFile'))
  const frameCount = view.getUint16(6, true)
  const width = view.getUint16(8, true)
  const height = view.getUint16(10, true)
  const colorDepth = view.getUint16(12, true)
  const headerFlags = view.getUint32(14, true)
  // The header reserves bytes 20-27; the transparent palette entry is byte 28.
  const transparentIndex = view.getUint8(28)
  if (!frameCount || width < 1 || height < 1 || width > MAX_DIMENSION || height > MAX_DIMENSION) throw new Error(tr('core.aseprite.invalidCanvas'))
  if (![8, 16, 32].includes(colorDepth)) throw new Error(tr('core.aseprite.unsupportedColorDepth', { depth: colorDepth }))

  const layers: LayerSpec[] = []
  const tilesets: Array<{ flags: number; count: number; width: number; height: number; data?: Uint8Array }> = []
  const cels = new Map<number, Cel[]>()
  const frameDurations: number[] = []
  const framePalettes: Array<Array<PaletteEntry | undefined>> = []
  const tags: Array<{ name: string; from: number; to: number; direction: number; repeat: number }> = []
  let palette: Array<PaletteEntry | undefined> = []
  const groupStack: string[] = []
  let offset = 128
  for (let frame = 0; frame < frameCount; frame += 1) {
    if (offset + 16 > input.byteLength) throw new Error(tr('core.aseprite.frameIncomplete'))
    const frameStart = offset
    const frameSize = view.getUint32(offset, true)
    const frameEnd = frameStart + frameSize
    if (frameSize < 16 || frameEnd > input.byteLength || view.getUint16(offset + 4, true) !== FRAME_MAGIC) throw new Error(tr('core.aseprite.invalidFrame'))
    const legacyChunkCount = view.getUint16(offset + 6, true)
    const chunkCount = legacyChunkCount === 0xffff ? view.getUint32(offset + 12, true) : legacyChunkCount
    frameDurations.push(Math.max(1, view.getUint16(offset + 8, true) || 100))
    offset += 16
    const frameCels: Cel[] = []
    for (let chunkIndex = 0; chunkIndex < chunkCount && offset + 6 <= frameEnd; chunkIndex += 1) {
      const chunkStart = offset
      const chunkSize = view.getUint32(offset, true)
      const chunkEnd = chunkStart + chunkSize
      const type = view.getUint16(offset + 4, true)
      if (chunkSize < 6 || chunkEnd > frameEnd) throw new Error(tr('core.aseprite.invalidChunk'))
      const payload = chunkStart + 6
      if (type === LAYER_CHUNK && frame === 0 && payload + 18 <= chunkEnd) {
        const flags = view.getUint16(payload, true)
        const layerType = view.getUint16(payload + 2, true)
        const childLevel = view.getUint16(payload + 4, true)
        if (layerType > TILEMAP_LAYER) throw new Error(tr('core.aseprite.invalidLayerType'))
        const name = readString(view, payload + 16, chunkEnd)
        const id = createId(layerType === GROUP_LAYER ? 'group' : 'layer')
        groupStack.length = Math.min(groupStack.length, childLevel)
        const parent = childLevel > 0 ? groupStack[childLevel - 1] ?? null : null
        const group = layerType === GROUP_LAYER
        const opacityValid = group ? (headerFlags & GROUP_BLEND_OPACITY_VALID) !== 0 : (headerFlags & LAYER_OPACITY_VALID) !== 0
        const groupPropertiesValid = !group || (headerFlags & GROUP_BLEND_OPACITY_VALID) !== 0
        const spec: LayerSpec = { index: layers.length, id, name: name.value || tr(group ? 'core.document.group' : 'core.document.layer'), group, tilemap: layerType === TILEMAP_LAYER, parentGroupId: parent, visible: (flags & 1) !== 0, locked: (flags & 2) === 0, opacity: opacityValid ? view.getUint8(payload + 12) / 255 : 1, blendMode: groupPropertiesValid ? blendMode(view.getUint16(payload + 10, true)) : 'normal', childLevel }
        if (spec.tilemap && name.next + 4 <= chunkEnd) spec.tilesetIndex = view.getUint32(name.next, true)
        layers.push(spec)
        if (spec.group) groupStack[childLevel] = spec.id
      } else if (type === CEL_CHUNK && payload + 16 <= chunkEnd) {
        const cel: Cel = { layerIndex: view.getUint16(payload, true), x: view.getInt16(payload + 2, true), y: view.getInt16(payload + 4, true), opacity: view.getUint8(payload + 6) / 255, type: view.getUint16(payload + 7, true), zIndex: view.getInt16(payload + 9, true) }
        if (cel.type === 0 || cel.type === 2) {
          if (payload + 20 > chunkEnd) throw new Error(tr('core.aseprite.celIncomplete'))
          cel.width = view.getUint16(payload + 16, true)
          cel.height = view.getUint16(payload + 18, true)
          const data = new Uint8Array(input.buffer, input.byteOffset + payload + 20, chunkEnd - payload - 20)
          cel.data = cel.type === 2 ? (awaitUnzip(data)) : data.slice()
        } else if (cel.type === 3) {
          if (payload + 52 > chunkEnd || view.getUint16(payload + 20, true) !== 32) throw new Error(tr('core.aseprite.celIncomplete'))
          cel.width = view.getUint16(payload + 16, true)
          cel.height = view.getUint16(payload + 18, true)
          cel.tileMasks = [22, 26, 30, 34].map((position) => view.getUint32(payload + position, true))
          cel.data = awaitUnzip(input.subarray(payload + 52, chunkEnd))
        } else if (cel.type === 1 && payload + 18 <= chunkEnd) cel.linkedFrame = view.getUint16(payload + 16, true)
        frameCels.push(cel)
      } else if (type === 0x2023) {
        if (payload + 34 > chunkEnd) throw new Error(tr('core.aseprite.invalidChunk'))
        const flags = view.getUint32(payload + 4, true)
        const count = view.getUint32(payload + 8, true)
        const tileWidth = view.getUint16(payload + 12, true)
        const tileHeight = view.getUint16(payload + 14, true)
        if (!tileWidth || !tileHeight || !count || tileWidth * tileHeight * count > MAX_DIMENSION * MAX_DIMENSION) throw new Error(tr('core.aseprite.invalidChunk'))
        let cursor = readString(view, payload + 32, chunkEnd).next
        if (flags & 1) cursor += 8
        let data: Uint8Array | undefined
        if (flags & 2) {
          if (cursor + 4 > chunkEnd) throw new Error(tr('core.aseprite.invalidChunk'))
          const length = view.getUint32(cursor, true)
          cursor += 4
          if (cursor + length > chunkEnd) throw new Error(tr('core.aseprite.invalidChunk'))
          data = awaitUnzip(input.subarray(cursor, cursor + length))
        }
        tilesets.push({ flags, count, width: tileWidth, height: tileHeight, data })
      } else if (type === 0x2018) {
        if (payload + 10 > chunkEnd) throw new Error(tr('core.aseprite.invalidChunk'))
        const count = view.getUint16(payload, true)
        let tagOffset = payload + 10
        for (let index = 0; index < count; index += 1) {
          if (tagOffset + 19 > chunkEnd) throw new Error(tr('core.aseprite.invalidChunk'))
          const name = readString(view, tagOffset + 17, chunkEnd)
          tags.push({ name: name.value, from: view.getUint16(tagOffset, true), to: view.getUint16(tagOffset + 2, true), direction: view.getUint8(tagOffset + 4), repeat: view.getUint16(tagOffset + 5, true) })
          tagOffset = name.next
        }
      } else if (type === PALETTE_CHUNK) {
        palette = readPalette(view, payload, chunkEnd, palette)
      } else if (type === 0x0004 || type === 0x0011) {
        palette = readOldPalette(view, payload, chunkEnd, palette)
        if (type === 0x0004) {
          palette = palette.map((entry) => entry ? {
            ...entry,
            color: {
              r: Math.round((entry.color.r * 255) / 63),
              g: Math.round((entry.color.g * 255) / 63),
              b: Math.round((entry.color.b * 255) / 63),
              a: entry.color.a
            }
          } : undefined)
        }
      }
      offset = chunkEnd
    }
    framePalettes.push(palette.slice())
    cels.set(frame, frameCels)
    offset = frameEnd
    reportProgress(0.72 * ((frame + 1) / frameCount))
  }
  if (!layers.length) throw new Error(tr('core.aseprite.noImportableLayers'))

  const document = createDocument(fallbackName, 1, 1, 'rgba')
  document.width = width
  document.height = height
  document.layers = []
  document.groups = []
  const groupIds = new Set(layers.filter((layer) => layer.group).map((layer) => layer.id))
  for (const spec of layers) if (spec.group) document.groups.push({ id: spec.id, name: spec.name, parentGroupId: spec.parentGroupId, visible: spec.visible, locked: spec.locked, opacity: spec.opacity, blendMode: spec.blendMode } satisfies LayerGroup)
  const resolved = new Map<string, DecodedCel | null>()
  const resolveCel = (frame: number, layerIndex: number, stack = new Set<string>()): DecodedCel | null => {
    const key = `${frame}:${layerIndex}`
    if (resolved.has(key)) return resolved.get(key) ?? null
    if (stack.has(key)) return null
    const cel = (cels.get(frame) ?? []).find((item) => item.layerIndex === layerIndex)
    if (!cel) { resolved.set(key, null); return null }
    if (cel.type === 1) {
      const linked = resolveCel(cel.linkedFrame ?? 0, layerIndex, new Set(stack).add(key))
      if (!linked) return null
      const result = { ...linked, x: cel.x, y: cel.y, opacity: cel.opacity, zIndex: cel.zIndex }
      resolved.set(key, result)
      return result
    }
    if (!cel.width || !cel.height || !cel.data) return null
    if (cel.type === 3) {
      const spec = layers[layerIndex]
      const tileset = spec?.tilesetIndex === undefined ? undefined : tilesets[spec.tilesetIndex]
      if (!tileset?.data || !cel.tileMasks) throw new Error(tr('core.aseprite.externalTilesetUnsupported'))
      const width = cel.width * tileset.width
      const height = cel.height * tileset.height
      if (width > MAX_DIMENSION || height > MAX_DIMENSION || cel.data.length !== cel.width * cel.height * 4) throw new Error(tr('core.aseprite.celIncomplete'))
      const tilePixels = decodePixelData(tileset.data, tileset.width, tileset.height * tileset.count, colorDepth, framePalettes[frame], transparentIndex)
      const pixels = new Uint8ClampedArray(width * height * 4)
      const tileView = new DataView(cel.data.buffer, cel.data.byteOffset, cel.data.byteLength)
      const [idMask, xMask, yMask, diagonalMask] = cel.tileMasks
      for (let cell = 0; cell < cel.width * cel.height; cell += 1) {
        const value = tileView.getUint32(cell * 4, true)
        const id = (value & idMask) >>> 0
        if ((tileset.flags & 4) ? id === 0 : value === 0xffffffff) continue
        if (id >= tileset.count) throw new Error(tr('core.aseprite.celIncomplete'))
        for (let y = 0; y < tileset.height; y += 1) for (let x = 0; x < tileset.width; x += 1) {
          let sourceX = (value & xMask) ? tileset.width - 1 - x : x
          let sourceY = (value & yMask) ? tileset.height - 1 - y : y
          if (value & diagonalMask) [sourceX, sourceY] = [sourceY, sourceX]
          if (sourceX >= tileset.width || sourceY >= tileset.height) continue
          const sourceOffset = (id * tileset.width * tileset.height + sourceY * tileset.width + sourceX) * 4
          const targetOffset = ((Math.floor(cell / cel.width) * tileset.height + y) * width + (cell % cel.width) * tileset.width + x) * 4
          pixels.set(tilePixels.subarray(sourceOffset, sourceOffset + 4), targetOffset)
        }
      }
      const result = { x: cel.x, y: cel.y, opacity: cel.opacity, zIndex: cel.zIndex, width, height, pixels, sourceFrame: frame }
      resolved.set(key, result)
      return result
    }
    const result = { x: cel.x, y: cel.y, opacity: cel.opacity, zIndex: cel.zIndex, width: cel.width, height: cel.height, pixels: decodePixelData(cel.data, cel.width, cel.height, colorDepth, framePalettes[frame], transparentIndex), sourceFrame: frame }
    resolved.set(key, result)
    return result
  }
  const documentLayerBySpecIndex = new Map<number, RasterLayer>()
  for (const spec of layers) {
    if (groupIds.has(spec.id) || (spec.tilemap && spec.tilesetIndex === undefined)) continue
    const layer = createLayer(spec.name, 1, 1, 'rgba')
    if (layer.format !== 'rgba') continue
    layer.id = spec.id
    layer.groupId = spec.parentGroupId
    layer.visible = spec.visible
    layer.locked = spec.locked
    layer.opacity = spec.opacity
    layer.blendMode = spec.blendMode
    document.layers.push(layer)
    documentLayerBySpecIndex.set(spec.index, layer)
  }
  if (!document.layers.length) throw new Error(tr('core.aseprite.noPixelLayers'))
  document.activeLayerId = document.layers[document.layers.length - 1].id
  document.name = fallbackName
  const frames = frameDurations.map((duration, index) => ({ id: `frame-${index + 1}`, duration }))
  const animationCels: AnimationCel[] = []
  let celSequence = 0
  const celIdBySlot = new Map<string, string>()
  for (const spec of layers) {
    const layer = documentLayerBySpecIndex.get(spec.index)
    if (!layer) continue
    for (let frameIndex = 0; frameIndex < frames.length; frameIndex += 1) celIdBySlot.set(`${frameIndex}:${spec.index}`, `cel-${++celSequence}`)
  }
  const sourceSurfaces = new Map<string, AnimationCelSurface>()
  const createCelSurface = (cel: DecodedCel, copyPixels = false): AnimationCelSurface => {
    const pixels = copyPixels ? cel.pixels.slice() : cel.pixels
    return { format: 'rgba', width: cel.width, height: cel.height, offsetX: cel.x, offsetY: cel.y, pixels }
  }
  for (const spec of layers) {
    const layer = documentLayerBySpecIndex.get(spec.index)
    if (!layer) continue
    for (let frameIndex = 0; frameIndex < frames.length; frameIndex += 1) {
      const cel = resolveCel(frameIndex, spec.index)
      const sourceCel = cel ? resolveCel(cel.sourceFrame, spec.index) : null
      const sharesSource = Boolean(cel && sourceCel && cel.sourceFrame !== frameIndex
        && cel.x === sourceCel.x && cel.y === sourceCel.y && cel.opacity === sourceCel.opacity
        && cel.zIndex === sourceCel.zIndex && cel.width === sourceCel.width && cel.height === sourceCel.height)
      const sourceKey = cel ? `${cel.sourceFrame}:${spec.index}` : ''
      let surface: AnimationCelSurface
      let linkedCelId: string | undefined
      if (cel && sourceCel && sharesSource) {
        surface = sourceSurfaces.get(sourceKey) ?? createCelSurface(sourceCel)
        sourceSurfaces.set(sourceKey, surface)
        linkedCelId = celIdBySlot.get(sourceKey)
      } else if (cel) {
        surface = createCelSurface(cel, cel.sourceFrame !== frameIndex)
        if (cel.sourceFrame === frameIndex) sourceSurfaces.set(sourceKey, surface)
      } else surface = { format: 'rgba', width: 1, height: 1, offsetX: 0, offsetY: 0, pixels: new Uint8ClampedArray(4) }
      animationCels.push({ id: celIdBySlot.get(`${frameIndex}:${spec.index}`)!, layerId: layer.id, frameId: frames[frameIndex].id, opacity: spec.opacity * (cel?.opacity ?? 1), zIndex: cel?.zIndex ?? 0, surface, ...(linkedCelId ? { linkedCelId } : {}) })
      reportProgress(0.72 + 0.22 * (animationCels.length / Math.max(1, celIdBySlot.size)))
    }
  }
  document.animation = { frames, cels: animationCels, activeFrameId: frames[0].id, loop: true,
    loopSections: tags.filter((tag) => tag.from <= tag.to && tag.to < frames.length).map((tag) => ({
      id: createId('loop'), name: tag.name, startFrameId: frames[tag.from].id, endFrameId: frames[tag.to].id,
      direction: tag.direction === 3 ? 'ping-pong-reverse' : tag.direction === 2 ? 'ping-pong' : tag.direction === 1 ? 'reverse' : 'forward', repeatCount: tag.repeat || null
    }))
  }
  refreshActiveAnimationFrame(document)
  applyImportedRgbaPalette(document)
  reportProgress(1)
  return document
}

const awaitUnzip = (data: Uint8Array): Uint8Array => {
  try { return unzlibSync(data) } catch { throw new Error(tr('core.aseprite.compressedCelError')) }
}

const aseEncoder = new TextEncoder()

const concatBytes = (parts: Uint8Array[]): Uint8Array => {
  const output = new Uint8Array(parts.reduce((total, part) => total + part.length, 0))
  let offset = 0
  for (const part of parts) { output.set(part, offset); offset += part.length }
  return output
}

const aseChunk = (type: number, payload: Uint8Array): Uint8Array => {
  const output = new Uint8Array(payload.length + 6)
  const view = new DataView(output.buffer)
  view.setUint32(0, output.length, true)
  view.setUint16(4, type, true)
  output.set(payload, 6)
  return output
}

const aseString = (value: string): Uint8Array => {
  const bytes = aseEncoder.encode(value).subarray(0, 65533)
  const output = new Uint8Array(bytes.length + 2)
  new DataView(output.buffer).setUint16(0, bytes.length, true)
  output.set(bytes, 2)
  return output
}

const aseBlendMode = (value: BlendMode): number => {
  const modes: Partial<Record<BlendMode, number>> = {
    normal: 0, multiply: 1, screen: 2, overlay: 3, darken: 4, lighten: 5,
    'color-dodge': 6, 'color-burn': 7, 'hard-light': 8, 'soft-light': 9, difference: 10,
    exclusion: 11, hue: 12, saturation: 13, color: 14, luminosity: 15,
    'linear-dodge': 16, subtract: 17, divide: 18
  }
  return modes[value] ?? 0
}

const scaledLayerPixels = (document: SpriteDocument, layer: RasterLayer, scale: number): { width: number; height: number; offsetX: number; offsetY: number; pixels: Uint8Array } => {
  const offsetX = Math.floor(layer.offsetX * scale)
  const offsetY = Math.floor(layer.offsetY * scale)
  const right = Math.ceil((layer.offsetX + layer.width) * scale)
  const bottom = Math.ceil((layer.offsetY + layer.height) * scale)
  const width = Math.max(1, right - offsetX)
  const height = Math.max(1, bottom - offsetY)
  const pixels = new Uint8Array(width * height * 4)
  const clamp = (value: number, maximum: number): number => Math.max(0, Math.min(maximum - 1, value))
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const sourceX = clamp(Math.floor((offsetX + x + 0.5) / scale - layer.offsetX), layer.width)
    const sourceY = clamp(Math.floor((offsetY + y + 0.5) / scale - layer.offsetY), layer.height)
    const packed = readLayerPacked(document, layer, sourceY * layer.width + sourceX)
    const color = layer.format === 'rgba' ? unpackColor(packed) : getPaletteEntry(document, packed).color
    const target = (y * width + x) * 4
    pixels[target] = color.r
    pixels[target + 1] = color.g
    pixels[target + 2] = color.b
    pixels[target + 3] = color.a
  }
  return { width, height, offsetX, offsetY, pixels }
}

const aseLayerChunk = (layer: RasterLayer | LayerGroup, level: number, group: boolean): Uint8Array => {
  const payload = new Uint8Array(16 + aseString(layer.name).length)
  const view = new DataView(payload.buffer)
  const flags = (layer.visible ? 1 : 0) | (layer.locked ? 0 : 2)
  view.setUint16(0, flags, true)
  view.setUint16(2, group ? GROUP_LAYER : 0, true)
  view.setUint16(4, level, true)
  view.setUint16(10, aseBlendMode(layer.blendMode), true)
  view.setUint8(12, Math.max(0, Math.min(255, Math.round(layer.opacity * 255))))
  payload.set(aseString(layer.name), 16)
  return aseChunk(LAYER_CHUNK, payload)
}

const aseCelChunk = (layerIndex: number, raster: ReturnType<typeof scaledLayerPixels>, opacity: number, zIndex: number, linkedFrame?: number): Uint8Array => {
  if (raster.offsetX < -32768 || raster.offsetX > 32767 || raster.offsetY < -32768 || raster.offsetY > 32767) throw new Error(tr('core.aseprite.layerOffsetRange'))
  if (raster.width > MAX_ASE_DIMENSION || raster.height > MAX_ASE_DIMENSION) throw new Error(tr('core.aseprite.layerSizeRange'))
  const compressed = linkedFrame === undefined ? zlibSync(raster.pixels) : new Uint8Array(0)
  const payload = new Uint8Array(linkedFrame === undefined ? 20 + compressed.length : 18)
  const view = new DataView(payload.buffer)
  view.setUint16(0, layerIndex, true)
  view.setInt16(2, raster.offsetX, true)
  view.setInt16(4, raster.offsetY, true)
  view.setUint8(6, Math.round(Math.max(0, Math.min(1, opacity)) * 255))
  view.setUint16(7, linkedFrame === undefined ? 2 : 1, true)
  view.setInt16(9, Math.max(-32768, Math.min(32767, zIndex)), true)
  if (linkedFrame !== undefined) {
    view.setUint16(16, linkedFrame, true)
    return aseChunk(CEL_CHUNK, payload)
  }
  view.setUint16(16, raster.width, true)
  view.setUint16(18, raster.height, true)
  payload.set(compressed, 20)
  return aseChunk(CEL_CHUNK, payload)
}

type AseExportItem = { kind: 'layer'; layer: RasterLayer; level: number } | { kind: 'group'; group: LayerGroup; level: number }

const orderedAseItems = (document: SpriteDocument): AseExportItem[] => {
  const layerOrder = new Map(document.layers.map((layer, index) => [layer.id, index]))
  const groupOrder = new Map(document.groups.map((group, index) => [group.id, index]))
  const groupById = new Map(document.groups.map((group) => [group.id, group]))
  const anchorCache = new Map<string, number>()
  const groupAnchor = (groupId: string, visiting = new Set<string>()): number => {
    if (anchorCache.has(groupId)) return anchorCache.get(groupId)!
    if (visiting.has(groupId)) return Number.POSITIVE_INFINITY
    const next = new Set(visiting).add(groupId)
    let anchor = Number.POSITIVE_INFINITY
    for (const layer of document.layers) if (layer.groupId === groupId) anchor = Math.min(anchor, layerOrder.get(layer.id) ?? anchor)
    for (const group of document.groups) if (group.parentGroupId === groupId) anchor = Math.min(anchor, groupAnchor(group.id, next))
    anchorCache.set(groupId, anchor)
    return anchor
  }
  const compile = (parentGroupId: string | null, level: number, visiting = new Set<string>()): AseExportItem[] => {
    const items: Array<{ item: AseExportItem; order: number; tie: number }> = []
    for (const layer of document.layers) {
      const parent = layer.groupId && groupById.has(layer.groupId) ? layer.groupId : null
      if (parent === parentGroupId) items.push({ item: { kind: 'layer', layer, level }, order: layerOrder.get(layer.id) ?? 0, tie: 0 })
    }
    for (const group of document.groups) {
      const parent = group.parentGroupId && groupById.has(group.parentGroupId) && group.parentGroupId !== group.id ? group.parentGroupId : null
      if (parent === parentGroupId) items.push({ item: { kind: 'group', group, level }, order: groupAnchor(group.id), tie: groupOrder.get(group.id) ?? 0 })
    }
    items.sort((left, right) => left.order - right.order || left.tie - right.tie)
    const result: AseExportItem[] = []
    for (const { item } of items) {
      result.push(item)
      if (item.kind === 'group' && !visiting.has(item.group.id)) result.push(...compile(item.group.id, level + 1, new Set(visiting).add(item.group.id)))
    }
    return result
  }
  return compile(null, 0)
}

export function encodeAseprite(document: SpriteDocument, scalePercent = 100): Uint8Array {
  syncActiveAnimationFrame(document)
  const timeline = ensureAnimationDocument(document)
  const scale = Math.max(0.01, Math.min(64, Math.round(scalePercent) / 100))
  const width = Math.max(1, Math.round(document.width * scale))
  const height = Math.max(1, Math.round(document.height * scale))
  if (width > MAX_ASE_DIMENSION || height > MAX_ASE_DIMENSION) throw new Error(tr('core.aseprite.canvasSizeRange'))
  if (timeline.frames.length > 65535 || (timeline.loopSections?.length ?? 0) > 65535) throw new Error(tr('core.aseprite.invalidFrame'))
  const layerChunks: Uint8Array[] = []
  const rasterLayerIndices: Array<{ index: number; layer: RasterLayer }> = []
  let layerIndex = 0
  // These features depend on other layers; bake their composed appearance rather
  // than silently dropping the masks, clipping or group effects in ASE.
  const needsComposite = [...document.layers, ...document.groups].some((item) => item.clippingMask || hasEnabledLayerStyles(item.layerStyles))
    || Boolean(timeline.layerMasks?.length || timeline.groupMasks?.length)
    || document.groups.some((group) => group.cumulativeBlend)
  const exportItems: AseExportItem[] = needsComposite
    ? [{ kind: 'layer', layer: { ...createLayer(document.name, 1, 1, 'rgba'), id: 'ase-composite' }, level: 0 }]
    : orderedAseItems(document)
  for (const item of exportItems) {
    layerChunks.push(aseLayerChunk(item.kind === 'group' ? item.group : { ...item.layer, opacity: 1 }, item.level, item.kind === 'group'))
    if (item.kind === 'layer') rasterLayerIndices.push({ index: layerIndex, layer: item.layer })
    layerIndex += 1
  }
  if (layerIndex === 0) throw new Error(tr('core.aseprite.noExportableLayers'))
  const tagEntries = (timeline.loopSections ?? []).flatMap((section) => {
    const from = timeline.frames.findIndex((frame) => frame.id === section.startFrameId)
    const to = timeline.frames.findIndex((frame) => frame.id === section.endFrameId)
    if (from < 0 || to < from) return []
    const name = aseString(section.name)
    const entry = new Uint8Array(17 + name.length)
    const view = new DataView(entry.buffer)
    view.setUint16(0, from, true)
    view.setUint16(2, to, true)
    view.setUint8(4, section.direction === 'ping-pong-reverse' ? 3 : section.direction === 'ping-pong' ? 2 : section.direction === 'reverse' ? 1 : 0)
    view.setUint16(5, section.repeatCount === null ? 0 : Math.min(65535, Math.max(1, section.repeatCount)), true)
    entry.set(name, 17)
    return [entry]
  })
  const tagHeader = new Uint8Array(10)
  new DataView(tagHeader.buffer).setUint16(0, tagEntries.length, true)
  const tagChunks = tagEntries.length ? [aseChunk(0x2018, concatBytes([tagHeader, ...tagEntries]))] : []
  const framePayloads = timeline.frames.map((frame, frameIndex) => {
    const celChunks = rasterLayerIndices.map(({ index, layer }) => {
      let frameLayer = animationLayerAtFrame(document, layer.id, frame.id) ?? layer
      if (needsComposite) {
        const snapshot = cloneDocumentForAnimationFrame(document, frame.id)
        frameLayer = { ...layer, format: 'rgba', width: document.width, height: document.height, offsetX: 0, offsetY: 0, pixels: compositeDocument(snapshot) }
      }
      const cel = timeline.cels.find((item) => item.layerId === layer.id && item.frameId === frame.id)
      const source = cel?.linkedCelId ? timeline.cels.find((item) => item.id === cel.linkedCelId) : undefined
      const sourceIndex = source ? timeline.frames.findIndex((item) => item.id === source.frameId) : -1
      return aseCelChunk(index, scaledLayerPixels(document, frameLayer, scale), frameLayer.opacity, cel?.zIndex ?? 0,
        sourceIndex >= 0 && sourceIndex < frameIndex ? sourceIndex : undefined)
    })
    const chunks = frameIndex === 0 ? [...layerChunks, ...tagChunks, ...celChunks] : celChunks
    return { duration: frame.duration, chunks, data: concatBytes(chunks) }
  })
  const totalFrameBytes = framePayloads.reduce((total, frame) => total + 16 + frame.data.length, 0)
  const output = new Uint8Array(128 + totalFrameBytes)
  const view = new DataView(output.buffer)
  view.setUint32(0, output.length, true)
  view.setUint16(4, ASE_MAGIC, true)
  view.setUint16(6, framePayloads.length, true)
  view.setUint16(8, width, true)
  view.setUint16(10, height, true)
  view.setUint16(12, 32, true)
  view.setUint32(14, LAYER_OPACITY_VALID | GROUP_BLEND_OPACITY_VALID, true)
  view.setUint16(18, Math.min(65_535, framePayloads[0]?.duration ?? 100), true)
  view.setUint8(28, 0)
  view.setUint16(32, 0, true)
  view.setUint8(34, 1)
  view.setUint8(35, 1)
  view.setUint16(40, 16, true)
  view.setUint16(42, 16, true)
  let offset = 128
  for (const frame of framePayloads) {
    const frameSize = 16 + frame.data.length
    view.setUint32(offset, frameSize, true)
    view.setUint16(offset + 4, FRAME_MAGIC, true)
    if (frame.chunks.length < 0xffff) view.setUint16(offset + 6, frame.chunks.length, true)
    else { view.setUint16(offset + 6, 0xffff, true); view.setUint32(offset + 12, frame.chunks.length, true) }
    view.setUint16(offset + 8, Math.min(65_535, Math.max(1, frame.duration)), true)
    output.set(frame.data, offset + 16)
    offset += frameSize
  }
  return output
}
