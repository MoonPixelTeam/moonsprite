import type { BrushTexture, FillKind, ImageBrush, ProceduralBrushId, ProceduralBrushSettings, ToolId } from '@shared/types-brush'
import type { SelectionMask } from '@shared/types-selection'
import type { SpriteDocument } from '@shared/types-document'
import type { StoredBrush } from '@shared/types-library'
import { getActiveLayer, readLayerColor, readLayerColorAt } from './document-model'
import { encodePng } from './png-encode'
import { selectionContains } from './selection'
import { packColor, unpackColor } from './raster'
import { translateCurrent as tr, type TranslationKey } from './localization'

export const MAX_BRUSH_DIMENSION = 64

export interface ActiveBrushInputs {
  imageBrush: ImageBrush | null
  texture: BrushTexture
  fillTextureEnabled: boolean
}

export function activeBrushInputsForTool(tool: ToolId, fillKind: FillKind, imageBrush: ImageBrush | null, texture: BrushTexture): ActiveBrushInputs {
  const fillTextureEnabled = tool === 'fill' && fillKind === 'bucket'
  const supportsImageBrush = tool === 'pencil' || tool === 'eraser' || tool === 'line' || fillTextureEnabled
  return {
    imageBrush: supportsImageBrush && (fillTextureEnabled || !imageBrush?.id.startsWith('procedural:')) ? imageBrush : null,
    texture: fillTextureEnabled ? texture : 'solid',
    fillTextureEnabled
  }
}

const assertBrushDimensions = (width: number, height: number, name: string): void => {
  if (width > MAX_BRUSH_DIMENSION || height > MAX_BRUSH_DIMENSION) {
    throw new Error(tr('core.brush.dimensionLimit', { name, limit: MAX_BRUSH_DIMENSION }))
  }
}

export function createImageBrushFromRgba(id: string, name: string, width: number, height: number, pixels: Uint8ClampedArray): ImageBrush {
  assertBrushDimensions(width, height, name)
  if (pixels.length !== width * height * 4) throw new Error(tr('core.brush.invalidPixels', { name }))
  const coverage = new Uint8Array(width * height)
  const colors = new Uint32Array(width * height)
  for (let index = 0; index < coverage.length; index += 1) {
    const offset = index * 4
    const color = { r: pixels[offset] ?? 0, g: pixels[offset + 1] ?? 0, b: pixels[offset + 2] ?? 0, a: pixels[offset + 3] ?? 0 }
    coverage[index] = color.a
    colors[index] = packColor(color)
  }
  return { id, name, width, height, coverage, colors, intrinsicSize: true }
}

export function createSelectionBrush(document: SpriteDocument, selection: SelectionMask, id: string, name: string): ImageBrush | null {
  const x = Math.max(0, Math.min(document.width, Math.floor(selection.x)))
  const y = Math.max(0, Math.min(document.height, Math.floor(selection.y)))
  const right = Math.max(x, Math.min(document.width, Math.ceil(selection.x + selection.width)))
  const bottom = Math.max(y, Math.min(document.height, Math.ceil(selection.y + selection.height)))
  const width = right - x
  const height = bottom - y
  if (width < 1 || height < 1) return null
  assertBrushDimensions(width, height, name)
  const layer = getActiveLayer(document)
  const coverage = new Uint8Array(width * height)
  const colors = new Uint32Array(width * height)
  let pixels = 0
  for (let offsetY = 0; offsetY < height; offsetY += 1) for (let offsetX = 0; offsetX < width; offsetX += 1) {
    const documentX = x + offsetX
    const documentY = y + offsetY
    if (!selectionContains(selection, documentX, documentY)) continue
    const sourceColor = readLayerColorAt(document, layer, documentX, documentY)
    const offset = offsetY * width + offsetX
    coverage[offset] = sourceColor.a
    colors[offset] = packColor(sourceColor)
    if (sourceColor.a > 0) pixels += 1
  }
  return pixels > 0 ? { id, name, width, height, coverage, colors, intrinsicSize: true, sourceX: x, sourceY: y } : null
}

export function encodeBrushPng(brush: ImageBrush): Uint8Array {
  const rgba = new Uint8ClampedArray(brush.width * brush.height * 4)
  const sourceColors = brush.paintColors ?? brush.colors
  for (let index = 0; index < brush.coverage.length; index += 1) {
    const offset = index * 4
    if (sourceColors?.length === brush.width * brush.height) {
      const color = unpackColor(sourceColors[index] ?? 0)
      rgba[offset] = color.r
      rgba[offset + 1] = color.g
      rgba[offset + 2] = color.b
      rgba[offset + 3] = color.a
    } else {
      rgba[offset] = 255
      rgba[offset + 1] = 255
      rgba[offset + 2] = 255
      rgba[offset + 3] = brush.coverage[index]
    }
  }
  return encodePng(rgba, brush.width, brush.height, true).bytes
}

