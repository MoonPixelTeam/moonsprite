import type { ExtensionBuiltInMenuId, ExtensionMenuItemPosition, StoredExtension, StoredExtensionCommand, StoredExtensionMenuItem, StoredExtensionPanel, StoredExtensionTool, StoredExtensionTopMenu } from '@shared/types-extensions'
import { readStoredString, writeStoredString } from './storage'

const EXTENSION_PANEL_VISIBILITY_PREFIX = 'moonsprite.extension-panel-visible.v1.'

export interface ExtensionPanelContribution {
  key: string
  extensionId: string
  extensionName: string
  panel: StoredExtensionPanel
  commands: StoredExtensionCommand[]
}

export interface ExtensionMenuItemContribution {
  key: string
  extensionId: string
  extensionName: string
  menuItem: StoredExtensionMenuItem
  commands: StoredExtensionCommand[]
}

export interface ExtensionTopMenuContribution {
  key: string
  openMenuId: string
  extensionId: string
  extensionName: string
  topMenu: StoredExtensionTopMenu
  commands: StoredExtensionCommand[]
}

export interface ExtensionToolContribution {
  key: string
  extensionId: string
  extensionName: string
  tool: StoredExtensionTool
}

export const extensionCommandScriptId = (extensionId: string, commandId: string): string =>
  `extension:${extensionId}:${commandId}`

export const extensionPanelKey = (extensionId: string, panelId: string): string =>
  `${extensionId}:${panelId}`

export const extensionMenuItemKey = (extensionId: string, menuItemId: string): string =>
  `${extensionId}:menu-item:${menuItemId}`

export const extensionTopMenuKey = (extensionId: string, topMenuId: string): string =>
  `extension-menu:${extensionId}:${topMenuId}`

export const extensionToolKey = (extensionId: string, toolId: string): string =>
  `${extensionId}:tool:${toolId}`

export const listExtensionToolContributions = (extensions: StoredExtension[]): ExtensionToolContribution[] =>
  extensions.flatMap((extension) => (extension.enabled ? (extension.tools ?? []).map((tool) => ({
    key: extensionToolKey(extension.id, tool.id),
    extensionId: extension.id,
    extensionName: extension.name,
    tool
  })) : []))

let activeToolContributions = new Map<string, ExtensionToolContribution>()

export const publishExtensionToolContributions = (contributions: ExtensionToolContribution[]): void => {
  activeToolContributions = new Map(contributions.map((contribution) => [contribution.key, contribution]))
}

export const extensionToolContributionFor = (key: string | null): ExtensionToolContribution | null =>
  key ? activeToolContributions.get(key) ?? null : null

const extensionPanelVisibilityStorageKey = (panelKey: string): string =>
  `${EXTENSION_PANEL_VISIBILITY_PREFIX}${panelKey}`

export const listExtensionPanelContributions = (extensions: StoredExtension[]): ExtensionPanelContribution[] =>
  extensions.flatMap((extension) => {
    if (!extension.enabled) return []
    const commands = new Map(extension.commands.map((command) => [command.id, command]))
    return extension.panels.map((panel) => ({
      key: extensionPanelKey(extension.id, panel.id),
      extensionId: extension.id,
      extensionName: extension.name,
      panel,
      commands: panel.commands.flatMap((id) => {
        const command = commands.get(id)
        return command ? [command] : []
      })
    }))
  })

export const listExtensionMenuItemContributions = (extensions: StoredExtension[]): ExtensionMenuItemContribution[] =>
  extensions.flatMap((extension) => {
    if (!extension.enabled) return []
    const commands = new Map(extension.commands.map((command) => [command.id, command]))
    return extension.menuItems.map((menuItem) => ({
      key: extensionMenuItemKey(extension.id, menuItem.id),
      extensionId: extension.id,
      extensionName: extension.name,
      menuItem,
      commands: menuItem.commands.flatMap((id) => {
        const command = commands.get(id)
        return command ? [command] : []
      })
    }))
  })

export const listExtensionTopMenuContributions = (extensions: StoredExtension[]): ExtensionTopMenuContribution[] =>
  extensions.flatMap((extension) => {
    if (!extension.enabled) return []
    const commands = new Map(extension.commands.map((command) => [command.id, command]))
    return extension.topMenus.map((topMenu) => ({
      key: extensionTopMenuKey(extension.id, topMenu.id),
      openMenuId: extensionTopMenuKey(extension.id, topMenu.id),
      extensionId: extension.id,
      extensionName: extension.name,
      topMenu,
      commands: topMenu.commands.flatMap((id) => {
        const command = commands.get(id)
        return command ? [command] : []
      })
    }))
  })

export const extensionMenuItemsAt = (
  contributions: ExtensionMenuItemContribution[],
  menu: ExtensionBuiltInMenuId,
  position: ExtensionMenuItemPosition
): ExtensionMenuItemContribution[] => contributions.filter((contribution) =>
  contribution.menuItem.menu === menu && contribution.menuItem.position === position)

export const arrangeExtensionTopMenuIds = (
  builtInMenuIds: readonly ExtensionBuiltInMenuId[],
  contributions: ExtensionTopMenuContribution[]
): string[] => {
  const at = (position: string): string[] => contributions
    .filter((contribution) => contribution.topMenu.position === position)
    .map((contribution) => contribution.openMenuId)
  const ordered = [
    ...at('start'),
    ...builtInMenuIds.flatMap((menuId) => [
      ...at(`before:${menuId}`),
      menuId,
      ...at(`after:${menuId}`)
    ]),
    ...at('end')
  ]
  return ordered.filter((id, index) => ordered.indexOf(id) === index)
}

export const reconcileExtensionPanelVisibility = (
  extensions: StoredExtension[],
  current: Record<string, boolean>,
  storage?: Storage
): Record<string, boolean> => Object.fromEntries(listExtensionPanelContributions(extensions).map(({ key, panel }) => {
  if (Object.hasOwn(current, key)) return [key, current[key]]
  const stored = readStoredString(extensionPanelVisibilityStorageKey(key), storage)
  return [key, stored === null ? panel.defaultVisible : stored === 'true']
}))

export const saveExtensionPanelVisibility = (panelKey: string, visible: boolean, storage?: Storage): void => {
  writeStoredString(extensionPanelVisibilityStorageKey(panelKey), String(visible), storage)
}
