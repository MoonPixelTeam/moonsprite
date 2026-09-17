import type { AppShortcutContext } from './app-shortcut-context'
import { handleSelectionShortcuts } from './app-selection-shortcuts'
import { handleDocumentShortcuts } from './app-document-shortcuts'
import { handleLayersShortcuts } from './app-layers-shortcuts'
import { handleViewShortcuts } from './app-view-shortcuts'
import { createToolShortcutHandler } from './app-tools-shortcuts'
import { handleCompletionShortcuts } from './app-completion-shortcuts'
import { useEffect, useRef } from 'react'
import { animationFrameStepDirection, type EditorCommandScope } from '@/core/command-context'
import { adjacentFormInput } from '@/core/form-focus'
import { QUICK_TOOL_SHORTCUT_IDS, deriveShortcutConflicts, dispatchMouseDoubleClickShortcutInput, dispatchMouseShortcutInput, dispatchWheelShortcutInput, findShortcutBindingOwners, keyboardEventKey, loadShortcutBindings, mouseDoubleClickShortcutText, mouseShortcutText, shortcutBindingBlocked, shortcutBindingsFor, shortcutKeyPart, shortcutMatchesEvent, shortcutReleasedByBindings, shortcutText, wheelShortcutText, type ShortcutId } from '@/core/shortcuts'
import { beginPaletteSamplingShortcut, endPaletteSamplingShortcut } from '@/core/palette-sampling-shortcut'
import { deferCanvasShortcut, isCanvasToolGestureLocked } from '@/core/canvas-tool-gesture-lock'
import { useWorkspace } from '@/store/workspace'
import { useI18n } from '@/components/I18nProvider'

interface Options {
  pointerPosition: () => { x: number; y: number } | null
  commandSurface: () => HTMLElement | null
  rotationIndicatorPosition: import('@/core/file-preferences').RotationIndicatorPosition
  shortcuts: ReturnType<typeof loadShortcutBindings>
  homeOpen: boolean
  outlineOpen: boolean
  openMenu: boolean
  shortcutOpen: boolean
  timelineHidden: boolean
  commandScope(): EditorCommandScope
  selectionOverride(): boolean
  onEscape(event: KeyboardEvent): void
  commands: AppShortcutContext['uiCommands']
  openAdjustment: AppShortcutContext['openAdjustment']
  publishShortcutCommand: AppShortcutContext['publishShortcutCommand']
}

const heldCanvasShortcutIds = new Set<ShortcutId>(['addForegroundToPalette', ...QUICK_TOOL_SHORTCUT_IDS])