export async function decodeImageBrush(stored: StoredBrush, bytes: Uint8Array): Promise<ImageBrush> {
  const { decodePng } = await import('./png')
  const document = decodePng(bytes, stored.name)
  assertBrushDimensions(document.width, document.height, stored.name)
  const layer = getActiveLayer(document)
  const width = document.width
  const height = document.height
  const coverage = new Uint8Array(width * height)
  const colors = new Uint32Array(width * height)
  for (let index = 0; index < coverage.length; index += 1) {
    const color = readLayerColor(document, layer, index)
    coverage[index] = color.a
    colors[index] = packColor(color)
  }
  return { id: stored.id, name: stored.name, width, height, coverage, colors, intrinsicSize: true, sourceX: stored.sourceX, sourceY: stored.sourceY }
}

export const PROCEDURAL_BRUSH_IDS: ProceduralBrushId[] = ['procedural:noise', 'procedural:clouds', 'procedural:cells', 'procedural:fibers']

export const proceduralBrushDefaults: Record<ProceduralBrushId, ProceduralBrushSettings> = {
  'procedural:noise': { seed: 17, scale: 1, detail: 50, variation: 50, angle: 0 },
  'procedural:clouds': { seed: 31, scale: 18, detail: 3, variation: 45, angle: 0 },
  'procedural:cells': { seed: 71, scale: 12, detail: 38, variation: 70, angle: 0 },
  'procedural:fibers': { seed: 103, scale: 9, detail: 35, variation: 28, angle: 90 }
}

const proceduralBrushNameKeys: Record<ProceduralBrushId, TranslationKey> = {
  'procedural:noise': 'core.brush.proceduralNoise',
  'procedural:clouds': 'core.brush.proceduralClouds',
  'procedural:cells': 'core.brush.proceduralCells',
  'procedural:fibers': 'core.brush.proceduralFibers'
}

export const isProceduralBrushId = (id: string): id is ProceduralBrushId => PROCEDURAL_BRUSH_IDS.includes(id as ProceduralBrushId)
const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value))
const integer = (value: number, fallback: number): number => Number.isFinite(value) ? Math.round(value) : fallback
const normalizedSettingsCache = new WeakMap<object, ProceduralBrushSettings>()

export function normalizeProceduralBrushSettings(brushId: string, settings?: Partial<ProceduralBrushSettings>): ProceduralBrushSettings {
  const id = isProceduralBrushId(brushId) ? brushId : 'procedural:noise'
  const defaults = proceduralBrushDefaults[id]
  const next = { ...defaults, ...settings }
  const scaleRange = id === 'procedural:noise' ? [1, 12] : id === 'procedural:clouds' ? [4, 64] : id === 'procedural:cells' ? [4, 40] : [2, 32]
  const detailRange = id === 'procedural:clouds' ? [1, 5] : id === 'procedural:noise' ? [5, 95] : [0, 100]
  return {
    seed: clamp(integer(next.seed, defaults.seed), 0, 9999),
    scale: clamp(integer(next.scale, defaults.scale), scaleRange[0], scaleRange[1]),
    detail: clamp(integer(next.detail, defaults.detail), detailRange[0], detailRange[1]),
    variation: clamp(integer(next.variation, defaults.variation), 0, 100),
    angle: clamp(integer(next.angle, defaults.angle), 0, 180)
  }
}

const resolvedProceduralBrushSettings = (brushId: ProceduralBrushId, settings?: Partial<ProceduralBrushSettings>): ProceduralBrushSettings => {
  if (!settings) return proceduralBrushDefaults[brushId]
  const cached = normalizedSettingsCache.get(settings)
  if (cached) return cached
  const normalized = normalizeProceduralBrushSettings(brushId, settings)
  normalizedSettingsCache.set(settings, normalized)
  normalizedSettingsCache.set(normalized, normalized)
  return normalized
}

const hashNoise = (x: number, y: number, seed: number): number => {
  let value = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 1442695041)
  value = Math.imul(value ^ (value >>> 13), 1274126177)
  return ((value ^ (value >>> 16)) >>> 0) / 0xffffffff
}

const smooth = (value: number): number => value * value * (3 - 2 * value)
const valueNoise = (x: number, y: number, scale: number, seed: number): number => {
  const cellX = Math.floor(x / scale)
  const cellY = Math.floor(y / scale)
  const tx = smooth((x / scale) - cellX)
  const ty = smooth((y / scale) - cellY)
  const top = hashNoise(cellX, cellY, seed) * (1 - tx) + hashNoise(cellX + 1, cellY, seed) * tx
  const bottom = hashNoise(cellX, cellY + 1, seed) * (1 - tx) + hashNoise(cellX + 1, cellY + 1, seed) * tx
  return top * (1 - ty) + bottom * ty
}

