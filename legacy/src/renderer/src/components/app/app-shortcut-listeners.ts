import { EXCLUSIVE_SHORTCUT_SCOPE_CHANGED } from '../exclusive-shortcut-scope'

interface Handlers {
  keydown(event: KeyboardEvent): void
  keyup(event: KeyboardEvent): void
  pointerdown(event: PointerEvent): void
  releasePointerShortcut(event: PointerEvent): void
  auxclick(event: MouseEvent): void
  dblclick(event: MouseEvent): void
  contextmenu(event: MouseEvent): void
  wheel(event: WheelEvent): void
  blur(): void
}
/** Keep event lifetimes and held-state reset separate from command routing. */
export function registerAppShortcutListeners(handlers: Handlers): () => void {
  const listeners: [string, EventListener][] = [
    ['keydown', handlers.keydown as EventListener], ['keyup', handlers.keyup as EventListener],
    ['pointerdown', handlers.pointerdown as EventListener], ['pointerup', handlers.releasePointerShortcut as EventListener],
    ['pointercancel', handlers.releasePointerShortcut as EventListener], ['auxclick', handlers.auxclick as EventListener],
    ['dblclick', handlers.dblclick as EventListener], ['contextmenu', handlers.contextmenu as EventListener],
    ['wheel', handlers.wheel as EventListener]
  ]
  for (const [name, listener] of listeners) window.addEventListener(name, listener, { capture: true, passive: false })
  window.addEventListener('blur', handlers.blur)
  window.addEventListener(EXCLUSIVE_SHORTCUT_SCOPE_CHANGED, handlers.blur)
  return () => {
    handlers.blur()
    for (const [name, listener] of listeners) window.removeEventListener(name, listener, true)
    window.removeEventListener('blur', handlers.blur)
    window.removeEventListener(EXCLUSIVE_SHORTCUT_SCOPE_CHANGED, handlers.blur)
  }
}
