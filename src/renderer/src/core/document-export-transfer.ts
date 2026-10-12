import type { SpriteDocument } from '@shared/types-document'
import type { DocumentExportWorkerRequest } from './document-export-worker-client'

/** Static image jobs only read the active frame. Keep linked cel dependencies,
 * masks and visual assets, but do not snapshot unrelated animation pixels. */
export const documentForExportTransfer = (
  document: SpriteDocument,
  options: Pick<DocumentExportWorkerRequest, 'job' | 'format'>
): SpriteDocument => {
  if (!['document', 'selection', 'slices', 'layers'].includes(options.job) ||
      !['png-auto', 'png-rgba', 'jpeg', 'svg', 'bmp', 'ico'].includes(options.format)) return document
  const timeline = document.animation
  if (!timeline) return { ...document, timelapse: undefined }
  const byId = new Map(timeline.cels.map(cel => [cel.id, cel]))
  const needed = new Set<string>()
  for (const root of timeline.cels) {
    if (root.frameId !== timeline.activeFrameId) continue
    let cel = root
    while (!needed.has(cel.id)) {
      needed.add(cel.id)
      const linked = cel.linkedCelId ? byId.get(cel.linkedCelId) : undefined
      if (!linked || linked.layerId !== root.layerId) break
      cel = linked
    }
  }
  return {
    ...document,
    timelapse: undefined,
    animation: {
      ...timeline,
      cels: timeline.cels.map(cel => needed.has(cel.id) ? cel : { ...cel, surface: undefined })
    }
  }
}
