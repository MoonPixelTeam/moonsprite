import type { AnimationCelSurface } from '@shared/types-animation'
import type { ColorMode } from '@shared/types-raster'
import type { PaletteEntry, RgbaColor } from '@shared/types-color'
import type { TextCelData, TextSpacingMode } from '@shared/types-text'
import { applyRelativeLuminance, packColor } from './raster'
import { transformRgbaSelectionSurface } from './tools-selection-transform'
import { DEFAULT_TEXT_FONT_SIZE, normalizeTextCelData } from './text-cel-data'

export { applyTextStyleRun, cloneTextCelData, DEFAULT_TEXT_BOX_HEIGHT, DEFAULT_TEXT_BOX_WIDTH, DEFAULT_TEXT_CONTENT, DEFAULT_TEXT_FONT_FAMILY, DEFAULT_TEXT_FONT_SIZE, normalizeTextBoxBounds, normalizeTextCelData, normalizeTextStyleRuns, reconcileTextStyleRuns, TEXT_FONT_FAMILIES, textFontDefaultSize, translateTextCelData } from './text-cel-data'

const finiteOr = (value: unknown, fallback: number): number => {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

export const textLineAdvance = (data: Pick<TextCelData, 'fontSize' | 'lineSpacing'>): number => Math.max(1, data.fontSize + data.lineSpacing)

export const textLineWidth = (characters: readonly number[], letterSpacing: number): number =>
  characters.reduce((sum, width) => sum + width, 0) + Math.max(0, characters.length - 1) * letterSpacing

export const textActualLineBaselines = (lines: readonly { top: number; bottom: number; lineSpacing: number }[], padding = 0): number[] => {
  let visibleTop = padding
  return lines.map((line, index) => {
    const baseline = visibleTop - line.top
    visibleTop = baseline + line.bottom + 1 + (index < lines.length - 1 ? line.lineSpacing : 0)
    return baseline
  })
}

type GlyphMetrics = Pick<TextMetrics, 'width'> & Partial<Pick<TextMetrics, 'actualBoundingBoxLeft' | 'actualBoundingBoxRight'>>

interface VisibleGlyphBounds {
  left: number
  width: number
}

interface RasterGlyph extends VisibleGlyphBounds {
  top: number
  height: number
  advance: number
  pixels: Uint8ClampedArray
}

interface StyledCharacter {
  character: string
  index: number
  fontSize: number
  lineSpacing: number
  letterSpacing: number
  color: RgbaColor
  glyph: RasterGlyph | null
  advance: number
  x: number
}

interface TextLineLayout {
  characters: StyledCharacter[]
  width: number
  top: number
  bottom: number
  fontHeight: number
  lineSpacing: number
  baseline: number
}

const glyphAdvance = (metrics: GlyphMetrics, spacingMode: TextSpacingMode): number => spacingMode === 'actual'
  ? Math.max(0, finiteOr(metrics.actualBoundingBoxLeft, 0)) + Math.max(0, finiteOr(metrics.actualBoundingBoxRight, metrics.width))
  : metrics.width

export const textGlyphPositions = (metrics: readonly GlyphMetrics[], letterSpacing: number, spacingMode: TextSpacingMode): number[] => {
  const positions: number[] = []
  let cursor = 0
  for (const metric of metrics) {
    positions.push(cursor + (spacingMode === 'actual' ? Math.max(0, finiteOr(metric.actualBoundingBoxLeft, 0)) : 0))
    cursor += glyphAdvance(metric, spacingMode) + letterSpacing
  }
  return positions
}

export const textVisibleGlyphPositions = (bounds: readonly (VisibleGlyphBounds | null)[], advances: readonly number[], letterSpacing: number): number[] => {
  const positions: number[] = []
  let cursor = 0
  bounds.forEach((bound, index) => {
    positions.push(bound ? cursor - bound.left : cursor)
    cursor += (bound?.width ?? Math.max(0, advances[index] ?? 0)) + letterSpacing
  })
  return positions
}

const PIXEL_TEXT_ALPHA_THRESHOLD = 192

export const textPixelAdvance = (advance: number): number => Math.max(1, Math.round(finiteOr(advance, 1)))
export const textPixelCoverage = (coverage: number, threshold = PIXEL_TEXT_ALPHA_THRESHOLD): number => coverage >= threshold ? 255 : 0

const rasterGlyph = (font: string, character: string, alphaThreshold: number): RasterGlyph | null => {
  const sizeMatch = /(^|\s)(\d+(?:\.\d+)?)px(?:\s|$)/.exec(font)
  const fontSize = Math.max(1, Math.ceil(Number(sizeMatch?.[2]) || DEFAULT_TEXT_FONT_SIZE))
  const canvas = new OffscreenCanvas(fontSize * 4 + 16, fontSize * 4 + 16)
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) return null
  context.font = font
  context.fontKerning = 'none'
  context.imageSmoothingEnabled = false
  context.textBaseline = 'alphabetic'
  context.fillStyle = '#fff'
  const metrics = context.measureText(character)
  const originX = Math.ceil(fontSize * 2 + Math.max(0, metrics.actualBoundingBoxLeft || 0))
  const baseline = Math.ceil(fontSize * 2 + Math.max(1, metrics.actualBoundingBoxAscent || fontSize))
  context.fillText(character, originX, baseline)
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data
  let left = canvas.width
  let top = canvas.height
  let right = -1
  let bottom = -1
  for (let y = 0; y < canvas.height; y += 1) for (let x = 0; x < canvas.width; x += 1) {
    if (pixels[(y * canvas.width + x) * 4 + 3] < alphaThreshold) continue
    left = Math.min(left, x)
    top = Math.min(top, y)
    right = Math.max(right, x)
    bottom = Math.max(bottom, y)
  }
  if (right < left || bottom < top) return null
  const width = right - left + 1
  const height = bottom - top + 1
  const alpha = new Uint8ClampedArray(width * height)
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const coverage = pixels[((top + y) * canvas.width + left + x) * 4 + 3]
    alpha[y * width + x] = alphaThreshold > 1 ? textPixelCoverage(coverage, alphaThreshold) : coverage
  }
  return { left: left - originX, top: top - baseline, width, height, advance: metrics.width, pixels: alpha }
}

