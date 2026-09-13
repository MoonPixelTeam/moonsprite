import type { RgbaColor } from '@shared/types-color'
import type { SelectionRect } from '@shared/types-selection'
import type { TextCelData, TextCelTransform, TextStyleRun } from '@shared/types-text'

export const DEFAULT_TEXT_FONT_FAMILY = 'Fusion Pixel 10px Prop Zh_hans'
export const DEFAULT_TEXT_FONT_SIZE = 10
export const DEFAULT_TEXT_CONTENT = 'TEXT'
export const DEFAULT_TEXT_BOX_WIDTH = 128
export const DEFAULT_TEXT_BOX_HEIGHT = 64

export const TEXT_FONT_FAMILIES = [
  DEFAULT_TEXT_FONT_FAMILY,
  'Silkscreen',
  'Tiny5',
  'Noto Sans SC'
] as const

const TEXT_FONT_DEFAULT_SIZE_BY_FAMILY: Readonly<Record<string, number>> = {
  [DEFAULT_TEXT_FONT_FAMILY]: 10,
  Silkscreen: 8,
  Tiny5: 8
}

export const textFontDefaultSize = (family: string): number | undefined => TEXT_FONT_DEFAULT_SIZE_BY_FAMILY[family]

const finiteOr = (value: unknown, fallback: number): number => {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

const sameColor = (left: RgbaColor | undefined, right: RgbaColor | undefined): boolean => left === right || Boolean(left && right && left.r === right.r && left.g === right.g && left.b === right.b && left.a === right.a)
const sameStyleRun = (left: TextStyleRun, right: TextStyleRun): boolean => left.fontSize === right.fontSize && left.lineSpacing === right.lineSpacing && left.letterSpacing === right.letterSpacing && sameColor(left.color, right.color)
const hasStyle = (run: TextStyleRun): boolean => run.fontSize !== undefined || run.lineSpacing !== undefined || run.letterSpacing !== undefined || run.color !== undefined

export const normalizeTextStyleRuns = (value: unknown, textLength: number): TextStyleRun[] => {
  if (!Array.isArray(value) || textLength < 1) return []
  const boundaries = new Set<number>([0, textLength])
  const candidates = value.flatMap((item) => {
    if (!item || typeof item !== 'object') return []
    const raw = item as Partial<TextStyleRun>
    const start = Math.max(0, Math.min(textLength, Math.trunc(finiteOr(raw.start, 0))))
    const end = Math.max(start, Math.min(textLength, Math.trunc(finiteOr(raw.end, start))))
    if (end <= start) return []
    const run: TextStyleRun = {
      start,
      end,
      ...(Number.isFinite(raw.fontSize) ? { fontSize: Math.max(1, Math.min(512, Math.round(raw.fontSize!))) } : {}),
      ...(Number.isFinite(raw.lineSpacing) ? { lineSpacing: Math.max(-256, Math.min(512, Math.round(raw.lineSpacing!))) } : {}),
      ...(Number.isFinite(raw.letterSpacing) ? { letterSpacing: Math.max(-64, Math.min(256, Math.round(raw.letterSpacing!))) } : {}),
      ...(raw.color ? { color: {
        r: Math.max(0, Math.min(255, Math.round(finiteOr(raw.color.r, 0)))),
        g: Math.max(0, Math.min(255, Math.round(finiteOr(raw.color.g, 0)))),
        b: Math.max(0, Math.min(255, Math.round(finiteOr(raw.color.b, 0)))),
        a: Math.max(0, Math.min(255, Math.round(finiteOr(raw.color.a, 255))))
      } } : {})
    }
    if (!hasStyle(run)) return []
    boundaries.add(start)
    boundaries.add(end)
    return [run]
  })
  const points = [...boundaries].sort((left, right) => left - right)
  const normalized: TextStyleRun[] = []
  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index]
    const end = points[index + 1]
    let source: TextStyleRun | undefined
    for (let candidateIndex = candidates.length - 1; candidateIndex >= 0; candidateIndex -= 1) {
      const candidate = candidates[candidateIndex]
      if (candidate.start <= start && candidate.end >= end) { source = candidate; break }
    }
    if (!source) continue
    const next = { ...source, start, end, color: source.color ? { ...source.color } : undefined }
    const previous = normalized.at(-1)
    if (previous && previous.end === next.start && sameStyleRun(previous, next)) previous.end = next.end
    else normalized.push(next)
  }
  return normalized
}

