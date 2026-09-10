import type { BrushDitherSettings, BrushPaintMode, BrushShape, BrushTexture, FillKind, FillMode, GradientDither, GradientStop, GradientType, ImageBrushSettings, LineKind, LiquifyMode, ProceduralBrushId, ProceduralBrushSettings, SelectionKind, SelectionMode, ShapeKind, ShapeRatio, ToolId } from '@shared/types'
import { normalizeProceduralBrushSettings, PROCEDURAL_BRUSH_IDS } from './brushes'
import { DEFAULT_BRUSH_DITHER_SETTINGS, normalizeBrushDitherSettings, normalizeGradientStops } from './gradient-color'
import { readStoredJson, writeStoredJson } from './storage'
import { DEFAULT_SYMMETRY_AXES, type SymmetryAxes } from './symmetry'
import { DEFAULT_GAP_CLOSING_THRESHOLD, normalizeGapClosingThreshold } from './contiguous-region'
import {
  DEFAULT_BRUSH_DYNAMICS_SETTINGS,
  DEFAULT_BRUSH_PRESSURE_SETTINGS,
  brushPressureFromDynamics,
  cloneBrushDynamicsSettings,
  migrateBrushPressureSettings,
  normalizeBrushDynamicsSettings,
  normalizeBrushPressureSettings,
  type BrushDynamicsSettings,
  type LegacyBrushDynamicsSettingsV2,
  type LegacyBrushDynamicsSettingsV3,
  type LegacyBrushDynamicsSettingsV4,
  type BrushPressureSettings
} from './pressure'

export const TOOL_SETTINGS_KEY = 'moonsprite.tool-settings.v1'
export const BRUSH_TOOLS = ['pencil', 'eraser', 'fill', 'line'] as const
export type BrushTool = typeof BRUSH_TOOLS[number]

export interface PersistedBrushProfile {
  brushSize: number
  brushShape: BrushShape
  brushAngle: number
  brushDither: BrushDitherSettings
  brushTexture: BrushTexture
  brushTextureScale: number
  brushPaintMode: BrushPaintMode
  brushImageId: string | null
  brushImageSettings: ImageBrushSettings
  proceduralBrushSettings: Record<ProceduralBrushId, ProceduralBrushSettings>
  proceduralAntialias: boolean
  proceduralAntialiasStrength: number
  brushDynamics: BrushDynamicsSettings
  brushPressure: BrushPressureSettings
}

export interface PersistedToolSettings extends PersistedBrushProfile {
  brushPaintModePreferenceVersion: number
  proceduralAntialiasPreferenceVersion: number
  brushProfiles?: Partial<Record<BrushTool, PersistedBrushProfile>>
  shapeKind: ShapeKind
  lineKind: LineKind
  curveAnchorCount: number
  shapeRatio: ShapeRatio | number | null
  shapeRounded: boolean
  shapeCornerRadius: number
  fillMode: FillMode
  fillKind: FillKind
  fillTolerance: number
  fillGapClosing: boolean
  fillGapThreshold: number
  gradientTolerance: number
  gradientContiguous: boolean
  gradientType: GradientType
  gradientDither: GradientDither
  gradientFreeform: boolean
  gradientStops: GradientStop[]
  moveAutoSelect: boolean
  selectionKind: SelectionKind
  selectionMode: SelectionMode
  selectionRotationAlgorithm: 'fast' | 'rotsprite'
  selectionRounded: boolean
  selectionCornerRadius: number
  wandTolerance: number
  wandContiguous: boolean
  wandGapClosing: boolean
  wandGapThreshold: number
  perfectPixels: boolean
  symmetryAxes: SymmetryAxes
  airbrushParticleRadius: number
  airbrushParticleShape: BrushShape
  airbrushScatterRadius: number
  airbrushDensity: number
  airbrushIntervalMs: number
  liquifyMode: LiquifyMode
  liquifyRadius: number
  liquifyStrength: number
  liquifySmoothing: boolean
  liquifySmoothingStrength: number
  smoothStrength: number
}

const createDefaultProceduralBrushSettings = (): Record<ProceduralBrushId, ProceduralBrushSettings> => Object.fromEntries(
  PROCEDURAL_BRUSH_IDS.map((id) => [id, normalizeProceduralBrushSettings(id)])
) as Record<ProceduralBrushId, ProceduralBrushSettings>

