import {
  dispatchMouseDoubleClickShortcutInput,
  dispatchMouseShortcutInput,
  dispatchWheelShortcutInput,
  findShortcutBindingOwners,
  mouseDoubleClickShortcutText,
  mouseShortcutText,
  shortcutBindingBlocked,
  wheelShortcutText,
  type ShortcutId
} from '@/core/shortcuts'
import type { Options } from './app-shortcut-router-options'

type ConflictState = Parameters<typeof shortcutBindingBlocked>[0]

/** Tracks pointer shortcut presses until their matching release event. */
export function createMouseShortcutHandlers(
  shortcuts: Options['shortcuts'],
  conflicts: ConflictState,
  heldShortcutParts: Set<string>,
  activePointers: Set<number>,
  pendingDoubleClicks: Set<number>
) {
  const targetsShortcutRecorder = (target: EventTarget | null): boolean => target instanceof Element
    && Boolean(target.closest('[data-shortcut-recorder="true"]'))
  const targetsStageCanvas = (target: EventTarget | null): boolean => target instanceof Element
    && Boolean(target.closest('canvas.stage-canvas'))
  const hasBinding = (shortcut: string): boolean => findShortcutBindingOwners(shortcuts, shortcut).some((id: ShortcutId) => (
    !shortcutBindingBlocked(conflicts, id, shortcut)
  ))
  const pointerdown = (event: PointerEvent): void => {
    if (targetsShortcutRecorder(event.target) || !targetsStageCanvas(event.target)) return
    const shortcut = mouseShortcutText(event, heldShortcutParts)
    const assigned = hasBinding(shortcut)
    const doubleClickAssigned = event.button === 0 && hasBinding(mouseDoubleClickShortcutText(event, heldShortcutParts))
    if (!assigned && !doubleClickAssigned) return
    if (assigned) {
      dispatchMouseShortcutInput(event.target ?? window, event, 'keydown')
      activePointers.add(event.pointerId)
    } else {
      pendingDoubleClicks.add(event.pointerId)
    }
    event.preventDefault()
    event.stopPropagation()
  }
  const releasePointerShortcut = (event: PointerEvent): void => {
    const active = activePointers.delete(event.pointerId)
    const pendingDoubleClick = pendingDoubleClicks.delete(event.pointerId)
    if (!active && !pendingDoubleClick) return
    if (active) dispatchMouseShortcutInput(window, event, 'keyup')
    event.preventDefault()
    event.stopPropagation()
  }
  const auxclick = (event: MouseEvent): void => {
    if (targetsShortcutRecorder(event.target) || !targetsStageCanvas(event.target)) return
    const shortcut = mouseShortcutText(event, heldShortcutParts)
    if (!shortcut || !hasBinding(shortcut)) return
    event.preventDefault()
    event.stopPropagation()
  }
  const dblclick = (event: MouseEvent): void => {
    if (targetsShortcutRecorder(event.target) || !targetsStageCanvas(event.target)) return
    const shortcut = mouseDoubleClickShortcutText(event, heldShortcutParts)
    if (!hasBinding(shortcut)) return
    dispatchMouseDoubleClickShortcutInput(event.target ?? window, event)
    event.preventDefault()
    event.stopPropagation()
  }
  const contextmenu = (event: MouseEvent): void => {
    if (targetsShortcutRecorder(event.target) || !targetsStageCanvas(event.target)) return
    const shortcut = mouseShortcutText(event, heldShortcutParts)
    if (!shortcut || !hasBinding(shortcut)) return
    event.preventDefault()
    event.stopPropagation()
  }
  const wheel = (event: WheelEvent): void => {
    if (targetsShortcutRecorder(event.target) || !targetsStageCanvas(event.target)) return
    const shortcut = wheelShortcutText(event, event.deltaY, heldShortcutParts)
    if (!shortcut || !hasBinding(shortcut)) return
    dispatchWheelShortcutInput(event.target ?? window, event, event.deltaY)
    event.preventDefault()
    event.stopPropagation()
  }
  return { pointerdown, releasePointerShortcut, auxclick, dblclick, contextmenu, wheel }
}
