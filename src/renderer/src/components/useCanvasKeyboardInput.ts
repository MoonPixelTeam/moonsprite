import { registerCanvasKeyboard } from './canvas-keyboard-router'
import { flushCanvasBrushSize } from './canvas-brush-size-update'
import { useEffect, useRef, useState } from 'react'
import type { RasterLayer } from '@shared/types-layer'
import type { RgbaColor } from '@shared/types-color'
import { temporaryLiquifyModeForShift } from '@/core/liquify'
import { useWorkspace, type DocumentSession } from '@/store/workspace'
import { SHORTCUT_GROUPS, shortcutBindingBlocked, shortcutBindingsFor, shortcutMatchesEvent, shortcutReleasedByBindings } from '@/core/shortcuts'
import {
  CanvasInputState,
  beginTemporaryCenteredMarqueeResize,
  centerMarqueeBoundsAtCreationPoint,
  createMarqueeResizeStart,
  isPendingCanvasPathGesture,
  redoCanvasPathStep,
  registerPendingCanvasGestureHistory,
  restoreTemporaryCenteredMarqueeResize,
  undoActiveCanvasPathGesture,
  type CanvasDragState as DragState,
  type CanvasPoint as Point
} from '@/core/canvas-input'
import { canvasCursors, canvasToolCursor, selectionCreationCursor } from '@/core/canvas-visuals'
import { OnionSkinCompositeCache } from '@/components/onion-skin-composite-cache'
import { publishCanvasColorSample } from '@/components/color-sampling-events'
import { shouldQuickSelectEyedropper } from '@/core/eyedropper-quick-select'
import { keyDisplayKeydownAccepted, keyDisplayLabel } from '@/core/key-display'
interface Ports {
  readonly keyDisplayEnabled: boolean
  readonly inputRef: import('react').RefObject<CanvasInputState>
  readonly modifierActive: (event: Pick<KeyboardEvent, 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>, id: import('@/core/shortcuts').ShortcutId) => boolean
  readonly wheelBrushSizePreviewRef: import('react').RefObject<boolean>
  readonly scheduleDraw: () => void
  readonly session: DocumentSession
  readonly canvasResizeFrameRef: import('react').RefObject<number | null>
  readonly shortcuts: import('@/core/shortcuts').ShortcutBindings
  readonly updateGradientDragGeometry: (drag: DragState, point: Point, modifiers: Pick<KeyboardEvent, 'altKey' | 'ctrlKey' | 'metaKey' | 'shiftKey'>) => void
  readonly liveInputSession: () => DocumentSession
  readonly shortcutConflictState: import('@/core/shortcuts').ShortcutConflictState
  readonly eyedropperQuickSelect: boolean
  readonly quickEyedropperActiveRef: import('react').RefObject<boolean>
  readonly quickEyedropperSuppressedRef: import('react').RefObject<boolean>
  readonly quickEyedropperOriginalColorRef: import('react').RefObject<RgbaColor | null>
  readonly eyedropperLens: {
    begin: (color: RgbaColor) => void
    clearOriginalColor: () => void
    cancelPendingColor: () => void
    hide: () => void
    queueColor: (sampled: RgbaColor, secondary: boolean) => void
    flushColor: () => void
    preview: (clientX: number, clientY: number, sampled: RgbaColor) => void
    overlay: import('react').JSX.Element
  }
  readonly hideEyedropperMagnifier: () => void
  readonly sameRgbaColor: (left: RgbaColor, right: RgbaColor) => boolean
  readonly activeDocumentId: string | null
  readonly onionSkinCacheRef: import('react').RefObject<OnionSkinCompositeCache>
  readonly liveViewRef: import('react').RefObject<import('@shared/types-view').ViewState>
  readonly applyRotationStyle: (_view: import('@shared/types-view').ViewState) => void
  readonly updateRotationIndicator: (rotation: number, visible: boolean) => void
  readonly canvasRef: import('react').RefObject<HTMLCanvasElement | null>
  readonly selectionCrosshair: boolean
  readonly selectionInteractionEditable: boolean
  readonly scheduleBrushPreviewOverlay: () => void
  readonly lineConnectionConfigured: boolean
  readonly lineConnectionPreviewActive: (event: Pick<KeyboardEvent, 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>) => boolean
  readonly activeLayer: RasterLayer
  readonly brushPreviewOverlaySupported: (currentSession: DocumentSession) => boolean
  readonly canvasResizePreviewRef: import('react').RefObject<import('@/store/workspace').CanvasResizePreview | null>
  readonly canvasColorSampleAtClientPointRef: import('react').RefObject<(clientX: number, clientY: number) => RgbaColor | null>
  readonly updateEyedropperMagnifier: (clientX: number, clientY: number, sampled: RgbaColor) => void
  readonly quickToolActive: (tool: DocumentSession['tool']) => boolean
  readonly updateCursorAt: (clientX: number, clientY: number, ctrlKey: boolean, altKey: boolean, shiftKey?: boolean) => void
  readonly updateMarqueePreview: (
    drag: DragState,
    point: Point,
    modifiers: ReturnType<
      (event: Pick<KeyboardEvent, 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>) => {
        fromCenter: boolean
        proportional: boolean
        rotate: boolean
      }
    >
  ) => void
  readonly currentSelectionMarqueeModifierState: () => {
    fromCenter: boolean
    proportional: boolean
    rotate: boolean
  }
  readonly updateShapePreview: (
    drag: DragState,
    point: Point,
    modifiers: ReturnType<
      (event: Pick<KeyboardEvent, 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>) => {
        fromCenter: boolean
        proportional: boolean
        rotate: boolean
      }
    >
  ) => void
  readonly updateFreeTransformPreview: (drag: DragState, point: Point) => void
  readonly updateSelectionTransformPreview: (
    drag: DragState,
    point: Point,
    modifiers: ReturnType<
      (event: Pick<KeyboardEvent, 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>) => {
        proportional: boolean
        integerScale: boolean
        fromCenter: boolean
        copy: false
      }
    >
  ) => void
  readonly currentSelectionTransformModifierState: () => {
    proportional: boolean
    integerScale: boolean
    fromCenter: boolean
    copy: false
  }
  readonly keyDisplayDuration: import('@/core/file-preferences').KeyDisplayDuration
  readonly lineConnectionActive: (event: Pick<KeyboardEvent, 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>) => boolean
  readonly flushEyedropperSampleColor: () => void
  readonly cancelActiveCanvasInteraction: () => void
  readonly hidePenCursor: () => void
  readonly gradientType: import('@shared/types-brush').GradientType
  readonly lineAnchor: {
    x: number
    y: number
  } | null
  readonly lineConnectionShortcut: string
}

