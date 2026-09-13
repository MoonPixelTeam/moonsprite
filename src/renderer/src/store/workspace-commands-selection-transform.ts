import type { AnimationCelSurface } from '@shared/types-animation'
import type { SelectionRect } from '@shared/types-selection'
import type { TextCelData } from '@shared/types-text'
import { commitPixelEdit } from '@/core/history'
import { isLayerEffectivelyLocked, isLayerEffectivelyVisible, layerContentBounds, paletteColorIdForCanvas } from '@/core/document-model'
import { cloneAnimationCelSurface, ensureAnimationDocument, refreshActiveAnimationFrame, resolveAnimationCel } from '@/core/animation'
import { isCanvasToolGestureLocked } from '@/core/canvas-tool-gesture-lock'
import {
  transformSelectionCopy
} from '@/core/tools-selection-transform-apply'
import { clampSelection } from '@/core/tools-pixel-edit'
import { selectionQuadFromRect } from '@/core/selection'
import { cloneTextCelData, convertTextSurface, normalizeTextBoxBounds } from '@/core/text-raster'
import { freeTileInstanceBounds } from '@/core/free-tile'
import { activeFreeTileCelTarget } from '@/core/free-tile-document'
import {
  activePaintLayer,
  cloneSelectionMask,
  isBrushTool,
  rememberBrushProfile,
  selectedTransformLayersForSession,
  touch
} from './workspace-session'
import type { WorkspaceViewSelectionCommands } from './workspace-state'
import type { WorkspaceCommandContext } from './workspace-command-context'
import { unionRects } from './workspace-selection-geometry'
import { tr } from './workspace-translation'
import { activeSession } from './workspace-access'
import { renderTextAtCurrentSurface, applyTextSurface } from './workspace-text-surface'



