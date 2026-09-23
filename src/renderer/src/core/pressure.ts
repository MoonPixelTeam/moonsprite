import type { GradientDither } from '@shared/types-brush'

export type BrushDynamicsEffect = 'size' | 'strength' | 'gradient' | 'angle'
export type BrushDynamicsSensor = 'pressure' | 'speed'
export type BrushDynamicsCurve = 'soft' | 'linear' | 'hard'
export type BrushDynamicsDirection = 'direct' | 'inverse'

export interface BrushDynamicsMapping {
  sensor: BrushDynamicsSensor | null
  outputMin: number
  outputMax: number
  inputMin: number
  inputMax: number
  curve: BrushDynamicsCurve
  direction: BrushDynamicsDirection
}

export interface BrushDynamicsSettings {
  version: 5
  effects: Record<BrushDynamicsEffect, BrushDynamicsMapping>
  gradientDither: GradientDither
}

export interface LegacyBrushDynamicsSettingsV2 {
  version: 2
  effects: Partial<Record<'size' | 'strength', Partial<BrushDynamicsMapping>>>
}

export interface LegacyBrushDynamicsSettingsV3 {
  version: 3
  effects: Partial<Record<BrushDynamicsEffect, Partial<BrushDynamicsMapping>>>
}

export interface LegacyBrushDynamicsSettingsV4 {
  version: 4
  effects: Partial<Record<'size' | 'strength' | 'gradient', Partial<BrushDynamicsMapping>>>
  gradientDither?: GradientDither
}

export type PressureCurve = BrushDynamicsCurve

export interface BrushPressureSettings {
  enabled: boolean
  affectsSize: boolean
  affectsOpacity: boolean
  minSizePercent: number
  minOpacityPercent: number
  curve: PressureCurve
}

export const BRUSH_SPEED_INPUT_LIMIT = 4000
export const DEFAULT_PRESSURE_INPUT_RANGE = { inputMin: 0, inputMax: 70, curve: 'hard' as const }
export const DEFAULT_SPEED_INPUT_RANGE = { inputMin: 50, inputMax: 2400, curve: 'linear' as const }

export const DEFAULT_BRUSH_PRESSURE_SETTINGS: BrushPressureSettings = {
  enabled: false,
  affectsSize: true,
  affectsOpacity: false,
  minSizePercent: 20,
  minOpacityPercent: 20,
  curve: 'linear'
}

const defaultMapping = (): BrushDynamicsMapping => ({
  sensor: null,
  outputMin: 20,
  outputMax: 100,
  inputMin: 0,
  inputMax: 100,
  curve: 'linear',
  direction: 'direct'
})

const defaultGradientMapping = (): BrushDynamicsMapping => ({
  ...defaultMapping(),
  outputMin: 0
})

export const DEFAULT_BRUSH_DYNAMICS_SETTINGS: BrushDynamicsSettings = {
  version: 5,
  effects: {
    size: defaultMapping(),
    strength: defaultMapping(),
    gradient: defaultGradientMapping(),
    angle: { ...defaultMapping(), outputMin: -180, outputMax: 180 }
  },
  gradientDither: 'none'
}

const clamp = (value: number, minimum: number, maximum: number): number => Math.max(minimum, Math.min(maximum, value))

const normalizedNumber = (value: number | undefined, fallback: number, minimum: number, maximum: number): number =>
  Number.isFinite(value) ? clamp(value!, minimum, maximum) : fallback

const normalizedCurve = (value: BrushDynamicsCurve | undefined, fallback: BrushDynamicsCurve): BrushDynamicsCurve =>
  value === 'soft' || value === 'linear' || value === 'hard' ? value : fallback

const normalizedDirection = (value: BrushDynamicsDirection | undefined, fallback: BrushDynamicsDirection): BrushDynamicsDirection =>
  value === 'direct' || value === 'inverse' ? value : fallback

const normalizedSensor = (value: BrushDynamicsSensor | null | undefined, fallback: BrushDynamicsSensor | null): BrushDynamicsSensor | null =>
  value === null || value === 'pressure' || value === 'speed' ? value : fallback

const normalizedGradientDither = (value: unknown, fallback: GradientDither): GradientDither =>
  value === 'none' || value === 'checker' || value === 'diagonal' || value === 'diagonal-reverse'
    || value === 'horizontal' || value === 'vertical' || value === 'bayer-2' || value === 'bayer-4' || value === 'bayer-8'
    ? value
    : fallback

const inputLimitForSensor = (sensor: BrushDynamicsSensor | null): number => sensor === 'speed' ? BRUSH_SPEED_INPUT_LIMIT : 100