const styleAt = (data: TextCelData, index: number): Pick<StyledCharacter, 'fontSize' | 'lineSpacing' | 'letterSpacing' | 'color'> => {
  const run = data.styleRuns?.find((candidate) => candidate.start <= index && candidate.end > index)
  return {
    fontSize: run?.fontSize ?? data.fontSize,
    lineSpacing: run?.lineSpacing ?? data.lineSpacing,
    letterSpacing: run?.letterSpacing ?? data.letterSpacing,
    color: run?.color ? { ...run.color } : { ...data.color }
  }
}

const blendGlyph = (target: Uint8ClampedArray, targetWidth: number, targetHeight: number, glyph: RasterGlyph, x: number, y: number, color: RgbaColor, pixelMode: boolean): void => {
  for (let localY = 0; localY < glyph.height; localY += 1) for (let localX = 0; localX < glyph.width; localX += 1) {
    const targetX = x + localX
    const targetY = y + localY
    if (targetX < 0 || targetY < 0 || targetX >= targetWidth || targetY >= targetHeight) continue
    const coverage = glyph.pixels[localY * glyph.width + localX]
    if (coverage === 0) continue
    const sourceAlpha = pixelMode ? color.a : Math.round(coverage * color.a / 255)
    if (sourceAlpha === 0) continue
    const offset = (targetY * targetWidth + targetX) * 4
    const destinationAlpha = target[offset + 3]
    const outputAlpha = sourceAlpha + Math.round(destinationAlpha * (255 - sourceAlpha) / 255)
    if (outputAlpha === 0) continue
    target[offset] = Math.round((color.r * sourceAlpha + target[offset] * destinationAlpha * (255 - sourceAlpha) / 255) / outputAlpha)
    target[offset + 1] = Math.round((color.g * sourceAlpha + target[offset + 1] * destinationAlpha * (255 - sourceAlpha) / 255) / outputAlpha)
    target[offset + 2] = Math.round((color.b * sourceAlpha + target[offset + 2] * destinationAlpha * (255 - sourceAlpha) / 255) / outputAlpha)
    target[offset + 3] = outputAlpha
  }
}

