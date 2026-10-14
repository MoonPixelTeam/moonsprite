import { convolveLayer, type ConvolutionOptions } from '@/core/convolution-matrix'
import { findLayerMask, getLayerStorageOrigin, isLayerEffectivelyLocked, markLayerContentChanged, setLayerStorageOrigin } from '@/core/document-model'
import { syncActiveAnimationLayer } from '@/core/animation'
import { linkedLayerMembers, shareLinkedRasterContent } from '@/core/linked-layers'
import { registerAdjustmentPreviewController } from '@/core/adjustment-preview-lifecycle'
import type { RasterLayer } from '@shared/types-layer'
import type { WorkspaceCommandContext } from './workspace-command-context'
import { activeSession } from './workspace-access'
import { captureAdjustmentSnapshot, restoreAdjustmentSnapshot } from './workspace-history'
import { invalidateFilterPreview } from './workspace-filter-preview'
import { completeDocumentChange } from './workspace-document-change'
import { tr } from './workspace-translation'

export interface ConvolutionPreviewHandle {
  update(options: ConvolutionOptions | null): Promise<void>
  apply(options: ConvolutionOptions): Promise<void>
  cancel(): void
}

export function createConvolutionPreview({ get, set, recording }: WorkspaceCommandContext): ConvolutionPreviewHandle {
  const session = activeSession(get())
  if (!session) throw new Error(tr('convolution.noTarget'))
  const document = session.document
  const find = (id: string): RasterLayer | undefined => document.layers.find(layer => layer.id === id) ?? findLayerMask(document, id) ?? undefined
  const seen = new Set<string>()
  const captured = captureAdjustmentSnapshot(session)
  const targets = captured.layers.map(item => find(item.layerId)).filter((layer): layer is RasterLayer => {
    if (!layer || layer.kind || isLayerEffectivelyLocked(document, layer)) return false
    const key = layer.linkedContentId ?? layer.id
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
  if (!targets.length) throw new Error(tr('convolution.noTarget'))
  let baseline = { ...captured, layers: captured.layers.filter(item => targets.some(layer => layer.id === item.layerId)) }
  let generation = 0, closed = false, suspended = false, visible = false
  let latest: ConvolutionOptions | null = null
  const notify = (): void => { invalidateFilterPreview(session); set({ sessions: [...get().sessions] }) }
  const sync = (): void => {
    for (const layer of targets) {
      markLayerContentChanged(layer)
      if (layer.linkedContentId) for (const member of linkedLayerMembers(document, layer.linkedContentId)) {
        shareLinkedRasterContent(member, layer)
        markLayerContentChanged(member)
      }
      syncActiveAnimationLayer(document, layer.id)
    }
  }
  const restore = (): void => {
    generation++
    if (!visible) return
    restoreAdjustmentSnapshot(session, baseline)
    sync()
    visible = false
    notify()
  }
  const render = async (options: ConvolutionOptions | null): Promise<boolean> => {
    restore()
    if (closed || suspended || !options || activeSession(get()) !== session) return false
    const ticket = generation
    const cancelled = (): boolean => closed || suspended || ticket !== generation || activeSession(get()) !== session
    const selection = session.selection ? { ...session.selection, mask: session.selection.mask?.slice() } : null
    // Palette edits and pixels remain detached until every target has finished successfully.
    const workingDocument = { ...document, palette: baseline.palette.map(entry => ({ ...entry, color: { ...entry.color } })), paletteOrder: [...(baseline.paletteOrder ?? document.paletteOrder)], nextColorId: baseline.nextColorId }
    const results: RasterLayer[] = []
    for (const item of baseline.layers) {
      const target = find(item.layerId)
      if (!target) continue
      const source = { ...target, ...item, id: target.id } as RasterLayer
      setLayerStorageOrigin(source, { x: item.storageOriginX, y: item.storageOriginY })
      const result = await convolveLayer(workingDocument, source, options, selection, cancelled)
      if (cancelled()) return false
      if (result) results.push(result)
    }
    if (cancelled() || !results.length) return false
    for (const result of results) {
      const target = find(result.id)
      if (!target) continue
      target.width = result.width; target.height = result.height
      target.offsetX = result.offsetX; target.offsetY = result.offsetY
      target.pixels = result.pixels
      setLayerStorageOrigin(target, getLayerStorageOrigin(result))
    }
    document.palette = workingDocument.palette
    document.paletteOrder = workingDocument.paletteOrder
    document.nextColorId = workingDocument.nextColorId
    visible = true
    sync()
    notify()
    return true
  }
  const update = async (options: ConvolutionOptions | null): Promise<void> => { latest = options; await render(options) }
  const unregister = registerAdjustmentPreviewController(document.id, {
    suspend: () => { suspended = true; restore() },
    resume: () => {
      suspended = false
      baseline = captureAdjustmentSnapshot(session, targets.map(layer => layer.id))
      void update(latest).catch(error => set({ message: String(error) }))
    }
  })
  const cancel = (): void => { closed = true; unregister(); restore() }
  return { update, cancel, apply: async options => {
    if (!await render(options)) return
    const before = baseline, after = captureAdjustmentSnapshot(session, targets.map(layer => layer.id))
    session.history.push({
      label: tr('convolution.title'),
      bytes: [...before.layers, ...after.layers].reduce((total, layer) => total + layer.pixels.byteLength, 0) + (before.palette.length + after.palette.length) * 24,
      affectedLayerIds: targets.flatMap(layer => layer.linkedContentId ? linkedLayerMembers(document, layer.linkedContentId).map(member => member.id) : [layer.id]),
      invalidation: { kind: 'full' },
      undo: () => { restoreAdjustmentSnapshot(session, before); sync() },
      redo: () => { restoreAdjustmentSnapshot(session, after); sync() }
    })
    baseline = after
    visible = false
    latest = null
    completeDocumentChange(session, 'content', recording.recordDocumentOperation, { kind: 'full' })
    set({ sessions: [...get().sessions] })
  } }
}
