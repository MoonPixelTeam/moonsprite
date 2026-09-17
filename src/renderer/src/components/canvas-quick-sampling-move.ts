import type { RgbaColor } from '@shared/types-color'
import { useWorkspace, type DocumentSession } from '@/store/workspace'
import { CanvasInputState, type CanvasDragState as DragState } from '@/core/canvas-input'
import { canvasCursors } from '@/core/canvas-visuals'
import { shouldQuickSelectEyedropper } from '@/core/eyedropper-quick-select'
export function createCanvasQuickSamplingMove(ports: {
  quickEyedropperActiveRef: import('react').RefObject<boolean>
  eyedropperQuickSelect: boolean
  inputRef: import('react').RefObject<CanvasInputState>
  quickEyedropperSuppressedRef: import('react').RefObject<boolean>
  canvasResizePreviewRef: import('react').RefObject<import('@/store/workspace').CanvasResizePreview | null>
  canvasColorSampleAtClientPointRef: import('react').RefObject<(clientX: number, clientY: number) => RgbaColor | null>
  quickEyedropperOriginalColorRef: import('react').RefObject<RgbaColor | null>
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
  queueEyedropperSampleColor: (sampled: RgbaColor, secondary: boolean) => void
  updateEyedropperMagnifier: (clientX: number, clientY: number, sampled: RgbaColor) => void
}) {
  return ({ drag, session, event }: { drag: DragState | null; session: DocumentSession; event: React.PointerEvent<HTMLCanvasElement> }) => {
    const {
      quickEyedropperActiveRef,
      eyedropperQuickSelect,
      inputRef,
      quickEyedropperSuppressedRef,
      canvasResizePreviewRef,
      canvasColorSampleAtClientPointRef,
      quickEyedropperOriginalColorRef,
      eyedropperLens,
      queueEyedropperSampleColor,
      updateEyedropperMagnifier
    } = ports
    if (
      !drag &&
      quickEyedropperActiveRef.current &&
      shouldQuickSelectEyedropper({
        enabled: eyedropperQuickSelect,
        shortcutMatched: true,
        repeat: false,
        pointerVisible: inputRef.current.pointer.visible,
        activeDocument: useWorkspace.getState().activeId === session.document.id,
        dragActive: false,
        spaceHeld: inputRef.current.spaceHeld,
        modifierChordActive: false,
        canvasContextBlocked:
          quickEyedropperSuppressedRef.current ||
          session.tool === 'move' ||
          session.animationPlaying ||
          session.freeTransformActive === true ||
          Boolean(canvasResizePreviewRef.current),
        interactionBlocked: false
      })
    ) {
      const sampled = canvasColorSampleAtClientPointRef.current(event.clientX, event.clientY)
      if (sampled) {
        const liveSession = useWorkspace.getState().sessions.find((item) => item.document.id === session.document.id) ?? session
        if (!quickEyedropperOriginalColorRef.current) quickEyedropperOriginalColorRef.current = { ...liveSession.primaryColor }
        eyedropperLens.begin({ ...quickEyedropperOriginalColorRef.current })
        queueEyedropperSampleColor(sampled, false)
        updateEyedropperMagnifier(event.clientX, event.clientY, sampled)
        event.currentTarget.style.cursor = canvasCursors.eyedropper
        return true
      }
    }
    return false
  }
}
