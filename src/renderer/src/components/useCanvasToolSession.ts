import { useEffect, useMemo, useState } from 'react'
import { useWorkspace, type DocumentSession } from '@/store/workspace'
import { deriveShortcutConflicts, loadShortcutBindings, matchingModifierShortcut, modifierShortcutHeldByBindings, shortcutBindingsFor } from '@/core/shortcuts'
import {
  CanvasInputState,
  brushLineConnectionOverridesTemporaryMove,
  selectionMarqueeUsesConstraint,
  selectionTransformModifiers,
  temporaryMoveToolAllowed
} from '@/core/canvas-input'
import { applyQuickToolTarget, quickToolNeedsContextualCanvasHandling } from '@/core/quick-tools'
import { currentQuickToolMatch, useQuickToolShortcut } from '@/components/useQuickToolShortcut'
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
  const [shortcuts, setShortcuts] = useState(loadShortcutBindings)

  const shortcutConflictState = useMemo(() => deriveShortcutConflicts(shortcuts), [shortcuts])

  const quickToolMatch = useQuickToolShortcut(shortcuts)

  const directQuickToolTarget = quickToolMatch && !quickToolNeedsContextualCanvasHandling(quickToolMatch.target) ? quickToolMatch.target : null

  // Keep inactive, resident stages out of the switch update. Only the stage
  // becoming active and the one being left need the active-session payload.
  const activeDocumentId = useWorkspace((state) => (state.activeId === ports.storedSession.document.id ? state.activeId : null))

  const activeToolSession = useWorkspace((state) =>
    state.activeId === ports.storedSession.document.id ? (state.sessions.find((item) => item.document.id === state.activeId) ?? null) : null
  )

  // Sessions are updated in place, so subscribe to the scalar that drives the
  // hover preview as well as the active session reference.
  const activeToolBrushSize = useWorkspace((state) => {
    if (state.activeId !== ports.storedSession.document.id) return null
    const active = state.sessions.find((item) => item.document.id === state.activeId)
    return active ? (active.tool === 'liquify' ? active.liquifyRadius : active.brushSize) : null
  })

  const localSession = applyQuickToolTarget(ports.storedSession, directQuickToolTarget)

  const session =
    activeToolSession && activeToolSession.document.id !== ports.storedSession.document.id
      ? shareCanvasToolSettings(localSession, applyQuickToolTarget(activeToolSession, directQuickToolTarget))
      : localSession

  const currentQuickTool = () => currentQuickToolMatch(shortcuts, shortcutConflictState)

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
    return temporaryTool ? { ...resolved, tool: temporaryTool } : resolved
  }

  const modifierActive = (event: Pick<KeyboardEvent, 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>, id: keyof typeof shortcuts): boolean =>
    modifierShortcutHeldByBindings(event, shortcuts[id] ?? [])

  const brushLineConnectionHasPriority = (
    event: Pick<KeyboardEvent, 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>,
    targetSession: DocumentSession = session
  ): boolean =>
    brushLineConnectionOverridesTemporaryMove(
      targetSession.tool,
      event,
      matchingModifierShortcut(event, shortcutBindingsFor(shortcuts, 'lineConnectionMode')),
      Boolean(targetSession.tool === 'eraser' ? targetSession.lastEraserPoint : targetSession.tool === 'pencil' ? targetSession.lastPencilPoint : null)
    )

  const temporaryMoveActive = (event: Pick<KeyboardEvent, 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>, targetSession: DocumentSession = session): boolean =>
    targetSession.freeTransformActive !== true &&
    !ports.radialGradientCenterModifierActive(targetSession, event) &&
    quickMoveToolActive() &&
    temporaryMoveToolAllowed(targetSession.tool, targetSession.moveKind) &&
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
      metaKey: false,
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
      metaKey: false,
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

  useEffect(() => {
    const refresh = (): void => setShortcuts(loadShortcutBindings())
    window.addEventListener('moonsprite:shortcuts-changed', refresh)
    return () => window.removeEventListener('moonsprite:shortcuts-changed', refresh)
  }, [])
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