/** Owns held input, mouse shortcut lifetimes and ordered command routing. */
export function useAppShortcutRouter(options: Options) {
  const optionsRef = useRef(options)
  optionsRef.current = options
  const { t } = useI18n()
  const translationRef = useRef(t)
  translationRef.current = t
  const toolHandler = useRef(createToolShortcutHandler())
  const activeMouseShortcutPointersRef = useRef(new Set<number>())
  const pendingDoubleClickShortcutPointersRef = useRef(new Set<number>())
  useEffect(() => {
    const { shortcuts } = options
    const shortcutConflictState = deriveShortcutConflicts(shortcuts)
    const heldShortcutParts = new Set<string>()
    const keydown = (event: KeyboardEvent): void => {
      const {pointerPosition, commandSurface, rotationIndicatorPosition, homeOpen, outlineOpen, openMenu, shortcutOpen, timelineHidden, commandScope, selectionOverride, commands: uiCommands, openAdjustment, publishShortcutCommand} = optionsRef.current
      const workspace = useWorkspace.getState()
      const session = workspace.sessions.find(item => item.document.id === workspace.activeId) ?? null
      const t = translationRef.current

      heldShortcutParts.add(shortcutKeyPart(event))

      const key = keyboardEventKey(event).toLowerCase()

      // Deferred shortcuts can replay on window after their original target disappears.
      const target = event.target instanceof HTMLElement ? event.target : null

      if (shortcutOpen && target?.closest('[data-shortcut-recorder="true"]')) return

      const matches = (action: ShortcutId): boolean => {
        return shortcutBindingsFor(shortcuts, action).some((shortcut) => (
        !shortcutBindingBlocked(shortcutConflictState, action, shortcut)
        && shortcutMatchesEvent(event, shortcut, heldShortcutParts)
        ))
      }

      if (key === 'escape') { optionsRef.current.onEscape(event); return }
      if (key === 'tab') {
        const nextInput = adjacentFormInput(event.target, event.shiftKey)
        if (nextInput) {
          event.preventDefault()
          event.stopPropagation()
          nextInput.focus()
          nextInput.select()
          return
        }
      }

      if (key === 'enter' && outlineOpen) return

      if (key === 'alt') event.preventDefault()

      const commandKey = event.ctrlKey || event.metaKey

      const inputType = target?.tagName === 'INPUT' ? (target as HTMLInputElement).type : ''

      const isTextEntry = Boolean(target?.isContentEditable)
      || target?.tagName === 'TEXTAREA'
      || target?.tagName === 'SELECT'
      || (target?.tagName === 'INPUT' && !['range', 'number', 'checkbox', 'radio', 'button', 'submit', 'reset'].includes(inputType))

      const isHeldKey = key === 'control' || key === 'meta' || key === 'alt' || key === 'shift' || key === 'space'

      if (isCanvasToolGestureLocked() && !isTextEntry && !isHeldKey) {
        const deferredOwners = findShortcutBindingOwners(shortcuts, shortcutText(event, heldShortcutParts)).filter((id) => (
        !heldCanvasShortcutIds.has(id) && !shortcutBindingBlocked(shortcutConflictState, id, shortcutText(event, heldShortcutParts))
        ))
        if (deferredOwners.length > 0) {
          const originalTarget = event.target
          const originalDocumentId = useWorkspace.getState().activeId
          const init: KeyboardEventInit = {
            key: event.key,
            code: event.code,
            location: event.location,
            ctrlKey: event.ctrlKey,
            metaKey: event.metaKey,
            altKey: event.altKey,
            shiftKey: event.shiftKey,
            bubbles: true,
            cancelable: true,
            composed: true
          }
          deferCanvasShortcut(() => {
            if (useWorkspace.getState().activeId !== originalDocumentId) return
            const replayTarget = originalTarget instanceof Node && originalTarget.isConnected ? originalTarget : window
            replayTarget.dispatchEvent(new KeyboardEvent('keydown', init))
            replayTarget.dispatchEvent(new KeyboardEvent('keyup', init))
          })
          event.preventDefault()
          event.stopImmediatePropagation()
          return
        }
      }

      if (matches('advancedMode')) {
        event.preventDefault()
        event.stopPropagation()
        if (session && !homeOpen && !isTextEntry && !event.repeat) {
          uiCommands.advancedMode?.()
        }
        return
      }

      if (matches('fillForeground') && !isTextEntry) {
        event.preventDefault()
        event.stopPropagation()
        target?.blur()
        if (!event.repeat) workspace.fillForeground()
        return
      }

      if (matches('addForegroundToPalette') && !isTextEntry) {
        event.preventDefault()
        event.stopPropagation()
        target?.blur()
        if (session && !event.repeat) beginPaletteSamplingShortcut()
        return
      }

      if (matches('transform') && !isTextEntry) {
        event.preventDefault()
        event.stopPropagation()
        if (!event.repeat) {
          workspace.beginLayerTransform()
        }
        return
      }

      if (!isTextEntry && (matches('undo') || matches('redo'))) {
        event.preventDefault()
        event.stopPropagation()
        matches('undo') ? workspace.undo() : workspace.redo()
        return
      }

      if (target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.tagName === 'SELECT') return

      const keyboardSurfaceBlocked = event.defaultPrevented || Boolean(document.querySelector('.modal-backdrop')) || Boolean(openMenu)

      const activeTextLayer = session?.tool === 'text' && session.selectedGroupIds.length === 0
      ? session.document.layers.find((layer) => layer.id === session.document.activeLayerId && layer.kind === 'text')
      : null

      const textNudgeKey = key === 'arrowleft' ? { x: -1, y: 0 }
      : key === 'arrowright' ? { x: 1, y: 0 }
      : key === 'arrowup' ? { x: 0, y: -1 }
      : key === 'arrowdown' ? { x: 0, y: 1 }
      : null

      const textNudgeBlocked = Boolean(target?.closest('[contenteditable="true"], .modal-backdrop, .themed-select'))

      if (activeTextLayer && textNudgeKey && !textNudgeBlocked && !event.ctrlKey && !event.metaKey && !event.altKey) {
        event.preventDefault()
        event.stopImmediatePropagation()
        workspace.moveLayerBy(activeTextLayer.id, textNudgeKey.x, textNudgeKey.y)
        return
      }

      if (!keyboardSurfaceBlocked && session && !session.selection
      && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey
      && (key === 'arrowup' || key === 'arrowdown')) {
        event.preventDefault()
        event.stopPropagation()
        workspace.stepLayerSelection(key === 'arrowup' ? -1 : 1)
        return
      }

      const frameStep = animationFrameStepDirection({ key, hasSelection: Boolean(session?.selection), ctrlKey: event.ctrlKey, metaKey: event.metaKey, shiftKey: event.shiftKey, altKey: event.altKey })

      if (!keyboardSurfaceBlocked && frameStep && !timelineHidden && session?.document.animation && session.document.animation.frames.length > 1) {
        event.preventDefault()
        event.stopPropagation()
        if (session.animationPlaying) workspace.pauseAnimationAtCurrentFrame()
        else workspace.stepAnimationFrame(frameStep)
        return
      }

      const runCommand = (action: ShortcutId, command: () => void, allowRepeat = false): boolean => {
        if (!matches(action)) return false
        event.preventDefault()
        event.stopPropagation()
        if (allowRepeat || !event.repeat) command()
        return true
      }

      const adjustBrushSize = (delta: number): void => {
        if (!session) return
        if (session.tool === 'airbrush') workspace.setAirbrushScatterRadius(session.airbrushScatterRadius + delta)
        else if (session.tool === 'liquify') workspace.setLiquifyRadius(session.liquifyRadius + delta)
        else workspace.setBrushSize(session.brushSize + delta)
      }
      const context: AppShortcutContext = {pointerPosition, commandSurface, rotationIndicatorPosition, event, heldShortcutParts, key, target, commandKey, isTextEntry, keyboardSurfaceBlocked, workspace, session, t, matches, runCommand, adjustBrushSize, homeOpen, outlineOpen, timelineHidden, commandScope, selectionOverride, uiCommands, openAdjustment, publishShortcutCommand}
      if (handleSelectionShortcuts(context)) return
      if (handleDocumentShortcuts(context)) return
      if (handleLayersShortcuts(context)) return
      if (handleViewShortcuts(context)) return
      if (toolHandler.current(context)) return
      if (handleCompletionShortcuts(context)) return
    }
    const keyup = (event: KeyboardEvent): void => {
      if (event.key === 'Alt') event.preventDefault()
      if (shortcutReleasedByBindings(event, shortcutBindingsFor(shortcuts, 'addForegroundToPalette'))) endPaletteSamplingShortcut()
      heldShortcutParts.delete(shortcutKeyPart(event))
    }
    const targetsShortcutRecorder = (target: EventTarget | null): boolean => target instanceof Element
    && Boolean(target.closest('[data-shortcut-recorder="true"]'))
    const targetsStageCanvas = (target: EventTarget | null): boolean => target instanceof Element
    && Boolean(target.closest('canvas.stage-canvas'))
    const hasMouseShortcutBinding = (shortcut: string): boolean => findShortcutBindingOwners(shortcuts, shortcut).some((id) => (
    !shortcutBindingBlocked(shortcutConflictState, id, shortcut)
    ))
    const pointerdown = (event: PointerEvent): void => {
      if (targetsShortcutRecorder(event.target) || !targetsStageCanvas(event.target)) return
      const shortcut = mouseShortcutText(event, heldShortcutParts)
      const assigned = hasMouseShortcutBinding(shortcut)
      const doubleClickAssigned = event.button === 0 && hasMouseShortcutBinding(mouseDoubleClickShortcutText(event, heldShortcutParts))
      if (!assigned && !doubleClickAssigned) return
      if (assigned) {
        dispatchMouseShortcutInput(event.target ?? window, event, 'keydown')
        activeMouseShortcutPointersRef.current.add(event.pointerId)
      } else {
        pendingDoubleClickShortcutPointersRef.current.add(event.pointerId)
      }
      event.preventDefault()
      event.stopPropagation()
    }
    const releasePointerShortcut = (event: PointerEvent): void => {
      const active = activeMouseShortcutPointersRef.current.delete(event.pointerId)
      const pendingDoubleClick = pendingDoubleClickShortcutPointersRef.current.delete(event.pointerId)
      if (!active && !pendingDoubleClick) return
      if (active) dispatchMouseShortcutInput(window, event, 'keyup')
      event.preventDefault()
      event.stopPropagation()
    }
    const auxclick = (event: PointerEvent): void => {
      if (targetsShortcutRecorder(event.target) || !targetsStageCanvas(event.target)) return
      const shortcut = mouseShortcutText(event, heldShortcutParts)
      if (!shortcut || !hasMouseShortcutBinding(shortcut)) return
      event.preventDefault()
      event.stopPropagation()
    }
    const dblclick = (event: MouseEvent): void => {
      if (targetsShortcutRecorder(event.target) || !targetsStageCanvas(event.target)) return
      const shortcut = mouseDoubleClickShortcutText(event, heldShortcutParts)
      if (!hasMouseShortcutBinding(shortcut)) return
      dispatchMouseDoubleClickShortcutInput(event.target ?? window, event)
      event.preventDefault()
      event.stopPropagation()
    }
    const contextmenu = (event: MouseEvent): void => {
      if (targetsShortcutRecorder(event.target) || !targetsStageCanvas(event.target)) return
      const shortcut = mouseShortcutText(event, heldShortcutParts)
      if (!shortcut || !hasMouseShortcutBinding(shortcut)) return
      event.preventDefault()
      event.stopPropagation()
    }
    const wheel = (event: WheelEvent): void => {
      if (targetsShortcutRecorder(event.target) || !targetsStageCanvas(event.target)) return
      const shortcut = wheelShortcutText(event, event.deltaY, heldShortcutParts)
      if (!shortcut || !hasMouseShortcutBinding(shortcut)) return
      dispatchWheelShortcutInput(event.target ?? window, event, event.deltaY)
      event.preventDefault()
      event.stopPropagation()
    }
    const blur = (): void => {
      heldShortcutParts.clear()
      activeMouseShortcutPointersRef.current.clear()
      pendingDoubleClickShortcutPointersRef.current.clear()
      endPaletteSamplingShortcut()
    }
    window.addEventListener('keydown', keydown, true)
    window.addEventListener('keyup', keyup, true)
    window.addEventListener('pointerdown', pointerdown, true)
    window.addEventListener('pointerup', releasePointerShortcut, true)
    window.addEventListener('pointercancel', releasePointerShortcut, true)
    window.addEventListener('auxclick', auxclick, true)
    window.addEventListener('dblclick', dblclick, true)
    window.addEventListener('contextmenu', contextmenu, true)
    window.addEventListener('wheel', wheel, { capture: true, passive: false })
    window.addEventListener('blur', blur)
    return () => {
      blur()
      window.removeEventListener('keydown', keydown, true)
      window.removeEventListener('keyup', keyup, true)
      window.removeEventListener('pointerdown', pointerdown, true)
      window.removeEventListener('pointerup', releasePointerShortcut, true)
      window.removeEventListener('pointercancel', releasePointerShortcut, true)
      window.removeEventListener('auxclick', auxclick, true)
      window.removeEventListener('dblclick', dblclick, true)
      window.removeEventListener('contextmenu', contextmenu, true)
      window.removeEventListener('wheel', wheel, true)
      window.removeEventListener('blur', blur)
    }
  }, [options.shortcuts])
}
