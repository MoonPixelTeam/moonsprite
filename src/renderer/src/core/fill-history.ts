import type { RasterLayer } from '@shared/types-layer'
import { getLayerStorageOrigin, layerIndexAtStoragePoint } from './document-model'
import type { PixelEdit } from './history'

/** A later symmetry seed may grow storage after earlier seeds wrote pixels. */
export const mergeFillPixelEdit = (layer: RasterLayer, merged: PixelEdit, edit: PixelEdit | null, oldWidth: number, oldOrigin: { x: number; y: number }, multipleSeeds: boolean): PixelEdit => {
  const origin = getLayerStorageOrigin(layer)
  if (layer.width !== oldWidth || origin.x !== oldOrigin.x || origin.y !== oldOrigin.y) {
    for (const run of merged.runs ?? []) {
      const next = layerIndexAtStoragePoint(layer, run.index % oldWidth + oldOrigin.x, Math.floor(run.index / oldWidth) + oldOrigin.y)
      if (next === null) throw new Error('Fill history lies outside expanded layer')
      run.index = next
    }
  }
  if (!edit) return merged
  if (!multipleSeeds) return edit
  // Keep chronological runs compact; history undoes them in reverse order so
  // overlapping translucent seeds restore the first, not intermediate, color.
  merged.frameId ??= edit.frameId
  const runs = merged.runs ??= []
  for (const run of edit.runs ?? []) runs.push({ ...run })
  for (const [index, before] of edit.before) runs.push({ index, length: 1, before, after: edit.after.get(index) ?? before })
  if (edit.dirtyRect) {
    const a = merged.dirtyRect ?? edit.dirtyRect, b = edit.dirtyRect
    const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y)
    merged.dirtyRect = { x, y, width: Math.max(a.x + a.width, b.x + b.width) - x, height: Math.max(a.y + a.height, b.y + b.height) - y }
  }
  return merged
}