export const defaultToolSettings: PersistedToolSettings = {
  brushSize: 1,
  brushShape: 'round',
  brushAngle: 0,
  brushDither: { ...DEFAULT_BRUSH_DITHER_SETTINGS },
  brushTexture: 'solid',
  brushTextureScale: 1,
  brushPaintMode: 'paint',
  brushPaintModePreferenceVersion: 1,
  brushImageId: null,
  brushImageSettings: { mode: 'dither', threshold: 128, blackPoint: 0, whitePoint: 255, invert: false },
  proceduralBrushSettings: createDefaultProceduralBrushSettings(),
  proceduralAntialias: false,
  proceduralAntialiasPreferenceVersion: 1,
  proceduralAntialiasStrength: 20,
  brushDynamics: cloneBrushDynamicsSettings(DEFAULT_BRUSH_DYNAMICS_SETTINGS),
  brushPressure: { ...DEFAULT_BRUSH_PRESSURE_SETTINGS },
  brushProfiles: undefined,
  shapeKind: 'rectangle',
  lineKind: 'line',
  curveAnchorCount: 2,
  shapeRatio: null,
  shapeRounded: false,
  shapeCornerRadius: 4,
  fillMode: 'contiguous',
  fillKind: 'bucket',
  fillTolerance: 0,
  fillGapClosing: false,
  fillGapThreshold: DEFAULT_GAP_CLOSING_THRESHOLD,
  gradientTolerance: 0,
  gradientContiguous: true,
  gradientType: 'linear',
  gradientDither: 'none',
  gradientFreeform: false,
  gradientStops: [
    { position: 0, color: { r: 41, g: 121, b: 255, a: 255 } },
    { position: 1, color: { r: 241, g: 244, b: 248, a: 255 } }
  ],
  moveAutoSelect: true,
  selectionKind: 'rectangle',
  selectionMode: 'replace',
  selectionRotationAlgorithm: 'fast',
  selectionRounded: false,
  selectionCornerRadius: 4,
  wandTolerance: 0,
  wandContiguous: true,
  wandGapClosing: false,
  wandGapThreshold: DEFAULT_GAP_CLOSING_THRESHOLD,
  perfectPixels: false,
  symmetryAxes: { ...DEFAULT_SYMMETRY_AXES },
  airbrushParticleRadius: 1,
  airbrushParticleShape: 'round',
  airbrushScatterRadius: 12,
  airbrushDensity: 8,
  airbrushIntervalMs: 50,
  liquifyMode: 'push',
  liquifyRadius: 16,
  smoothStrength: 50,
  liquifySmoothing: false,
  liquifySmoothingStrength: 50,
  liquifyStrength: 50
}

export const cloneProceduralSettings = (settings: Record<ProceduralBrushId, ProceduralBrushSettings>): Record<ProceduralBrushId, ProceduralBrushSettings> => Object.fromEntries(
  PROCEDURAL_BRUSH_IDS.map((id) => [id, { ...settings[id] }])
) as Record<ProceduralBrushId, ProceduralBrushSettings>

const normalizeShapeRatio = (value: ShapeRatio | number | null | undefined): ShapeRatio | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return { width: Math.max(0.1, Math.min(100, value)), height: 1 }
  if (!value || typeof value !== 'object' || !Number.isFinite(value.width) || !Number.isFinite(value.height)) return null
  return {
    width: Math.max(0.1, Math.min(100, value.width)),
    height: Math.max(0.1, Math.min(100, value.height))
  }
}