export const applyTextStyleRun = (runs: readonly TextStyleRun[], start: number, end: number, patch: Omit<TextStyleRun, 'start' | 'end'>, textLength: number): TextStyleRun[] => {
  const from = Math.max(0, Math.min(textLength, Math.trunc(start)))
  const to = Math.max(from, Math.min(textLength, Math.trunc(end)))
  if (to <= from) return normalizeTextStyleRuns(runs, textLength)
  const normalized = normalizeTextStyleRuns(runs, textLength)
  const boundaries = new Set<number>([0, textLength, from, to])
  normalized.forEach((run) => { boundaries.add(run.start); boundaries.add(run.end) })
  const points = [...boundaries].sort((left, right) => left - right)
  const nextRuns: TextStyleRun[] = []
  for (let index = 0; index < points.length - 1; index += 1) {
    const segmentStart = points[index]
    const segmentEnd = points[index + 1]
    const source = normalized.find((run) => run.start <= segmentStart && run.end >= segmentEnd)
    const selected = segmentStart >= from && segmentEnd <= to
    if (!source && !selected) continue
    const next: TextStyleRun = { ...(source ?? { start: segmentStart, end: segmentEnd }), ...(selected ? patch : {}), start: segmentStart, end: segmentEnd }
    if (next.color) next.color = { ...next.color }
    if (!hasStyle(next)) continue
    const previous = nextRuns.at(-1)
    if (previous && previous.end === next.start && sameStyleRun(previous, next)) previous.end = next.end
    else nextRuns.push(next)
  }
  return nextRuns
}

export const reconcileTextStyleRuns = (runs: readonly TextStyleRun[], previousText: string, nextText: string): TextStyleRun[] => {
  if (previousText === nextText) return normalizeTextStyleRuns(runs, nextText.length)
  let prefix = 0
  while (prefix < previousText.length && prefix < nextText.length && previousText[prefix] === nextText[prefix]) prefix += 1
  let suffix = 0
  while (suffix < previousText.length - prefix && suffix < nextText.length - prefix && previousText[previousText.length - 1 - suffix] === nextText[nextText.length - 1 - suffix]) suffix += 1
  const previousEnd = previousText.length - suffix
  const nextEnd = nextText.length - suffix
  const delta = nextEnd - previousEnd
  const normalized = normalizeTextStyleRuns(runs, previousText.length)
  const adjusted = normalized.flatMap((run) => {
    const pieces: TextStyleRun[] = []
    if (run.start < prefix) pieces.push({ ...run, end: Math.min(run.end, prefix), color: run.color ? { ...run.color } : undefined })
    if (run.end > previousEnd) pieces.push({ ...run, start: Math.max(run.start, previousEnd) + delta, end: run.end + delta, color: run.color ? { ...run.color } : undefined })
    return pieces.filter((run) => run.end > run.start)
  })
  if (nextEnd > prefix) {
    const inheritedIndex = prefix > 0 ? prefix - 1 : Math.min(prefix, Math.max(0, previousText.length - 1))
    const inherited = normalized.find((run) => run.start <= inheritedIndex && run.end > inheritedIndex)
    if (inherited) adjusted.push({ ...inherited, start: prefix, end: nextEnd, color: inherited.color ? { ...inherited.color } : undefined })
  }
  return normalizeTextStyleRuns(adjusted, nextText.length)
}

const normalizeTextTransform = (value: TextCelTransform): TextCelTransform | null => {
  const source = value?.source
  const target = value?.target
  if (!source || !target || !Number.isFinite(source.x) || !Number.isFinite(source.y) || !Number.isFinite(source.width) || !Number.isFinite(source.height)
    || !Number.isFinite(target.x) || !Number.isFinite(target.y) || !Number.isFinite(target.width) || !Number.isFinite(target.height)) return null
  if (source.width < 1 || source.height < 1 || target.width < 1 || target.height < 1) return null
  const shear = value.shear && (value.shear.axis === 'x' || value.shear.axis === 'y') && ['n', 'e', 's', 'w'].includes(value.shear.edge) && Number.isFinite(value.shear.amount)
    ? { axis: value.shear.axis, edge: value.shear.edge, amount: value.shear.amount }
    : undefined
  return {
    source: { ...source },
    target: { ...target },
    angle: finiteOr(value.angle, 0),
    ...(shear ? { shear } : {})
  }
}