export function createSelectionTransformCommands({ get, set }: WorkspaceCommandContext<'cancelTextBoxTransform' | 'commitFloatingPaste' | 'commitPixelEdit' | 'mutateActive' | 'previewTextBoxTransform' | 'redo' | 'undo'>): Pick<WorkspaceViewSelectionCommands, 'beginLayerTransform' | 'beginFreeTransform' | 'beginSelectedTextBoxTransform' | 'previewTextBoxTransform' | 'commitTextBoxTransform' | 'cancelTextBoxTransform' | 'transformActiveSelection' | 'commitSelectionTransform'> {
  return {
    beginLayerTransform() {
      if (isCanvasToolGestureLocked()) return
      get().commitFloatingPaste()
      get().cancelTextBoxTransform()
      const session = activeSession(get())
      if (!session) return
      if (activePaintLayer(session).kind === 'free-tile' && session.freeTileMode === 'paint') return
      const layers = selectedTransformLayersForSession(session)
      if (layers.length === 0) {
        set({ message: tr('workspace.transform.selectLayer') })
        return
      }
      if (layers.length > 1 && layers.some((layer) => layer.kind)) {
        set({ message: tr('workspace.transform.multipleUnsupported') })
        return
      }
      if (layers.some((layer) => !isLayerEffectivelyVisible(session.document, layer))) {
        set({ message: tr('workspace.transform.hidden') })
        return
      }
      if (layers.some((layer) => isLayerEffectivelyLocked(session.document, layer))) {
        set({ message: tr('workspace.transform.locked') })
        return
      }
      const layer = layers[0]
      const timeline = ensureAnimationDocument(session.document)
      const textCel = layers.length === 1 && layer.kind === 'text' ? timeline.cels.find((cel) => cel.layerId === layer.id && cel.frameId === timeline.activeFrameId) : null
      const textSource = textCel ? (resolveAnimationCel(timeline, textCel) ?? textCel) : null
      if (textCel && textSource?.text?.boxWidth && textSource.text.boxHeight && textSource.surface) {
        // Boxed text already exposes its resize handles while selected. Ctrl+T
        // must not create a second transform mode around the same text area.
        return
      }
      const selectedFreeTileInstanceBounds =
        layers.length === 1 && layer.kind === 'free-tile' && session.freeTileInstanceLayerId === layer.id && session.selectedFreeTileInstanceId
          ? (() => {
              const target = activeFreeTileCelTarget(session.document)
              const instance = target?.layer.id === layer.id ? (target.freeTiles.instances.find((candidate) => candidate.id === session.selectedFreeTileInstanceId) ?? null) : null
              return target && instance ? freeTileInstanceBounds(instance, target.sources, target.surface.offsetX, target.surface.offsetY) : null
            })()
          : null
      const contentBounds =
        selectedFreeTileInstanceBounds ??
        layers.reduce<SelectionRect | null>((bounds, candidate) => {
          const candidateBounds = layerContentBounds(session.document, candidate)
          return candidateBounds ? (bounds ? unionRects(bounds, candidateBounds) : candidateBounds) : bounds
        }, null)
      if (!contentBounds) {
        set({ message: tr('workspace.transform.empty') })
        return
      }
      const visibleBounds = clampSelection(session.document, contentBounds)
      if (!visibleBounds) {
        set({ message: tr('workspace.transform.outside') })
        return
      }
      get().mutateActive((active) => {
        if (isBrushTool(active.tool)) rememberBrushProfile(active)
        active.tool = 'selection'
        active.selection = visibleBounds
        active.selectionKind = 'rectangle'
        active.selectionMode = 'replace'
        active.freeTransformActive = false
        active.freeTransformQuad = null
      }, false)
      set({ message: tr('workspace.transform.started') })
    },
    beginFreeTransform() {
      if (isCanvasToolGestureLocked()) return
      get().commitFloatingPaste()
      get().cancelTextBoxTransform()
      const session = activeSession(get())
      if (!session?.selection) {
        set({ message: tr('workspace.selectionRequired') })
        return
      }
      if (activePaintLayer(session).kind === 'free-tile' && session.freeTileMode === 'paint') return
      const layer = activePaintLayer(session)
      if (!isLayerEffectivelyVisible(session.document, layer)) {
        set({ message: tr('workspace.transform.hidden') })
        return
      }
      if (isLayerEffectivelyLocked(session.document, layer)) {
        set({ message: tr('workspace.transform.locked') })
        return
      }
      get().mutateActive((active) => {
        active.tool = 'selection'
        active.freeTransformActive = true
        active.selectionAspectRatio = null
        active.freeTransformQuad = selectionQuadFromRect(active.selection!)
      }, false)
      set({ message: tr('workspace.transform.freeStarted') })
    },
    beginSelectedTextBoxTransform() {
      const session = activeSession(get())
      if (!session || session.selectedGroupId || session.selectedGroupIds.length > 0 || session.selectedLayerIds.length !== 1) return
      const layer = session.document.layers.find((candidate) => candidate.id === session.selectedLayerIds[0] && candidate.kind === 'text')
      if (!layer || !isLayerEffectivelyVisible(session.document, layer) || isLayerEffectivelyLocked(session.document, layer)) return
      const timeline = ensureAnimationDocument(session.document)
      const cel = timeline.cels.find((candidate) => candidate.layerId === layer.id && candidate.frameId === timeline.activeFrameId)
      const source = resolveAnimationCel(timeline, cel ?? null) ?? cel
      if (!cel || !source?.text?.boxWidth || !source.text.boxHeight || !source.surface) return
      get().mutateActive((active) => {
        active.textBoxTransform = {
          layerId: layer.id,
          frameId: timeline.activeFrameId,
          bounds: {
            x: source.text!.originX ?? source.surface!.offsetX ?? layer.offsetX,
            y: source.text!.originY ?? source.surface!.offsetY ?? layer.offsetY,
            width: source.text!.boxWidth!,
            height: source.text!.boxHeight!
          },
          originalText: cloneTextCelData(source.text!),
          originalSurface: cloneAnimationCelSurface(source.surface!)
        }
      }, false)
    },
    previewTextBoxTransform(bounds) {
      get().mutateActive((session) => {
        const transform = session.textBoxTransform
        if (!transform) return
        const layer = session.document.layers.find((candidate) => candidate.id === transform.layerId && candidate.kind === 'text')
        const timeline = ensureAnimationDocument(session.document)
        const cel = timeline.cels.find((candidate) => candidate.layerId === transform.layerId && candidate.frameId === transform.frameId)
        const source = resolveAnimationCel(timeline, cel ?? null) ?? cel
        if (!layer || !cel || !source?.text) return
        const target = normalizeTextBoxBounds(bounds)
        const rendered = renderTextAtCurrentSurface(
          session.document,
          {
            ...source.text,
            originX: target.x,
            originY: target.y,
            boxWidth: target.width,
            boxHeight: target.height
          },
          target.x,
          target.y
        )
        const surface = convertTextSurface(rendered.rgba, session.document.colorMode, session.document.palette, (color) => paletteColorIdForCanvas(session.document, color))
        applyTextSurface(session.document, layer, source, cel, rendered.data, surface)
        session.textBoxTransform = { ...transform, bounds: target }
        if (timeline.activeFrameId === transform.frameId) refreshActiveAnimationFrame(session.document)
      }, false)
    },
    commitTextBoxTransform(bounds) {
      const current = activeSession(get())
      const transform = current?.textBoxTransform
      if (!current || !transform) return
      const layer = current.document.layers.find((candidate) => candidate.id === transform.layerId && candidate.kind === 'text')
      const timeline = ensureAnimationDocument(current.document)
      const cel = timeline.cels.find((candidate) => candidate.layerId === transform.layerId && candidate.frameId === transform.frameId)
      const source = resolveAnimationCel(timeline, cel ?? null) ?? cel
      if (!layer || !cel || !source?.text || !source.surface) return
      const beforeText = cloneTextCelData(transform.originalText)
      const beforeSurface = cloneAnimationCelSurface(transform.originalSurface)
      const target = normalizeTextBoxBounds(bounds)
      get().previewTextBoxTransform(target)
      get().mutateActive((session) => {
        const activeTransform = session.textBoxTransform
        if (!activeTransform) return
        const activeLayer = session.document.layers.find((candidate) => candidate.id === activeTransform.layerId && candidate.kind === 'text')
        const activeTimeline = ensureAnimationDocument(session.document)
        const activeCel = activeTimeline.cels.find((candidate) => candidate.layerId === activeTransform.layerId && candidate.frameId === activeTransform.frameId)
        const activeSource = resolveAnimationCel(activeTimeline, activeCel ?? null) ?? activeCel
        if (!activeLayer || !activeCel || !activeSource?.text || !activeSource.surface) return
        const afterText = cloneTextCelData(activeSource.text)
        const afterSurface = cloneAnimationCelSurface(activeSource.surface)
        const restore = (text: TextCelData, surface: AnimationCelSurface): void => {
          applyTextSurface(session.document, activeLayer, activeSource, activeCel, cloneTextCelData(text), cloneAnimationCelSurface(surface))
          if (activeTimeline.activeFrameId === activeTransform.frameId) refreshActiveAnimationFrame(session.document)
        }
        session.textBoxTransform = null
        session.history.push({
          label: tr('workspace.history.transformSelectionContent'),
          bytes: beforeSurface.pixels.byteLength + afterSurface.pixels.byteLength + 128,
          undo: () => restore(beforeText, beforeSurface),
          redo: () => restore(afterText, afterSurface)
        })
      })
    },
    cancelTextBoxTransform() {
      get().mutateActive((session) => {
        const transform = session.textBoxTransform
        if (!transform) return
        const layer = session.document.layers.find((candidate) => candidate.id === transform.layerId && candidate.kind === 'text')
        const timeline = ensureAnimationDocument(session.document)
        const cel = timeline.cels.find((candidate) => candidate.layerId === transform.layerId && candidate.frameId === transform.frameId)
        const source = resolveAnimationCel(timeline, cel ?? null) ?? cel
        if (layer && cel && source) {
          applyTextSurface(session.document, layer, source, cel, cloneTextCelData(transform.originalText), cloneAnimationCelSurface(transform.originalSurface))
          if (timeline.activeFrameId === transform.frameId) refreshActiveAnimationFrame(session.document)
        }
        session.textBoxTransform = null
      }, false)
    },
    transformActiveSelection(beforeSelection, afterSelection, angle = 0) {
      get().mutateActive((session) => {
        const edit = transformSelectionCopy(session.document, beforeSelection, afterSelection, angle, undefined, undefined, undefined, activePaintLayer(session), undefined, session.selectionRotationAlgorithm === 'rotsprite')
        const entry = edit && commitPixelEdit(session.document, edit, angle === 0 ? tr('workspace.history.transformSelectionContent') : tr('workspace.history.rotateSelectionContent'))
        const before = { ...beforeSelection }
        const after = { ...afterSelection }
        session.selection = after
        if (entry) {
          session.history.push({
            ...entry,
            bytes: entry.bytes + 64,
            undo: () => {
              entry.undo()
              session.selection = { ...before }
            },
            redo: () => {
              entry.redo()
              session.selection = { ...after }
            }
          })
        } else if (before.x !== after.x || before.y !== after.y || before.width !== after.width || before.height !== after.height) {
          session.history.push({
            label: tr('workspace.history.transformSelection'),
            bytes: 48,
            undo: () => {
              session.selection = { ...before }
            },
            redo: () => {
              session.selection = { ...after }
            }
          })
        }
      })
    },
    commitSelectionTransform(edit, beforeSelection, afterSelection, label) {
      get().mutateActive((session) => {
        const entry = edit && commitPixelEdit(session.document, edit, label)
        const before = cloneSelectionMask(beforeSelection)!
        const after = cloneSelectionMask(afterSelection)!
        const sameMask = before.mask === after.mask || (before.mask?.length === after.mask?.length && before.mask?.every((value, index) => value === after.mask?.[index]))
        const selectionChanged = before.x !== after.x || before.y !== after.y || before.width !== after.width || before.height !== after.height || !sameMask
        session.selection = after
        if (entry) {
          session.history.push({
            ...entry,
            bytes: entry.bytes + 64 + (before.mask?.byteLength ?? 0) + (after.mask?.byteLength ?? 0),
            undo: () => {
              entry.undo()
              session.selection = cloneSelectionMask(before)
            },
            redo: () => {
              entry.redo()
              session.selection = cloneSelectionMask(after)
            }
          })
          touch(session)
        } else if (selectionChanged) {
          session.history.push({
            label,
            bytes: 48 + (before.mask?.byteLength ?? 0) + (after.mask?.byteLength ?? 0),
            undo: () => {
              session.selection = cloneSelectionMask(before)
            },
            redo: () => {
              session.selection = cloneSelectionMask(after)
            },
            documentChanged: false,
            contentChanged: false,
            requiresAnimationSync: false
          })
        }
      }, false)
    }
  }
}
