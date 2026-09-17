import { useState, type ComponentProps, type ReactNode } from 'react'
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { StoredExtension } from '@shared/types-extensions'
import { AppMenuBar } from './AppMenuBar'
import { clearExtensionCommandState, setExtensionMenuItems } from '@/core/extension-command-state'
import { registerExtensionRuntime } from '@/core/extension-runtime'

vi.mock('@/store/workspace', () => {
  const state = { sessions: [], activeId: null }
  return { useWorkspace: Object.assign((select: (value: typeof state) => unknown) => select(state), { getState: () => state }) }
})
vi.mock('@/components/I18nProvider', () => ({ useI18n: () => ({ t: (key: string) => key }) }))
vi.mock('@/components/PerformanceProfiler', () => ({ PerformanceProfiler: ({ children }: { children: ReactNode }) => children }))

const extension: StoredExtension = {
  id: 'test.pets', name: 'Pets', version: '1', description: '', author: '', enabled: true,
  hasLuaEntry: false, hasSettings: true, panels: [],
  commands: [
    { id: 'manager', name: '宠物管理', description: '', handler: 'runtime', runtimeEvent: 'manager' },
    { id: 'settings', name: '宠物设置', description: '', handler: 'settings', opensSettings: true }
  ],
  menuItems: [{ id: 'file-manager', menu: 'file', position: 'end', name: '', description: '', commands: ['manager'] }],
  topMenus: [{ id: 'pet-menu', name: '宠物', description: '', position: 'after:window', commands: ['manager', 'settings'] }]
}
const noop = () => {}
type Props = ComponentProps<typeof AppMenuBar>
const defaults: Omit<Props, 'openMenu' | 'setOpenMenu'> = {
  shortcutFor: () => '', homeOpen: true, panelVisibility: {} as Props['panelVisibility'], timelineHidden: false,
  sliceOutlinesVisible: false, alignmentPreferences: { gridAlignmentEnabled: false, smartAlignmentEnabled: false, alignmentGuidesVisible: false },
  toolRailSide: 'left', advancedModeActive: false, luaScriptRunning: false, luaScripts: [], luaScriptsLoading: false,
  luaScriptsLoadFailed: false, extensions: [extension], extensionPanelVisibility: {}, recentFiles: [], projectRollbackEnabled: false,
  onHome: noop, onNew: noop, onOpen: noop, onOpenRecent: noop, onSave: noop, onSaveAs: noop, onExport: noop,
  onExportAllFrames: noop, onExportSpriteSheet: noop, onOpenTimelapse: noop, onOpenProjectInfo: noop, onOpenProjectRollback: noop,
  onRunLuaScript: noop, onOpenLuaScriptFolder: noop, onToggleExtensionPanel: noop, onOpenProjectFolder: noop, onOpenOutline: noop,
  onOpenAntiAlias: noop, onOpenColorReplacement: noop, onOpenAdjustment: noop, onOpenLcdScreenFilter: noop,
  onOpenShortcuts: noop, onOpenPreferences: noop, onOpenExtensionSettings: noop, onOpenCanvasResize: noop, onOpenImageResize: noop,
  onOpenGridSettings: noop, onOpenIsoViewSettings: noop, onToggleMirror: noop, onTogglePanel: noop, onToggleTimeline: noop,
  onToggleSliceOutlines: noop, onToggleAlignmentPreference: noop, onToolRailSideChange: noop, onCycleAdvancedMode: noop,
  onOpenComponentLibrary: noop, onOpenLatestRelease: noop, onOpenUsageStatistics: noop, onOpenDiagnostics: noop, onOpenAbout: noop
}
function Menu() {
  const [openMenu, setOpenMenu] = useState<string | null>(null)
  return <AppMenuBar {...defaults} openMenu={openMenu} setOpenMenu={setOpenMenu} />
}
afterEach(() => { cleanup(); clearExtensionCommandState(extension.id) })

it('opens the installed pet menu before dynamic options arrive, then renders and dispatches each pet', () => {
  const dispatch = vi.fn(), unregister = registerExtensionRuntime(extension.id, dispatch)
  try {
    const view = render(<Menu />)
    fireEvent.click(view.getByRole('button', { name: '宠物' }))
    expect(view.getByRole('menuitemcheckbox', { name: '宠物管理' })).toBeTruthy()
    const items = [
      { id: 'builtin', name: '奶龙', event: 'toggle-pet', checked: true },
      { id: 'custom', name: '第二只宠物', event: 'toggle-pet', checked: false }
    ]
    act(() => setExtensionMenuItems(extension.id, 'pet-menu', items))
    expect(view.getByRole('menuitemcheckbox', { name: '奶龙' }).getAttribute('aria-checked')).toBe('true')
    expect(view.getByRole('menuitemcheckbox', { name: '第二只宠物' }).getAttribute('aria-checked')).toBe('false')
    fireEvent.click(view.getByRole('menuitemcheckbox', { name: '第二只宠物' }))
    expect(dispatch).toHaveBeenLastCalledWith({ type: 'command', commandId: 'custom', event: 'toggle-pet' })
    expect(view.queryByRole('menuitemcheckbox', { name: '第二只宠物' })).toBeNull()
    fireEvent.click(view.getByRole('button', { name: '宠物' }))
    fireEvent.click(view.getByRole('menuitemcheckbox', { name: '宠物管理' }))
    expect(dispatch).toHaveBeenLastCalledWith({ type: 'command', commandId: 'manager', event: 'manager' })
    fireEvent.click(view.getByRole('button', { name: 'app.menu.file' }))
    expect(view.getByRole('menuitemcheckbox', { name: '宠物管理' })).toBeTruthy()
    fireEvent.click(view.getByRole('button', { name: '宠物' }))
    act(() => setExtensionMenuItems(extension.id, 'pet-menu', []))
    expect(view.queryByRole('menuitemcheckbox', { name: '奶龙' })).toBeNull()
    expect(view.getByRole('menuitemcheckbox', { name: '宠物设置' })).toBeTruthy()
  } finally { unregister() }
})
