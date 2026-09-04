import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { RgbaColor } from '@shared/types'
import { clampByte, hsvToRgb, rgbToHsv } from '@/core/raster'
import { hslToRgb, rgbToHsl } from '@/core/color-values'
import { ColorValueControl } from './ColorValueControl'
import { useI18n } from '@/components/I18nProvider'

export const colorCss = (color: RgbaColor): string => `rgba(${color.r}, ${color.g}, ${color.b}, ${color.a / 255})`
export { parseRgbaHex as parseColorHex } from '@/core/color-values'
export { rgbaHex } from '@/core/color-values'
interface TriangleVertices { tip: { x: number; y: number }; white: { x: number; y: number }; black: { x: number; y: number } }
export interface TriangleWeights { tip: number; white: number; black: number }
export const MOON_RING_HUE_ROTATION = 150
export const moonRingDragZone = (radius: number, innerRadius: number): 'hue' | 'sv' => radius >= innerRadius ? 'hue' : 'sv'
export type ColorPickerScheme = 'moon-ring' | 'sv-square' | 'hs-square' | 'wheel'
export interface ColorPickerConfig {
  scheme: ColorPickerScheme
  hueSteps: number
  colorSteps: number
  moonField?: 'hsv-square' | 'hsl-triangle'
}

const equilateralTriangleVertices = (radius: number): TriangleVertices => ({
  tip: { x: 0.5 + radius / 2, y: 0.5 },
  white: { x: 0.5 - radius / 4, y: 0.5 - radius * Math.sqrt(3) / 4 },
  black: { x: 0.5 - radius / 4, y: 0.5 + radius * Math.sqrt(3) / 4 }
})

export const triangleWeightsAt = (vertices: TriangleVertices, x: number, y: number): TriangleWeights | null => {
  const { tip, white, black } = vertices
  const denominator = (white.y - black.y) * (tip.x - black.x) + (black.x - white.x) * (tip.y - black.y)
  const tipWeight = ((white.y - black.y) * (x - black.x) + (black.x - white.x) * (y - black.y)) / denominator
  const whiteWeight = ((black.y - tip.y) * (x - black.x) + (tip.x - black.x) * (y - black.y)) / denominator
  const blackWeight = 1 - tipWeight - whiteWeight
  const epsilon = 1e-7
  if (tipWeight < -epsilon || whiteWeight < -epsilon || blackWeight < -epsilon) return null
  const clamped = [tipWeight, whiteWeight, blackWeight].map((value) => value <= epsilon ? 0 : value)
  const total = clamped[0] + clamped[1] + clamped[2]
  return { tip: clamped[0] / total, white: clamped[1] / total, black: clamped[2] / total }
}

export const closestTriangleWeights = (vertices: TriangleVertices, x: number, y: number): TriangleWeights => {
  const inside = triangleWeightsAt(vertices, x, y)
  if (inside) return inside
  const edges = [[vertices.tip, vertices.white], [vertices.white, vertices.black], [vertices.black, vertices.tip]] as const
  let closest = { x: vertices.tip.x, y: vertices.tip.y }
  let closestDistance = Number.POSITIVE_INFINITY
  for (const [start, end] of edges) {
    const deltaX = end.x - start.x
    const deltaY = end.y - start.y
    const lengthSquared = deltaX * deltaX + deltaY * deltaY
    const amount = lengthSquared > 0 ? Math.max(0, Math.min(1, ((x - start.x) * deltaX + (y - start.y) * deltaY) / lengthSquared)) : 0
    const candidate = { x: start.x + deltaX * amount, y: start.y + deltaY * amount }
    const distance = (candidate.x - x) ** 2 + (candidate.y - y) ** 2
    if (distance < closestDistance) { closest = candidate; closestDistance = distance }
  }
  return triangleWeightsAt(vertices, closest.x, closest.y) ?? { tip: 1, white: 0, black: 0 }
}

export const quantizeTriangleWeights = (weights: TriangleWeights, steps: number): TriangleWeights => {
  if (steps <= 0) return weights
  const levels = Math.max(1, steps - 1)
  const scaled = [weights.tip, weights.white, weights.black].map((value) => Math.max(0, value) * levels)
  const integers = scaled.map(Math.floor)
  let remaining = levels - integers.reduce((sum, value) => sum + value, 0)
  const fractions = scaled
    .map((value, index) => ({ index, fraction: value - integers[index] }))
    .sort((left, right) => right.fraction - left.fraction)
  for (let index = 0; index < remaining; index += 1) integers[fractions[index].index] += 1
  return { tip: integers[0] / levels, white: integers[1] / levels, black: integers[2] / levels }
}

export const quantizedCellCenter = (value: number, steps: number): number => {
  const clamped = Math.max(0, Math.min(1, value))
  if (steps <= 0) return clamped
  const index = Math.max(0, Math.min(steps - 1, Math.floor(clamped * steps)))
  return (index + 0.5) / steps
}

export const quantizedWheelVector = (dx: number, dy: number, steps: number, safeRadius = 1): { dx: number; dy: number } => {
  let nextX = dx
  let nextY = dy
  if (steps > 0) {
    nextX = quantizedCellCenter((dx + 1) / 2, steps) * 2 - 1
    nextY = quantizedCellCenter((dy + 1) / 2, steps) * 2 - 1
  }
  const radius = Math.hypot(nextX, nextY)
  if (radius > safeRadius && radius > 0) {
    const scale = safeRadius / radius
    nextX *= scale
    nextY *= scale
  }
  return { dx: nextX, dy: nextY }
}

export const wheelCellIsInside = (dx: number, dy: number, steps: number): boolean => {
  const point = quantizedWheelVector(dx, dy, steps, Number.POSITIVE_INFINITY)
  return Math.hypot(point.dx, point.dy) <= 1
}

