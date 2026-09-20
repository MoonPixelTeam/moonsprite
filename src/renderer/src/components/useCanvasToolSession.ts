import { withDeviceTemporaryTool } from './canvas-device-tools'
import { useWorkspace, type DocumentSession } from '@/store/workspace'
import { modifierShortcutHeldByBindings, shortcutBindingsFor, shortcutHeldByKeyParts } from '@/core/shortcuts'
import {
  CanvasInputState,
  selectionMarqueeUsesConstraint,
  selectionTransformModifiers,
  temporaryMoveToolAllowed
} from '@/core/canvas-input'
import { applyQuickToolTarget, quickToolNeedsContextualCanvasHandling } from '@/core/quick-tools'
import { currentHeldShortcutKeyParts, currentQuickToolMatch, quickToolConflictsFor, useQuickToolShortcut } from '@/components/useQuickToolShortcut'
import { useCanvasShortcutBindings } from './useCanvasShortcutBindings'
import { shareCanvasToolSettings } from './canvas-stage-helpers'
interface Ports {
  readonly storedSession: DocumentSession
  readonly inputRef: import('react').RefObject<CanvasInputState>
  readonly radialGradientCenterModifierActive: (targetSession: DocumentSession, event: Pick<KeyboardEvent, 'ctrlKey' | 'metaKey'>) => boolean
  readonly canvasResizePreviewRef: import('react').RefObject<import('@/store/workspace').CanvasResizePreview | null>
  readonly lineAnchor: {
    x: number
    y: number
  } | null
}

