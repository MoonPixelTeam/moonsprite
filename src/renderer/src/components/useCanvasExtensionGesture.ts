import { useRef, useState } from 'react'
import type { SelectionRect } from '@shared/types-selection'
import { isLayerEffectivelyLocked, layerIndexAt, readLayerColorAt } from '@/core/document-model'
import { beginPixelEdit, recordPixel } from '@/core/history'
import { packColor } from '@/core/raster'
import { brushStampAnchor, solidBrushPreviewRowSpans } from '@/core/tools-brush'
import { useWorkspace, type DocumentSession } from '@/store/workspace'
import { activePaintLayer } from '@/store/workspace-session'
import { selectionContains } from '@/core/selection'
import { type CanvasDragState as DragState, type CanvasPoint as Point } from '@/core/canvas-input'
import { boundsFromPixelMask, loadRemotePixelToolConfig, requestRemotePixelToolPatch } from '@/core/remote-pixel-tool'
import { extensionToolContributionFor } from '@/core/extension-contributions'
import { brushAngleWithDynamics } from './canvas-stage-helpers'
interface Ports {
  readonly optimizedRotationEnabled: boolean
  readonly invalidateCompositeRect: (selection: SelectionRect | null | undefined, layerIds?: readonly string[]) => void
  readonly requestDrawRef: import('react').RefObject<() => void>
}

export function useCanvasExtensionGesture(ports: Ports) {
  const extensionToolRequestRef = useRef<AbortController | null>(null)

  const [extensionToolBusy, setExtensionToolBusy] = useState(false)

  const addExtensionToolFootprint = (drag: DragState, center: Point, currentSession: DocumentSession): void => {
    if (!drag.extensionToolMask) drag.extensionToolMask = new Set<number>()
    const size = Math.max(1, Math.min(128, Math.round(currentSession.brushSize)))
    const angle = brushAngleWithDynamics(currentSession)
    const anchor = brushStampAnchor(size, null, angle, currentSession.brushShape)
    for (const span of solidBrushPreviewRowSpans(size, currentSession.brushShape, angle, ports.optimizedRotationEnabled)) {
      const y = Math.round(center.y) - anchor.y + span.y
      if (y < 0 || y >= currentSession.document.height) continue
      for (
        let x = Math.max(0, Math.round(center.x) - anchor.x + span.left);
        x <= Math.min(currentSession.document.width - 1, Math.round(center.x) - anchor.x + span.right);
        x++
      ) {
        if (!currentSession.selection || selectionContains(currentSession.selection, x, y)) drag.extensionToolMask.add(y * currentSession.document.width + x)
      }
    }
    drag.extensionToolBounds = boundsFromPixelMask(drag.extensionToolMask, currentSession.document.width, currentSession.document.height)
  }

  const runExtensionTool = async (drag: DragState, initialSession: DocumentSession): Promise<void> => {
    const contribution = extensionToolContributionFor(initialSession.extensionToolId)
    if (!contribution || contribution.tool.kind !== 'remote-pixel-brush') return
    const bounds = drag.extensionToolBounds ?? boundsFromPixelMask(drag.extensionToolMask ?? [], initialSession.document.width, initialSession.document.height)
    const layer = activePaintLayer(initialSession)
    if (!bounds || layer.kind || initialSession.activeLayerMaskId || isLayerEffectivelyLocked(initialSession.document, layer)) return
    const config = loadRemotePixelToolConfig(contribution.key)
    const pixels: number[] = []
    for (let y = 0; y < bounds.height; y += 1)
      for (let x = 0; x < bounds.width; x += 1) {
        const color = readLayerColorAt(initialSession.document, layer, bounds.x + x, bounds.y + y)
        pixels.push(color.r, color.g, color.b, color.a)
      }
    const mask = Array.from(drag.extensionToolMask ?? []).flatMap((index) => {
      const x = index % initialSession.document.width
      const y = Math.floor(index / initialSession.document.width)
      return x >= bounds.x && x < bounds.x + bounds.width && y >= bounds.y && y < bounds.y + bounds.height
        ? [(y - bounds.y) * bounds.width + (x - bounds.x)]
        : []
    })
    if (mask.length === 0) return
    const controller = new AbortController()
    extensionToolRequestRef.current?.abort()
    extensionToolRequestRef.current = controller
    let timedOut = false
    const timeoutId = window.setTimeout(() => {
      timedOut = true
      controller.abort()
    }, 45_000)
    setExtensionToolBusy(true)
    useWorkspace.getState().setMessage('正在等待 AI 返回修线结果（最长 45 秒）…')
    try {
      const patch = await requestRemotePixelToolPatch(
        config,
        { toolId: contribution.key, width: bounds.width, height: bounds.height, bounds, mode: initialSession.extensionToolMode, pixels, mask },
        controller.signal
      )
      const state = useWorkspace.getState()
      const current = state.sessions.find((item) => item.document.id === initialSession.document.id)
      if (!current || current.contentRevision !== drag.extensionToolContentRevision || current.document !== initialSession.document) return
      const edit = beginPixelEdit(layer.id)
      if (patch.edits) {
        const selected = new Set(mask)
        for (const item of patch.edits) {
          if (!selected.has(item.index)) continue
          const x = bounds.x + (item.index % bounds.width)
          const y = bounds.y + Math.floor(item.index / bounds.width)
          const index = layerIndexAt(layer, x, y)
          if (index === null) continue
          const [r, g, b, a] = item.rgba
          recordPixel(initialSession.document, layer, edit, index, packColor({ r, g, b, a }))
        }
      } else if (patch.pixels) {
        for (const localIndex of mask) {
          const x = bounds.x + (localIndex % bounds.width)
          const y = bounds.y + Math.floor(localIndex / bounds.width)
          const index = layerIndexAt(layer, x, y)
          if (index === null) continue
          const offset = localIndex * 4
          recordPixel(
            initialSession.document,
            layer,
            edit,
            index,
            packColor({ r: patch.pixels[offset], g: patch.pixels[offset + 1], b: patch.pixels[offset + 2], a: patch.pixels[offset + 3] })
          )
        }
      }
      if (edit.after.size > 0) {
        if (edit.dirtyRect) ports.invalidateCompositeRect(edit.dirtyRect, [layer.id])
        state.commitPixelEdit(edit, contribution.tool.name, { stroke: true, durationMs: Math.max(1, Date.now() - (drag.startedAt ?? Date.now())) })
      }
    } catch (error) {
      if (timedOut) useWorkspace.getState().setMessage('AI 接口响应超时（45 秒），本次没有修改画布。')
      else if ((error as Error)?.name !== 'AbortError') useWorkspace.getState().setMessage(error instanceof Error ? error.message : String(error))
    } finally {
      window.clearTimeout(timeoutId)
      if (extensionToolRequestRef.current === controller) extensionToolRequestRef.current = null
      setExtensionToolBusy(false)
      ports.requestDrawRef.current()
    }
  }

  const cancelExtensionToolRequest = (): void => {
    extensionToolRequestRef.current?.abort()
    extensionToolRequestRef.current = null
    setExtensionToolBusy(false)
    useWorkspace.getState().setMessage('已取消 AI 修线。')
    ports.requestDrawRef.current()
  }
  return { extensionToolRequestRef, extensionToolBusy, addExtensionToolFootprint, runExtensionTool, cancelExtensionToolRequest }
}