export function normalizePersistedBrushProfile(stored: Partial<PersistedBrushProfile> | undefined, fallback: PersistedBrushProfile): PersistedBrushProfile {
  const proceduralBrushSettings = Object.fromEntries(PROCEDURAL_BRUSH_IDS.map((id) => [
    id,
    normalizeProceduralBrushSettings(id, stored?.proceduralBrushSettings?.[id] ?? fallback.proceduralBrushSettings[id])
  ])) as Record<ProceduralBrushId, ProceduralBrushSettings>
  const storedDynamics = stored?.brushDynamics as BrushDynamicsSettings | LegacyBrushDynamicsSettingsV2 | LegacyBrushDynamicsSettingsV3 | LegacyBrushDynamicsSettingsV4 | undefined
  const brushDynamics = storedDynamics?.version === 2 || storedDynamics?.version === 3 || storedDynamics?.version === 4 || storedDynamics?.version === 5
    ? normalizeBrushDynamicsSettings(storedDynamics, fallback.brushDynamics)
    : stored?.brushPressure
      ? migrateBrushPressureSettings(stored.brushPressure)
      : normalizeBrushDynamicsSettings(fallback.brushDynamics)
  return {
    brushSize: Number.isFinite(stored?.brushSize) ? Math.max(1, Math.min(128, Math.round(stored!.brushSize!))) : fallback.brushSize,
    brushShape: stored?.brushShape === 'square' || stored?.brushShape === 'round' || stored?.brushShape === 'line' ? stored.brushShape : fallback.brushShape,
    brushAngle: Number.isFinite(stored?.brushAngle) ? Math.max(-180, Math.min(180, Math.round(stored!.brushAngle!))) : fallback.brushAngle,
    brushDither: normalizeBrushDitherSettings(stored?.brushDither, fallback.brushDither),
    brushTexture: stored?.brushTexture === 'cracks' || stored?.brushTexture === 'wood' || stored?.brushTexture === 'grain' || stored?.brushTexture === 'solid' ? stored.brushTexture : fallback.brushTexture,
    brushTextureScale: Number.isFinite(stored?.brushTextureScale) ? Math.max(1, Math.min(16, Math.round(stored!.brushTextureScale!))) : fallback.brushTextureScale,
    brushPaintMode: stored?.brushPaintMode === 'paint' || stored?.brushPaintMode === 'pattern-source' || stored?.brushPaintMode === 'pattern-target' ? stored.brushPaintMode : fallback.brushPaintMode,
    brushImageId: typeof stored?.brushImageId === 'string' && stored.brushImageId.length > 0 ? stored.brushImageId : null,
    brushImageSettings: {
      mode: stored?.brushImageSettings?.mode === 'threshold' ? 'threshold' : stored?.brushImageSettings?.mode === 'dither' ? 'dither' : fallback.brushImageSettings.mode,
      threshold: Number.isFinite(stored?.brushImageSettings?.threshold) ? Math.max(0, Math.min(255, Math.round(stored!.brushImageSettings!.threshold))) : fallback.brushImageSettings.threshold,
      blackPoint: Number.isFinite(stored?.brushImageSettings?.blackPoint) ? Math.max(0, Math.min(254, Math.round(stored!.brushImageSettings!.blackPoint))) : fallback.brushImageSettings.blackPoint,
      whitePoint: Number.isFinite(stored?.brushImageSettings?.whitePoint) ? Math.max(1, Math.min(255, Math.round(stored!.brushImageSettings!.whitePoint))) : fallback.brushImageSettings.whitePoint,
      invert: stored?.brushImageSettings?.invert === true
    },
    proceduralBrushSettings,
    proceduralAntialias: stored?.proceduralAntialias === true,
    proceduralAntialiasStrength: Number.isFinite(stored?.proceduralAntialiasStrength) ? Math.max(1, Math.min(100, Math.round(stored!.proceduralAntialiasStrength!))) : fallback.proceduralAntialiasStrength,
    brushDynamics,
    brushPressure: normalizeBrushPressureSettings(stored?.brushPressure, brushPressureFromDynamics(brushDynamics))
  }
}