const cellCoverage = (x: number, y: number, settings: ProceduralBrushSettings): number => {
  const cellSize = settings.scale
  const cellX = Math.floor(x / cellSize)
  const cellY = Math.floor(y / cellSize)
  let nearest = Number.POSITIVE_INFINITY
  let second = Number.POSITIVE_INFINITY
  const jitter = 0.05 + settings.variation / 100 * 0.45
  for (let offsetY = -1; offsetY <= 1; offsetY += 1) for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
    const gridX = cellX + offsetX
    const gridY = cellY + offsetY
    const pointX = (gridX + 0.5 + (hashNoise(gridX, gridY, settings.seed) - 0.5) * jitter * 2) * cellSize
    const pointY = (gridY + 0.5 + (hashNoise(gridX, gridY, settings.seed + 19) - 0.5) * jitter * 2) * cellSize
    const distance = Math.hypot(x - pointX, y - pointY)
    if (distance < nearest) { second = nearest; nearest = distance } else if (distance < second) second = distance
  }
  const edgeWidth = 0.35 + settings.detail / 100 * cellSize * 0.35
  return clamp(Math.round((1 - (second - nearest) / edgeWidth) * 255), 0, 255)
}

const proceduralCoverage = (brushId: ProceduralBrushId, x: number, y: number, settings: ProceduralBrushSettings): number => {
  if (brushId === 'procedural:noise') {
    const raw = hashNoise(Math.floor(x / settings.scale), Math.floor(y / settings.scale), settings.seed)
    const density = settings.detail / 100
    const contrast = 0.55 + settings.variation / 100 * 1.3
    return clamp(Math.round(((raw - (1 - density)) * contrast + 0.5) * 255), 0, 255)
  }
  if (brushId === 'procedural:clouds') {
    let value = 0
    let weight = 0
    for (let octave = 0; octave < settings.detail; octave += 1) {
      const octaveWeight = 1 / (2 ** octave)
      value += valueNoise(x, y, Math.max(2, settings.scale / (2 ** octave)), settings.seed + octave * 17) * octaveWeight
      weight += octaveWeight
    }
    const contrast = 0.55 + settings.variation / 100 * 1.5
    return clamp(Math.round(((value / weight - 0.5) * contrast + 0.5) * 255), 0, 255)
  }
  if (brushId === 'procedural:cells') return cellCoverage(x, y, settings)
  const radians = settings.angle * Math.PI / 180
  const along = x * Math.cos(radians) + y * Math.sin(radians)
  const across = -x * Math.sin(radians) + y * Math.cos(radians)
  const bend = (valueNoise(x, y, Math.max(4, settings.scale * 2), settings.seed) - 0.5) * settings.scale * 2 * settings.detail / 100
  const strand = (Math.cos((across + bend) * Math.PI * 2 / settings.scale) + 1) * 0.5
  const noiseAmount = settings.variation / 100 * 0.45
  const grain = valueNoise(along, across, Math.max(2, settings.scale / 2), settings.seed + 29)
  return clamp(Math.round((strand * (1 - noiseAmount) + grain * noiseAmount) * 255), 0, 255)
}

export function proceduralBrushCoverageAt(brushId: string, x: number, y: number, scale = 64, settings?: Partial<ProceduralBrushSettings>): number {
  if (!isProceduralBrushId(brushId)) return 255
  const normalized = resolvedProceduralBrushSettings(brushId, settings)
  const coordinateScale = 64 / Math.max(1, scale)
  return proceduralCoverage(brushId, x * coordinateScale, y * coordinateScale, normalized)
}

export function createProceduralBrush(brushId: ProceduralBrushId, settings?: Partial<ProceduralBrushSettings>): ImageBrush {
  const normalized = resolvedProceduralBrushSettings(brushId, settings)
  const width = 64
  const height = 64
  const coverage = new Uint8Array(width * height)
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) coverage[y * width + x] = proceduralCoverage(brushId, x, y, normalized)
  return { id: brushId, name: tr(proceduralBrushNameKeys[brushId]), width, height, coverage, proceduralSettings: normalized }
}

export function createProceduralBrushes(settingsByBrush: Partial<Record<ProceduralBrushId, Partial<ProceduralBrushSettings>>> = {}): ImageBrush[] {
  return PROCEDURAL_BRUSH_IDS.map((id) => createProceduralBrush(id, settingsByBrush[id]))
}
