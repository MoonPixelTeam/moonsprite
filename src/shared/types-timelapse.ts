export type TimelapseQuality = 'low' | 'medium' | 'high'

/** How newly captured timelapse operations are retained. */
export type TimelapseRecordingMode = 'full' | 'smart'

export type TimelapseVideoFormat = 'mp4' | 'webm'

export type TimelapseImageFormat = 'png' | 'jpeg'

export type TimelapseExportFormat = TimelapseVideoFormat | TimelapseImageFormat

export interface TimelapseSnapshot {
  id: string
  capturedAt: number
  elapsedMs: number
  width: number
  height: number
  /** Approximate visual change ratio used only for smart history compaction. */
  changeScore?: number
  data: Uint8Array
}

export interface TimelapseSettings {
  enabled: boolean
  /** Omitted by legacy projects; normalization treats it as false. */
  recordUndoSteps?: boolean
  quality: TimelapseQuality
  fps: number
  speed: number
  /** Omitted by legacy projects; normalization treats it as `smart`. */
  mode?: TimelapseRecordingMode
  snapshots: TimelapseSnapshot[]
}
