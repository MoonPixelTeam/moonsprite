import { TRANSPARENT } from '@/core/raster'
import { deviceSampleUsesSecondary } from './canvas-device-tools'
import type { FreeTileInstance, TilemapCell } from '@shared/types-tiles'
import type { RgbaColor } from '@shared/types-color'
import { readLayerMaskDisplayColorAt } from '@/core/document-model'
import { useWorkspace, type DocumentSession } from '@/store/workspace'
import { activeLayerMask } from '@/store/workspace-session'
import { beginCanvasColorSampling } from '@/core/canvas-color-sampling'
import { CanvasInputState, type CanvasPoint as Point } from '@/core/canvas-input'
import { canvasCursors } from '@/core/canvas-visuals'
import { publishCanvasColorSample } from '@/components/color-sampling-events'
export function createCanvasSamplingStart(ports: {
  canvasRef: import('react').RefObject<HTMLCanvasElement | null>
  inputRef: import('react').RefObject<CanvasInputState>
  queueEyedropperSampleColor: (sampled: RgbaColor, secondary: boolean) => void
  updateEyedropperMagnifier: (clientX: number, clientY: number, sampled: RgbaColor) => void
  updateRotationIndicator: (rotation: number, visible: boolean) => void
  liveViewRef: import('react').RefObject<import('@shared/types-view').ViewState>
  freeTileAtPoint: (
    point: Point,
    current?: DocumentSession
  ) =>
    | {
        sourceId: string
        tilesetId: string
        tileId: string
        instance: FreeTileInstance
      }
    | null
    | undefined
  hideEyedropperMagnifier: () => void
  draw: () => void
  tilemapCellAtPoint: (point: Point, current?: DocumentSession) => TilemapCell | null | undefined
  cursorCompositePointSamplerFor: (currentSession: DocumentSession) => (x: number, y: number) => RgbaColor
  eyedropperLens: { begin: (color: RgbaColor) => void }
}) {
  return ({
    event,
    point,
    readSession,
    state
  }: {
    event: React.PointerEvent<HTMLCanvasElement>
    point: Point
    readSession: () => DocumentSession
    state: ReturnType<typeof useWorkspace.getState>
  }) => {
    const {
      canvasRef,
      inputRef,
      queueEyedropperSampleColor,
      updateEyedropperMagnifier,
      updateRotationIndicator,
      liveViewRef,
      freeTileAtPoint,
      hideEyedropperMagnifier,
      draw,
      tilemapCellAtPoint,
      cursorCompositePointSamplerFor,
      eyedropperLens
    } = ports
    const beginCrossCanvasSampling = (): void => {
      const sourceCanvas = canvasRef.current
      if (!sourceCanvas) return
      beginCanvasColorSampling({
        sourceCanvas,
        pointerId: event.pointerId,
        onSample: (sampled, clientX, clientY) => {
          const drag = inputRef.current.drag
          if (drag?.kind !== 'sample-color') return
          queueEyedropperSampleColor(sampled, Boolean(drag.sampleSecondary))
          drag.sampledColor = { ...sampled }
          inputRef.current.sampling = true
          updateEyedropperMagnifier(clientX, clientY, sampled)
        }
      })
    }
    const sampleAtPoint = (temporarySampling = true): void => {
      temporarySampling ||= inputRef.current.temporaryTool === 'eyedropper'
      const session = readSession()
      // Sampling owns the pointer overlay. Prevent a stale rotate indicator
      // from rendering underneath the eyedropper magnifier/cursor.
      updateRotationIndicator(liveViewRef.current.rotation, false)
      const outsideCanvas = point.x < 0 || point.y < 0 || point.x >= session.document.width || point.y >= session.document.height
      const secondary = deviceSampleUsesSecondary(event.button, inputRef.current.temporaryTool)
      const sampledFreeTile = outsideCanvas ? undefined : freeTileAtPoint(point)
      if (sampledFreeTile !== undefined) {
        if (sampledFreeTile) {
          state.setSelectedTile(sampledFreeTile.tilesetId, sampledFreeTile.tileId, secondary ? 'secondary' : 'primary')
          state.setFreeTileMode('paint')
        }
        inputRef.current.sampling = true
        inputRef.current.drag = { kind: 'sample-color', start: point, last: point, sampleSecondary: secondary, temporarySampling, tileSampling: true }
        hideEyedropperMagnifier()
        event.currentTarget.style.cursor = canvasCursors.eyedropper
        draw()
        return
      }
      const sampledTile = outsideCanvas ? undefined : tilemapCellAtPoint(point)
      if (sampledTile !== undefined) {
        if (sampledTile) state.setSelectedTile(sampledTile.tilesetId, sampledTile.tileId, secondary ? 'secondary' : 'primary')
        inputRef.current.sampling = true
        inputRef.current.drag = { kind: 'sample-color', start: point, last: point, sampleSecondary: secondary, temporarySampling, tileSampling: true }
        hideEyedropperMagnifier()
        event.currentTarget.style.cursor = canvasCursors.eyedropper
        draw()
        return
      }
      const setSampledColor = secondary ? state.setSecondaryColor : state.setPrimaryColor
      const mask = activeLayerMask(session)
      const sampled = outsideCanvas ? { ...TRANSPARENT } : mask ? readLayerMaskDisplayColorAt(mask, point.x, point.y) : cursorCompositePointSamplerFor(session)(point.x, point.y)
      const previous = secondary ? session.secondaryColor : session.primaryColor
      setSampledColor(sampled)
      publishCanvasColorSample(sampled, secondary)
      eyedropperLens.begin({ ...previous })
      inputRef.current.sampling = true
      inputRef.current.drag = { kind: 'sample-color', start: point, last: point, sampleSecondary: secondary, temporarySampling, sampledColor: { ...sampled } }
      beginCrossCanvasSampling()
      updateEyedropperMagnifier(event.clientX, event.clientY, sampled)
      event.currentTarget.style.cursor = canvasCursors.eyedropper
      draw()
    }
    return { sampleAtPoint }
  }
}
