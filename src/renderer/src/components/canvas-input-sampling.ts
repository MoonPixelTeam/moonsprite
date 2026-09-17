import type { FreeTileInstance, TilemapCell } from '@shared/types-tiles'
import type { RgbaColor } from '@shared/types-color'
import { readLayerMaskDisplayColorAt } from '@/core/document-model'
import { useWorkspace, type DocumentSession } from '@/store/workspace'
import { activeLayerMask } from '@/store/workspace-session'
import { paletteSamplingShortcutActive } from '@/core/palette-sampling-shortcut'
import { endCanvasColorSampling } from '@/core/canvas-color-sampling'
import { CanvasInputState } from '@/core/canvas-input-controller'
import { sampledForegroundColorToAdd } from '@/core/canvas-input-preview'
import { type CanvasDragState as DragState, type CanvasPoint as Point } from '@/core/canvas-input-contracts'
import { canvasCursors, canvasToolCursor } from '@/core/canvas-visuals'
import { publishCanvasColorSamplingCompleted } from '@/components/color-sampling-events'

interface Ports {
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
  inputRef: import('react').RefObject<CanvasInputState>
  hideEyedropperMagnifier: () => void
  tilemapCellAtPoint: (point: Point, current?: DocumentSession) => TilemapCell | null | undefined
  cursorCompositePointSamplerFor: (currentSession: DocumentSession) => (x: number, y: number) => RgbaColor
  queueEyedropperSampleColor: (sampled: RgbaColor, secondary: boolean) => void
  updateEyedropperMagnifier: (clientX: number, clientY: number, sampled: RgbaColor) => void
  flushEyedropperSampleColor: () => void
  eyedropperLens: {
    begin: (color: RgbaColor) => void
    clearOriginalColor: () => void
    cancelPendingColor: () => void
    hide: () => void
    queueColor: (sampled: RgbaColor, secondary: boolean) => void
    flushColor: () => void
    preview: (clientX: number, clientY: number, sampled: RgbaColor) => void
    overlay: import('react').JSX.Element
  }
  eyedropperSwitchToPencil: boolean
  updateCursor: (event: React.PointerEvent<HTMLCanvasElement>) => void
  draw: () => void
}

export function createSamplingCanvasInput(ports: Ports) {
  function moveSample({
    drag,
    point,
    session,
    state,
    event
  }: {
    drag: DragState
    point: Point
    session: DocumentSession
    state: ReturnType<typeof useWorkspace.getState>
    event: React.PointerEvent<HTMLCanvasElement>
  }): boolean {
    const {
      freeTileAtPoint,
      inputRef,
      hideEyedropperMagnifier,
      tilemapCellAtPoint,
      cursorCompositePointSamplerFor,
      queueEyedropperSampleColor,
      updateEyedropperMagnifier
    } = ports
    if (drag.kind === 'sample-color') {
      if (point.x >= 0 && point.y >= 0 && point.x < session.document.width && point.y < session.document.height) {
        if (drag.tileSampling) {
          const sampledFreeTile = freeTileAtPoint(point)
          if (sampledFreeTile !== undefined) {
            if (sampledFreeTile) {
              state.setSelectedTile(sampledFreeTile.tilesetId, sampledFreeTile.tileId, drag.sampleSecondary ? 'secondary' : 'primary')
              state.setFreeTileMode('paint')
            }
            inputRef.current.sampling = true
            hideEyedropperMagnifier()
            event.currentTarget.style.cursor = canvasCursors.eyedropper
            return true
          }
          const sampledTile = tilemapCellAtPoint(point)
          if (sampledTile) state.setSelectedTile(sampledTile.tilesetId, sampledTile.tileId, drag.sampleSecondary ? 'secondary' : 'primary')
          inputRef.current.sampling = true
          hideEyedropperMagnifier()
          event.currentTarget.style.cursor = canvasCursors.eyedropper
          return true
        }
        const mask = activeLayerMask(session)
        const sampled = mask ? readLayerMaskDisplayColorAt(mask, point.x, point.y) : cursorCompositePointSamplerFor(session)(point.x, point.y)
        // Color setters synchronize every open session and may remap brush
        // assets. Commit at most once per animation frame while keeping the
        // newest sample in the drag state for an immediate pointer-up flush.
        queueEyedropperSampleColor(sampled, Boolean(drag.sampleSecondary))
        drag.sampledColor = { ...sampled }
        inputRef.current.sampling = true
        updateEyedropperMagnifier(event.clientX, event.clientY, sampled)
      } else {
        hideEyedropperMagnifier()
      }
      event.currentTarget.style.cursor = canvasCursors.eyedropper
      return true
    }
    return false
  }

  function endSample({
    drag,
    event,
    state,
    session
  }: {
    drag: DragState
    event: React.PointerEvent<HTMLCanvasElement>
    state: ReturnType<typeof useWorkspace.getState>
    session: DocumentSession
  }): boolean {
    const { flushEyedropperSampleColor, inputRef, hideEyedropperMagnifier, eyedropperLens, eyedropperSwitchToPencil, updateCursor, draw } = ports
    if (drag.kind === 'sample-color') {
      flushEyedropperSampleColor()
      endCanvasColorSampling(event.pointerId)
      inputRef.current.sampling = false
      hideEyedropperMagnifier()
      eyedropperLens.clearOriginalColor()
      const sampledColorToAdd = sampledForegroundColorToAdd(drag, paletteSamplingShortcutActive())
      if (sampledColorToAdd) state.addPaletteColor(sampledColorToAdd)
      publishCanvasColorSamplingCompleted()
      if (!drag.temporarySampling && eyedropperSwitchToPencil) {
        state.setTool('pencil')
        event.currentTarget.style.cursor = canvasToolCursor('pencil', session.primaryColor)
      } else updateCursor(event)
      draw()
      return true
    }
    return false
  }
  return { moveSample, endSample }
}