const layoutTextLine = (data: TextCelData, characters: StyledCharacter[]): TextLineLayout => {
  let cursor = 0
  for (const character of characters) {
    character.x = data.spacingMode === 'actual' && character.glyph ? cursor - character.glyph.left : cursor
    cursor += (data.spacingMode === 'actual' && character.glyph ? character.glyph.width : character.advance) + character.letterSpacing
  }
  const visible = characters.flatMap((character) => character.glyph ? [character.glyph] : [])
  const fallbackSize = Math.max(data.fontSize, ...characters.map((character) => character.fontSize))
  const top = visible.length > 0 ? Math.min(...visible.map((glyph) => glyph.top)) : -Math.ceil(fallbackSize * 0.8)
  const bottom = visible.length > 0 ? Math.max(...visible.map((glyph) => glyph.top + glyph.height - 1)) : Math.ceil(fallbackSize * 0.2)
  const width = Math.max(0, ...characters.map((character) => character.glyph ? character.x + character.glyph.left + character.glyph.width : character.x + character.advance))
  return { characters, width, top, bottom, fontHeight: fallbackSize, lineSpacing: Math.max(data.lineSpacing, ...characters.map((character) => character.lineSpacing)), baseline: 0 }
}

const wrapTextLine = (data: TextCelData, characters: StyledCharacter[], maximumWidth: number | null): TextLineLayout[] => {
  if (maximumWidth === null || characters.length === 0) return [layoutTextLine(data, characters)]
  const lines: TextLineLayout[] = []
  let start = 0
  while (start < characters.length) {
    let end = start + 1
    let accepted = end
    while (end <= characters.length) {
      const candidate = layoutTextLine(data, characters.slice(start, end))
      if (candidate.width > maximumWidth && end > start + 1) break
      accepted = end
      if (candidate.width > maximumWidth) break
      end += 1
    }
    lines.push(layoutTextLine(data, characters.slice(start, accepted)))
    start = accepted
  }
  return lines
}

const rasterizeTextBase = (data: TextCelData, x: number, y: number): Extract<AnimationCelSurface, { format: 'rgba' }> => {
  const normalizedText = data.text.replaceAll('\r\n', '\n').replaceAll('\r', '\n')
  const glyphCache = new Map<string, RasterGlyph | null>()
  const pixelMode = data.antialias === 'pixel'
  const alphaThreshold = pixelMode ? PIXEL_TEXT_ALPHA_THRESHOLD : 1
  const lines: TextLineLayout[] = []
  const boxed = data.layoutMode === 'box' && data.boxWidth !== undefined && data.boxHeight !== undefined
  const padding = boxed && data.spacingMode === 'actual' ? 0 : 2
  const maximumLineWidth = boxed ? Math.max(1, data.boxWidth! - padding * 2) : null
  let lineStart = 0
  for (const line of normalizedText.split('\n')) {
    const characters: StyledCharacter[] = []
    let characterIndex = lineStart
    for (const character of Array.from(line)) {
      const style = styleAt(data, characterIndex)
      const font = `${style.fontSize}px "${data.fontFamily.replaceAll('"', '')}"`
      const cacheKey = `${font}\n${character}\n${alphaThreshold}`
      if (!glyphCache.has(cacheKey)) glyphCache.set(cacheKey, rasterGlyph(font, character, alphaThreshold))
      const glyph = glyphCache.get(cacheKey) ?? null
      const measuredAdvance = glyph?.advance ?? style.fontSize * (character === ' ' ? 0.34 : 0.6)
      characters.push({ character, index: characterIndex, ...style, glyph, advance: pixelMode ? textPixelAdvance(measuredAdvance) : measuredAdvance, x: 0 })
      characterIndex += character.length
    }
    lines.push(...wrapTextLine(data, characters, maximumLineWidth))
    lineStart += line.length + 1
  }
  if (data.spacingMode === 'actual') {
    const baselines = textActualLineBaselines(lines, padding)
    lines.forEach((line, index) => { line.baseline = baselines[index] })
  } else {
    let baseline = padding + Math.max(1, Math.ceil(-lines[0].top))
    lines.forEach((line, index) => {
      line.baseline = baseline
      baseline += index < lines.length - 1 ? Math.max(1, line.fontHeight + line.lineSpacing) : 0
    })
  }
  const width = boxed ? data.boxWidth! : Math.max(1, Math.ceil(Math.max(0, ...lines.map((line) => line.width)) + padding * 2))
  const height = boxed ? data.boxHeight! : Math.max(1, Math.ceil(Math.max(...lines.map((line) => line.baseline + line.bottom + 1), padding) + padding))
  const pixels = new Uint8ClampedArray(width * height * 4)
  lines.forEach((line) => {
    const availableWidth = width - padding * 2
    const alignmentOffset = !boxed || data.textAlign === 'left'
      ? 0
      : data.textAlign === 'center'
        ? Math.max(0, Math.floor((availableWidth - line.width) / 2))
        : Math.max(0, availableWidth - line.width)
    line.characters.forEach((character) => {
    if (!character.glyph) return
      blendGlyph(pixels, width, height, character.glyph, Math.round(padding + alignmentOffset + character.x + character.glyph.left), Math.round(line.baseline + character.glyph.top), character.color, data.antialias === 'pixel')
    })
  })
  return { format: 'rgba', width, height, offsetX: Math.trunc(x), offsetY: Math.trunc(y), pixels }
}

