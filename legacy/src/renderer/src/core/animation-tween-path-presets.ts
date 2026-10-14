import { DEFAULT_ANIMATION_TWEEN, validateAnimationTween, type TweenPathPoint } from './animation-tween'
import { createId } from './document-model'
import { getStorage, writeStoredJson } from './storage'
import { translateCurrent as tr } from './localization'

export const TWEEN_PATH_PRESETS_KEY = 'moonsprite.animation-tween.paths.v1'
export const MAX_TWEEN_PATH_PRESETS = 64
export interface TweenPathPreset { id: string; name: string; path: TweenPathPoint[] }

function validPath(value: unknown): value is TweenPathPoint[] {
  if (!Array.isArray(value) || value.length < 2 || value.length > 2048 || value.some((point) => !point || !Number.isInteger(point.x) || !Number.isInteger(point.y))) return false
  try { validateAnimationTween({ ...DEFAULT_ANIMATION_TWEEN, path: value }); return true }
  catch { return false }
}
const copyPreset = (preset: TweenPathPreset): TweenPathPreset => ({ id: preset.id, name: preset.name, path: preset.path.map(({ x, y }) => ({ x, y })) })

/** Read strictly: a corrupt or future library must never be silently replaced on save. */
export function loadTweenPathPresets(storage?: Storage): TweenPathPreset[] {
  try {
    const target = getStorage(storage)
    if (!target) throw new Error('Storage unavailable')
    const raw = target.getItem(TWEEN_PATH_PRESETS_KEY)
    if (raw === null) return []
    const data: unknown = JSON.parse(raw)
    if (!data || typeof data !== 'object' || !('version' in data) || data.version !== 1 || !('paths' in data)
      || !Array.isArray(data.paths) || data.paths.length > MAX_TWEEN_PATH_PRESETS) throw new Error('Invalid path library')
    const ids = new Set<string>(), names = new Set<string>()
    for (const item of data.paths) {
      if (!item || typeof item.id !== 'string' || !item.id || item.id.length > 100
        || typeof item.name !== 'string' || !item.name.trim() || item.name.length > 80 || item.name !== item.name.trim()
        || !validPath(item.path) || ids.has(item.id) || names.has(item.name.toLowerCase())) throw new Error('Invalid path preset')
      ids.add(item.id); names.add(item.name.toLowerCase())
    }
    return data.paths.map(copyPreset)
  } catch { throw new Error(tr('timeline.tween.pathLibraryReadFailed')) }
}

/** Store only displacement points; each project supplies its own anchor. */
export function saveTweenPathPreset(name: string, path: readonly TweenPathPoint[], storage?: Storage): TweenPathPreset[] {
  const trimmed = name.trim()
  if (!trimmed || trimmed.length > 80) throw new Error(tr('timeline.tween.pathNameInvalid'))
  if (!validPath(path)) throw new Error(tr('timeline.tween.invalid'))
  // Always merge with the latest library, including paths saved from another editor.
  const presets = loadTweenPathPresets(storage)
  if (presets.some((preset) => preset.name.toLowerCase() === trimmed.toLowerCase())) throw new Error(tr('timeline.tween.pathNameExists'))
  if (presets.length >= MAX_TWEEN_PATH_PRESETS) throw new Error(tr('timeline.tween.pathLibraryFull'))
  const preset = copyPreset({ id: createId('tween-path'), name: trimmed, path: [...path] })
  const next = [...presets, preset]
  if (!writeStoredJson(TWEEN_PATH_PRESETS_KEY, { version: 1, paths: next }, storage)) throw new Error(tr('timeline.tween.pathSaveFailed'))
  return next
}