const inputDefaultsForSensor = (sensor: BrushDynamicsSensor | null): Pick<BrushDynamicsMapping, 'inputMin' | 'inputMax' | 'curve'> =>
  sensor === 'speed'
    ? DEFAULT_SPEED_INPUT_RANGE
    : sensor === 'pressure'
      ? DEFAULT_PRESSURE_INPUT_RANGE
      : { inputMin: 0, inputMax: 100, curve: 'linear' }

export function normalizeBrushDynamicsMapping(
  mapping: Partial<BrushDynamicsMapping> | undefined,
  fallback: BrushDynamicsMapping = DEFAULT_BRUSH_DYNAMICS_SETTINGS.effects.size,
  outputLimit = 100,
  outputMinimum = 0
): BrushDynamicsMapping {
  const sensor = normalizedSensor(mapping?.sensor, fallback.sensor)
  const inputLimit = inputLimitForSensor(sensor)
  const sensorChanged = mapping?.sensor !== undefined && sensor !== fallback.sensor
  const sensorDefaults = inputDefaultsForSensor(sensor)
  const defaultInputMin = sensorChanged ? sensorDefaults.inputMin : fallback.inputMin
  const defaultInputMax = sensorChanged ? sensorDefaults.inputMax : fallback.inputMax
  const defaultCurve = sensorChanged ? sensorDefaults.curve : fallback.curve
  const outputA = normalizedNumber(mapping?.outputMin, fallback.outputMin, outputMinimum, outputLimit)
  const outputB = normalizedNumber(mapping?.outputMax, fallback.outputMax, outputMinimum, outputLimit)
  const inputA = normalizedNumber(mapping?.inputMin, clamp(defaultInputMin, 0, inputLimit), 0, inputLimit)
  const inputB = normalizedNumber(mapping?.inputMax, clamp(defaultInputMax, 0, inputLimit), 0, inputLimit)
  return {
    sensor,
    outputMin: Math.min(outputA, outputB),
    outputMax: Math.max(outputA, outputB),
    inputMin: Math.min(inputA, inputB),
    inputMax: Math.max(inputA, inputB),
    curve: normalizedCurve(mapping?.curve, defaultCurve),
    direction: normalizedDirection(mapping?.direction, fallback.direction)
  }
}

const isFactoryV2Mapping = (mapping: Partial<BrushDynamicsMapping> | undefined, sensor: BrushDynamicsSensor): boolean => {
  if (!mapping || mapping.sensor !== sensor || mapping.outputMin !== 20 || mapping.outputMax !== 100 || mapping.direction !== 'direct') return false
  return sensor === 'pressure'
    ? mapping.inputMin === 0 && mapping.inputMax === 100 && mapping.curve === 'linear'
    : mapping.inputMin === 0 && mapping.inputMax === 1200 && mapping.curve === 'linear'
}

const migrateV2Mapping = (mapping: Partial<BrushDynamicsMapping> | undefined, fallback: BrushDynamicsMapping): BrushDynamicsMapping => {
  if (isFactoryV2Mapping(mapping, 'pressure')) return normalizeBrushDynamicsMapping({ ...mapping, ...DEFAULT_PRESSURE_INPUT_RANGE }, fallback)
  if (isFactoryV2Mapping(mapping, 'speed')) return normalizeBrushDynamicsMapping({ ...mapping, ...DEFAULT_SPEED_INPUT_RANGE }, fallback)
  return normalizeBrushDynamicsMapping(mapping, fallback)
}

export function cloneBrushDynamicsSettings(settings: BrushDynamicsSettings): BrushDynamicsSettings {
  return {
    version: 5,
    effects: {
      size: { ...settings.effects.size },
      strength: { ...settings.effects.strength },
      gradient: { ...settings.effects.gradient },
      angle: { ...settings.effects.angle }
    },
    gradientDither: settings.gradientDither
  }
}