export function loadToolSettings(storage?: Storage): PersistedToolSettings {
  try {
    const stored = readStoredJson<Partial<PersistedToolSettings> | null>(TOOL_SETTINGS_KEY, null, storage)
    if (!stored) return {
      ...defaultToolSettings,
      brushDither: { ...DEFAULT_BRUSH_DITHER_SETTINGS },
      proceduralBrushSettings: createDefaultProceduralBrushSettings(),
      brushDynamics: cloneBrushDynamicsSettings(DEFAULT_BRUSH_DYNAMICS_SETTINGS),
      brushPressure: { ...DEFAULT_BRUSH_PRESSURE_SETTINGS }
    }
    const legacyProfile = normalizePersistedBrushProfile(stored, defaultToolSettings)
    if (stored.brushPaintModePreferenceVersion !== 1) legacyProfile.brushPaintMode = defaultToolSettings.brushPaintMode
    if (stored.proceduralAntialiasPreferenceVersion !== 1) legacyProfile.proceduralAntialias = defaultToolSettings.proceduralAntialias
    const storedProfiles = stored.brushProfiles
    const brushProfiles = Object.fromEntries(BRUSH_TOOLS.map((tool) => [
      tool,
      normalizePersistedBrushProfile(storedProfiles?.[tool], legacyProfile)
    ])) as Record<BrushTool, PersistedBrushProfile>
    const storedSymmetryAxes = stored.symmetryAxes as (Partial<SymmetryAxes> & { diagonal?: boolean }) | undefined
    return {
      ...legacyProfile,
      brushPaintModePreferenceVersion: 1,
      proceduralAntialiasPreferenceVersion: 1,
      brushProfiles,
      shapeKind: stored.shapeKind === 'ellipse' || stored.shapeKind === 'rectangle' || stored.shapeKind === 'ellipse-outline' || stored.shapeKind === 'rectangle-outline' || stored.shapeKind === 'freeform' || stored.shapeKind === 'polygon' ? stored.shapeKind : defaultToolSettings.shapeKind,
      lineKind: stored.lineKind === 'curve' ? 'curve' : 'line',
      curveAnchorCount: Number.isFinite(stored.curveAnchorCount) ? Math.max(1, Math.min(8, Math.round(stored.curveAnchorCount!))) : defaultToolSettings.curveAnchorCount,
      shapeRatio: normalizeShapeRatio(stored.shapeRatio),
      shapeRounded: typeof stored.shapeRounded === 'boolean' ? stored.shapeRounded : defaultToolSettings.shapeRounded,
      shapeCornerRadius: Number.isFinite(stored.shapeCornerRadius) ? Math.max(0, Math.min(256, Math.round(stored.shapeCornerRadius!))) : defaultToolSettings.shapeCornerRadius,
      fillMode: stored.fillMode === 'global' || stored.fillMode === 'contiguous' ? stored.fillMode : defaultToolSettings.fillMode,
      fillKind: stored.fillKind === 'gradient' || stored.fillKind === 'bucket' ? stored.fillKind : defaultToolSettings.fillKind,
      fillTolerance: Number.isFinite(stored.fillTolerance) ? Math.max(0, Math.min(255, Math.round(stored.fillTolerance!))) : defaultToolSettings.fillTolerance,
      fillGapClosing: typeof stored.fillGapClosing === 'boolean' ? stored.fillGapClosing : defaultToolSettings.fillGapClosing,
      fillGapThreshold: Number.isFinite(stored.fillGapThreshold) ? normalizeGapClosingThreshold(stored.fillGapThreshold!) : defaultToolSettings.fillGapThreshold,
      gradientTolerance: Number.isFinite(stored.gradientTolerance) ? Math.max(0, Math.min(255, Math.round(stored.gradientTolerance!))) : defaultToolSettings.gradientTolerance,
      gradientContiguous: typeof stored.gradientContiguous === 'boolean' ? stored.gradientContiguous : defaultToolSettings.gradientContiguous,
      gradientType: stored.gradientType === 'radial' ? 'radial' : 'linear',
      gradientDither: stored.gradientDither === 'checker' || stored.gradientDither === 'diagonal' || stored.gradientDither === 'diagonal-reverse' || stored.gradientDither === 'horizontal' || stored.gradientDither === 'vertical' || stored.gradientDither === 'bayer-2' || stored.gradientDither === 'bayer-4' || stored.gradientDither === 'bayer-8' || stored.gradientDither === 'none' ? stored.gradientDither : defaultToolSettings.gradientDither,
      gradientFreeform: typeof stored.gradientFreeform === 'boolean' ? stored.gradientFreeform : defaultToolSettings.gradientFreeform,
      gradientStops: normalizeGradientStops(stored.gradientStops, defaultToolSettings.gradientStops[0].color, defaultToolSettings.gradientStops.at(-1)!.color),
      moveAutoSelect: typeof stored.moveAutoSelect === 'boolean' ? stored.moveAutoSelect : defaultToolSettings.moveAutoSelect,
      selectionKind: stored.selectionKind === 'magic' || stored.selectionKind === 'lasso' || stored.selectionKind === 'polygon-lasso' || stored.selectionKind === 'ellipse' || stored.selectionKind === 'rectangle' ? stored.selectionKind : defaultToolSettings.selectionKind,
      selectionMode: stored.selectionMode === 'add' || stored.selectionMode === 'subtract' || stored.selectionMode === 'intersect' || stored.selectionMode === 'replace' ? stored.selectionMode : defaultToolSettings.selectionMode,
      selectionRotationAlgorithm: stored.selectionRotationAlgorithm === 'rotsprite' ? 'rotsprite' : 'fast',
      selectionRounded: typeof stored.selectionRounded === 'boolean' ? stored.selectionRounded : defaultToolSettings.selectionRounded,
      selectionCornerRadius: Number.isFinite(stored.selectionCornerRadius) ? Math.max(0, Math.min(256, Math.round(stored.selectionCornerRadius!))) : defaultToolSettings.selectionCornerRadius,
      wandTolerance: Number.isFinite(stored.wandTolerance) ? Math.max(0, Math.min(255, Math.round(stored.wandTolerance!))) : defaultToolSettings.wandTolerance,
      wandContiguous: typeof stored.wandContiguous === 'boolean' ? stored.wandContiguous : defaultToolSettings.wandContiguous,
      wandGapClosing: typeof stored.wandGapClosing === 'boolean' ? stored.wandGapClosing : defaultToolSettings.wandGapClosing,
      wandGapThreshold: Number.isFinite(stored.wandGapThreshold) ? normalizeGapClosingThreshold(stored.wandGapThreshold!) : defaultToolSettings.wandGapThreshold,
      perfectPixels: typeof stored.perfectPixels === 'boolean' ? stored.perfectPixels : defaultToolSettings.perfectPixels,
      airbrushParticleRadius: Number.isFinite(stored.airbrushParticleRadius) ? Math.max(1, Math.min(16, Math.round(stored.airbrushParticleRadius!))) : defaultToolSettings.airbrushParticleRadius,
      airbrushParticleShape: stored.airbrushParticleShape === 'square' || stored.airbrushParticleShape === 'line' || stored.airbrushParticleShape === 'round' ? stored.airbrushParticleShape : defaultToolSettings.airbrushParticleShape,
      airbrushScatterRadius: Number.isFinite(stored.airbrushScatterRadius) ? Math.max(1, Math.min(64, Math.round(stored.airbrushScatterRadius!))) : defaultToolSettings.airbrushScatterRadius,
      airbrushDensity: Number.isFinite(stored.airbrushDensity) ? Math.max(1, Math.min(128, Math.round(stored.airbrushDensity!))) : defaultToolSettings.airbrushDensity,
      airbrushIntervalMs: Number.isFinite(stored.airbrushIntervalMs) ? Math.max(16, Math.min(1000, Math.round(stored.airbrushIntervalMs!))) : defaultToolSettings.airbrushIntervalMs,
      liquifyMode: stored.liquifyMode === 'inflate' || stored.liquifyMode === 'deflate' || stored.liquifyMode === 'twist-clockwise' || stored.liquifyMode === 'twist-counter-clockwise' || stored.liquifyMode === 'push' ? stored.liquifyMode : defaultToolSettings.liquifyMode,
      liquifyRadius: Number.isFinite(stored.liquifyRadius) ? Math.max(1, Math.min(128, Math.round(stored.liquifyRadius!))) : defaultToolSettings.liquifyRadius,
      liquifyStrength: Number.isFinite(stored.liquifyStrength) ? Math.max(1, Math.min(100, Math.round(stored.liquifyStrength!))) : defaultToolSettings.liquifyStrength,
      liquifySmoothing: stored.liquifySmoothing === true,
      liquifySmoothingStrength: Number.isFinite(stored.liquifySmoothingStrength) ? Math.max(0, Math.min(100, Math.round(stored.liquifySmoothingStrength!))) : defaultToolSettings.liquifySmoothingStrength,
      smoothStrength: Number.isFinite(stored.smoothStrength) ? Math.max(0, Math.min(100, Math.round(stored.smoothStrength!))) : defaultToolSettings.smoothStrength,
      symmetryAxes: {
        horizontal: storedSymmetryAxes?.horizontal === true,
        vertical: storedSymmetryAxes?.vertical === true,
        diagonalUp: storedSymmetryAxes?.diagonalUp === true,
        diagonalDown: storedSymmetryAxes?.diagonalDown === true || storedSymmetryAxes?.diagonal === true,
        rotational: storedSymmetryAxes?.rotational === true
      }
    }
  } catch {
    return {
      ...defaultToolSettings,
      brushDither: { ...DEFAULT_BRUSH_DITHER_SETTINGS },
      proceduralBrushSettings: createDefaultProceduralBrushSettings(),
      brushDynamics: cloneBrushDynamicsSettings(DEFAULT_BRUSH_DYNAMICS_SETTINGS),
      brushPressure: { ...DEFAULT_BRUSH_PRESSURE_SETTINGS }
    }
  }
}

export function saveToolSettings(snapshot: PersistedToolSettings, storage?: Storage): void {
  writeStoredJson(TOOL_SETTINGS_KEY, snapshot, storage)
}