export const normalizeTextCelData = (value: Partial<TextCelData> | null | undefined, fallbackColor: RgbaColor = { r: 0, g: 0, b: 0, a: 255 }): TextCelData => {
  const text = typeof value?.text === 'string' ? value.text : ''
  const styleRuns = normalizeTextStyleRuns(value?.styleRuns, text.length)
  const boxWidth = Number.isFinite(value?.boxWidth) ? Math.max(1, Math.min(16384, Math.round(value!.boxWidth!))) : undefined
  const boxHeight = Number.isFinite(value?.boxHeight) ? Math.max(1, Math.min(16384, Math.round(value!.boxHeight!))) : undefined
  const layoutMode = value?.layoutMode === 'box' || (value?.layoutMode !== 'free' && boxWidth !== undefined && boxHeight !== undefined) ? 'box' : 'free'
  return {
    text,
    fontFamily: typeof value?.fontFamily === 'string' && value.fontFamily.trim() ? value.fontFamily.trim().slice(0, 128) : DEFAULT_TEXT_FONT_FAMILY,
    fontSize: Math.max(1, Math.min(512, Math.round(finiteOr(value?.fontSize, DEFAULT_TEXT_FONT_SIZE)))),
    lineSpacing: Math.max(-256, Math.min(512, Math.round(finiteOr(value?.lineSpacing, 0)))),
    letterSpacing: Math.max(-64, Math.min(256, Math.round(finiteOr(value?.letterSpacing, 0)))),
    spacingMode: value?.spacingMode === 'actual' ? 'actual' : 'font',
    antialias: value?.antialias === 'smooth' ? 'smooth' : 'pixel',
    layoutMode,
    textAlign: value?.textAlign === 'center' || value?.textAlign === 'right' ? value.textAlign : 'left',
    color: {
      r: Math.max(0, Math.min(255, Math.round(finiteOr(value?.color?.r, fallbackColor.r)))),
      g: Math.max(0, Math.min(255, Math.round(finiteOr(value?.color?.g, fallbackColor.g)))),
      b: Math.max(0, Math.min(255, Math.round(finiteOr(value?.color?.b, fallbackColor.b)))),
      a: Math.max(0, Math.min(255, Math.round(finiteOr(value?.color?.a, fallbackColor.a))))
    },
    ...(styleRuns.length > 0 ? { styleRuns } : {}),
    ...(Number.isFinite(value?.originX) ? { originX: Math.trunc(value!.originX!) } : {}),
    ...(Number.isFinite(value?.originY) ? { originY: Math.trunc(value!.originY!) } : {}),
    ...(layoutMode === 'box' ? { boxWidth: boxWidth ?? DEFAULT_TEXT_BOX_WIDTH, boxHeight: boxHeight ?? DEFAULT_TEXT_BOX_HEIGHT } : {}),
    ...(Array.isArray(value?.transforms) && value!.transforms!.length > 0 ? { transforms: value!.transforms!.flatMap((transform) => {
      const normalized = normalizeTextTransform(transform)
      return normalized ? [normalized] : []
    }) } : {})
  }
}

// Text boxes are layer content, rather than document selections or slices: they
// deliberately retain negative positions and may extend past the canvas edge.
export const normalizeTextBoxBounds = (value: SelectionRect): SelectionRect => ({
  x: Math.trunc(finiteOr(value.x, 0)),
  y: Math.trunc(finiteOr(value.y, 0)),
  width: Math.max(1, Math.min(16384, Math.round(finiteOr(value.width, 1)))),
  height: Math.max(1, Math.min(16384, Math.round(finiteOr(value.height, 1))))
})

export const cloneTextCelData = (value: TextCelData): TextCelData => ({
  ...value,
  color: { ...value.color },
  styleRuns: value.styleRuns?.map((run) => ({ ...run, color: run.color ? { ...run.color } : undefined })),
  transforms: value.transforms?.map((transform) => ({
    ...transform,
    source: { ...transform.source },
    target: { ...transform.target },
    shear: transform.shear ? { ...transform.shear } : undefined
  }))
})

export const translateTextCelData = (value: TextCelData, deltaX: number, deltaY: number): TextCelData => {
  const x = Math.trunc(deltaX)
  const y = Math.trunc(deltaY)
  if (x === 0 && y === 0) return value
  value.originX = Math.trunc((value.originX ?? 0) + x)
  value.originY = Math.trunc((value.originY ?? 0) + y)
  for (const transform of value.transforms ?? []) {
    transform.source.x += x
    transform.source.y += y
    transform.target.x += x
    transform.target.y += y
  }
  return value
}
