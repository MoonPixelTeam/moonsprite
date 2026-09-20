import type { RightClickAction } from './file-preferences'
import type { ToolId } from '@shared/types-brush'
import { hasReliableBrushPressure, isPressurePointerType } from './pressure'
import { type CanvasPoint, type CanvasDragState } from './canvas-input-contracts'
import { type CanvasPointerDeviceEvent, PEN_COMPATIBLE_MOUSE_SUPPRESSION_MS } from './canvas-input-pointer'
import { isPendingCanvasPathGesture, undoCanvasPathStep } from './canvas-input-path'

export interface CanvasPointerState {
  point: CanvasPoint
  clientX: number
  clientY: number
  ctrlKey: boolean
  altKey: boolean
  visible: boolean
}

const EMPTY_POINTER: CanvasPointerState = {
  point: { x: 0, y: 0 },
  clientX: 0,
  clientY: 0,
  ctrlKey: false,
  altKey: false,
  visible: false
}

export class CanvasInputState {
  drag: CanvasDragState | null = null
  pointer: CanvasPointerState = {
    ...EMPTY_POINTER,
    point: { ...EMPTY_POINTER.point }
  }
  sampling = false
  altHeld = false
  ctrlHeld = false
  shiftHeld = false
  spaceHeld = false
  shiftLinePreview = false
  temporaryEraserPointerId: number | null = null
  temporaryToolPointerId: number | null = null
  temporaryRightClickAction: RightClickAction | null = null
  temporaryTool: ToolId | null = null
  modifierBrushSize: { x: number; y: number; size: number } | null = null
  private penPointerId: number | null = null
  private lastPenPointerTime = Number.NEGATIVE_INFINITY
  private auxiliaryMousePointerId: number | null = null
  private pressurePointerIds = new Set<number>()

  acceptPointerDeviceEvent(event: CanvasPointerDeviceEvent, forceMouseTakeover = false): boolean {
    const pointerType = event.pointerType || 'mouse'
    // Tablet drivers may emit side buttons as a mouse stream interleaved
    // with pen hover. A deliberate auxiliary press owns its move/up events.
    if (pointerType === 'mouse' && forceMouseTakeover && ((event.buttons ?? 0) & 30)) this.auxiliaryMousePointerId = event.pointerId
    if (pointerType === 'mouse' && event.pointerId === this.auxiliaryMousePointerId) return true
    // Some Windows tablet stacks expose the stylus as a mouse in WebView.
    // Treat a proven pressure-bearing stream like a pen for compatibility
    // mouse suppression, but never promote the browser's ordinary 0.5 mouse
    // value here (hasReliableBrushPressure rejects it without a prior change).
    const pressurePointer = this.pressurePointerIds.has(event.pointerId) || isPressurePointerType(pointerType) || hasReliableBrushPressure(pointerType, event.pressure)
    if (pressurePointer) {
      this.pressurePointerIds.add(event.pointerId)
      this.penPointerId = event.pointerId
      this.lastPenPointerTime = Number.isFinite(event.timeStamp) ? event.timeStamp : this.lastPenPointerTime
      return true
    }
    if (pointerType !== 'mouse') {
      this.penPointerId = null
      return true
    }
    if (this.penPointerId === null) return true
    const elapsed = event.timeStamp - this.lastPenPointerTime
    const followsPen = !Number.isFinite(elapsed) || elapsed < 0 || elapsed <= PEN_COMPATIBLE_MOUSE_SUPPRESSION_MS
    if (!forceMouseTakeover && followsPen) return false
    this.penPointerId = null
    return true
  }

  releasePointerDeviceEvent(event: Pick<CanvasPointerDeviceEvent, 'pointerId' | 'pointerType'>): void {
    if (event.pointerType === 'mouse' && event.pointerId === this.auxiliaryMousePointerId) this.auxiliaryMousePointerId = null
    this.pressurePointerIds.delete(event.pointerId)
    if (event.pointerId === this.penPointerId) {
      this.penPointerId = null
      this.lastPenPointerTime = Number.NEGATIVE_INFINITY
    }
  }

  /**
   * Clears device ownership after a lost pointer, window blur, or document
   * switch. Pointer Events do not guarantee a matching cancel/up event in
   * those cases, so a later pointerId reuse must start a fresh session.
   */
  resetPointerDeviceState(): void {
    this.auxiliaryMousePointerId = null
    this.clearTemporaryTool()
    this.clearTemporaryEraser()
    this.pressurePointerIds.clear()
    this.penPointerId = null
    this.lastPenPointerTime = Number.NEGATIVE_INFINITY
  }

  penPointerIsActive(): boolean {
    return this.penPointerId !== null
  }

  auxiliaryMouseGestureActive(): boolean {
    return this.auxiliaryMousePointerId !== null
  }

  begin(drag: CanvasDragState): CanvasDragState {
    this.drag = drag
    return drag
  }

  finish(): CanvasDragState | null {
    const drag = this.drag
    this.drag = null
    return drag
  }

  updatePointer(pointer: Omit<CanvasPointerState, 'visible'>): void {
    this.pointer = { ...pointer, point: { ...pointer.point }, visible: true }
  }

  clearPointer(): void {
    this.pointer.visible = false
  }

  resetPointerInteraction(): void {
    this.sampling = false
    this.shiftLinePreview = false
    this.modifierBrushSize = null
  }

  setTemporaryEraser(pointerId: number): void {
    this.temporaryEraserPointerId = pointerId
  }
  clearTemporaryEraser(pointerId?: number): void {
    if (pointerId === undefined || this.temporaryEraserPointerId === pointerId) this.temporaryEraserPointerId = null
  }

  setTemporaryTool(pointerId: number, tool: ToolId): void {
    this.temporaryToolPointerId = pointerId
    this.temporaryTool = tool
  }
  clearTemporaryTool(pointerId?: number): void {
    if (pointerId === undefined || this.temporaryToolPointerId === pointerId) {
      this.temporaryToolPointerId = null
      this.temporaryTool = null
      this.temporaryRightClickAction = null
    }
  }

  resetInteraction(): CanvasDragState | null {
    const drag = this.finish()
    this.pointer.visible = false
    this.sampling = false
    this.altHeld = false
    this.ctrlHeld = false
    this.shiftHeld = false
    this.spaceHeld = false
    this.shiftLinePreview = false
    this.modifierBrushSize = null
    this.temporaryEraserPointerId = null
    this.clearTemporaryTool()
    return drag
  }

  syncModifierKeys(event: Pick<PointerEvent, 'altKey' | 'ctrlKey' | 'shiftKey'>, releaseOnly = false): void {
    if (releaseOnly) {
      this.altHeld = this.altHeld && event.altKey
      this.ctrlHeld = this.ctrlHeld && event.ctrlKey
      this.shiftHeld = this.shiftHeld && event.shiftKey
      return
    }
    this.altHeld = event.altKey
    this.ctrlHeld = event.ctrlKey
    this.shiftHeld = event.shiftKey
  }
}

export const undoActiveCanvasPathGesture = (input: CanvasInputState): boolean => {
  const drag = input.drag
  if (!isPendingCanvasPathGesture(drag)) return false
  const changed = undoCanvasPathStep(drag)
  if (!changed || (drag.path?.length ?? 0) === 0) input.finish()
  return true
}