export function normalizeBrushDynamicsSettings(
  settings: Partial<BrushDynamicsSettings> | LegacyBrushDynamicsSettingsV2 | LegacyBrushDynamicsSettingsV3 | LegacyBrushDynamicsSettingsV4 | undefined,
  fallback: BrushDynamicsSettings = DEFAULT_BRUSH_DYNAMICS_SETTINGS
): BrushDynamicsSettings {
  if (settings?.version === 2) {
    return {
      version: 5,
      effects: {
        size: migrateV2Mapping(settings.effects?.size, fallback.effects.size),
        strength: migrateV2Mapping(settings.effects?.strength, fallback.effects.strength),
        gradient: { ...fallback.effects.gradient, sensor: null },
        angle: { ...fallback.effects.angle, sensor: null }
      },
      gradientDither: 'none'
    }
  }
  const legacyV3 = settings?.version === 3
  return {
    version: 5,
    effects: {
      size: normalizeBrushDynamicsMapping(settings?.effects?.size, fallback.effects.size),
      strength: normalizeBrushDynamicsMapping(settings?.effects?.strength, fallback.effects.strength),
      gradient: normalizeBrushDynamicsMapping(settings?.effects?.gradient, fallback.effects.gradient),
      angle: normalizeBrushDynamicsMapping(
        settings?.effects && 'angle' in settings.effects ? settings.effects.angle : undefined,
        fallback.effects.angle,
        180,
        -180
      )
    },
    gradientDither: legacyV3
      ? 'none'
      : normalizedGradientDither((settings as Partial<BrushDynamicsSettings> | undefined)?.gradientDither, fallback.gradientDither)
  }
}

export function patchBrushDynamicsMapping(
  settings: BrushDynamicsSettings,
  effect: BrushDynamicsEffect,
  patch: Partial<BrushDynamicsMapping>
): BrushDynamicsSettings {
  const current = settings.effects[effect]
  const sensorChanged = patch.sensor !== undefined && patch.sensor !== current.sensor
  const sensorDefaults = sensorChanged ? inputDefaultsForSensor(patch.sensor ?? null) : {}
  const next = normalizeBrushDynamicsMapping({
    ...current,
    ...sensorDefaults,
    ...patch
  }, current, effect === 'angle' ? 180 : 100, effect === 'angle' ? -180 : 0)
  return {
    version: 5,
    effects: {
      size: effect === 'size' ? next : { ...settings.effects.size },
      strength: effect === 'strength' ? next : { ...settings.effects.strength },
      gradient: effect === 'gradient' ? next : { ...settings.effects.gradient },
      angle: effect === 'angle' ? next : { ...settings.effects.angle }
    },
    gradientDither: settings.gradientDither
  }
}

export function patchBrushDynamicsGradientDither(
  settings: BrushDynamicsSettings,
  gradientDither: GradientDither
): BrushDynamicsSettings {
  return {
    ...cloneBrushDynamicsSettings(settings),
    gradientDither: normalizedGradientDither(gradientDither, settings.gradientDither)
  }
}

const normalizePercent = (value: number | undefined, fallback: number): number =>
  Number.isFinite(value) ? Math.max(0, Math.min(100, Math.round(value!))) : fallback

export function normalizeBrushPressureSettings(
  settings: Partial<BrushPressureSettings> | undefined,
  fallback: BrushPressureSettings = DEFAULT_BRUSH_PRESSURE_SETTINGS
): BrushPressureSettings {
  return {
    enabled: typeof settings?.enabled === 'boolean' ? settings.enabled : fallback.enabled,
    affectsSize: typeof settings?.affectsSize === 'boolean' ? settings.affectsSize : fallback.affectsSize,
    affectsOpacity: typeof settings?.affectsOpacity === 'boolean' ? settings.affectsOpacity : fallback.affectsOpacity,
    minSizePercent: normalizePercent(settings?.minSizePercent, fallback.minSizePercent),
    minOpacityPercent: normalizePercent(settings?.minOpacityPercent, fallback.minOpacityPercent),
    curve: normalizedCurve(settings?.curve, fallback.curve)
  }
}

export function migrateBrushPressureSettings(settings: Partial<BrushPressureSettings> | undefined): BrushDynamicsSettings {
  const legacy = normalizeBrushPressureSettings(settings)
  const mapping = (enabled: boolean, outputMin: number): BrushDynamicsMapping => ({
    sensor: legacy.enabled && enabled ? 'pressure' : null,
    outputMin,
    outputMax: 100,
    inputMin: 0,
    inputMax: 100,
    curve: legacy.curve,
    direction: 'direct'
  })
  return {
    version: 5,
    effects: {
      size: mapping(legacy.affectsSize, legacy.minSizePercent),
      strength: mapping(legacy.affectsOpacity, legacy.minOpacityPercent),
      gradient: { ...DEFAULT_BRUSH_DYNAMICS_SETTINGS.effects.gradient, sensor: null },
      angle: { ...DEFAULT_BRUSH_DYNAMICS_SETTINGS.effects.angle, sensor: null }
    },
    gradientDither: 'none'
  }
}

