import { readStoredJson, writeStoredJson } from './storage'
import { MAX_ANIMATION_FRAME_DURATION } from './animation'

export const IMAGE_SEQUENCE_PREFERENCE_KEY = 'moonsprite.image-sequence.v1'
export interface ImageSequenceSettings {
  duration: number
  repeat: boolean
  remember: boolean
  selectedIndices?: number[]
}
export interface ImageSequencePreference { choice: 'animation' | 'separate'; duration: number }
export const sequenceDuration = (value: number): number => Number.isFinite(value) ? Math.max(1, Math.min(MAX_ANIMATION_FRAME_DURATION, Math.trunc(value))) : 100
export function loadImageSequencePreference(): ImageSequencePreference | null {
  const value = readStoredJson<Partial<ImageSequencePreference> | null>(IMAGE_SEQUENCE_PREFERENCE_KEY, null)
  if (!value || (value.choice !== 'animation' && value.choice !== 'separate') || typeof value.duration !== 'number' || !Number.isFinite(value.duration)) return null
  return { choice: value.choice, duration: sequenceDuration(value.duration) }
}
export function saveImageSequencePreference(value: ImageSequencePreference): boolean {
  return writeStoredJson(IMAGE_SEQUENCE_PREFERENCE_KEY, value)
}