export function useCanvasToolSession(ports: Ports) {
  const shortcuts = useCanvasShortcutBindings()

  const shortcutConflictState = quickToolConflictsFor(shortcuts)

  const heldQuickToolMatch = useQuickToolShortcut(shortcuts)
  const brushSizingHeld = (current: DocumentSession): boolean =>
    ['pencil', 'line', 'airbrush', 'eraser', 'smooth', 'liquify'].includes(current.tool) &&
    shortcutBindingsFor(shortcuts, 'brushSizeAdjust').some((binding) => shortcutHeldByKeyParts(currentHeldShortcutKeyParts(), binding))
  const quickToolMatch = brushSizingHeld(ports.storedSession) ? null : heldQuickToolMatch

  const directQuickToolTarget = quickToolMatch && !quickToolNeedsContextualCanvasHandling(quickToolMatch.target) ? quickToolMatch.target : null

  // Only the stage becoming active and the one being left need a switch update.
  const activeDocumentId = useWorkspace((state) => (state.activeId === ports.storedSession.document.id ? state.activeId : null))

  // Sessions are updated in place, so subscribe to the scalar that drives the
  // hover preview as well as the active session reference.
  const activeToolBrushSize = useWorkspace((state) => {
    if (state.activeId !== ports.storedSession.document.id) return null
    const active = state.sessions.find((item) => item.document.id === state.activeId)
    return active ? (active.tool === 'liquify' ? active.liquifyRadius : active.brushSize) : null
  })

  const session = applyQuickToolTarget(ports.storedSession, directQuickToolTarget)

  const currentQuickTool = () => brushSizingHeld(ports.storedSession) ? null : currentQuickToolMatch(shortcuts, shortcutConflictState)

  const quickToolActive = (tool: DocumentSession['tool']): boolean => currentQuickTool()?.target.tool === tool

  const quickMoveToolActive = (): boolean => currentQuickTool()?.id === 'tool.move.quick'

  const sessionWithActiveQuickTool = (current: DocumentSession): DocumentSession => {
    const match = currentQuickTool()
    return applyQuickToolTarget(current, match && !quickToolNeedsContextualCanvasHandling(match.target) ? match.target : null)
  }

  const sharedCanvasSession = (current: DocumentSession): DocumentSession => {
    const state = useWorkspace.getState()
    const active = state.sessions.find((item) => item.document.id === state.activeId)
    return active && active.document.id !== current.document.id ? shareCanvasToolSettings(current, sessionWithActiveQuickTool(active)) : current
  }

  const liveInputSession = (): DocumentSession => {
    const current = useWorkspace.getState().sessions.find((item) => item.document.id === ports.storedSession.document.id)
    if (!current) return session
    const resolved = sessionWithActiveQuickTool(sharedCanvasSession(current))
    const temporaryTool = ports.inputRef.current.temporaryTool
    return withDeviceTemporaryTool(resolved, temporaryTool, ports.inputRef.current.temporaryRightClickAction)
  }

  const modifierActive = (event: Pick<KeyboardEvent, 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>, id: keyof typeof shortcuts): boolean =>
    modifierShortcutHeldByBindings(event, shortcuts[id] ?? [], currentHeldShortcutKeyParts())

  const brushLineConnectionHasPriority = (
    event: Pick<KeyboardEvent, 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>,
    targetSession: DocumentSession = session
  ): boolean =>
    Boolean(targetSession.tool === 'eraser' ? targetSession.lastEraserPoint : targetSession.tool === 'pencil' ? targetSession.lastPencilPoint : null) &&
    modifierActive(event, 'lineConnectionMode')

  const temporaryMoveActive = (event: Pick<KeyboardEvent, 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>, targetSession: DocumentSession = session): boolean =>
    targetSession.freeTransformActive !== true &&
    !ports.radialGradientCenterModifierActive(targetSession, event) &&
    quickMoveToolActive() &&
    temporaryMoveToolAllowed(targetSession.tool, targetSession.moveKind, targetSession.selectionKind) &&
    !brushLineConnectionHasPriority(event, targetSession)

  const selectionTransformModifierState = (event: Pick<KeyboardEvent, 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>) =>
    selectionTransformModifiers({
      ctrlKey: modifierActive(event, 'integerSelectionScale'),
      altKey: event.altKey,
      shiftKey: modifierActive(event, 'proportionalSelectionTransform'),
      proportionalLocked: session.selectionAspectRatio != null
    })

  const currentSelectionTransformModifierState = () =>
    selectionTransformModifierState({
      ctrlKey: ports.inputRef.current.ctrlHeld,
      metaKey: currentHeldShortcutKeyParts().has('Win'),
      altKey: ports.inputRef.current.altHeld,
      shiftKey: ports.inputRef.current.shiftHeld
    })

  const selectionMarqueeModifierState = (event: Pick<KeyboardEvent, 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>) => {
    const activeDrag = ports.inputRef.current.drag
    const proportional =
      activeDrag?.kind === 'marquee'
        ? selectionMarqueeUsesConstraint(
            event,
            Boolean(activeDrag.selectionStart),
            activeDrag.selectionMode ?? session.selectionMode,
            activeDrag.marqueeAngle !== undefined
          )
        : event.shiftKey
    return {
      fromCenter: Boolean(event.ctrlKey || event.metaKey),
      proportional,
      rotate: event.altKey
    }
  }

  const currentSelectionMarqueeModifierState = () =>
    selectionMarqueeModifierState({
      ctrlKey: ports.inputRef.current.ctrlHeld,
      metaKey: currentHeldShortcutKeyParts().has('Win'),
      altKey: ports.inputRef.current.altHeld,
      shiftKey: ports.inputRef.current.shiftHeld
    })

  const lineConnectionShortcut = shortcutBindingsFor(shortcuts, 'lineConnectionMode').join('|')

  const lineConnectionConfigured = shortcutBindingsFor(shortcuts, 'lineConnectionMode').length > 0

  const lineConnectionActive = (event: Pick<KeyboardEvent, 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>): boolean =>
    lineConnectionConfigured && modifierActive(event, 'lineConnectionMode')

  const lineConnectionPreviewActive = (event: Pick<KeyboardEvent, 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>): boolean =>
    Boolean(
      !ports.inputRef.current.drag &&
        !ports.inputRef.current.sampling &&
        !ports.inputRef.current.spaceHeld &&
        !ports.canvasResizePreviewRef.current &&
        (session.tool === 'pencil' || session.tool === 'eraser') &&
        ports.lineAnchor &&
        lineConnectionActive(event)
    )

  return {
    shortcuts,
    shortcutConflictState,
    quickToolMatch,
    activeDocumentId,
    activeToolBrushSize,
    session,
    quickToolActive,
    quickMoveToolActive,
    sessionWithActiveQuickTool,
    sharedCanvasSession,
    liveInputSession,
    modifierActive,
    brushLineConnectionHasPriority,
    temporaryMoveActive,
    selectionTransformModifierState,
    currentSelectionTransformModifierState,
    selectionMarqueeModifierState,
    currentSelectionMarqueeModifierState,
    lineConnectionShortcut,
    lineConnectionConfigured,
    lineConnectionActive,
    lineConnectionPreviewActive
  }
}