export function smoothBrushSizeEnvelope(previous: number, target: number, baseSize: number, rasterDistance: number): number {
  const normalizedPrevious = Math.max(1, Math.round(Number.isFinite(previous) ? previous : 1))
  const normalizedTarget = Math.max(1, Math.round(Number.isFinite(target) ? target : 1))
  const normalizedBaseSize = Math.max(1, Number.isFinite(baseSize) ? baseSize : 1)
  const normalizedDistance = Math.max(1, Number.isFinite(rasterDistance) ? rasterDistance : 1)
  const budget = Math.max(1, Math.floor(Math.max(1, Math.ceil(normalizedBaseSize / 6)) * normalizedDistance))
  if (normalizedTarget > normalizedPrevious) return Math.min(normalizedTarget, normalizedPrevious + budget)
  return Math.max(normalizedTarget, normalizedPrevious - budget)
}

export function brushPressureFromDynamics(settings: BrushDynamicsSettings): BrushPressureSettings {
  const normalized = normalizeBrushDynamicsSettings(settings)
  const size = normalized.effects.size
  const strength = normalized.effects.strength
  const enabled = size.sensor !== null || strength.sensor !== null
  return {
    enabled,
    affectsSize: size.sensor !== null || !enabled,
    affectsOpacity: strength.sensor !== null,
    minSizePercent: Math.round(size.outputMin),
    minOpacityPercent: Math.round(strength.outputMin),
    curve: size.sensor !== null ? size.curve : strength.curve
  }
}

export interface BrushDynamicsInput {
  pointerType?: string
  pressure?: number
  /**
   * Pressure from a pointer event is not always accompanied by a reliable
   * `pointerType`.  The canvas input adapter can set this flag once it has
   * observed a pressure-capable stream (for example a device that reports
   * itself as `mouse` but emits changing pressure values).  When omitted we
   * use the conservative browser-event heuristic in
   * `hasReliableBrushPressure`.
   */
  pressureAvailable?: boolean
  /** The previous finite sample in the same pointer stream, when known. */
  previousPressure?: number
  speed?: number | null
}

/** Browser's compatibility mouse/touch pressure value when no force sensor is available. */
export const POINTER_DEFAULT_PRESSURE = 0.5
export const POINTER_PRESSURE_EPSILON = 0.001

const normalizedPointerType = (pointerType: string | undefined): string | undefined => {
  if (typeof pointerType !== 'string') return undefined
  const normalized = pointerType.trim().toLowerCase()
  return normalized.length > 0 ? normalized : undefined
}

/**
 * Aseprite treats pen and eraser pointers as pressure-capable devices and
 * leaves mouse input at full pressure.  Pointer Events implementations can
 * expose styluses under a vendor-specific type, so keep the common aliases
 * in the same trusted class.  Unknown/mouse/touch streams are only accepted
 * after a non-default pressure value (or a change from the previous sample)
 * proves that a force sensor is actually present.
 */
export function isPressurePointerType(pointerType: string | undefined): boolean {
  const normalized = normalizedPointerType(pointerType)
  if (!normalized) return false
  const compact = normalized.replace(/[\s_-]+/g, '')
  return compact === 'pen'
    || compact === 'eraser'
    || compact === 'stylus'
    || compact === 'pencil'
    || compact === 'applepencil'
    || compact === 'tablet'
    || compact === 'tabletpen'
    || compact === 'wintab'
    || compact === 'wintabpen'
    || compact === 'windowsink'
    || compact === 'windowsinkpen'
}

export function hasReliableBrushPressure(
  pointerType: string | undefined,
  pressure: number | undefined,
  previousPressure?: number,
  pressureAvailable?: boolean
): boolean {
  if (!Number.isFinite(pressure)) return false
  if (pressureAvailable !== undefined) return pressureAvailable
  if (isPressurePointerType(pointerType)) return true

  // Aseprite only routes tablet pen/eraser input through pressure dynamics.
  // Touch contacts may expose a non-default PointerEvent pressure value, but
  // that value is not a brush pressure axis and must not change brush size or
  // opacity unexpectedly.
  if (normalizedPointerType(pointerType) === 'touch') return false

  const current = clamp(pressure!, 0, 1)
  // A zero value is the PointerEvent hover/up sentinel for non-pen devices;
  // it must not turn an ordinary mouse stream into a pressure stream.
  if (current <= 0) return false
  const previous = Number.isFinite(previousPressure) ? clamp(previousPressure!, 0, 1) : undefined
  const changed = previous !== undefined && Math.abs(current - previous) > POINTER_PRESSURE_EPSILON
  // Mouse and touch events commonly report exactly 0.5 while active.  Keep
  // that compatibility value on the non-pressure path unless the stream has
  // demonstrated a real change.
  return changed || Math.abs(current - POINTER_DEFAULT_PRESSURE) > POINTER_PRESSURE_EPSILON
}

