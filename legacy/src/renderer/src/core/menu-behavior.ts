import type { ExtensionBuiltInMenuId } from '@shared/types-extensions'

export const TOP_MENU_IDS = ['file', 'edit', 'select', 'canvas', 'layer', 'window', 'help'] as const satisfies readonly ExtensionBuiltInMenuId[]

export const nextTopMenuOnHover = (
  openMenu: string | null,
  hoveredMenu: string,
  availableMenuIds: readonly string[] = TOP_MENU_IDS
): string | null => {
  const topMenuIds = new Set(availableMenuIds)
  return openMenu && topMenuIds.has(openMenu) && topMenuIds.has(hoveredMenu) ? hoveredMenu : openMenu
}