export function useCanvasKeyboardInput(ports: Ports) {
  const [keyDisplayEntries, setKeyDisplayEntries] = useState<Array<{ id: number; label: string }>>([])

  const keyDisplayIdRef = useRef(0)

  const keyDisplayHeldRef = useRef<Set<string>>(new Set())

  const keyDisplayGestureRef = useRef<Set<string>>(new Set())

  const keyDisplayWheelRef = useRef(false)

  const keyDisplayActiveEntryRef = useRef<number | null>(null)

  useEffect(() => {
    if (!ports.keyDisplayEnabled) {
      setKeyDisplayEntries([])
      keyDisplayHeldRef.current.clear()
      keyDisplayGestureRef.current.clear()
      keyDisplayWheelRef.current = false
      keyDisplayActiveEntryRef.current = null
    }
  }, [ports.keyDisplayEnabled])

  useEffect(() => {
    const releaseModifierSizing = (event?: KeyboardEvent): void => {
      flushCanvasBrushSize(ports.inputRef.current)
      ports.inputRef.current.modifierBrushSize = null
      if (!event || !ports.modifierActive(event, 'brushSizeWheelAdjust')) {
        ports.wheelBrushSizePreviewRef.current = false
        ports.scheduleDraw()
      }
    }
    const blur = (): void => releaseModifierSizing()
    const unregisterKeyboard = registerCanvasKeyboard({
      isActive: () => useWorkspace.getState().activeId === ports.session.document.id,
      keyUp: releaseModifierSizing
    })
    window.addEventListener('blur', blur)
    return () => {
      flushCanvasBrushSize(ports.inputRef.current)
      unregisterKeyboard()
      window.removeEventListener('blur', blur)
      if (ports.canvasResizeFrameRef.current !== null) window.cancelAnimationFrame(ports.canvasResizeFrameRef.current)
    }
  }, [ports.shortcuts])

  useEffect(
    () =>
      registerPendingCanvasGestureHistory(ports.session.document.id, {
        undo: () => {
          if (!undoActiveCanvasPathGesture(ports.inputRef.current)) return false
          ports.scheduleDraw()
          return true
        },
        redo: () => {
          const drag = ports.inputRef.current.drag
          if (!isPendingCanvasPathGesture(drag)) return false
          if (redoCanvasPathStep(drag)) ports.scheduleDraw()
          return true
        }
      }),
    [ports.session.document.id]
  )

  useEffect(() => {
    const updateShiftPreview = (active: boolean): void => {
      if (ports.inputRef.current.shiftLinePreview === active) return
      ports.inputRef.current.shiftLinePreview = active
      ports.scheduleDraw()
    }
    const updateGradientModifiers = (): void => {
      const drag = ports.inputRef.current.drag
      if (drag?.kind !== 'gradient') return
      // The geometry owns the last processed pointer; rawLast may precede it.
      ports.updateGradientDragGeometry(drag, drag.last, {
        altKey: ports.inputRef.current.altHeld,
        ctrlKey: ports.inputRef.current.ctrlHeld,
        metaKey: false,
        shiftKey: ports.inputRef.current.shiftHeld
      })
      ports.scheduleDraw()
    }
    const updateLiquifyModifierMode = (): void => {
      const drag = ports.inputRef.current.drag
      if (drag?.kind !== 'liquify') return
      const nextMode = temporaryLiquifyModeForShift(ports.liveInputSession().liquifyMode, ports.inputRef.current.shiftHeld)
      if (drag.liquifyMode === nextMode) return
      drag.liquifyMode = nextMode
    }
    const quickEyedropperShortcuts = shortcutBindingsFor(ports.shortcuts, 'tool.eyedropper.quick')
    const quickEyedropperShortcutMatches = (event: KeyboardEvent): boolean =>
      quickEyedropperShortcuts.some(
        (shortcut) => !shortcutBindingBlocked(ports.shortcutConflictState, 'tool.eyedropper.quick', shortcut) && shortcutMatchesEvent(event, shortcut)
      )
    const cancelQuickEyedropperForChord = (): void => {
      if (!ports.eyedropperQuickSelect || !ports.quickEyedropperActiveRef.current) return
      ports.quickEyedropperActiveRef.current = false
      ports.quickEyedropperSuppressedRef.current = true
      const original = ports.quickEyedropperOriginalColorRef.current
      ports.quickEyedropperOriginalColorRef.current = null
      ports.eyedropperLens.cancelPendingColor()
      ports.eyedropperLens.clearOriginalColor()
      ports.hideEyedropperMagnifier()
      if (!original) return
      const workspace = useWorkspace.getState()
      const liveSession = workspace.sessions.find((item) => item.document.id === ports.session.document.id)
      if (liveSession && !ports.sameRgbaColor(liveSession.primaryColor, original)) {
        workspace.setPrimaryColor(original)
        publishCanvasColorSample(original, false)
      }
    }
    const quickSelectChordKeyDown = (event: KeyboardEvent): void => {
      if (!quickEyedropperShortcutMatches(event)) cancelQuickEyedropperForChord()
    }
    const keyDown = (event: KeyboardEvent): void => {
      flushCanvasBrushSize(ports.inputRef.current)
      const eventTarget = event.target instanceof Element ? event.target : null
      const keyDisplayBlocked = Boolean(eventTarget?.closest('input, textarea, select, [contenteditable="true"], .modal-backdrop'))
      if (keyDisplayBlocked || document.querySelector('.modal-backdrop')) return
      // Plain wheel shortcuts are represented as synthetic keyboard events and
      // stay hidden; a modifier + wheel is an intentional shortcut and remains
      // visible (for example Ctrl + ↑).
      const syntheticWheelWithModifier = !event.isTrusted && (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey)
      const keyDisplayAccepted = keyDisplayKeydownAccepted({
        isTrusted: event.isTrusted,
        syntheticWheelWithModifier,
        enabled: ports.keyDisplayEnabled,
        activeDocument: ports.activeDocumentId === ports.session.document.id,
        repeat: event.repeat,
        blockedTarget: keyDisplayBlocked
      })
      if (keyDisplayAccepted) {
        const keyId = event.key
        if (keyDisplayGestureRef.current.size === 0) keyDisplayWheelRef.current = false
        keyDisplayHeldRef.current.add(keyId)
        keyDisplayGestureRef.current.add(keyId)
      }
      const controlWasHeld = ports.inputRef.current.ctrlHeld
      if (event.key === 'Alt') {
        ports.inputRef.current.altHeld = true
        if (!event.repeat) ports.quickEyedropperSuppressedRef.current = false
      }
      if (event.key === 'Control') {
        ports.inputRef.current.ctrlHeld = true
      }
      if (event.key === 'Shift') {
        ports.inputRef.current.shiftHeld = true
        updateLiquifyModifierMode()
      }
      if (event.key === 'Alt' || event.key === 'Control' || event.key === 'Shift') updateGradientModifiers()
      const rotatableDrag = ports.inputRef.current.drag
      if (rotatableDrag?.kind === 'marquee' || rotatableDrag?.kind === 'shape') {
        if (event.key === 'Alt') rotatableDrag.marqueeModifierMode = 'rotate'
        if (event.key === 'Control') {
          rotatableDrag.marqueeModifierMode = 'resize'
          if (!controlWasHeld && rotatableDrag.marqueeAngle !== undefined) {
            const bounds = rotatableDrag.marqueeBounds ?? rotatableDrag.marqueeRotationStart?.bounds
            if (bounds) {
              const offset = rotatableDrag.transformOffset ?? { x: 0, y: 0 }
              const pointer = ports.inputRef.current.pointer.visible ? ports.inputRef.current.pointer.point : rotatableDrag.last
              const transition = beginTemporaryCenteredMarqueeResize(
                bounds,
                rotatableDrag.start,
                { x: pointer.x - offset.x, y: pointer.y - offset.y },
                rotatableDrag.marqueeDirection,
                rotatableDrag.marqueeResizeStart?.fromCenter ?? true
              )
              rotatableDrag.marqueeTemporaryCenterRestore = transition.restore
              rotatableDrag.marqueeBounds = transition.bounds
              rotatableDrag.marqueeResizeStart = transition.resizeStart
              rotatableDrag.marqueeRotationStart = undefined
            }
          }
        }
      }
      const selectionNudge =
        event.key === 'ArrowLeft'
          ? { x: -1, y: 0 }
          : event.key === 'ArrowRight'
            ? { x: 1, y: 0 }
            : event.key === 'ArrowUp'
              ? { x: 0, y: -1 }
              : event.key === 'ArrowDown'
                ? { x: 0, y: 1 }
                : null
      const target = event.target instanceof Element ? event.target : null
      const selectionNudgeBlocked = Boolean(target?.closest('input, textarea, select, [contenteditable="true"], .modal-backdrop, .layer-list, .themed-select'))
      // Text movement takes priority over arrow navigation in the layer list.
      const textNudgeBlocked = Boolean(target?.closest('input, textarea, select, [contenteditable="true"], .modal-backdrop, .themed-select'))
      const activeTextLayer =
        ports.session.tool === 'text' && ports.session.selectedGroupIds.length === 0
          ? ports.session.document.layers.find((layer) => layer.id === ports.session.document.activeLayerId && layer.kind === 'text')
          : null
      if (selectionNudge && activeTextLayer && !textNudgeBlocked && !event.ctrlKey && !event.metaKey && !event.altKey && !ports.inputRef.current.drag) {
        event.preventDefault()
        event.stopPropagation()
        useWorkspace.getState().moveLayerBy(activeTextLayer.id, selectionNudge.x, selectionNudge.y)
        ports.scheduleDraw()
        return
      }
      if (
        selectionNudge &&
        ports.session.selection &&
        !selectionNudgeBlocked &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey &&
        !ports.inputRef.current.drag
      ) {
        event.preventDefault()
        event.stopPropagation()
        useWorkspace.getState().moveActiveSelectionWithSelectionHistory(selectionNudge.x, selectionNudge.y, true)
        ports.onionSkinCacheRef.current.invalidateFrames(ports.session.selectedAnimationFrameIds)
        ports.scheduleDraw()
        return
      }
      if (ports.session.tool === 'rotate' && ports.modifierActive(event, 'resetViewRotation')) {
        const drag = ports.inputRef.current.drag
        if (drag?.kind === 'rotate-view') {
          ports.liveViewRef.current = { ...ports.liveViewRef.current, rotation: 0 }
          ports.applyRotationStyle(ports.liveViewRef.current)
          ports.updateRotationIndicator(0, true)
          useWorkspace.getState().setView({ rotation: 0 })
          ports.scheduleDraw()
        }
      }
      if (ports.quickToolActive('hand')) {
        const target = event.target as HTMLElement | null
        if (target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.tagName === 'SELECT' || target?.isContentEditable) return
        event.preventDefault()
        if (!ports.inputRef.current.spaceHeld) {
          ports.inputRef.current.spaceHeld = true
          ports.inputRef.current.sampling = false
          const drag = ports.inputRef.current.drag
          if ((drag?.kind === 'marquee' || drag?.kind === 'shape' || (drag?.kind === 'gradient' && ports.session.gradientType === 'radial')) && ports.inputRef.current.pointer.visible) {
            drag.transformMoveStart = {
              pointer: { ...ports.inputRef.current.pointer.point },
              offset: { ...(drag.transformOffset ?? { x: 0, y: 0 }) }
            }
          }
          if (ports.canvasRef.current && ports.inputRef.current.pointer.visible) {
            ports.canvasRef.current.style.cursor =
              drag?.kind === 'marquee'
                ? selectionCreationCursor(ports.selectionCrosshair, ports.selectionInteractionEditable, true)
                : drag?.kind === 'shape'
                  ? canvasToolCursor(ports.session.tool === 'selection' && ports.session.selectionKind === 'brush' ? 'pencil' : ports.session.tool, ports.session.primaryColor)
                  : drag?.kind === 'pan'
                    ? canvasCursors.grabbing
                    : canvasCursors.grab
          }
          // The brush preview is rendered on a separate overlay canvas. Clear
          // it immediately when Space turns the active gesture into a hand
          // pan; the regular canvas redraw does not touch this surface.
          ports.scheduleBrushPreviewOverlay()
          ports.scheduleDraw()
        }
        return
      }
      if (ports.inputRef.current.spaceHeld && ports.quickToolActive('hand')) return
      ports.inputRef.current.spaceHeld = false
      if (ports.lineConnectionConfigured && ports.inputRef.current.pointer.visible) updateShiftPreview(ports.lineConnectionPreviewActive(event))
      const modifierEvent = {
        ctrlKey: event.ctrlKey || ports.inputRef.current.ctrlHeld,
        metaKey: event.metaKey,
        altKey: event.altKey || ports.inputRef.current.altHeld,
        shiftKey: event.shiftKey || ports.inputRef.current.shiftHeld
      }
      const modifierSizing =
        (ports.activeLayer.kind !== 'tilemap' || ports.session.tilemapMode !== 'paint') &&
        ports.modifierActive(modifierEvent, 'brushSizeAdjust') &&
        (ports.session.tool === 'pencil' ||
          ports.session.tool === 'line' ||
          ports.session.tool === 'airbrush' ||
          ports.session.tool === 'eraser' ||
          ports.session.tool === 'smooth' ||
          (ports.session.tool === 'selection' && ports.session.selectionKind === 'brush') ||
          ports.session.tool === 'liquify')
      if (modifierSizing) {
        ports.inputRef.current.sampling = false
        event.preventDefault()
        const pointer = ports.inputRef.current.pointer
        if (pointer.visible) {
          if (!ports.inputRef.current.modifierBrushSize) {
            ports.inputRef.current.modifierBrushSize = {
              x: pointer.clientX,
              y: pointer.clientY,
              size:
                ports.session.tool === 'airbrush'
                  ? ports.session.airbrushScatterRadius
                  : ports.session.tool === 'liquify'
                    ? ports.session.liquifyRadius
                    : ports.session.brushSize
            }
          }
          // Sizing only changes the transient brush cursor. Avoid sampling the
          // composited canvas while the modifier is held.
          ports.canvasRef.current && (ports.canvasRef.current.style.cursor = canvasToolCursor('pencil', ports.session.primaryColor))
        }
        if (ports.brushPreviewOverlaySupported(ports.session)) ports.scheduleBrushPreviewOverlay()
        else ports.scheduleDraw()
      } else if (quickEyedropperShortcutMatches(event) && ports.inputRef.current.pointer.visible) {
        const interactionBlocked =
          Boolean(target?.closest('input, textarea, select, [contenteditable="true"], .modal-backdrop, .themed-select')) ||
          Boolean(document.querySelector('.modal-backdrop'))
        event.preventDefault()
        if (
          shouldQuickSelectEyedropper({
            enabled: ports.eyedropperQuickSelect,
            shortcutMatched: true,
            repeat: event.repeat,
            pointerVisible: ports.inputRef.current.pointer.visible,
            activeDocument: useWorkspace.getState().activeId === ports.session.document.id,
            dragActive: Boolean(ports.inputRef.current.drag),
            spaceHeld: ports.inputRef.current.spaceHeld,
            // An exact shortcut match already accounts for the configured
            // modifiers, so these are not an unrelated chord here.
            modifierChordActive: false,
            canvasContextBlocked:
              ports.quickEyedropperSuppressedRef.current ||
              ports.session.tool === 'move' ||
              ports.session.animationPlaying ||
              ports.session.freeTransformActive === true ||
              Boolean(ports.canvasResizePreviewRef.current),
            interactionBlocked
          })
        ) {
          ports.quickEyedropperActiveRef.current = true
          const sampled = ports.canvasColorSampleAtClientPointRef.current(ports.inputRef.current.pointer.clientX, ports.inputRef.current.pointer.clientY)
          const workspace = useWorkspace.getState()
          const liveSession = workspace.sessions.find((item) => item.document.id === ports.session.document.id)
          if (sampled) {
            const previous = liveSession?.primaryColor ?? ports.session.primaryColor
            if (!ports.quickEyedropperOriginalColorRef.current) ports.quickEyedropperOriginalColorRef.current = { ...previous }
            ports.eyedropperLens.begin({ ...ports.quickEyedropperOriginalColorRef.current })
            if (!ports.sameRgbaColor(previous, sampled)) {
              workspace.setPrimaryColor(sampled)
              publishCanvasColorSample(sampled, false)
            }
            ports.updateEyedropperMagnifier(ports.inputRef.current.pointer.clientX, ports.inputRef.current.pointer.clientY, sampled)
          }
        }
        if (ports.session.tool === 'rotate' && ports.quickToolActive('eyedropper')) ports.updateRotationIndicator(ports.liveViewRef.current.rotation, false)
        ports.updateCursorAt(
          ports.inputRef.current.pointer.clientX,
          ports.inputRef.current.pointer.clientY,
          ports.inputRef.current.ctrlHeld,
          true,
          ports.inputRef.current.shiftHeld
        )
        ports.scheduleDraw()
      } else if (event.key === 'Control' && ports.inputRef.current.pointer.visible) {
        ports.updateCursorAt(
          ports.inputRef.current.pointer.clientX,
          ports.inputRef.current.pointer.clientY,
          true,
          ports.inputRef.current.altHeld,
          ports.inputRef.current.shiftHeld
        )
        // The brush preview has its own overlay canvas, so the main redraw
        // above cannot clear it when Ctrl temporarily activates Move.
        ports.scheduleBrushPreviewOverlay()
        ports.scheduleDraw()
      } else if (event.key === 'Shift' && ports.inputRef.current.pointer.visible) {
        ports.updateCursorAt(
          ports.inputRef.current.pointer.clientX,
          ports.inputRef.current.pointer.clientY,
          ports.inputRef.current.ctrlHeld,
          ports.inputRef.current.altHeld,
          true
        )
        ports.scheduleDraw()
      }
      if ((event.key === 'Alt' || event.key === 'Control' || event.key === 'Shift') && ports.inputRef.current.pointer.visible) {
        const drag = ports.inputRef.current.drag
        if (drag?.kind === 'marquee' && drag.moved)
          ports.updateMarqueePreview(drag, ports.inputRef.current.pointer.point, ports.currentSelectionMarqueeModifierState())
        else if (drag?.kind === 'shape') ports.updateShapePreview(drag, ports.inputRef.current.pointer.point, ports.currentSelectionMarqueeModifierState())
        else if (drag?.kind === 'transform-content') {
          if (drag.freeTransform) ports.updateFreeTransformPreview(drag, ports.inputRef.current.pointer.point)
          else ports.updateSelectionTransformPreview(drag, ports.inputRef.current.pointer.point, ports.currentSelectionTransformModifierState())
        }
      }
    }
    const keyUp = (event: KeyboardEvent): void => {
      ports.inputRef.current.syncModifierKeys(event)
      keyDisplayHeldRef.current.delete(event.key)
      const wheelOnlyModifiers =
        keyDisplayWheelRef.current &&
        Array.from(keyDisplayGestureRef.current).every((key) => key === 'Control' || key === 'Meta' || key === 'Shift' || key === 'Alt')
      const pendingKeys = Array.from(keyDisplayGestureRef.current)
      const shouldEmitKeyDisplay = keyDisplayHeldRef.current.size === 0 && pendingKeys.length > 0 && !wheelOnlyModifiers
      if (shouldEmitKeyDisplay) {
        const combo = pendingKeys
          .sort((left, right) => {
            const rank = (key: string): number => (key === 'Control' || key === 'Meta' ? 0 : key === 'Shift' ? 1 : key === 'Alt' ? 2 : 3)
            return rank(left) - rank(right)
          })
          .map((heldKey) => keyDisplayLabel(heldKey))
        const id = ++keyDisplayIdRef.current
        setKeyDisplayEntries((current) => [...current, { id, label: combo.join(' + ') }].slice(-10))
        globalThis.setTimeout(() => setKeyDisplayEntries((current) => current.filter((entry) => entry.id !== id)), ports.keyDisplayDuration)
        keyDisplayGestureRef.current.clear()
        keyDisplayActiveEntryRef.current = null
      }
      if (keyDisplayHeldRef.current.size === 0) keyDisplayWheelRef.current = false
      const temporaryPanReleased = shortcutReleasedByBindings(event, shortcutBindingsFor(ports.shortcuts, 'tool.hand.quick'))
      const quickEyedropperReleased = shortcutReleasedByBindings(event, quickEyedropperShortcuts)
      if (ports.lineConnectionConfigured && !ports.lineConnectionActive(event)) updateShiftPreview(false)
      if (quickEyedropperReleased && ports.quickEyedropperActiveRef.current) {
        ports.quickEyedropperActiveRef.current = false
        ports.flushEyedropperSampleColor()
        ports.quickEyedropperOriginalColorRef.current = null
        ports.quickEyedropperSuppressedRef.current = false
        ports.eyedropperLens.clearOriginalColor()
        ports.hideEyedropperMagnifier()
      }
      if (event.key === 'Alt' || event.key === 'Control' || event.key === 'Shift') {
        if (event.key === 'Alt') {
          event.preventDefault()
          ports.inputRef.current.altHeld = false
        }
        if (event.key === 'Control') ports.inputRef.current.ctrlHeld = false
        if (event.key === 'Shift') {
          ports.inputRef.current.shiftHeld = false
          updateLiquifyModifierMode()
        }
        if (event.key === 'Alt' || event.key === 'Control' || event.key === 'Shift') updateGradientModifiers()
        const rotatableDrag = ports.inputRef.current.drag
        if (rotatableDrag?.kind === 'marquee' || rotatableDrag?.kind === 'shape') {
          if (event.key === 'Alt' && rotatableDrag.marqueeModifierMode === 'rotate') {
            rotatableDrag.marqueeModifierMode = ports.inputRef.current.ctrlHeld ? 'resize' : undefined
          }
          if (event.key === 'Control' && rotatableDrag.marqueeModifierMode === 'resize') {
            rotatableDrag.marqueeModifierMode = ports.inputRef.current.altHeld ? 'rotate' : undefined
          }
          if (event.key === 'Control' && rotatableDrag.marqueeTemporaryCenterRestore) {
            const offset = rotatableDrag.transformOffset ?? { x: 0, y: 0 }
            const pointer = ports.inputRef.current.pointer.visible ? ports.inputRef.current.pointer.point : rotatableDrag.last
            const restored = restoreTemporaryCenteredMarqueeResize(rotatableDrag.marqueeTemporaryCenterRestore, {
              x: pointer.x - offset.x,
              y: pointer.y - offset.y
            })
            rotatableDrag.marqueeBounds = restored.bounds
            rotatableDrag.marqueeResizeStart = restored.resizeStart
            rotatableDrag.marqueeDirection = restored.direction
            rotatableDrag.marqueeRotationStart = undefined
            rotatableDrag.marqueeTemporaryCenterRestore = undefined
          }
        }
        ports.inputRef.current.sampling = ports.session.tool === 'eyedropper' || ports.quickToolActive('eyedropper')
        if (!ports.modifierActive(event, 'brushSizeAdjust')) ports.inputRef.current.modifierBrushSize = null
        if (event.key === 'Alt' && (ports.inputRef.current.drag?.kind === 'marquee' || ports.inputRef.current.drag?.kind === 'shape')) {
          const drag = ports.inputRef.current.drag
          const bounds = drag.marqueeBounds ?? drag.marqueeRotationStart?.bounds
          if (bounds) {
            const offset = drag.transformOffset ?? { x: 0, y: 0 }
            const resizeBounds = ports.inputRef.current.ctrlHeld ? centerMarqueeBoundsAtCreationPoint(bounds, drag.start) : bounds
            drag.marqueeBounds = resizeBounds
            drag.marqueeResizeStart = createMarqueeResizeStart(resizeBounds, { x: drag.last.x - offset.x, y: drag.last.y - offset.y })
            drag.marqueeRotationStart = undefined
          }
        }
        if (ports.inputRef.current.pointer.visible)
          ports.updateCursorAt(
            ports.inputRef.current.pointer.clientX,
            ports.inputRef.current.pointer.clientY,
            ports.inputRef.current.ctrlHeld,
            ports.inputRef.current.altHeld,
            ports.inputRef.current.shiftHeld
          )
        else if (ports.canvasRef.current)
          ports.canvasRef.current.style.cursor = ports.inputRef.current.sampling
            ? canvasCursors.eyedropper
            : canvasToolCursor(ports.session.tool === 'selection' && ports.session.selectionKind === 'brush' ? 'pencil' : ports.session.tool, ports.session.primaryColor)
        const drag = ports.inputRef.current.drag
        if (drag?.kind === 'marquee' && drag.moved && ports.inputRef.current.pointer.visible)
          ports.updateMarqueePreview(drag, ports.inputRef.current.pointer.point, ports.currentSelectionMarqueeModifierState())
        else if (drag?.kind === 'shape' && ports.inputRef.current.pointer.visible)
          ports.updateShapePreview(drag, ports.inputRef.current.pointer.point, ports.currentSelectionMarqueeModifierState())
        else if (drag?.kind === 'transform-content' && ports.inputRef.current.pointer.visible) {
          if (drag.freeTransform) ports.updateFreeTransformPreview(drag, ports.inputRef.current.pointer.point)
          else ports.updateSelectionTransformPreview(drag, ports.inputRef.current.pointer.point, ports.currentSelectionTransformModifierState())
        }
        ports.scheduleDraw()
        if (event.key === 'Control') ports.scheduleBrushPreviewOverlay()
      }
      if (shortcutReleasedByBindings(event, SHORTCUT_GROUPS.modifiers.flatMap((id) => shortcutBindingsFor(ports.shortcuts, id)))) {
        if (!ports.modifierActive(event, 'brushSizeAdjust')) ports.inputRef.current.modifierBrushSize = null
        if (ports.inputRef.current.pointer.visible) ports.updateCursorAt(
          ports.inputRef.current.pointer.clientX, ports.inputRef.current.pointer.clientY,
          event.ctrlKey, event.altKey, event.shiftKey
        )
        ports.scheduleBrushPreviewOverlay()
      }
      if (temporaryPanReleased) {
        event.preventDefault()
        ports.inputRef.current.spaceHeld = false
        const drag = ports.inputRef.current.drag
        if (drag) drag.transformMoveStart = undefined
        if (ports.canvasRef.current)
          ports.canvasRef.current.style.cursor =
            drag?.kind === 'marquee'
              ? selectionCreationCursor(ports.selectionCrosshair, ports.selectionInteractionEditable, true)
              : canvasToolCursor(ports.session.tool === 'selection' && ports.session.selectionKind === 'brush' ? 'pencil' : ports.session.tool, ports.session.primaryColor)
        // Restore the smooth preview as soon as temporary hand navigation is
        // released (the overlay draw will re-check the live input state).
        ports.scheduleBrushPreviewOverlay()
        ports.scheduleDraw()
      }
    }
    const cancelSampling = (): void => {
      if (ports.inputRef.current.drag?.kind === 'sample-color') ports.inputRef.current.finish()
      ports.inputRef.current.sampling = false
      ports.quickEyedropperActiveRef.current = false
      ports.quickEyedropperOriginalColorRef.current = null
      ports.quickEyedropperSuppressedRef.current = false
      ports.eyedropperLens.clearOriginalColor()
      ports.hideEyedropperMagnifier()
    }
    const blur = (): void => {
      keyDisplayHeldRef.current.clear()
      keyDisplayGestureRef.current.clear()
      keyDisplayWheelRef.current = false
      keyDisplayActiveEntryRef.current = null
      updateShiftPreview(false)
      ports.cancelActiveCanvasInteraction()
      cancelSampling()
      ports.hidePenCursor()
      if (ports.canvasRef.current) ports.canvasRef.current.style.cursor = canvasToolCursor(ports.session.tool === 'selection' && ports.session.selectionKind === 'brush' ? 'pencil' : ports.session.tool, ports.session.primaryColor)
    }
    const visibilityChange = (): void => {
      if (document.hidden) blur()
    }
    const focus = (): void => {
      cancelSampling()
      if (ports.canvasRef.current) ports.canvasRef.current.style.cursor = canvasToolCursor(ports.session.tool === 'selection' && ports.session.selectionKind === 'brush' ? 'pencil' : ports.session.tool, ports.session.primaryColor)
    }
    const unregisterKeyboard = registerCanvasKeyboard({
      isActive: () => useWorkspace.getState().activeId === ports.session.document.id,
      keyDown: (event) => {
        quickSelectChordKeyDown(event)
        keyDown(event)
      },
      keyUp,
      inactiveModifiers: (event) => {
        ports.inputRef.current.ctrlHeld = event.ctrlKey
        ports.inputRef.current.altHeld = event.altKey
        ports.inputRef.current.shiftHeld = event.shiftKey
      }
    })
    window.addEventListener('blur', blur)
    window.addEventListener('focus', focus)
    document.addEventListener('visibilitychange', visibilityChange)
    return () => {
      unregisterKeyboard()
      window.removeEventListener('blur', blur)
      window.removeEventListener('focus', focus)
      document.removeEventListener('visibilitychange', visibilityChange)
    }
  }, [
    ports.session.tool,
    ports.gradientType,
    ports.lineAnchor,
    ports.lineConnectionShortcut,
    ports.eyedropperQuickSelect,
    ports.keyDisplayEnabled,
    ports.keyDisplayDuration,
    ports.activeDocumentId,
    ports.shortcuts.brushSizeAdjust,
    ports.shortcuts.resetViewRotation,
    ports.shortcuts['tool.hand.quick'],
    ports.shortcuts['tool.eyedropper.quick'],
    ports.shortcutConflictState
  ])
  return { keyDisplayEntries, keyDisplayWheelRef }
}
