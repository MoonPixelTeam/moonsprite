import { TRANSPARENT } from '@/core/raster'
import { useCanvasEyedropperMagnifier } from './useCanvasEyedropperMagnifier'
import { useEffect, useRef } from 'react'
import type { RgbaColor } from '@shared/types-color'
import { readLayerMaskDisplayColorAt } from '@/core/document-model'
import { useWorkspace, type DocumentSession } from '@/store/workspace'
import { activeLayerMask } from '@/store/workspace-session'
import { clearCanvasColorSamplingIntentFor, registerCanvasColorSamplingSurface, setCanvasColorSamplingIntent } from '@/core/canvas-color-sampling'
import { type CanvasPoint as Point } from '@/core/canvas-input'
import { canvasCursors, canvasToolCursor } from '@/core/canvas-visuals'
import { publishCanvasColorSample, publishCanvasColorSamplingCompleted } from '@/components/color-sampling-events'
interface Ports {
  readonly canvasRef: import('react').RefObject<HTMLCanvasElement | null>
  readonly session: DocumentSession
  readonly activeDocumentId: string | null
  readonly localPointAt: (clientX: number, clientY: number, allowOutsideCopies?: boolean) => Point | null
  readonly cursorCompositePointSamplerFor: (currentSession: DocumentSession) => (x: number, y: number) => RgbaColor
  readonly liveInputSession: () => DocumentSession
  readonly stageBounds: () => DOMRect
  readonly localContinuousPointAt: (clientX: number, clientY: number) => Point | null
  readonly liveViewRef: import('react').RefObject<import('@shared/types-view').ViewState>
  readonly checkerboard: import('@/core/file-preferences').CheckerboardPreferences
}

export function useCanvasColorSampling(ports: Ports) {
  const quickEyedropperOriginalColorRef = useRef<RgbaColor | null>(null)

  const quickEyedropperActiveRef = useRef(false)

  const quickEyedropperSuppressedRef = useRef(false)

  const canvasColorSampleAtClientPointRef = useRef<(clientX: number, clientY: number) => RgbaColor | null>(() => null)

  useEffect(() => {
    const canvas = ports.canvasRef.current
    if (!canvas) return
    const currentSession = useWorkspace.getState().sessions.find((item) => item.document.id === ports.session.document.id) ?? ports.session
    if (ports.activeDocumentId !== ports.session.document.id || currentSession.tool !== 'eyedropper') {
      clearCanvasColorSamplingIntentFor(canvas)
      return
    }
    setCanvasColorSamplingIntent({
      sourceCanvas: canvas,
      onSample: (sampled, _clientX, _clientY, secondary) => {
        const state = useWorkspace.getState()
        if (secondary) state.setSecondaryColor(sampled)
        else state.setPrimaryColor(sampled)
        publishCanvasColorSample(sampled, secondary)
        publishCanvasColorSamplingCompleted()
      }
    })
    return () => clearCanvasColorSamplingIntentFor(canvas)
  }, [ports.activeDocumentId, ports.session.document.id, ports.session.tool])

  canvasColorSampleAtClientPointRef.current = (clientX, clientY) => {
    const currentSession = useWorkspace.getState().sessions.find((item) => item.document.id === ports.session.document.id) ?? ports.session
    const bounds = ports.stageBounds()
    if (clientX < bounds.left || clientY < bounds.top || clientX >= bounds.right || clientY >= bounds.bottom) return null
    const point = ports.localPointAt(clientX, clientY) ?? ports.localContinuousPointAt(clientX, clientY)
    if (!point) return null
    if (point.x < 0 || point.y < 0 || point.x >= currentSession.document.width || point.y >= currentSession.document.height) return { ...TRANSPARENT }
    const mask = activeLayerMask(currentSession)
    return mask ? readLayerMaskDisplayColorAt(mask, point.x, point.y) : ports.cursorCompositePointSamplerFor(currentSession)(point.x, point.y)
  }

  useEffect(() => {
    const canvas = ports.canvasRef.current
    if (!canvas) return
    return registerCanvasColorSamplingSurface({
      canvas,
      sampleAtClientPoint: (clientX, clientY) => canvasColorSampleAtClientPointRef.current(clientX, clientY),
      setSamplingCursor: (active) => {
        const current = ports.liveInputSession()
        canvas.style.cursor = active ? canvasCursors.eyedropper : canvasToolCursor(current.tool, current.primaryColor)
      }
    })
  }, [ports.session.document.id])

  const eyedropperLens = useCanvasEyedropperMagnifier({
    documentId: ports.session.document.id,
    stageBounds: () => ports.stageBounds(),
    localContinuousPointAt: (x, y) => ports.localContinuousPointAt(x, y),
    readView: () => ports.liveViewRef.current,
    checkerboard: ports.checkerboard
  })

  const {
    hide: hideEyedropperMagnifier,
    queueColor: queueEyedropperSampleColor,
    flushColor: flushEyedropperSampleColor,
    preview: updateEyedropperMagnifier
  } = eyedropperLens
  return {
    quickEyedropperOriginalColorRef,
    quickEyedropperActiveRef,
    quickEyedropperSuppressedRef,
    canvasColorSampleAtClientPointRef,
    eyedropperLens,
    hideEyedropperMagnifier,
    queueEyedropperSampleColor,
    flushEyedropperSampleColor,
    updateEyedropperMagnifier
  }
}
