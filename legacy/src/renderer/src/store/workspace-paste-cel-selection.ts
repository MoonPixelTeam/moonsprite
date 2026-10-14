import { animationCelKey, ensureAnimationDocument, parseAnimationCelKey, refreshActiveAnimationFrame } from '@/core/animation'
import { createId, isLayerEffectivelyLocked } from '@/core/document-model'
import { readSurfacePackedLocal } from '@/core/runtime-raster'
import { applySelectionTransformLayerState } from '@/core/selection-transform-targets'
import type { SelectionTransformLayerState } from '@/core/tools-selection-transform'
import { cloneSelection } from '@/core/selection'
import type { AnimationCelClipboardSnapshot } from './clipboard-service'
import { animationCelForTarget } from './workspace-animation-cel-target'
import type { DocumentSession } from './workspace-types'
import { markFloatingPreviewChanged } from './workspace-floating-preview'
import { tr } from './workspace-translation'

export function pasteCelSelection(session: DocumentSession, snapshot: AnimationCelClipboardSnapshot): void {
  const document = session.document
  const timeline = ensureAnimationDocument(document)
  const target = parseAnimationCelKey(session.selectedAnimationCellKeys.at(-1) ?? animationCelKey(document.activeLayerId, timeline.activeFrameId))
  if (!target) return
  const row = document.layers.findIndex(layer => layer.id === target.layerId)
  const column = timeline.frames.findIndex(frame => frame.id === target.frameId)
  const items = snapshot.items.map(item => ({ item, layer: document.layers[row + item.layerIndex - snapshot.anchorLayerIndex], index: column + item.frameIndex - snapshot.anchorFrameIndex }))
  if (items.some(({ layer, index }) => !layer || layer.kind || isLayerEffectivelyLocked(document, layer) || index < 0)) return
  const surfaces = items.flatMap(({ item }) => item.cel.surface ? [item.cel.surface] : [])
  if (!surfaces.length) return
  const x = Math.min(...surfaces.map(s => s.offsetX)), y = Math.min(...surfaces.map(s => s.offsetY))
  const width = Math.max(...surfaces.map(s => s.offsetX + s.width)) - x
  const height = Math.max(...surfaces.map(s => s.offsetY + s.height)) - y
  const bounds = { x, y, width, height }
  const extra = Array.from({ length: Math.max(0, Math.max(...items.map(i => i.index)) + 1 - timeline.frames.length) }, () => ({ id: createId('frame'), duration: 100 }))
  timeline.frames.push(...extra)
  ensureAnimationDocument(document)
  const extraIds = new Set(extra.map(frame => frame.id))
  const structureHistory = extra.length ? {
    label: tr('workspace.history.pasteToLayer'), bytes: extra.length * 32,
    undo: () => { timeline.frames = timeline.frames.filter(frame => !extraIds.has(frame.id)); timeline.cels = timeline.cels.filter(cel => !extraIds.has(cel.frameId)); refreshActiveAnimationFrame(document) },
    redo: () => { timeline.frames.push(...extra); ensureAnimationDocument(document); refreshActiveAnimationFrame(document) }
  } : undefined
  const layers: SelectionTransformLayerState[] = items.map(({ item, layer, index }) => {
    const surface = animationCelForTarget(document, layer, item.cel).surface
    const values = new Uint32Array(width * height), mask = new Uint8Array(width * height)
    const offsets: number[] = []
    if (surface) for (let cy = 0; cy < surface.height; cy++) for (let cx = 0; cx < surface.width; cx++) {
      const value = readSurfacePackedLocal(surface, cx, cy)
      const alpha = surface.format === 'rgba' ? value >>> 24 : document.palette.find(entry => entry.id === value)?.color.a ?? 0
      if (!alpha) continue
      const offset = (surface.offsetY + cy - y) * width + surface.offsetX + cx - x
      values[offset] = value; mask[offset] = 1; offsets.push(offset)
    }
    const selectedOffsets = Uint32Array.from(offsets)
    return { layerId: layer.id, frameId: timeline.frames[index].id, previewEdit: null, translationPreview: null,
      source: { selection: { ...bounds, mask }, values, selectedOffsets, opaqueOffsets: selectedOffsets, opaqueIndices: selectedOffsets, opaqueValues: Uint32Array.from(offsets.map(i => values[i])), origin: 'clipboard' } }
  })
  for (const state of layers) state.previewEdit = applySelectionTransformLayerState(document, state, bounds, 0, true)
  const primary = layers.find(state => state.layerId === document.activeLayerId && state.frameId === timeline.activeFrameId) ?? layers[0]
  layers.splice(layers.indexOf(primary), 1)
  layers.unshift(primary)
  session.pendingPaste = { layerId: primary.layerId, layers, beforeSelection: cloneSelection(session.selection), beforeSelectionPivot: session.selectionPivot,
    source: primary.source, target: bounds, transformTarget: bounds, previewEdit: primary.previewEdit, translationPreview: null, copy: true,
    label: tr('workspace.history.pasteToLayer'), structureHistory }
  session.selection = { ...bounds }
  markFloatingPreviewChanged(session, bounds, bounds)
}