export const rasterizeText = (raw: TextCelData, x: number, y: number): { data: TextCelData; rgba: AnimationCelSurface } => {
  const data = normalizeTextCelData(raw)
  let rgba = rasterizeTextBase(data, data.originX ?? x, data.originY ?? y)
  for (const transform of data.transforms ?? []) {
    let minX = rgba.width
    let minY = rgba.height
    let maxX = -1
    let maxY = -1
    for (let localY = 0; localY < rgba.height; localY += 1) for (let localX = 0; localX < rgba.width; localX += 1) {
      if (rgba.pixels[(localY * rgba.width + localX) * 4 + 3] === 0) continue
      minX = Math.min(minX, localX)
      minY = Math.min(minY, localY)
      maxX = Math.max(maxX, localX)
      maxY = Math.max(maxY, localY)
    }
    const visible = maxX >= minX && maxY >= minY
      ? { x: rgba.offsetX + minX, y: rgba.offsetY + minY, width: maxX - minX + 1, height: maxY - minY + 1 }
      : { x: rgba.offsetX, y: rgba.offsetY, width: rgba.width, height: rgba.height }
    const scaleX = transform.target.width / transform.source.width
    const scaleY = transform.target.height / transform.source.height
    const sourceCenter = { x: transform.source.x + transform.source.width / 2, y: transform.source.y + transform.source.height / 2 }
    const targetCenter = { x: transform.target.x + transform.target.width / 2, y: transform.target.y + transform.target.height / 2 }
    const visibleCenter = { x: visible.x + visible.width / 2, y: visible.y + visible.height / 2 }
    const radians = transform.angle * Math.PI / 180
    const offsetX = (visibleCenter.x - sourceCenter.x) * scaleX
    const offsetY = (visibleCenter.y - sourceCenter.y) * scaleY
    const rotatedOffset = {
      x: offsetX * Math.cos(radians) - offsetY * Math.sin(radians),
      y: offsetX * Math.sin(radians) + offsetY * Math.cos(radians)
    }
    const width = Math.max(1, Math.round(visible.width * scaleX))
    const height = Math.max(1, Math.round(visible.height * scaleY))
    const adjustedTarget = {
      ...transform.target,
      x: Math.round(targetCenter.x + rotatedOffset.x - width / 2),
      y: Math.round(targetCenter.y + rotatedOffset.y - height / 2),
      width,
      height
    }
    rgba = transformRgbaSelectionSurface(
      rgba,
      visible,
      adjustedTarget,
      transform.angle,
      transform.shear
    )
  }
  return { data, rgba }
}

export const convertTextSurface = (
  surface: AnimationCelSurface,
  mode: ColorMode,
  palette: PaletteEntry[],
  findOrAdd: (color: RgbaColor) => number
): AnimationCelSurface => {
  if (mode === 'rgba') return surface
  if (mode === 'grayscale') {
    if (surface.format !== 'rgba') return surface
    return { ...surface, pixels: applyRelativeLuminance(surface.pixels.slice()) }
  }
  if (surface.format !== 'rgba') return surface
  const pixels = new Uint32Array(surface.width * surface.height)
  const ids = new Map<number, number>()
  for (let index = 0; index < pixels.length; index += 1) {
    const offset = index * 4
    const color = { r: surface.pixels[offset], g: surface.pixels[offset + 1], b: surface.pixels[offset + 2], a: surface.pixels[offset + 3] }
    if (color.a === 0) continue
    const packed = packColor(color)
    let id = ids.get(packed)
    if (id === undefined) {
      id = palette.find((entry) => packColor(entry.color) === packed)?.id ?? findOrAdd(color)
      ids.set(packed, id)
    }
    pixels[index] = id
  }
  return { format: 'indexed', width: surface.width, height: surface.height, offsetX: surface.offsetX, offsetY: surface.offsetY, pixels }
}
