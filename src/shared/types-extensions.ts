export interface LuaScriptEntry {
  id: string
  name: string
  filePath: string
  extensionId?: string
  extensionName?: string
  extensionCommandId?: string
  extensionDescription?: string
}

export interface LuaScriptListing {
  directoryPath: string
  scripts: LuaScriptEntry[]
}

export interface StoredExtension {
  id: string
  name: string
  version: string
  description: string
  author: string
  apiVersion?: string
  entry?: string
  commands: StoredExtensionCommand[]
  panels: StoredExtensionPanel[]
  menuItems: StoredExtensionMenuItem[]
  topMenus: StoredExtensionTopMenu[]
  /** Declarative tools exposed by the extension host. */
  tools?: StoredExtensionTool[]
  filePath: string
  enabled: boolean
}

export type ExtensionToolKind = 'remote-pixel-brush'

export type ExtensionToolPlacement = 'pencil'

export interface StoredExtensionToolMode {
  id: string
  name: string
  description: string
}

/**
 * A host-owned interactive tool. Extensions describe the contribution; the
 * renderer owns the interaction and document mutation implementation.
 */
export interface StoredExtensionTool {
  id: string
  name: string
  description: string
  kind: ExtensionToolKind
  placement: ExtensionToolPlacement
  icon: string
  modes: StoredExtensionToolMode[]
  defaultMode: string
  previewColor: string
}

export interface StoredExtensionCommand {
  id: string
  name: string
  description: string
  entry: string
}

export interface StoredExtensionPanel {
  id: string
  name: string
  description: string
  defaultVisible: boolean
  commands: string[]
}

export type ExtensionBuiltInMenuId = 'file' | 'edit' | 'select' | 'canvas' | 'layer' | 'window' | 'help'

export type ExtensionMenuItemPosition = 'start' | 'end'

export type ExtensionTopMenuPosition = ExtensionMenuItemPosition | `before:${ExtensionBuiltInMenuId}` | `after:${ExtensionBuiltInMenuId}`

export interface StoredExtensionMenuItem {
  id: string
  menu: ExtensionBuiltInMenuId
  position: ExtensionMenuItemPosition
  commands: string[]
}

export interface StoredExtensionTopMenu {
  id: string
  name: string
  description: string
  position: ExtensionTopMenuPosition
  commands: string[]
}

export interface ExtensionListing {
  directoryPath: string
  extensions: StoredExtension[]
}

export interface ExtensionPackagePreview {
  name: string
  version: string
  description: string
  author: string
  id: string
  commandCount: number
  panelCount: number
  menuCount: number
  toolCount: number
}
