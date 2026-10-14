import type { StoredExtensionRuntime } from './types-extension-runtime'

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
  translations?: Record<string, Record<string, string>>
  id: string
  name: string
  version: string
  description: string
  author: string
  apiVersion?: string
  hasLuaEntry: boolean
  /** Whether the package supplies host-rendered settings or a sandboxed HTML fallback. */
  hasSettings: boolean
  settingsUi?: StoredExtensionSettingsUi
  runtime?: StoredExtensionRuntime
  commands: StoredExtensionCommand[]
  panels: StoredExtensionPanel[]
  menuItems: StoredExtensionMenuItem[]
  topMenus: StoredExtensionTopMenu[]
  enabled: boolean
}

export interface StoredExtensionSettingsUi {
  storageKey: string
  controls: StoredExtensionSettingsControl[]
}

interface StoredExtensionSettingsControlBase {
  id: string
  label: string
  description: string
  visibleWhen?: Record<string, boolean>
}

export interface StoredExtensionSettingsCheckbox extends StoredExtensionSettingsControlBase {
  type: 'checkbox'
  defaultValue: boolean
}

export interface StoredExtensionSettingsNumber extends StoredExtensionSettingsControlBase {
  type: 'number'
  defaultValue: number
  min?: number
  max?: number
  step?: number
  suffix?: string
}

export interface StoredExtensionSettingsText extends StoredExtensionSettingsControlBase {
  type: 'text'
  defaultValue: string
  placeholder?: string
  maxLength?: number
}

export interface StoredExtensionSettingsSelectOption {
  value: string
  label: string
  description: string
}

export interface StoredExtensionSettingsSelect extends StoredExtensionSettingsControlBase {
  type: 'select'
  defaultValue: string
  options: StoredExtensionSettingsSelectOption[]
}

export interface StoredExtensionSettingsButton extends StoredExtensionSettingsControlBase {
  type: 'button'
  fullWidth?: boolean
  commandId: string
  variant: 'primary' | 'secondary' | 'danger'
  closeOnRun: boolean
}

export type StoredExtensionSettingsControl =
  | StoredExtensionSettingsCheckbox
  | StoredExtensionSettingsNumber
  | StoredExtensionSettingsText
  | StoredExtensionSettingsSelect
  | StoredExtensionSettingsButton

export interface StoredExtensionCommand {
  id: string
  name: string
  description: string
  handler: 'lua' | 'runtime' | 'settings'
  runtimeEvent?: string
  opensSettings?: boolean
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
  name?: string
  description?: string
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
  extensions: StoredExtension[]
}

export interface ExtensionPackagePreview {
  translations?: Record<string, Record<string, string>>
  name: string
  version: string
  description: string
  author: string
  id: string
  commandCount: number
  panelCount: number
  menuCount: number
}