export const applyWheelOuterOutline = (pixels: Uint8ClampedArray, mask: Uint8Array, width: number, height: number): void => {
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const index = y * width + x
    if (mask[index] !== 0) continue
    let neighbor = -1
    for (let offsetY = -1; offsetY <= 1 && neighbor < 0; offsetY += 1) {
      const nextY = y + offsetY
      if (nextY < 0 || nextY >= height) continue
      for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
        if (offsetX === 0 && offsetY === 0) continue
        const nextX = x + offsetX
        if (nextX < 0 || nextX >= width) continue
        const candidate = nextY * width + nextX
        if (mask[candidate] !== 0) { neighbor = candidate; break }
      }
    }
    if (neighbor < 0) continue
    const neighborOffset = neighbor * 4
    const luminance = pixels[neighborOffset] * 0.2126 + pixels[neighborOffset + 1] * 0.7152 + pixels[neighborOffset + 2] * 0.0722
    const outline = luminance < 145 ? 224 : 20
    const offset = index * 4
    pixels[offset] = outline
    pixels[offset + 1] = outline
    pixels[offset + 2] = outline
    pixels[offset + 3] = 255
  }
}

export const triangleWeightsToColor = (hue: number, weights: TriangleWeights, alpha = 255): RgbaColor => {
  const lightness = Math.max(0, Math.min(1, weights.white + weights.tip * 0.5))
  const maximumChroma = 1 - Math.abs(2 * lightness - 1)
  const saturation = maximumChroma > 1e-7 ? Math.max(0, Math.min(1, weights.tip / maximumChroma)) : 0
  return hslToRgb(hue, saturation, lightness, alpha)
}

export const triangleHsvAtHue = (hue: number, weights: TriangleWeights): ReturnType<typeof rgbToHsv> => ({
  ...rgbToHsv(triangleWeightsToColor(hue, weights)),
  h: ((hue % 360) + 360) % 360
})

export const triangleWeightsFromColor = (color: RgbaColor): TriangleWeights => {
  const hsl = rgbToHsl(color)
  const tip = hsl.s * (1 - Math.abs(2 * hsl.l - 1))
  const white = Math.max(0, hsl.l - tip * 0.5)
  const black = Math.max(0, 1 - tip - white)
  const total = tip + white + black
  return { tip: tip / total, white: white / total, black: black / total }
}

