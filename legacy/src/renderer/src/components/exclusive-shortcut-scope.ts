interface ExclusiveScope {
  keyDown(event: KeyboardEvent): void
  keyUp?(event: KeyboardEvent): void
}
export const EXCLUSIVE_SHORTCUT_SCOPE_CHANGED = 'moonsprite:exclusive-shortcut-scope-changed'
const scopes: ExclusiveScope[] = []
export const hasExclusiveShortcutScope = () => scopes.length > 0
export function registerExclusiveShortcutScope(scope: ExclusiveScope): () => void {
  scopes.push(scope)
  window.dispatchEvent(new Event(EXCLUSIVE_SHORTCUT_SCOPE_CHANGED))
  return () => { const index = scopes.indexOf(scope); if (index >= 0) { scopes.splice(index, 1); window.dispatchEvent(new Event(EXCLUSIVE_SHORTCUT_SCOPE_CHANGED)) } }
}
// Imported by the app router before its effects register global command listeners.
// Stop at window capture so background tool and component listeners never see these keys.
if (typeof window !== 'undefined') {
  window.addEventListener('keydown', event => {
    const scope = scopes[scopes.length - 1]
    if (!scope) return
    event.stopImmediatePropagation()
    scope.keyDown(event)
  }, true)
  window.addEventListener('keyup', event => {
    const scope = scopes[scopes.length - 1]
    if (!scope) return
    event.stopImmediatePropagation()
    scope.keyUp?.(event)
  }, true)
}
