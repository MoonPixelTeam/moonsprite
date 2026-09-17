import { useEffect, useRef } from 'react'
import type { RasterLayer } from '@shared/types-layer'
import type { SelectionRect } from '@shared/types-selection'
import { isLayerEffectivelyLocked, isLayerEffectivelyVisible, readLayerVisibleColorAt } from '@/core/document-model'
import { type DocumentSession } from '@/store/workspace'
import { selectionResizeHit, type CanvasPoint as Point, type SelectionHandle } from '@/core/canvas-input'
import { layerIdsInVisualStackOrder } from '@/core/layer-panel-layout'
import { ensureAnimationDocument, resolveAnimationCel } from '@/core/animation'
import { TEXT_TOOL_PREVIEW_EVENT, type TextToolPreviewDetail } from '@/components/text-tool-events'
interface Ports {
  readonly session: DocumentSession
  readonly scheduleDraw: () => void
  readonly stageSize: () => {
    width: number
    height: number
  }
  readonly liveViewRef: import('react').RefObject<import('@shared/types-view').ViewState>
  readonly unrotatedStagePoint: (clientX: number, clientY: number) => Point
}

export function useCanvasTextPreview(ports: Ports) {
  const textToolPreviewRef = useRef<import('@shared/types-animation').AnimationCelSurface | null>(null)

  const textToolBoxRef = useRef<SelectionRect | null>(null)

  useEffect(() => {
    const updateTextPreview = (event: Event): void => {
      const detail = (event as CustomEvent<TextToolPreviewDetail>).detail
      if (!detail || detail.documentId !== ports.session.document.id) return
      textToolPreviewRef.current = detail.surface
      if (detail.box !== undefined) textToolBoxRef.current = detail.box
      ports.scheduleDraw()
    }
    window.addEventListener(TEXT_TOOL_PREVIEW_EVENT, updateTextPreview)
    return () => window.removeEventListener(TEXT_TOOL_PREVIEW_EVENT, updateTextPreview)
  }, [ports.session.document.id])

  const textLayerAt = (point: Point): RasterLayer | null => {
    const timeline = ensureAnimationDocument(ports.session.document)
    const layerById = new Map(ports.session.document.layers.map((layer) => [layer.id, layer]))
    for (const layerId of layerIdsInVisualStackOrder(ports.session.document.layers, ports.session.document.groups)) {
      const layer = layerById.get(layerId)
      if (!layer || !isLayerEffectivelyVisible(ports.session.document, layer) || isLayerEffectivelyLocked(ports.session.document, layer)) continue
      if (layer.kind !== 'text') {
        if (readLayerVisibleColorAt(ports.session.document, layer, point.x, point.y).a > 0) return null
        continue
      }
      const cel = timeline.cels.find((candidate) => candidate.layerId === layer.id && candidate.frameId === timeline.activeFrameId)
      const source = resolveAnimationCel(timeline, cel ?? null) ?? cel
      if (!source?.text || !source.surface) continue
      const boxed = source.text.layoutMode === 'box' && source.text.boxWidth !== undefined && source.text.boxHeight !== undefined
      // Unboxed text still owns a rectangular editing region. Extend the
      // rendered layout by half an em so spaces, ascenders/descenders, and the
      // area immediately around the line stay easy to target.
      const padding = boxed ? 0 : Math.max(2, Math.ceil(source.text.fontSize / 2))
      const x = source.surface.offsetX - padding
      const y = source.surface.offsetY - padding
      const width = (boxed ? source.text.boxWidth! : source.surface.width) + padding * 2
      const height = (boxed ? source.text.boxHeight! : source.surface.height) + padding * 2
      if (point.x >= x && point.y >= y && point.x < x + width && point.y < y + height) return layer
    }
    return null
  }

  const sliceScreenBox = (slice: SelectionRect): SelectionRect => {
    const size = ports.stageSize()
    const view = ports.liveViewRef.current
    const originX = size.width / 2 + view.panX - (ports.session.document.width * view.zoom) / 2
    const originY = size.height / 2 + view.panY - (ports.session.document.height * view.zoom) / 2
    return { x: originX + slice.x * view.zoom, y: originY + slice.y * view.zoom, width: slice.width * view.zoom, height: slice.height * view.zoom }
  }

  const sliceHandleAt = (clientX: number, clientY: number, slice: SelectionRect): SelectionHandle | null =>
    selectionResizeHit(sliceScreenBox(slice), ports.unrotatedStagePoint(clientX, clientY), 6, 8, 3)
  return { textToolPreviewRef, textToolBoxRef, textLayerAt, sliceHandleAt }
}
