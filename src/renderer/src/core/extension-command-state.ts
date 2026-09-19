/**
 * Runtime command presentation state for extension contributions.
 *
 * Extension manifests are fixed at install time, so an extension that owns a
 * changing, mutually exclusive set of options (a pet pack, a theme slot) cannot
 * express "which one is active" declaratively. The runtime owner of that state
 * reports it through `window.setCommandState`, and the host menu renders it with
 * the same checkmark the built-in toggles use.
 *
 * State is presentation-only: it never changes which commands exist, and it is
 * resolved by extension id so one extension cannot style another's commands.
 */
export interface ExtensionCommandState {
  checked?: boolean
  visible?: boolean
}

export type ExtensionCommandStateListener = () => void

const commandStates = new Map<string, ExtensionCommandState>()
export interface ExtensionMenuItem { id: string; name: string; event: string; checked: boolean; dividerBefore?: boolean }
const menuNames = new Map<string, string>()
export const extensionMenuName = (extensionId: string, menuId: string): string | undefined => menuNames.get(commandStateKey(extensionId, menuId))
const menuItems = new Map<string, ExtensionMenuItem[]>()
export const extensionMenuItems = (extensionId: string, menuId: string): readonly ExtensionMenuItem[] =>
  menuItems.get(commandStateKey(extensionId, menuId)) ?? []

/** Runtime items belong only to an already declared menu in the owning extension. */
export const setExtensionMenuItems = (extensionId: string, menuId: string, items: unknown, name?: unknown): void => {
  if (name !== undefined && (typeof name !== 'string' || !name.trim() || name.length > 80)) throw new Error('菜单名称无效。')
  if (!Array.isArray(items) || items.length > 64) throw new Error('菜单最多包含 64 个选项。')
  const ids = new Set<string>()
  const next = items.map(item => {
    if (!item || typeof item !== 'object'
      || typeof item.id !== 'string' || !/^[a-zA-Z0-9._-]{1,80}$/.test(item.id)
      || typeof item.event !== 'string' || !/^[a-zA-Z0-9._-]{1,80}$/.test(item.event)
      || typeof item.name !== 'string' || !item.name.trim() || item.name.length > 80
      || (item.dividerBefore !== undefined && typeof item.dividerBefore !== 'boolean')
      || typeof item.checked !== 'boolean' || ids.has(item.id)) throw new Error('菜单选项无效或重复。')
    ids.add(item.id)
    return { id: item.id, name: item.name, event: item.event, checked: item.checked, ...(item.dividerBefore ? {dividerBefore: true} : {}) }
  })
  const key = commandStateKey(extensionId, menuId)
  const nameChanged = typeof name === 'string' && menuNames.get(key) !== name
  if (typeof name === 'string') menuNames.set(key, name)
  if (!nameChanged && JSON.stringify(menuItems.get(key) ?? []) === JSON.stringify(next)) return
  menuItems.set(key, next)
  notify()
}
const listeners = new Set<ExtensionCommandStateListener>()
let revision = 0

const commandStateKey = (extensionId: string, commandId: string): string =>
  `${extensionId}:${commandId}`

const notify = (): void => {
  revision += 1
  for (const listener of listeners) listener()
}

/** Monotonic revision for `useSyncExternalStore` consumers. */
export const extensionCommandStateRevision = (): number => revision

export const extensionCommandState = (extensionId: string, commandId: string): ExtensionCommandState =>
  commandStates.get(commandStateKey(extensionId, commandId)) ?? {}

export const isExtensionCommandChecked = (extensionId: string, commandId: string): boolean =>
  extensionCommandState(extensionId, commandId).checked === true

export const isExtensionCommandVisible = (extensionId: string, commandId: string): boolean =>
  extensionCommandState(extensionId, commandId).visible !== false

/**
 * Replace the state of one command. Fields left undefined keep their previous
 * value so a caller can update `checked` without disturbing `visible`.
 */
export const setExtensionCommandState = (
  extensionId: string,
  commandId: string,
  next: ExtensionCommandState
): void => {
  const key = commandStateKey(extensionId, commandId)
  const previous = commandStates.get(key) ?? {}
  const resolved: ExtensionCommandState = {
    checked: next.checked ?? previous.checked,
    visible: next.visible ?? previous.visible
  }
  if (resolved.checked === previous.checked && resolved.visible === previous.visible) return
  if (resolved.checked === undefined && resolved.visible === undefined) commandStates.delete(key)
  else commandStates.set(key, resolved)
  notify()
}

/** Drop every command state belonging to an extension that stopped running. */
export const clearExtensionCommandState = (extensionId: string): void => {
  const prefix = `${extensionId}:`
  let removed = false
  for (const key of [...menuNames.keys()]) { if (key.startsWith(prefix)) { menuNames.delete(key); removed = true } }
  for (const key of [...menuItems.keys()]) {
    if (!key.startsWith(prefix)) continue
    menuItems.delete(key)
    removed = true
  }
  for (const key of [...commandStates.keys()]) {
    if (!key.startsWith(prefix)) continue
    commandStates.delete(key)
    removed = true
  }
  if (removed) notify()
}

export const subscribeExtensionCommandState = (listener: ExtensionCommandStateListener): (() => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