export function calibrateBrushPressure(pressure: number | undefined): number | null {
  if (!Number.isFinite(pressure)) return null
  const normalized = clamp((pressure! - 0.02) / 0.98, 0, 1)
  return 100 * Math.pow(normalized, 1.7)
}

const sensorValue = (mapping: BrushDynamicsMapping, input: BrushDynamicsInput): number | null => {
  if (mapping.sensor === null) return null
  if (mapping.sensor === 'pressure') {
    if (!hasReliableBrushPressure(input.pointerType, input.pressure, input.previousPressure, input.pressureAvailable)) return null
    return calibrateBrushPressure(input.pressure)
  }
  return Number.isFinite(input.speed) ? clamp(input.speed!, 0, BRUSH_SPEED_INPUT_LIMIT) : 0
}

const curveValue = (curve: BrushDynamicsCurve, value: number): number => curve === 'soft'
  ? Math.sqrt(value)
  : curve === 'hard'
    ? value * value
    : value

const mappingOutput = (mapping: BrushDynamicsMapping, input: BrushDynamicsInput): number | null => {
  if (mapping.sensor === null) return null
  const value = sensorValue(mapping, input)
  if (value === null) return null
  const range = mapping.inputMax - mapping.inputMin
  let progress = range <= 0 ? (value >= mapping.inputMax ? 1 : 0) : clamp((value - mapping.inputMin) / range, 0, 1)
  if (mapping.direction === 'inverse') progress = 1 - progress
  const curved = curveValue(mapping.curve, progress)
  return mapping.outputMin + (mapping.outputMax - mapping.outputMin) * curved
}

export function resolveBrushDynamics(
  settings: BrushDynamicsSettings,
  input: BrushDynamicsInput,
  baseSize: number
): { size: number; opacityScale: number; gradientAmount: number | null; angle: number } {
  const normalized = normalizeBrushDynamicsSettings(settings)
  const size = Number.isFinite(baseSize) ? Math.max(1, Math.round(baseSize)) : 1
  const sizePercent = mappingOutput(normalized.effects.size, input) ?? 100
  const strengthPercent = mappingOutput(normalized.effects.strength, input) ?? 100
  const gradientPercent = mappingOutput(normalized.effects.gradient, input)
  const angle = mappingOutput(normalized.effects.angle, input) ?? 0
  return {
    size: Math.max(1, Math.round(size * sizePercent / 100)),
    opacityScale: clamp(strengthPercent / 100, 0, 1),
    gradientAmount: gradientPercent === null ? null : clamp(gradientPercent / 100, 0, 1),
    angle: clamp(angle, -180, 180)
  }
}

export function brushOpacityScale(opacityScale: number, brushOpacity: number): number {
  const dynamicsOpacity = Number.isFinite(opacityScale) ? clamp(opacityScale, 0, 1) : 1
  const opacityPercent = Number.isFinite(brushOpacity) ? clamp(brushOpacity, 0, 100) : 100
  return dynamicsOpacity * opacityPercent / 100
}

export function normalizePointerPressure(
  pointerType: string | undefined,
  pressure: number | undefined,
  previousPressure?: number,
  pressureAvailable?: boolean
): number {
  if (!hasReliableBrushPressure(pointerType, pressure, previousPressure, pressureAvailable)) return 1
  return (calibrateBrushPressure(pressure) ?? 100) / 100
}

export function resolveBrushPressure(
  settings: BrushPressureSettings,
  pointerType: string | undefined,
  pressure: number | undefined,
  baseSize: number,
  previousPressure?: number,
  pressureAvailable?: boolean
): { pressure: number; size: number; opacityScale: number } {
  const legacy = normalizeBrushPressureSettings(settings)
  const normalizedPressure = normalizePointerPressure(pointerType, pressure, previousPressure, pressureAvailable)
  const resolved = resolveBrushDynamics(migrateBrushPressureSettings(legacy), { pointerType, pressure, previousPressure, pressureAvailable }, baseSize)
  return {
    pressure: legacy.curve === 'soft'
      ? Math.sqrt(normalizedPressure)
      : legacy.curve === 'hard'
        ? normalizedPressure * normalizedPressure
        : normalizedPressure,
    size: resolved.size,
    opacityScale: resolved.opacityScale
  }
}
