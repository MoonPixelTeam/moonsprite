import type { CanvasInputState, CanvasPoint as Point } from '@/core/canvas-input'
import type { DocumentSession } from '@/store/workspace'
import type { RasterLayer } from '@shared/types-layer'
import type { RgbaColor } from '@shared/types-color'
export interface Ports {
  readonly inputRef: import('react').RefObject<CanvasInputState>
  readonly session: DocumentSession
  readonly canvasRef: import('react').RefObject<HTMLCanvasElement | null>
  readonly stageBounds: () => DOMRect
  readonly keyDisplayEnabled: boolean
  readonly keyDisplayWheelRef: import('react').RefObject<boolean>
  readonly activeLayer: RasterLayer
  readonly canvasResizePreviewRef: import('react').RefObject<import('@/store/workspace').CanvasResizePreview | null>
  readonly modifierActive: (event: Pick<KeyboardEvent, 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>, id: import('@/core/shortcuts').ShortcutId) => boolean
  readonly activeBrushImage: import('@shared/types-brush').ImageBrush | null
  readonly updateCursorAt: (clientX: number, clientY: number, ctrlKey: boolean, altKey: boolean, shiftKey?: boolean) => void
  readonly scheduleDraw: () => void
  readonly brushSizeWheelReversed: boolean
  readonly wheelZoomEnabled: boolean
  readonly liveViewRef: import('react').RefObject<import('@shared/types-view').ViewState>
  readonly wheelZoomMode: import('@/core/file-preferences').WheelZoomMode
  readonly stageSize: () => {
    width: number
    height: number
  }
  readonly scheduleZoomPreview: (next: import('@shared/types-view').ViewState) => void
  readonly constrainCanvasView: (
    view: DocumentSession['view'],
    size?: {
      width: number
      height: number
    }
  ) => DocumentSession['view']
  readonly stagePoint: (clientX: number, clientY: number) => Point
  readonly rotationIndicatorPosition: import('@/core/file-preferences').RotationIndicatorPosition
  readonly liveInputSession: () => DocumentSession
  readonly tabletPreferences: import('@/core/file-preferences').TabletPreferences
  readonly beginPanPreview: () => void
  readonly finishPanPreview: () => import('@shared/types-view').ViewState
  readonly applyRotationStyle: (_view: import('@shared/types-view').ViewState) => void
  readonly finishZoomPreview: () => import('@shared/types-view').ViewState
  readonly handlePointerDown: (event: React.PointerEvent<HTMLCanvasElement>) => void
  readonly syncPenCursor: (event: React.PointerEvent<HTMLCanvasElement>) => void
  readonly handlePointerMove: (event: React.PointerEvent<HTMLCanvasElement>) => void
  readonly handlePointerUp: (event: React.PointerEvent<HTMLCanvasElement>) => void
  readonly cancelActiveCanvasInteraction: () => void
  readonly hideEyedropperMagnifier: () => void
  readonly updateCursor: (event: React.PointerEvent<HTMLCanvasElement>) => void
  readonly scheduleBrushPreviewOverlay: () => void
  readonly hidePenCursor: () => void
  readonly selectionCrosshair: boolean
  readonly useLocalCursors?: boolean
  readonly selectionInteractionEditable: boolean
  readonly draw: () => void
  readonly quickEyedropperOriginalColorRef: import('react').RefObject<RgbaColor | null>
  readonly flushEyedropperSampleColor: () => void
  readonly quickEyedropperSuppressedRef: import('react').RefObject<boolean>
  readonly brushPreviewOverlaySupported: (currentSession: DocumentSession) => boolean
  readonly lineConnectionPreviewActive: (event: Pick<KeyboardEvent, 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>) => boolean
}