export function ColorPicker({ color, secondaryColor, onChange, onSecondaryChange, paletteColors, onAddPaletteColor, addToPaletteShortcut, roleControls, compact = false, label, config = { scheme: 'sv-square', hueSteps: 0, colorSteps: 0 } }: { color: RgbaColor; secondaryColor?: RgbaColor; onChange: (color: RgbaColor) => void; onSecondaryChange?: (color: RgbaColor) => void; paletteColors?: readonly RgbaColor[]; onAddPaletteColor?: (color: RgbaColor) => void; addToPaletteShortcut?: string; roleControls?: ReactNode; compact?: boolean; label?: string; config?: ColorPickerConfig }) {
  const { t } = useI18n()
  const effectiveLabel = label ?? t('colorPicker.defaultLabel')
  const [pickerHsv, setPickerHsv] = useState(() => rgbToHsv(color))
  const [secondaryPickerHsv, setSecondaryPickerHsv] = useState(() => rgbToHsv(secondaryColor ?? color))
  const [stripRole, setStripRole] = useState<'primary' | 'secondary'>('primary')
  const pickerRef = useRef<HTMLDivElement>(null)
  const fieldRef = useRef<HTMLCanvasElement>(null)
  const hueRingRef = useRef<HTMLCanvasElement>(null)
  const wheelHitMaskRef = useRef<{ width: number; height: number; data: Uint8Array } | null>(null)
  const lastEmittedColorRef = useRef<RgbaColor | null>(null)
  const lastEmittedSecondaryColorRef = useRef<RgbaColor | null>(null)
  const moonDragZoneRef = useRef<'hue' | 'sv' | null>(null)
  const moonFieldHueRef = useRef<number | null>(null)
  const wheelDragRef = useRef(false)
  const fieldPointerActiveRef = useRef(false)
  const pickFieldRef = useRef<(event: PointerEvent) => void>(() => {})
  const editingSecondaryRef = useRef(false)
  // Keep the edited role and HSV stable for one pointer gesture. Re-deriving
  // HSV from each emitted RGB value can make the hue jump after rounding.
  const activeFieldRoleRef = useRef<'primary' | 'secondary' | null>(null)
  const activeFieldHsvRef = useRef<ReturnType<typeof rgbToHsv> | null>(null)
  const activeStripHsvRef = useRef<ReturnType<typeof rgbToHsv> | null>(null)
  const activeStripColorRef = useRef<RgbaColor | null>(null)
  const stripReleaseFrameRef = useRef<number | null>(null)
  const stripRoleRef = useRef<'primary' | 'secondary'>('primary')
  const pointerInputActiveRef = useRef(false)
  const colorFrameRef = useRef<number | null>(null)
  const pendingColorRef = useRef<{ color: RgbaColor; secondary: boolean; hsv?: ReturnType<typeof rgbToHsv> } | null>(null)
  const pickerHsvRef = useRef(pickerHsv)
  const secondaryPickerHsvRef = useRef(secondaryPickerHsv)
  const onChangeRef = useRef(onChange)
  const onSecondaryChangeRef = useRef(onSecondaryChange)
  onChangeRef.current = onChange
  onSecondaryChangeRef.current = onSecondaryChange
  if (!pointerInputActiveRef.current) pickerHsvRef.current = pickerHsv
  const hsv = pickerHsv
  const displayHsv = activeFieldHsvRef.current ?? (stripRole === 'secondary' && secondaryColor ? secondaryPickerHsv : hsv)
  const { scheme } = config
  const moonTriangle = scheme === 'moon-ring' && config.moonField === 'hsl-triangle'
  const hueSteps = config.hueSteps <= 0 ? 0 : Math.max(6, Math.min(36, Math.round(config.hueSteps / 6) * 6))
  const colorStepPresets = [5, 9, 15]
  const colorSteps = config.colorSteps <= 0
    ? 0
    : colorStepPresets.reduce((nearest, preset) => Math.abs(preset - config.colorSteps) < Math.abs(nearest - config.colorSteps) ? preset : nearest, colorStepPresets[0])
  const wheelCanvasSize = compact ? 160 : 256
  const wheelOutlineInset = 1
  const wheelInsetPosition = wheelOutlineInset / (wheelCanvasSize - 1)
  const wheelContentScale = 1 - wheelInsetPosition * 2
  const fieldHue = scheme === 'sv-square' || scheme === 'moon-ring' ? displayHsv.h : 0
  const fieldValue = scheme === 'hs-square' || scheme === 'wheel' ? displayHsv.v : 1
  const moonSquareRadius = 0.58
  const moonHueInnerRadius = 0.84
  const moonHueRotation = MOON_RING_HUE_ROTATION
  const moonTriangleVertices = equilateralTriangleVertices(moonHueInnerRadius - 0.012)
  const moonSquareStart = (1 - moonSquareRadius) / 2
  const normalizeHue = (value: number): number => ((value % 360) + 360) % 360
  const snapHue = (value: number): number => hueSteps > 0 ? normalizeHue(Math.round(value / (360 / hueSteps)) * (360 / hueSteps)) : normalizeHue(value)
  const actualHue = (displayHue: number): number => snapHue(displayHue)
  const displayHue = normalizeHue(displayHsv.h)
  const valueFromPosition = (value: number): number => Math.max(0, Math.min(1, value))
  const positionFromValue = valueFromPosition
  const hueGradient = hueSteps > 0
    ? (() => {
      const step = 360 / hueSteps
      const boundaries = [0, ...Array.from({ length: hueSteps }, (_, index) => normalizeHue((index + 0.5) * step))]
        .filter((value) => value > 0.0001 && value < 359.9999)
        .sort((left, right) => left - right)
      boundaries.push(360)
      const stops = boundaries.slice(0, -1).map((start, index) => {
        const end = boundaries[index + 1]
        const sample = hsvToRgb({ h: actualHue((start + end) / 2), s: 1, v: 1 })
        const color = `rgb(${sample.r} ${sample.g} ${sample.b})`
        return `${color} ${start / 3.6}%, ${color} ${end / 3.6}%`
      })
      return `linear-gradient(to right, ${stops.join(', ')})`
    })()
    : `linear-gradient(to right, ${Array.from({ length: 13 }, (_, index) => {
      const at = index / 12
      const sample = hsvToRgb({ h: actualHue(at * 360), s: 1, v: 1 })
      return `rgb(${sample.r} ${sample.g} ${sample.b}) ${Math.round(at * 100)}%`
    }).join(', ')})`
  const stepIndex = (value: number): number => Math.max(0, Math.min(colorSteps - 1, Math.floor(Math.max(0, Math.min(1, value)) * colorSteps)))
  const steppedColorPosition = (value: number): number => colorSteps <= 0 ? Math.max(0, Math.min(1, value)) : stepIndex(value) / (colorSteps - 1)
  const steppedCellCenter = (value: number): number => quantizedCellCenter(value, colorSteps)
  const wheelSafeRadius = colorSteps > 0 ? Math.max(0.94, 1 - 10 / wheelCanvasSize) : 1
  const wheelVector = (dx: number, dy: number): { dx: number; dy: number } => quantizedWheelVector(dx, dy, colorSteps, wheelSafeRadius)
  const wheelRasterVector = (dx: number, dy: number): { dx: number; dy: number } => quantizedWheelVector(dx, dy, colorSteps, Number.POSITIVE_INFINITY)
  const buildSteppedGradient = (sampleColor: (position: number) => string): string | null => {
    if (colorSteps <= 0) return null
    const stops: string[] = []
    for (let index = 0; index < colorSteps; index += 1) {
      const start = index / colorSteps
      const end = (index + 1) / colorSteps
      const colorAtStep = sampleColor(index / (colorSteps - 1))
      stops.push(`${colorAtStep} ${start * 100}%`, `${colorAtStep} ${end * 100}%`)
    }
    return `linear-gradient(to right, ${stops.join(', ')})`
  }
  const stripColor = stripRole === 'secondary' ? secondaryColor ?? color : color
  const stripHsv = stripRole === 'secondary' ? secondaryPickerHsv : displayHsv
  const valueStripGradient = buildSteppedGradient((position) => {
    const sample = hsvToRgb({ h: stripHsv.h, s: stripHsv.s, v: valueFromPosition(position) })
    return `rgb(${sample.r} ${sample.g} ${sample.b})`
  })
  const alphaStripGradient = buildSteppedGradient((position) => `rgba(${stripColor.r}, ${stripColor.g}, ${stripColor.b}, ${position})`)
  const steppedSliderColorPosition = (value: number, max: number): number => steppedColorPosition(value / max)

  useEffect(() => {
    const emitted = lastEmittedColorRef.current
    if (emitted && emitted.r === color.r && emitted.g === color.g && emitted.b === color.b && emitted.a === color.a) {
      lastEmittedColorRef.current = null
      return
    }
    lastEmittedColorRef.current = null
    const next = rgbToHsv(color)
    setPickerHsv((current) => {
      const updated = { h: next.s > 0.01 ? next.h : current.h, s: next.s, v: next.v }
      pickerHsvRef.current = updated
      return updated
    })
  }, [color.r, color.g, color.b, color.a])

  useEffect(() => {
    if (!secondaryColor) return
    const emitted = lastEmittedSecondaryColorRef.current
    if (emitted && emitted.r === secondaryColor.r && emitted.g === secondaryColor.g && emitted.b === secondaryColor.b && emitted.a === secondaryColor.a) {
      lastEmittedSecondaryColorRef.current = null
      return
    }
    lastEmittedSecondaryColorRef.current = null
    const next = rgbToHsv(secondaryColor)
    setSecondaryPickerHsv((current) => {
      const updated = { h: next.s > 0.01 ? next.h : current.h, s: next.s, v: next.v }
      secondaryPickerHsvRef.current = updated
      return updated
    })
  }, [secondaryColor?.r, secondaryColor?.g, secondaryColor?.b, secondaryColor?.a])

  useEffect(() => () => {
    if (colorFrameRef.current !== null) window.cancelAnimationFrame(colorFrameRef.current)
    if (stripReleaseFrameRef.current !== null) window.cancelAnimationFrame(stripReleaseFrameRef.current)
  }, [])

  const flushPendingColor = (): void => {
    if (colorFrameRef.current !== null) {
      window.cancelAnimationFrame(colorFrameRef.current)
      colorFrameRef.current = null
    }
    const pending = pendingColorRef.current
    pendingColorRef.current = null
    if (!pending) return
    if (pending.hsv) {
      if (pending.secondary) { secondaryPickerHsvRef.current = pending.hsv; setSecondaryPickerHsv(pending.hsv) }
      else { pickerHsvRef.current = pending.hsv; setPickerHsv(pending.hsv) }
    }
    if (pending.secondary) lastEmittedSecondaryColorRef.current = pending.color
    else lastEmittedColorRef.current = pending.color
    if (pending.secondary && onSecondaryChangeRef.current) onSecondaryChangeRef.current(pending.color)
    else onChangeRef.current(pending.color)
  }

  const emitPointerColor = (nextColor: RgbaColor, secondary: boolean, nextHsv?: ReturnType<typeof rgbToHsv>): void => {
    if (nextHsv) {
      if (secondary) secondaryPickerHsvRef.current = nextHsv
      else pickerHsvRef.current = nextHsv
    }
    pendingColorRef.current = { color: nextColor, secondary, hsv: nextHsv }
    if (colorFrameRef.current !== null) return
    colorFrameRef.current = window.requestAnimationFrame(() => {
      colorFrameRef.current = null
      const pending = pendingColorRef.current
      pendingColorRef.current = null
      if (!pending) return
      if (pending.hsv) {
        if (pending.secondary) { secondaryPickerHsvRef.current = pending.hsv; setSecondaryPickerHsv(pending.hsv) }
        else { pickerHsvRef.current = pending.hsv; setPickerHsv(pending.hsv) }
      }
      if (pending.secondary) lastEmittedSecondaryColorRef.current = pending.color
      else lastEmittedColorRef.current = pending.color
      if (pending.secondary && onSecondaryChangeRef.current) onSecondaryChangeRef.current(pending.color)
      else onChangeRef.current(pending.color)
    })
  }

  useEffect(() => {
    const canvas = fieldRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) return
    const image = context.createImageData(canvas.width, canvas.height)
    const wheelHitMask = scheme === 'wheel' ? new Uint8Array(canvas.width * canvas.height) : null
    for (let y = 0; y < canvas.height; y += 1) for (let x = 0; x < canvas.width; x += 1) {
      const rawRelativeX = x / (canvas.width - 1)
      const rawRelativeY = y / (canvas.height - 1)
      const relativeX = steppedColorPosition(rawRelativeX)
      const relativeY = steppedColorPosition(rawRelativeY)
      const offset = (y * canvas.width + x) * 4
      let sample = displayHsv
      if (scheme === 'hs-square') {
        sample = { h: actualHue(relativeX * 360), s: 1 - relativeY, v: fieldValue }
      } else if (scheme === 'wheel') {
        const wheelRawRelativeX = (x - wheelOutlineInset) / (canvas.width - 1 - wheelOutlineInset * 2)
        const wheelRawRelativeY = (y - wheelOutlineInset) / (canvas.height - 1 - wheelOutlineInset * 2)
        if (wheelRawRelativeX < 0 || wheelRawRelativeX > 1 || wheelRawRelativeY < 0 || wheelRawRelativeY > 1) {
          image.data[offset + 3] = 0
          continue
        }
        const rawDx = (wheelRawRelativeX - 0.5) * 2
        const rawDy = (wheelRawRelativeY - 0.5) * 2
        const wheelPoint = wheelRasterVector(rawDx, rawDy)
        const dx = wheelPoint.dx
        const dy = wheelPoint.dy
        if (Math.hypot(dx, dy) > 1) { image.data[offset + 3] = 0; continue }
        if (wheelHitMask) wheelHitMask[y * canvas.width + x] = 1
        sample = { h: actualHue(Math.atan2(dy, dx) * 180 / Math.PI), s: Math.min(1, Math.sqrt(dx * dx + dy * dy)), v: fieldValue }
      } else if (scheme === 'moon-ring') {
        const rawDx = (rawRelativeX - 0.5) * 2
        const rawDy = (rawRelativeY - 0.5) * 2
        const rawRadius = Math.sqrt(rawDx * rawDx + rawDy * rawDy)
        if (rawRadius >= moonHueInnerRadius && rawRadius <= 1) {
          image.data[offset + 3] = 0
          continue
        } else if (moonTriangle) {
          // Fill through the edge so the CSS polygon owns antialiasing.
          const rawWeights = closestTriangleWeights(moonTriangleVertices, rawRelativeX, rawRelativeY)
          sample = rgbToHsv(triangleWeightsToColor(fieldHue, quantizeTriangleWeights(rawWeights, colorSteps)))
        } else if (Math.abs(rawDx) <= moonSquareRadius && Math.abs(rawDy) <= moonSquareRadius) {
          const localX = Math.max(0, Math.min(1, (rawDx / moonSquareRadius + 1) / 2))
          const localY = Math.max(0, Math.min(1, (rawDy / moonSquareRadius + 1) / 2))
          sample = {
            h: fieldHue,
            s: steppedColorPosition(localX),
            v: valueFromPosition(steppedColorPosition(1 - localY))
          }
        } else {
          image.data[offset + 3] = 0
          continue
        }
      } else {
        sample = { h: fieldHue, s: relativeX, v: valueFromPosition(1 - relativeY) }
      }
      const next = hsvToRgb(sample)
      image.data[offset] = next.r
      image.data[offset + 1] = next.g
      image.data[offset + 2] = next.b
      image.data[offset + 3] = 255
    }
    if (scheme === 'wheel' && colorSteps > 0 && wheelHitMask) applyWheelOuterOutline(image.data, wheelHitMask, canvas.width, canvas.height)
    wheelHitMaskRef.current = scheme === 'wheel' && wheelHitMask ? { width: canvas.width, height: canvas.height, data: wheelHitMask } : null
    context.putImageData(image, 0, 0)
  }, [fieldHue, fieldValue, compact, scheme, moonTriangle, hueSteps, colorSteps])

  useEffect(() => {
    const canvas = hueRingRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context || scheme !== 'moon-ring') return
    const size = 512
    canvas.width = size
    canvas.height = size
    const image = context.createImageData(size, size)
    const center = (size - 1) / 2
    const edgeWidth = 2 / size
    for (let y = 0; y < size; y += 1) for (let x = 0; x < size; x += 1) {
      const dx = (x - center) / center
      const dy = (y - center) / center
      const radius = Math.hypot(dx, dy)
      const outerCoverage = Math.max(0, Math.min(1, (1 - radius) / edgeWidth + 0.5))
      const innerCoverage = Math.max(0, Math.min(1, (radius - moonHueInnerRadius) / edgeWidth + 0.5))
      const alpha = outerCoverage * innerCoverage
      if (alpha <= 0) continue
      const sample = hsvToRgb({ h: actualHue(Math.atan2(dy, dx) * 180 / Math.PI + moonHueRotation), s: 1, v: 1 })
      const offset = (y * size + x) * 4
      image.data[offset] = sample.r
      image.data[offset + 1] = sample.g
      image.data[offset + 2] = sample.b
      image.data[offset + 3] = Math.round(alpha * 255)
    }
    context.putImageData(image, 0, 0)
  }, [scheme, hueSteps])

  const pickField = (event: React.PointerEvent<HTMLElement>, begin = false): void => {
    const bounds = fieldRef.current?.getBoundingClientRect() ?? event.currentTarget.getBoundingClientRect()
    const pointerX = (event.clientX - bounds.left) / bounds.width
    const pointerY = (event.clientY - bounds.top) / bounds.height
    const rawX = Math.max(0, Math.min(1, pointerX))
    const rawY = Math.max(0, Math.min(1, pointerY))
    const relativeX = steppedColorPosition(rawX)
    const relativeY = steppedColorPosition(rawY)
    const activeRole = activeFieldRoleRef.current ?? (editingSecondaryRef.current ? 'secondary' : 'primary')
    const secondaryEditing = activeRole === 'secondary' && Boolean(secondaryColor && onSecondaryChange)
    const currentHsv = activeFieldHsvRef.current ?? (secondaryEditing ? secondaryPickerHsvRef.current : pickerHsvRef.current)
    let nextHsv = { ...currentHsv, s: relativeX, v: valueFromPosition(1 - relativeY) }
    if (scheme === 'hs-square') {
      nextHsv = { h: actualHue(relativeX * 360), s: 1 - relativeY, v: currentHsv.v }
    } else if (scheme === 'wheel') {
      const wheelX = (pointerX - wheelInsetPosition) / wheelContentScale
      const wheelY = (pointerY - wheelInsetPosition) / wheelContentScale
      const rawDx = (wheelX - 0.5) * 2
      const rawDy = (wheelY - 0.5) * 2
      const rawRadius = Math.hypot(rawDx, rawDy)
      const hitMask = wheelHitMaskRef.current
      const canvasX = Math.max(0, Math.min((hitMask?.width ?? 1) - 1, Math.round(wheelX * ((hitMask?.width ?? 1) - 1))))
      const canvasY = Math.max(0, Math.min((hitMask?.height ?? 1) - 1, Math.round(wheelY * ((hitMask?.height ?? 1) - 1))))
      const hitValid = !hitMask || hitMask.data[canvasY * hitMask.width + canvasX] === 1
      if (begin) wheelDragRef.current = rawRadius <= 1 && hitValid
      if (!wheelDragRef.current) return
      if (!hitValid) return
      const scale = rawRadius > 1 ? 1 / rawRadius : 1
      const wheelPoint = wheelVector(rawDx * scale, rawDy * scale)
      const dx = wheelPoint.dx
      const dy = wheelPoint.dy
      nextHsv = { h: actualHue(Math.atan2(dy, dx) * 180 / Math.PI), s: Math.min(1, Math.sqrt(dx * dx + dy * dy)), v: currentHsv.v }
    } else if (scheme === 'moon-ring') {
      const rawDx = (rawX - 0.5) * 2
      const rawDy = (rawY - 0.5) * 2
      const radius = Math.sqrt(rawDx * rawDx + rawDy * rawDy)
      if (begin) moonDragZoneRef.current = moonRingDragZone(radius, moonHueInnerRadius)
      if (moonDragZoneRef.current === 'hue') {
        nextHsv = { ...currentHsv, h: actualHue(Math.atan2(rawDy, rawDx) * 180 / Math.PI + moonHueRotation) }
      } else if (moonTriangle) {
        if (begin || moonFieldHueRef.current === null) {
          moonFieldHueRef.current = currentHsv.h
        }
        const rawWeights = closestTriangleWeights(moonTriangleVertices, rawX, rawY)
        nextHsv = triangleHsvAtHue(moonFieldHueRef.current, quantizeTriangleWeights(rawWeights, colorSteps))
      } else {
        const localX = Math.max(0, Math.min(1, (rawDx / moonSquareRadius + 1) / 2))
        const localY = Math.max(0, Math.min(1, (rawDy / moonSquareRadius + 1) / 2))
        nextHsv = {
          ...currentHsv,
          s: steppedColorPosition(localX),
          v: valueFromPosition(steppedColorPosition(1 - localY))
        }
      }
    }
    const secondary = secondaryEditing
    activeFieldHsvRef.current = nextHsv
    const nextColor = hsvToRgb(nextHsv, secondary ? secondaryColor!.a : color.a)
    emitPointerColor(nextColor, secondary, nextHsv)
  }
  pickFieldRef.current = (event) => pickField(event as unknown as React.PointerEvent<HTMLElement>)
  useEffect(() => {
    const move = (event: PointerEvent): void => {
      if (fieldPointerActiveRef.current) pickFieldRef.current(event)
    }
    const finish = (): void => {
      if (!fieldPointerActiveRef.current) return
      flushPendingColor()
      fieldPointerActiveRef.current = false
      pointerInputActiveRef.current = false
      moonDragZoneRef.current = null
      moonFieldHueRef.current = null
      wheelDragRef.current = false
      editingSecondaryRef.current = false
      activeFieldRoleRef.current = null
      activeFieldHsvRef.current = null
    }
    window.addEventListener('pointermove', move, true)
    window.addEventListener('pointerup', finish, true)
    window.addEventListener('pointercancel', finish, true)
    return () => {
      window.removeEventListener('pointermove', move, true)
      window.removeEventListener('pointerup', finish, true)
      window.removeEventListener('pointercancel', finish, true)
    }
  }, [])
  const pickStrip = (event: React.PointerEvent<HTMLInputElement>, kind: 'value' | 'alpha', begin = false): void => {
    if (begin) {
      const role = event.button === 2 && secondaryColor && onSecondaryChange ? 'secondary' : 'primary'
      stripRoleRef.current = role
      setStripRole(role)
      editingSecondaryRef.current = role === 'secondary'
      if (event.button === 2) event.preventDefault()
    }
    const bounds = event.currentTarget.getBoundingClientRect()
    const thumbRadius = 4.5
    const trackWidth = Math.max(1, bounds.width - thumbRadius * 2)
    const position = Math.max(0, Math.min(1, (event.clientX - bounds.left - thumbRadius) / trackWidth))
    const secondary = stripRoleRef.current === 'secondary' && Boolean(secondaryColor && onSecondaryChange)
    const sourceColor = activeStripColorRef.current ?? (secondary ? secondaryColor! : color)
    let nextColor: RgbaColor
    let nextHsv: ReturnType<typeof rgbToHsv> | undefined
    if (kind === 'value') {
      const sourceHsv = activeStripHsvRef.current ?? (secondary ? secondaryPickerHsvRef.current : pickerHsvRef.current)
      nextHsv = { ...sourceHsv, v: steppedColorPosition(position) }
      nextColor = hsvToRgb(nextHsv, sourceColor.a)
    } else {
      nextColor = { ...sourceColor, a: clampByte(steppedColorPosition(position) * 255) }
    }
    emitPointerColor(nextColor, secondary, nextHsv)
  }
  const updateStripFromNativeInput = (kind: 'value' | 'alpha', rawValue: number, maximum: number): void => {
    const secondary = stripRoleRef.current === 'secondary' && Boolean(secondaryColor && onSecondaryChange)
    const sourceColor = secondary ? secondaryColor! : color
    let nextColor: RgbaColor
    if (kind === 'value') {
      const sourceHsv = secondary ? secondaryPickerHsvRef.current : pickerHsvRef.current
      const nextHsv = { ...sourceHsv, v: steppedSliderColorPosition(rawValue, maximum) }
      nextColor = hsvToRgb(nextHsv, sourceColor.a)
      emitPointerColor(nextColor, secondary, nextHsv)
      return
    } else nextColor = { ...sourceColor, a: clampByte(steppedSliderColorPosition(rawValue, maximum) * 255) }
    emitPointerColor(nextColor, secondary)
  }
  const pickHueStrip = (event: React.PointerEvent<HTMLInputElement>, begin = false): void => {
    if (begin) {
      const role = event.button === 2 && secondaryColor && onSecondaryChange ? 'secondary' : 'primary'
      stripRoleRef.current = role
      setStripRole(role)
      editingSecondaryRef.current = role === 'secondary'
      if (event.button === 2) event.preventDefault()
    }
    const bounds = event.currentTarget.getBoundingClientRect()
    const thumbRadius = 4.5
    const position = Math.max(0, Math.min(1, (event.clientX - bounds.left - thumbRadius) / Math.max(1, bounds.width - thumbRadius * 2)))
    const secondary = stripRoleRef.current === 'secondary' && Boolean(secondaryColor && onSecondaryChange)
    const sourceColor = activeStripColorRef.current ?? (secondary ? secondaryColor! : color)
    const sourceHsv = activeStripHsvRef.current ?? (secondary ? secondaryPickerHsvRef.current : pickerHsvRef.current)
    const nextHsv = { ...sourceHsv, h: actualHue(position * 359) }
    const nextColor = hsvToRgb(nextHsv, sourceColor.a)
    emitPointerColor(nextColor, secondary, nextHsv)
  }
  const updateHueFromNativeInput = (rawValue: number): void => {
    const secondary = stripRoleRef.current === 'secondary' && Boolean(secondaryColor && onSecondaryChange)
    const sourceColor = secondary ? secondaryColor! : color
    const sourceHsv = secondary ? secondaryPickerHsvRef.current : pickerHsvRef.current
    const nextHsv = { ...sourceHsv, h: actualHue(rawValue) }
    emitPointerColor(hsvToRgb(nextHsv, sourceColor.a), secondary, nextHsv)
  }
  const beginStripPointer = (event: React.PointerEvent<HTMLInputElement>, kind: 'hue' | 'value' | 'alpha'): void => {
    if (event.button !== 0 && event.button !== 2) return
    event.preventDefault()
    if (stripReleaseFrameRef.current !== null) {
      window.cancelAnimationFrame(stripReleaseFrameRef.current)
      stripReleaseFrameRef.current = null
    }
    activeStripHsvRef.current = { ...stripHsv }
    activeStripColorRef.current = { ...stripColor }
    event.currentTarget.focus({ preventScroll: true })
    pointerInputActiveRef.current = true
    event.currentTarget.setPointerCapture(event.pointerId)
    if (kind === 'hue') pickHueStrip(event, true)
    else pickStrip(event, kind, true)
  }
  const moveStripPointer = (event: React.PointerEvent<HTMLInputElement>, kind: 'hue' | 'value' | 'alpha'): void => {
    if (!pointerInputActiveRef.current || !event.currentTarget.hasPointerCapture(event.pointerId)) return
    if (kind === 'hue') pickHueStrip(event)
    else pickStrip(event, kind)
  }
  const endStripPointer = (event: React.PointerEvent<HTMLInputElement>): void => {
    flushPendingColor()
    // The custom pointer handlers focus the range input so native capture and
    // keyboard accessibility continue to work during the drag. Release that
    // focus when the gesture ends so application-wide tool shortcuts are not
    // mistaken for range editing keys.
    event.currentTarget.blur()
    if (stripReleaseFrameRef.current !== null) window.cancelAnimationFrame(stripReleaseFrameRef.current)
    stripReleaseFrameRef.current = window.requestAnimationFrame(() => {
      stripReleaseFrameRef.current = null
      pointerInputActiveRef.current = false
      editingSecondaryRef.current = false
      activeStripHsvRef.current = null
      activeStripColorRef.current = null
    })
  }
  const cursorHue = actualHue(displayHue)
  const wheelCursor = quantizedWheelVector(Math.cos(cursorHue * Math.PI / 180) * displayHsv.s, Math.sin(cursorHue * Math.PI / 180) * displayHsv.s, colorSteps, Math.max(0.94, 1 - 10 / wheelCanvasSize))
  const fieldCursor = scheme === 'hs-square'
    ? { left: `${steppedCellCenter(cursorHue / 360) * 100}%`, top: `${steppedCellCenter(1 - displayHsv.s) * 100}%` }
    : scheme === 'wheel'
      ? { left: `${(wheelInsetPosition + (wheelCursor.dx + 1) / 2 * wheelContentScale) * 100}%`, top: `${(wheelInsetPosition + (wheelCursor.dy + 1) / 2 * wheelContentScale) * 100}%` }
      : scheme === 'moon-ring' && moonTriangle
        ? (() => {
            const weights = quantizeTriangleWeights(triangleWeightsFromColor(hsvToRgb(displayHsv, stripColor.a)), colorSteps)
            const { tip, white, black } = moonTriangleVertices
            return { left: `${(weights.tip * tip.x + weights.white * white.x + weights.black * black.x) * 100}%`, top: `${(weights.tip * tip.y + weights.white * white.y + weights.black * black.y) * 100}%` }
          })()
        : scheme === 'moon-ring'
        ? { left: `${(moonSquareStart + steppedCellCenter(displayHsv.s) * moonSquareRadius) * 100}%`, top: `${(moonSquareStart + steppedCellCenter(1 - positionFromValue(displayHsv.v)) * moonSquareRadius) * 100}%` }
        : { left: `${steppedCellCenter(displayHsv.s) * 100}%`, top: `${steppedCellCenter(1 - positionFromValue(displayHsv.v)) * 100}%` }
  const stripDisplayHue = actualHue(normalizeHue(stripHsv.h))
  const hueRingCursorRadius = (moonHueInnerRadius + 1) * 25
  const hueRingCursor = { left: `${50 + Math.cos((cursorHue - moonHueRotation) * Math.PI / 180) * hueRingCursorRadius}%`, top: `${50 + Math.sin((cursorHue - moonHueRotation) * Math.PI / 180) * hueRingCursorRadius}%` }
  const fullValueColor = hsvToRgb({ h: stripHsv.h, s: stripHsv.s, v: 1 })
  const valueSliderValue = Math.round((colorSteps > 0 ? steppedCellCenter(positionFromValue(stripHsv.v)) : positionFromValue(stripHsv.v)) * 1000)
  const alphaSliderValue = Math.round((colorSteps > 0 ? steppedCellCenter(stripColor.a / 255) : stripColor.a / 255) * 255)
  const squareField = scheme === 'moon-ring' || scheme === 'wheel'
  const quantizedField = colorSteps > 0 || (hueSteps > 0 && scheme !== 'moon-ring')
  const triangleClipStyle = moonTriangle ? {
    '--triangle-tip-x': `${moonTriangleVertices.tip.x * 100}%`, '--triangle-tip-y': `${moonTriangleVertices.tip.y * 100}%`,
    '--triangle-white-x': `${moonTriangleVertices.white.x * 100}%`, '--triangle-white-y': `${moonTriangleVertices.white.y * 100}%`,
    '--triangle-black-x': `${moonTriangleVertices.black.x * 100}%`, '--triangle-black-y': `${moonTriangleVertices.black.y * 100}%`
  } as React.CSSProperties : undefined

  return <div ref={pickerRef} className={`moon-color-picker ${compact ? 'compact' : ''}`}>
    <div className="integrated-color-picker">
      <div className={`color-spectrum-stack scheme-${scheme} ${moonTriangle ? 'moon-triangle' : ''} ${scheme === 'wheel' && colorSteps > 0 ? 'quantized-wheel' : ''}`}>
        <div className="color-field-slot"><div className="color-field-wrap"><canvas ref={fieldRef} style={triangleClipStyle} className={`color-field ${quantizedField ? 'quantized' : ''}`} width={wheelCanvasSize} height={compact && !squareField ? Math.round(wheelCanvasSize * 0.75) : wheelCanvasSize} aria-hidden="true" />{scheme === 'moon-ring' && <canvas ref={hueRingRef} className="smooth-hue-ring" aria-hidden="true" />}<span className="color-field-interaction" aria-label={`${effectiveLabel}${t('colorPicker.twoDimensional')}`} onContextMenu={(event) => event.preventDefault()} onPointerDown={(event) => { if (event.button !== 0 && event.button !== 2) return; event.preventDefault(); const secondary = event.button === 2 && Boolean(secondaryColor && onSecondaryChange); const role = secondary ? 'secondary' : 'primary'; stripRoleRef.current = role; pointerInputActiveRef.current = true; fieldPointerActiveRef.current = true; editingSecondaryRef.current = secondary; activeFieldRoleRef.current = role; activeFieldHsvRef.current = { ...displayHsv }; setStripRole(role); wheelDragRef.current = false; event.currentTarget.setPointerCapture(event.pointerId); pickField(event, true) }} onPointerUp={() => { flushPendingColor(); pointerInputActiveRef.current = false; fieldPointerActiveRef.current = false; moonDragZoneRef.current = null; moonFieldHueRef.current = null; wheelDragRef.current = false; editingSecondaryRef.current = false; activeFieldRoleRef.current = null; activeFieldHsvRef.current = null }} onPointerCancel={() => { flushPendingColor(); pointerInputActiveRef.current = false; fieldPointerActiveRef.current = false; moonDragZoneRef.current = null; moonFieldHueRef.current = null; wheelDragRef.current = false; editingSecondaryRef.current = false; activeFieldRoleRef.current = null; activeFieldHsvRef.current = null }} /><span className="color-field-cursor" style={fieldCursor} />{scheme === 'moon-ring' && <span className="color-field-cursor hue-ring-cursor" style={hueRingCursor} />}</div></div>
        {scheme === 'sv-square'
          ? <input className="hue-strip-input" aria-label={`${effectiveLabel}${t('colorPicker.hue')}`} style={{ background: hueGradient }} type="range" min="0" max="359" value={Math.round(stripDisplayHue)} onContextMenu={(event) => event.preventDefault()} onPointerDown={(event) => beginStripPointer(event, 'hue')} onPointerMove={(event) => moveStripPointer(event, 'hue')} onPointerUp={endStripPointer} onPointerCancel={endStripPointer} onInput={(event) => { if (!pointerInputActiveRef.current) updateHueFromNativeInput(Number(event.currentTarget.value)) }} />
          : <input className="value-strip-input" aria-label={`${effectiveLabel}${t('colorPicker.value')}`} style={{ '--value-color': `rgb(${fullValueColor.r} ${fullValueColor.g} ${fullValueColor.b})`, ...(valueStripGradient ? { background: valueStripGradient } : {}) } as React.CSSProperties} type="range" min="0" max="1000" value={valueSliderValue} onContextMenu={(event) => event.preventDefault()} onPointerDown={(event) => beginStripPointer(event, 'value')} onPointerMove={(event) => moveStripPointer(event, 'value')} onPointerUp={endStripPointer} onPointerCancel={endStripPointer} onInput={(event) => { if (!pointerInputActiveRef.current) updateStripFromNativeInput('value', Number(event.currentTarget.value), 1000) }} />}
        <input className="alpha-strip-input" aria-label={`${effectiveLabel}${t('colorPicker.alpha')}`} style={{ '--alpha-color': `rgb(${stripColor.r} ${stripColor.g} ${stripColor.b})`, ...(alphaStripGradient ? { background: `${alphaStripGradient}, repeating-conic-gradient(var(--theme-checker-dark) 0 25%, var(--theme-checker-light) 0 50%) 50% / 20px 20px` } : {}) } as React.CSSProperties} type="range" min="0" max="255" value={alphaSliderValue} onContextMenu={(event) => event.preventDefault()} onPointerDown={(event) => beginStripPointer(event, 'alpha')} onPointerMove={(event) => moveStripPointer(event, 'alpha')} onPointerUp={endStripPointer} onPointerCancel={endStripPointer} onInput={(event) => { if (!pointerInputActiveRef.current) updateStripFromNativeInput('alpha', Number(event.currentTarget.value), 255) }} />
      </div>
       {roleControls ?? <>
         <ColorValueControl color={color} density={compact ? 'compact' : 'regular'} onChange={onChange} label={effectiveLabel} roleLabel={t('colorPicker.foreground')} storageKey="palette-foreground" fillWithColor inPalette={paletteColors?.some((entry) => entry.r === color.r && entry.g === color.g && entry.b === color.b && entry.a === color.a)} onAddToPalette={onAddPaletteColor ? () => onAddPaletteColor(color) : undefined} addToPaletteShortcut={addToPaletteShortcut} />
         {secondaryColor && onSecondaryChange && <ColorValueControl color={secondaryColor} density={compact ? 'compact' : 'regular'} onChange={onSecondaryChange} label={effectiveLabel} roleLabel={t('colorPicker.background')} storageKey="palette-background" className="color-secondary-value-control" fillWithColor inPalette={paletteColors?.some((entry) => entry.r === secondaryColor.r && entry.g === secondaryColor.g && entry.b === secondaryColor.b && entry.a === secondaryColor.a)} onAddToPalette={onAddPaletteColor ? () => onAddPaletteColor(secondaryColor) : undefined} addToPaletteShortcut={addToPaletteShortcut} />}
       </>}
     </div>
  </div>
}
