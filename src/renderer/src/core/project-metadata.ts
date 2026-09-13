import type { ProjectDisplaySettings, ProjectStatistics, TimelapseQuality, TimelapseRecordingMode, TimelapseSettings, TimelapseSnapshot } from '@shared/types'
import { DEFAULT_GRID_SETTINGS, normalizeGridSettings } from './grid'

export const DEFAULT_PROJECT_DISPLAY_SETTINGS: ProjectDisplaySettings = {
  showPixelGrid: false,
  showGrid: false,
  grid: { ...DEFAULT_GRID_SETTINGS }
}

export const DEFAULT_PROJECT_STATISTICS: ProjectStatistics = {
  strokeCount: 0,
  operationCount: 0,
  drawingTimeMs: 0
}

export const DEFAULT_TIMELAPSE_SETTINGS: TimelapseSettings = {
  enabled: false,
  recordUndoSteps: false,
  quality: 'medium',
  fps: 12,
  speed: 8,
  mode: 'smart',
  snapshots: []
}

const safeCounter = (value: unknown): number =>
  Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : 0

export const normalizeProjectDisplaySettings = (value: unknown): ProjectDisplaySettings => {
  const candidate = value && typeof value === 'object' ? value as Partial<ProjectDisplaySettings> : {}
  return {
    showPixelGrid: candidate.showPixelGrid === true,
    showGrid: candidate.showGrid === true,
    grid: normalizeGridSettings(candidate.grid)
  }
}

export const normalizeProjectStatistics = (value: unknown): ProjectStatistics => {
  const candidate = value && typeof value === 'object' ? value as Partial<ProjectStatistics> : {}
  return {
    strokeCount: safeCounter(candidate.strokeCount),
    operationCount: safeCounter(candidate.operationCount),
    drawingTimeMs: safeCounter(candidate.drawingTimeMs)
  }
}

const timelapseQuality = (value: unknown): TimelapseQuality =>
  value === 'low' || value === 'high' ? value : 'medium'

const timelapseRecordingMode = (value: unknown): TimelapseRecordingMode =>
  value === 'full' ? 'full' : 'smart'

export const normalizeTimelapseSettings = (
  value: unknown,
  snapshots: TimelapseSnapshot[] = []
): TimelapseSettings => {
  const candidate = value && typeof value === 'object' ? value as Partial<TimelapseSettings> : {}
  return {
    enabled: candidate.enabled === undefined ? DEFAULT_TIMELAPSE_SETTINGS.enabled : candidate.enabled === true,
    recordUndoSteps: candidate.recordUndoSteps === true,
    quality: timelapseQuality(candidate.quality),
    fps: Number.isFinite(candidate.fps) ? Math.max(1, Math.min(60, Math.round(candidate.fps!))) : DEFAULT_TIMELAPSE_SETTINGS.fps,
    speed: Number.isFinite(candidate.speed) ? Math.max(1, Math.min(64, Math.round(candidate.speed!))) : DEFAULT_TIMELAPSE_SETTINGS.speed,
    mode: timelapseRecordingMode(candidate.mode),
    snapshots
  }
}
