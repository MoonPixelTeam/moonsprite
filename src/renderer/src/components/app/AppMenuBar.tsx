import type { ReactNode } from 'react'
import { useSyncExternalStore } from 'react'
import type { ColorMode, TileRepeatMode } from '@shared/types-raster'
import type { ExtensionBuiltInMenuId, ExtensionMenuItemPosition, ExtensionTopMenuPosition, LuaScriptEntry, StoredExtension } from '@shared/types-extensions'
import type { ToolRailSide, WorkspacePanelId } from '@shared/types-workspace'
import type { AdjustmentKind } from '@/core/adjustments'
import { FILTER_PRESETS } from '@/core/filter-presets'
import { APP_CHANNEL_LABEL } from '@/core/app-meta'
import { useWorkspace } from '@/store/workspace'
import moonspriteLogo from '@/assets/moonsprite-logo.svg'
import { PerformanceProfiler } from '@/components/PerformanceProfiler'
import { useI18n } from '@/components/I18nProvider'
import { appMenuRenderKey } from '@/components/app/app-render-keys'
import { nextTopMenuOnHover, TOP_MENU_IDS } from '@/core/menu-behavior'
import type { RecentProject } from '@/core/home-history'
import { PixelRightIcon as ChevronRight, PixelUtilityIcon } from '@/components/PixelUtilityIcon'
import {
  arrangeExtensionTopMenuIds,
  extensionCommandScriptId,
  extensionMenuItemsAt,
  listExtensionMenuItemContributions,
  listExtensionPanelContributions,
  listExtensionTopMenuContributions
} from '@/core/extension-contributions'
import { extensionCommandStateRevision, extensionMenuItems, isExtensionCommandChecked, isExtensionCommandVisible, subscribeExtensionCommandState } from '@/core/extension-command-state'
import { executeExtensionCommand } from '@/core/extension-runtime'
import type { ShortcutId } from '@/core/shortcuts'

const Check = (_props: { size?: number }) => <PixelUtilityIcon kind="check" />

function SubmenuTrigger({ children, disabled = false }: { children: ReactNode; disabled?: boolean }) {
  return <button className="menu-submenu-trigger" disabled={disabled}>
    <span className="menu-submenu-label">{children}</span>
    <span className="menu-submenu-arrow" aria-hidden="true"><ChevronRight /></span>
  </button>
}

interface AppMenuBarProps {
  openMenu: string | null
  setOpenMenu: (menu: string | null) => void
  shortcutFor: (id: ShortcutId) => string
  homeOpen: boolean
  panelVisibility: Record<WorkspacePanelId, boolean>
  timelineHidden: boolean
  sliceOutlinesVisible: boolean
  alignmentPreferences: {
    gridAlignmentEnabled: boolean
    smartAlignmentEnabled: boolean
    alignmentGuidesVisible: boolean
  }
  toolRailSide: ToolRailSide
  advancedModeActive: boolean
  luaScriptRunning: boolean
  luaScripts: LuaScriptEntry[]
  luaScriptsLoading: boolean
  luaScriptsLoadFailed: boolean
  extensions: StoredExtension[]
  extensionPanelVisibility: Record<string, boolean>
  recentFiles: RecentProject[]
  onHome: () => void
  onNew: () => void
  onOpen: () => void
  onOpenRecent: (filePath: string) => void
  onSave: () => void
  onSaveAs: () => void
  onExport: () => void
  onExportAllFrames: () => void
  onExportSpriteSheet: () => void
  onOpenTimelapse: () => void
  onOpenProjectInfo: () => void
  projectRollbackEnabled: boolean
  onOpenProjectRollback: () => void
  onRunLuaScript: (scriptId: string) => void
  onOpenLuaScriptFolder: () => void
  onToggleExtensionPanel: (key: string) => void
  onOpenProjectFolder: (documentId: string) => void
  onOpenOutline: () => void
  onOpenAntiAlias: () => void
  onOpenColorReplacement: () => void
  onOpenAdjustment: (kind: AdjustmentKind) => void
  onOpenLcdScreenFilter: () => void
  onOpenShortcuts: () => void
  onOpenPreferences: () => void
  onOpenExtensionSettings: (extensionId: string) => void
  onOpenCanvasResize: () => void
  onOpenImageResize: () => void
  onOpenGridSettings: () => void
  onOpenIsoViewSettings: () => void
  onToggleMirror: (axis: 'horizontal' | 'vertical') => void
  fullscreen: boolean
  onToggleFullscreen: () => void
  onTogglePanel: (id: WorkspacePanelId) => void
  onToggleTimeline: () => void
  onToggleSliceOutlines: () => void
  onToggleAlignmentPreference: (key: 'gridAlignmentEnabled' | 'smartAlignmentEnabled' | 'alignmentGuidesVisible') => void
  onToolRailSideChange: (side: ToolRailSide) => void
  onCycleAdvancedMode: () => void
  onOpenComponentLibrary: () => void
  onOpenLatestRelease: () => void
  onOpenUsageStatistics: () => void
  onOpenDiagnostics: () => void
  onOpenAbout: () => void
}

export function AppMenuBar({
  openMenu,
  setOpenMenu,
  shortcutFor,
  homeOpen,
  panelVisibility,
  timelineHidden,
  sliceOutlinesVisible,
  alignmentPreferences,
  toolRailSide,
  advancedModeActive,
  luaScriptRunning,
  luaScripts,
  luaScriptsLoading,
  luaScriptsLoadFailed,
  extensions,
  extensionPanelVisibility,
  recentFiles,
  onHome,
  onNew,
  onOpen,
  onOpenRecent,
  onSave,
  onSaveAs,
  onExport,
  onExportAllFrames,
  onExportSpriteSheet,
  onOpenTimelapse,
  onOpenProjectInfo,
  projectRollbackEnabled,
  onOpenProjectRollback,
  onRunLuaScript,
  onOpenLuaScriptFolder,
  onToggleExtensionPanel,
  onOpenProjectFolder,
  onOpenOutline,
  onOpenAntiAlias,
  onOpenColorReplacement,
  onOpenAdjustment,
  onOpenLcdScreenFilter,
  onOpenShortcuts,
  onOpenPreferences,
  onOpenExtensionSettings,
  onOpenCanvasResize,
  onOpenImageResize,
  onOpenGridSettings,
  onOpenIsoViewSettings,
  onToggleMirror,
  fullscreen,
  onToggleFullscreen,
  onTogglePanel,
  onToggleTimeline,
  onToggleSliceOutlines,
  onToggleAlignmentPreference,
  onToolRailSideChange,
  onCycleAdvancedMode,
  onOpenComponentLibrary,
  onOpenLatestRelease,
  onOpenUsageStatistics,
  onOpenDiagnostics,
  onOpenAbout
}: AppMenuBarProps) {
  const { t } = useI18n()
  // Reported command state lives outside the workspace store, so the bar has to
  // re-render when an extension updates which command is checked.
  useSyncExternalStore(subscribeExtensionCommandState, () => extensionCommandStateRevision(), () => 0)
  const renderKey = useWorkspace((state) => appMenuRenderKey(state.sessions.find((item) => item.document.id === state.activeId) ?? null))
  const state = useWorkspace.getState()
  const session = state.sessions.find((item) => item.document.id === state.activeId) ?? null
  const workspace = useWorkspace.getState()
  void renderKey
  const closeMenu = (): void => setOpenMenu(null)
  const toggleMenu = (menu: string): void => setOpenMenu(openMenu === menu ? null : menu)
  const extensionMenuContributions = listExtensionMenuItemContributions(extensions)
  const extensionTopMenus = listExtensionTopMenuContributions(extensions)
  const extensionPanels = listExtensionPanelContributions(extensions)
  const orderedTopMenuIds = arrangeExtensionTopMenuIds(TOP_MENU_IDS, extensionTopMenus)
  const hoverMenuAt = (index: number): void => {
    const hoveredMenu = orderedTopMenuIds[index]
    if (!hoveredMenu) return
    const next = nextTopMenuOnHover(openMenu, hoveredMenu, orderedTopMenuIds)
    if (next !== openMenu) setOpenMenu(next)
  }
  const shortcutHint = (id: ShortcutId) => {
    const shortcut = shortcutFor(id)
    return shortcut ? <kbd>{shortcut}</kbd> : null
  }
  const openAdjustment = (kind: AdjustmentKind): void => {
    onOpenAdjustment(kind)
    closeMenu()
  }
  const colorModes: ColorMode[] = ['rgba', 'indexed', 'grayscale']
  const tileRepeatModes: TileRepeatMode[] = ['off', 'both', 'x', 'y']
  const placedExtensionCommandIds = new Set(extensions.flatMap((extension) => {
    if (!extension.enabled) return []
    return [...extension.panels, ...extension.menuItems, ...extension.topMenus]
      .flatMap((contribution) => contribution.commands)
      .map((commandId) => extensionCommandScriptId(extension.id, commandId))
  }))
  const fileLuaScripts = luaScripts.filter((script) =>
    !script.extensionCommandId || !placedExtensionCommandIds.has(script.id))
  const renderExtensionCommandButton = (extensionId: string, command: StoredExtension['commands'][number], key: string, checkedOverride?: boolean): ReactNode => {
    if (!isExtensionCommandVisible(extensionId, command.id)) return null
    const extension = extensions.find((candidate) => candidate.id === extensionId)
    const disabled = !extension || (command.handler === 'lua' && (!session || luaScriptRunning))
    // Extension manifests are fixed at install time, so a command that owns a
    // mutually exclusive set of options reports its own checked state at runtime.
    const checked = checkedOverride ?? isExtensionCommandChecked(extensionId, command.id)
    return <button
      key={key}
      disabled={disabled}
      title={command.description || command.name}
      aria-checked={checked}
      role="menuitemcheckbox"
      onClick={() => {
        if (extension) executeExtensionCommand(extension, command, { runLua: onRunLuaScript, openSettings: onOpenExtensionSettings })
        closeMenu()
      }}
    >{command.name}<span className="menu-check">{checked && <Check size={14} />}</span></button>
  }
  const renderExtensionTopMenusAt = (position: ExtensionTopMenuPosition): ReactNode => extensionTopMenus
    .filter((contribution) => contribution.topMenu.position === position)
    .map((contribution) => <div className="menu-item extension-top-menu-item" key={contribution.key}>
      <button
        aria-expanded={openMenu === contribution.openMenuId}
        title={contribution.topMenu.description || contribution.extensionName}
        onClick={() => toggleMenu(contribution.openMenuId)}
      >{contribution.topMenu.name}</button>
      {openMenu === contribution.openMenuId && <div className="menu-popover extension-contributed-menu-popover">
        {extensionMenuItems(contribution.extensionId, contribution.topMenu.id).map(item => renderExtensionCommandButton(contribution.extensionId, { id: item.id, name: item.name, description: '', handler: 'runtime', runtimeEvent: item.event }, contribution.key + ':dynamic:' + item.id, item.checked))}
        {extensionMenuItems(contribution.extensionId, contribution.topMenu.id).length > 0 && contribution.commands.length > 0 && <span className="menu-divider" />}
        {contribution.commands.map(command => renderExtensionCommandButton(contribution.extensionId, command, `${contribution.key}:${command.id}`))}
      </div>}
    </div>)
  const renderExistingMenuContributions = (menu: ExtensionBuiltInMenuId, position: ExtensionMenuItemPosition): ReactNode => {
    const contributions = extensionMenuItemsAt(extensionMenuContributions, menu, position)
    if (contributions.length === 0) return null
    const nodes: ReactNode[] = []
    if (position === 'end') nodes.push(<span className="menu-divider" key={`${menu}:${position}:leading-divider`} />)
    contributions.forEach((contribution, contributionIndex) => {
      if (contributionIndex > 0) nodes.push(<span className="menu-divider" key={`${contribution.key}:divider`} />)
      const commands = contribution.commands.map((command) => renderExtensionCommandButton(
        contribution.extensionId, command, `${contribution.key}:${command.id}`
      ))
      if (contribution.menuItem.name) nodes.push(<div className="menu-submenu" key={contribution.key}>
            <SubmenuTrigger>{contribution.menuItem.name}</SubmenuTrigger>
            <div className="menu-popover menu-submenu-popover" title={contribution.menuItem.description}>{commands}</div>
          </div>)
      else nodes.push(...commands)
    })
    if (position === 'start') nodes.push(<span className="menu-divider" key={`${menu}:${position}:trailing-divider`} />)
    return nodes
  }
  const selectAll = (): void => {
    if (!session) return
    workspace.commitFloatingPaste()
    workspace.setTool('selection')
    workspace.setSelection({ x: 0, y: 0, width: session.document.width, height: session.document.height })
  }
  return <PerformanceProfiler id="AppMenuBar"><header className="topbar">
    <button className="brand" data-moon-tooltip-disabled aria-label={t('app.brand.homeAria')} onClick={() => { onHome(); closeMenu() }}><img className="brand-logo" src={moonspriteLogo} alt="" aria-hidden="true" /><span>MOONSPRITE</span><small>{APP_CHANNEL_LABEL}</small></button>
    <nav className="menu-strip" aria-label={t('app.menu.mainAria')} onPointerOver={(event) => { const button = (event.target as HTMLElement).closest('button[aria-expanded]'); const item = button?.parentElement; if (item?.parentElement !== event.currentTarget) return; hoverMenuAt(Array.from(event.currentTarget.children).indexOf(item)) }}>
      {renderExtensionTopMenusAt('start')}
      {renderExtensionTopMenusAt('before:file')}
       <div className="menu-item"><button aria-expanded={openMenu === 'file'} onClick={() => toggleMenu('file')}>{t('app.menu.file')}</button>{openMenu === 'file' && <div className="menu-popover">{renderExistingMenuContributions('file', 'start')}<button onClick={() => { onNew(); closeMenu() }}>{t('app.menu.file.new')} <kbd>{shortcutFor('newDocument')}</kbd></button><button onClick={() => { onOpen(); closeMenu() }}>{t('app.menu.file.open')} <kbd>{shortcutFor('openDocument')}</kbd></button><div className="menu-submenu"><SubmenuTrigger>{t('app.menu.file.recent')}</SubmenuTrigger><div className="menu-popover menu-submenu-popover recent-files-submenu">{recentFiles.length === 0 ? <button disabled>{t('app.menu.file.noRecent')}</button> : recentFiles.map((recent) => <button key={recent.filePath} title={recent.filePath} onClick={() => { onOpenRecent(recent.filePath); closeMenu() }}>{recent.fileName}</button>)}</div></div><span className="menu-divider" /><button disabled={!session} onClick={() => { onSave(); closeMenu() }}>{t('app.menu.file.save')} <kbd>{shortcutFor('save')}</kbd></button><button disabled={!session} onClick={() => { onSaveAs(); closeMenu() }}>{t('app.menu.file.saveAs')} <kbd>{shortcutFor('saveAs')}</kbd></button><button disabled={!projectRollbackEnabled} onClick={() => { onOpenProjectRollback(); closeMenu() }}>{t('rollback.title')}</button><div className="menu-submenu"><SubmenuTrigger disabled={!session}>{t('app.menu.file.export')}</SubmenuTrigger><div className="menu-popover menu-submenu-popover"><button disabled={!session} onClick={() => { onExport(); closeMenu() }}>{t('app.menu.file.exportAs')} <kbd>{shortcutFor('exportDocument')}</kbd></button><button disabled={!session || (session.document.animation?.frames.length ?? 1) < 2} onClick={() => { onExportAllFrames(); closeMenu() }}>{t('app.menu.file.exportAllFrames')}{shortcutHint('exportAllFrames')}</button><button disabled={!session} onClick={() => { onExportSpriteSheet(); closeMenu() }}>{t('app.menu.file.exportSpriteSheet')}{shortcutHint('exportSpriteSheet')}</button></div></div><button disabled={!session?.document.filePath && !session?.document.sourceFilePath} onClick={() => { if (session) onOpenProjectFolder(session.document.id); closeMenu() }}>{t('app.menu.file.openFolder')}{shortcutHint('openProjectFolder')}</button><span className="menu-divider" /><button disabled={!session} onClick={() => { onOpenTimelapse(); closeMenu() }}>{t('app.menu.file.timelapse')}{shortcutHint('openTimelapse')}</button><button disabled={!session} onClick={() => { onOpenProjectInfo(); closeMenu() }}>{t('app.menu.file.projectInfo')}{shortcutHint('openProjectInfo')}</button><span className="menu-divider" /><div className="menu-submenu"><SubmenuTrigger>{t('app.menu.file.scripts')}</SubmenuTrigger><div className="menu-popover menu-submenu-popover script-files-submenu component-scrollbar">{luaScriptsLoading ? <button disabled>{t('app.menu.file.loadingScripts')}</button> : luaScriptsLoadFailed ? <button disabled>{t('app.menu.file.scriptListFailed')}</button> : fileLuaScripts.length === 0 ? <button disabled>{t('app.menu.file.noScripts')}</button> : fileLuaScripts.map((script) => <button key={script.id} disabled={!session || luaScriptRunning} title={script.filePath} onClick={() => { onRunLuaScript(script.id); closeMenu() }}><span className="script-menu-name">{script.name}</span></button>)}<span className="menu-divider" /><button onClick={() => { onOpenLuaScriptFolder(); closeMenu() }}>{t('app.menu.file.openScriptFolder')}{shortcutHint('openScriptFolder')}</button></div></div>{renderExistingMenuContributions('file', 'end')}</div>}</div>
      {renderExtensionTopMenusAt('after:file')}
      {renderExtensionTopMenusAt('before:edit')}
      <div className="menu-item"><button aria-expanded={openMenu === 'edit'} onClick={() => toggleMenu('edit')}>{t('app.menu.edit')}</button>{openMenu === 'edit' && <div className="menu-popover">{renderExistingMenuContributions('edit', 'start')}<button disabled={!session?.history.canUndo} onClick={() => { workspace.undo(); closeMenu() }}>{t('app.menu.edit.undo')} <kbd>{shortcutFor('undo')}</kbd></button><button disabled={!session?.history.canRedo} onClick={() => { workspace.redo(); closeMenu() }}>{t('app.menu.edit.redo')} <kbd>{shortcutFor('redo')}</kbd></button><div className="menu-submenu"><SubmenuTrigger>{t('app.menu.edit.pasteSpecial')}</SubmenuTrigger><div className="menu-popover menu-submenu-popover"><button onClick={() => { void workspace.pasteAsNewDocument(); closeMenu() }}>{t('app.menu.edit.pasteAsDocument')}{shortcutHint('pasteAsNewDocument')}</button><button disabled={!session} onClick={() => { void workspace.pasteAsNewLayer(); closeMenu() }}>{t('app.menu.edit.pasteAsLayer')}{shortcutHint('pasteAsNewLayer')}</button></div></div><span className="menu-divider" /><button disabled={!session} onClick={() => { onOpenColorReplacement(); closeMenu() }}>{t('app.menu.edit.replaceColor')}{shortcutHint('replaceColor')}</button><button disabled={!session} onClick={() => { onOpenAntiAlias(); closeMenu() }}>{t('app.menu.edit.quickAntiAlias')}</button><div className="menu-submenu"><SubmenuTrigger disabled={!session}>{t('app.menu.edit.adjustments')}</SubmenuTrigger><div className="menu-popover menu-submenu-popover"><button onClick={() => openAdjustment('color-balance')}>{t('app.menu.edit.colorBalance')}{shortcutHint('adjustmentColorBalance')}</button><button onClick={() => openAdjustment('brightness-contrast')}>{t('app.menu.edit.brightnessContrast')} {shortcutHint('adjustmentBrightnessContrast')}</button><button onClick={() => openAdjustment('hue-saturation')}>{t('app.menu.edit.hueSaturation')}{shortcutHint('adjustmentHueSaturation')}</button><button onClick={() => openAdjustment('curves')}>{t('app.menu.edit.curves')}{shortcutHint('adjustmentCurves')}</button></div></div><div className="menu-submenu"><SubmenuTrigger disabled={!session}>{t('app.menu.edit.filters')}</SubmenuTrigger><div className="menu-popover menu-submenu-popover filter-menu-popover">{FILTER_PRESETS.map((preset) => <button key={preset.id} disabled={!session} title={t(`filter.preset.${preset.id}.description`)} onClick={() => { void workspace.applyFilterPreset(preset.id); closeMenu() }}>{t(`filter.preset.${preset.id}.name`)}</button>)}<span className="menu-divider" /><button disabled={!session || session.selectedLayerIds.length !== 1} title={t('filter.lcdScreenDialogHint')} onClick={() => { onOpenLcdScreenFilter(); closeMenu() }}>{t('filter.lcdScreen')}</button></div></div><span className="menu-divider" /><button onClick={() => { onOpenShortcuts(); closeMenu() }}>{t('app.menu.edit.shortcuts')}{shortcutHint('openShortcutSettings')}</button><button onClick={() => { onOpenPreferences(); closeMenu() }}>{t('app.menu.edit.preferences')}{shortcutHint('openPreferences')}</button>{renderExistingMenuContributions('edit', 'end')}</div>}</div>
      {renderExtensionTopMenusAt('after:edit')}
      {renderExtensionTopMenusAt('before:select')}
      <div className="menu-item"><button aria-expanded={openMenu === 'select'} onClick={() => toggleMenu('select')}>{t('app.menu.select')}</button>{openMenu === 'select' && <div className="menu-popover">{renderExistingMenuContributions('select', 'start')}<button disabled={!session} onClick={() => { selectAll(); closeMenu() }}>{t('app.menu.select.selectAll')}{shortcutHint('selectAll')}</button><button disabled={!session?.selection} onClick={() => { const label = t('app.menu.select.deselect'); if (session?.pendingPaste) workspace.commitFloatingPaste(label); else if (session?.selection) workspace.commitSelectionChange(session.selection, null, label); closeMenu() }}>{t('app.menu.select.deselect')}{shortcutHint('deselect')}</button><button disabled={!session?.selection} onClick={() => { workspace.invertSelection(); closeMenu() }}>{t('app.menu.select.invert')}{shortcutHint('invertSelection')}</button><span className="menu-divider" /><button disabled={!session || (!session.activeLayerMaskId && session.selectedLayerIds.length === 0 && session.selectedGroupIds.length === 0 && !session.selectedGroupId)} onClick={() => { workspace.beginLayerTransform(); closeMenu() }}>{t('app.menu.select.transform')}{shortcutHint('transform')}</button><button disabled={!session?.selection} onClick={() => { workspace.beginFreeTransform(); closeMenu() }}>{t('app.menu.select.freeTransform')}</button><button disabled={!session?.selection} onClick={() => { workspace.flipActiveSelection('horizontal'); closeMenu() }}>{t('app.menu.select.flipHorizontal')}{shortcutHint('flipHorizontal')}</button><button disabled={!session?.selection} onClick={() => { workspace.flipActiveSelection('vertical'); closeMenu() }}>{t('app.menu.select.flipVertical')}{shortcutHint('flipVertical')}</button><button disabled={!session?.selection} onClick={() => { workspace.deleteSelection(); closeMenu() }}>{t('app.menu.select.delete')}{shortcutHint('deleteSelection')}</button><button disabled={!session} onClick={() => { onOpenOutline(); closeMenu() }}>{t('app.menu.select.outline')}{shortcutHint('outline')}</button><button disabled={!session?.selection} onClick={() => { workspace.toggleSelectionOutline(); closeMenu() }}>{t(session?.view.showSelectionOutline === false ? 'app.menu.select.showOutline' : 'app.menu.select.hideOutline')}{shortcutHint('toggleSelectionOutline')}<span className="menu-check">{session?.view.showSelectionOutline === false && <Check size={14} />}</span></button><span className="menu-divider" /><div className="menu-submenu"><SubmenuTrigger disabled={!session?.selection}>{t('app.menu.select.convertTo')}</SubmenuTrigger><div className="menu-popover menu-submenu-popover"><button disabled={!session?.selection} onClick={() => { void workspace.createBrushFromSelection(); closeMenu() }}>{t('app.menu.select.convertToPatternBrush')}{shortcutHint('createBrushFromSelection')}</button><button disabled={!session?.selection} onClick={() => { void workspace.createBackgroundPresetFromSelection(); closeMenu() }}>{t('app.menu.select.convertToBackgroundPreset')}</button></div></div>{renderExistingMenuContributions('select', 'end')}</div>}</div>
      {renderExtensionTopMenusAt('after:select')}
      {renderExtensionTopMenusAt('before:canvas')}
      <div className="menu-item"><button aria-expanded={openMenu === 'canvas'} onClick={() => toggleMenu('canvas')}>{t('app.menu.image')}</button>{openMenu === 'canvas' && <div className="menu-popover">{renderExistingMenuContributions('canvas', 'start')}<div className="menu-submenu"><SubmenuTrigger disabled={!session}>{t('app.menu.image.colorMode')}</SubmenuTrigger><div className="menu-popover menu-submenu-popover">{colorModes.map((mode) => { const shortcutId: ShortcutId = mode === 'rgba' ? 'convertColorModeRgba' : mode === 'indexed' ? 'convertColorModeIndexed' : 'convertColorModeGrayscale'; return <button key={mode} disabled={!session} title={t(`colorMode.${mode}Description`)} onClick={() => { void workspace.convertColorMode(mode); closeMenu() }}>{t(`colorMode.${mode}`)}{shortcutHint(shortcutId)}<span className="menu-check">{session?.document.colorMode === mode && <Check size={14} />}</span></button> })}</div></div><span className="menu-divider" /><button disabled={!session} onClick={() => { onOpenCanvasResize(); closeMenu() }}>{t('app.menu.image.canvasSize')} <kbd>{shortcutFor('canvasResize')}</kbd></button><button disabled={!session} onClick={() => { onOpenImageResize(); closeMenu() }}>{t('app.menu.image.imageSize')} <kbd>{shortcutFor('imageResize')}</kbd></button><div className="menu-submenu"><SubmenuTrigger disabled={!session}>{t('app.menu.image.drawingPerspective')}</SubmenuTrigger><div className="menu-popover menu-submenu-popover"><button disabled={!session} onClick={() => { if (session) workspace.setView({ isoViewEnabled: false }); closeMenu() }}>{t('app.menu.image.drawingPerspective.default')}<span className="menu-check">{session?.view.isoViewEnabled !== true && <Check size={14} />}</span></button><button disabled={!session} onClick={() => { if (session) workspace.setView({ isoViewEnabled: true }); closeMenu() }}>{t('app.menu.image.drawingPerspective.iso')}{shortcutHint('toggleIsoView')}<span className="menu-check">{session?.view.isoViewEnabled && <Check size={14} />}</span></button><span className="menu-divider" /><button disabled={!session} onClick={() => { onOpenIsoViewSettings(); closeMenu() }}>{t('app.menu.image.drawingPerspective.isoSettings')}{shortcutHint('openIsoViewSettings')}</button></div></div><span className="menu-divider" /><button disabled={!session?.selection} onClick={() => { void workspace.cropActiveCanvas(); closeMenu() }}>{t('app.menu.image.crop')}{shortcutHint('cropCanvas')}</button><div className="menu-submenu"><SubmenuTrigger disabled={!session}>{t('app.menu.image.trim')}</SubmenuTrigger><div className="menu-popover menu-submenu-popover"><button disabled={!session} onClick={() => { void workspace.trimActiveCanvasCurrentFrame(); closeMenu() }}>{t('app.menu.image.trim.currentFrame')}</button><button disabled={!session} onClick={() => { void workspace.trimActiveCanvas(); closeMenu() }}>{t('app.menu.image.trim.allFrames')}{shortcutHint('trimCanvas')}</button></div></div>{renderExistingMenuContributions('canvas', 'end')}</div>}</div>
      {renderExtensionTopMenusAt('after:canvas')}
      {renderExtensionTopMenusAt('before:layer')}
      <div className="menu-item"><button aria-expanded={openMenu === 'layer'} onClick={() => toggleMenu('layer')}>{t('app.menu.layer')}</button>{openMenu === 'layer' && <div className="menu-popover">{renderExistingMenuContributions('layer', 'start')}<button disabled={!session} onClick={() => { void workspace.addLayer(); closeMenu() }}>{t('app.menu.layer.new')}{shortcutHint('newLayer')}</button><button disabled={!session} onClick={() => { workspace.createLayerGroup(); closeMenu() }}>{t('app.menu.layer.newGroup')} <kbd>{shortcutFor('createLayerGroup')}</kbd></button><button disabled={!session || Boolean(session.selectedGroupId)} onClick={() => { workspace.duplicateActiveLayer(); closeMenu() }}>{t('app.menu.layer.duplicate')}{shortcutHint('duplicateLayer')}</button><button disabled={!session || Boolean(session.selectedGroupId)} onClick={() => { workspace.mergeActiveLayerDown(); closeMenu() }}>{t('app.menu.layer.mergeDown')}{shortcutHint('mergeLayerDown')}</button><button disabled={!session || Boolean(session.selectedGroupId) || session.selectedLayerIds.length < 2} onClick={() => { workspace.mergeSelectedLayers(); closeMenu() }}>{t('app.menu.layer.mergeSelected')}{shortcutHint('mergeSelectedLayers')}</button><button disabled={!session?.selectedGroupId} onClick={() => { workspace.mergeSelectedGroup(); closeMenu() }}>{t('app.menu.layer.mergeGroup')}{shortcutHint('mergeLayerGroup')}</button><button disabled={!session || session.document.layers.length < 2} onClick={() => { workspace.mergeVisibleLayers(); closeMenu() }}>{t('app.menu.layer.mergeVisible')}{shortcutHint('mergeVisibleLayers')}</button><button disabled={!session?.selectedGroupId} onClick={() => { workspace.ungroupSelected(); closeMenu() }}>{t('app.menu.layer.ungroup')} <kbd>{shortcutFor('ungroupLayers')}</kbd></button>{renderExistingMenuContributions('layer', 'end')}</div>}</div>
      {renderExtensionTopMenusAt('after:layer')}
      {renderExtensionTopMenusAt('before:window')}
      <div className="menu-item"><button aria-expanded={openMenu === 'window'} onClick={() => toggleMenu('window')}>{t('app.menu.window')}</button>{openMenu === 'window' && <div className="menu-popover">{renderExistingMenuContributions('window', 'start')}
        <button role="menuitemcheckbox" aria-checked={fullscreen} onClick={() => { onToggleFullscreen(); closeMenu() }}>{t('app.menu.window.fullscreen')}{shortcutHint('toggleFullscreen')}<span className="menu-check">{fullscreen && <Check size={14} />}</span></button>
        <span className="menu-divider" />
        <div className="menu-submenu"><SubmenuTrigger disabled={!session}>{t('app.menu.window.display')}</SubmenuTrigger><div className="menu-popover menu-submenu-popover"><button disabled={!session} onClick={() => { workspace.togglePixelGrid(); closeMenu() }}>{t('app.menu.window.pixelGrid')}{shortcutHint('toggleGrid')}<span className="menu-check">{session?.view.showPixelGrid && <Check size={14} />}</span></button><button disabled={!session} onClick={() => { workspace.toggleGrid(); closeMenu() }}>{t('app.menu.window.customGrid')}{shortcutHint('toggleCustomGrid')}<span className="menu-check">{session?.view.showGrid && <Check size={14} />}</span></button><button disabled={!session} onClick={() => { onToggleSliceOutlines(); closeMenu() }}>{t('app.menu.window.sliceOutlines')}{shortcutHint('toggleSliceOutlines')}<span className="menu-check">{sliceOutlinesVisible && <Check size={14} />}</span></button><button disabled={!session} onClick={() => { if (session) workspace.setView({ relativeLuminance: !session.view.relativeLuminance }); closeMenu() }}>{t('app.menu.window.relativeLuminance')} <kbd>{shortcutFor('relativeLuminance')}</kbd><span className="menu-check">{session?.view.relativeLuminance && <Check size={14} />}</span></button></div></div>
        <div className="menu-submenu"><SubmenuTrigger disabled={!session}>{t('app.menu.window.alignment')}</SubmenuTrigger><div className="menu-popover menu-submenu-popover"><button disabled={!session} onClick={() => { onToggleAlignmentPreference('gridAlignmentEnabled'); closeMenu() }}>{t('app.menu.window.gridAlignment')}<span className="menu-check">{alignmentPreferences.gridAlignmentEnabled && <Check size={14} />}</span></button><button disabled={!session} onClick={() => { onToggleAlignmentPreference('smartAlignmentEnabled'); closeMenu() }}>{t('app.menu.window.smartAlignment')}<span className="menu-check">{alignmentPreferences.smartAlignmentEnabled && <Check size={14} />}</span></button><button disabled={!session} onClick={() => { onToggleAlignmentPreference('alignmentGuidesVisible'); closeMenu() }}>{t('app.menu.window.alignmentGuides')}<span className="menu-check">{alignmentPreferences.alignmentGuidesVisible && <Check size={14} />}</span></button></div></div>
        <div className="menu-submenu"><SubmenuTrigger disabled={!session}>{t('app.menu.window.tileRepeat')}</SubmenuTrigger><div className="menu-popover menu-submenu-popover">{tileRepeatModes.map((mode) => { const shortcutId: ShortcutId = mode === 'off' ? 'tileRepeatOff' : mode === 'both' ? 'tileRepeatBoth' : mode === 'x' ? 'tileRepeatX' : 'tileRepeatY'; return <button key={mode} disabled={!session} onClick={() => { workspace.setTileRepeatMode(mode); closeMenu() }}>{t(`app.menu.window.tileRepeat.${mode}`)}{shortcutHint(shortcutId)}<span className="menu-check">{(session?.view.tileRepeatMode ?? 'off') === mode && <Check size={14} />}</span></button> })}</div></div>
        <button disabled={!session} onClick={() => { onOpenGridSettings(); closeMenu() }}>{t('app.menu.window.gridSettings')}{shortcutHint('openGridSettings')}</button>
        <span className="menu-divider" />
        <div className="menu-submenu"><SubmenuTrigger disabled={!session}>{t('app.menu.window.rotateView')}</SubmenuTrigger><div className="menu-popover menu-submenu-popover"><button disabled={!session} onClick={() => { if (session) workspace.setView({ rotation: (session.view.rotation + 90) % 360 }); closeMenu() }}>{t('app.menu.window.rotateClockwise')}{shortcutHint('rotateViewClockwise90')}</button><button disabled={!session} onClick={() => { if (session) workspace.setView({ rotation: (session.view.rotation + 270) % 360 }); closeMenu() }}>{t('app.menu.window.rotateCounterClockwise')}{shortcutHint('rotateViewCounterClockwise90')}</button></div></div>
        <div className="menu-submenu"><SubmenuTrigger disabled={!session}>{t('app.menu.window.mirrorView')}</SubmenuTrigger><div className="menu-popover menu-submenu-popover"><button disabled={!session} onClick={() => { onToggleMirror('horizontal'); closeMenu() }}>{t('app.menu.window.mirrorHorizontal')} <kbd>{shortcutFor('mirrorView')}</kbd><span className="menu-check">{session?.view.mirrored && <Check size={14} />}</span></button><button disabled={!session} onClick={() => { onToggleMirror('vertical'); closeMenu() }}>{t('app.menu.window.mirrorVertical')} <kbd>{shortcutFor('mirrorViewVertical')}</kbd><span className="menu-check">{session?.view.mirroredVertical && <Check size={14} />}</span></button></div></div>
        <button disabled={!session} onClick={() => { if (session) workspace.setView({ zoom: 16, panX: 0, panY: 0, rotation: 0, mirrored: false, mirroredVertical: false }); closeMenu() }}>{t('app.menu.window.resetView')}{shortcutHint('resetView')}</button>
        <span className="menu-divider" />
        <div className="menu-submenu"><SubmenuTrigger disabled={!session}>{t('app.menu.window.panels')}</SubmenuTrigger><div className="menu-popover menu-submenu-popover">{([['color', t('app.menu.window.panelColor'), 'toggleColorPanel'], ['palette', t('app.menu.window.panelPalette'), 'togglePalettePanel'], ['layers', t('app.menu.window.panelLayers'), 'toggleLayersPanel'], ['history', t('app.menu.window.panelHistory')], ['brushes', t('app.menu.window.panelBrushes'), 'toggleBrushLibraryPanel'], ['tileset', t('app.menu.window.panelTileset'), 'toggleTilesetPanel'], ['preview', t('app.menu.window.panelPreview'), 'togglePreviewPanel']] as Array<[WorkspacePanelId, string, ShortcutId?]>).map(([id, label, shortcutId]) => <button key={id} disabled={!session} onClick={() => { onTogglePanel(id); closeMenu() }}>{label}{shortcutId ? shortcutHint(shortcutId) : null}<span className="menu-check">{panelVisibility[id] && <Check size={14} />}</span></button>)}<button disabled={!session} onClick={() => { onToggleTimeline(); closeMenu() }}>{t('app.menu.window.timeline')}{shortcutHint('toggleTimeline')}<span className="menu-check">{!timelineHidden && <Check size={14} />}</span></button>{extensionPanels.length > 0 && <span className="menu-divider" />}{extensionPanels.map((contribution) => <button key={`extension-panel:${contribution.key}`} title={contribution.panel.description || contribution.extensionName} onClick={() => { onToggleExtensionPanel(contribution.key); closeMenu() }}>{contribution.panel.name}<span className="menu-check">{extensionPanelVisibility[contribution.key] && <Check size={14} />}</span></button>)}</div></div>
        <div className="menu-submenu"><SubmenuTrigger disabled={!session}>{t('app.menu.window.toolRailPosition')}</SubmenuTrigger><div className="menu-popover menu-submenu-popover">
          <button disabled={!session} onClick={() => { onToolRailSideChange('left'); closeMenu() }}>{t('app.menu.window.left')}{shortcutHint('toolRailLeft')}<span className="menu-check">{toolRailSide === 'left' && <Check size={14} />}</span></button>
          <button disabled={!session} onClick={() => { onToolRailSideChange('right'); closeMenu() }}>{t('app.menu.window.right')}{shortcutHint('toolRailRight')}<span className="menu-check">{toolRailSide === 'right' && <Check size={14} />}</span></button>
          <button disabled={!session} onClick={() => { onToolRailSideChange('top'); closeMenu() }}>{t('app.menu.window.top')}{shortcutHint('toolRailTop')}<span className="menu-check">{toolRailSide === 'top' && <Check size={14} />}</span></button>
          <button disabled={!session} onClick={() => { onToolRailSideChange('bottom'); closeMenu() }}>{t('app.menu.window.bottom')}{shortcutHint('toolRailBottom')}<span className="menu-check">{toolRailSide === 'bottom' && <Check size={14} />}</span></button>
        </div></div>
        <span className="menu-divider" />
        <button disabled={!session} onClick={() => { if (!session || homeOpen) return; onCycleAdvancedMode(); closeMenu() }}>{t('app.menu.window.advancedMode')} <kbd>{shortcutFor('advancedMode')}</kbd><span className="menu-check">{advancedModeActive && <Check size={14} />}</span></button>
        {renderExistingMenuContributions('window', 'end')}
      </div>}</div>
      {renderExtensionTopMenusAt('after:window')}
      {renderExtensionTopMenusAt('before:help')}
      <div className="menu-item"><button aria-expanded={openMenu === 'help'} onClick={() => toggleMenu('help')}>{t('app.menu.help')}</button>{openMenu === 'help' && <div className="menu-popover">{renderExistingMenuContributions('help', 'start')}<button onClick={() => { onOpenComponentLibrary(); closeMenu() }}>{t('app.menu.help.componentLibrary')}{shortcutHint('openComponentLibrary')}</button><button onClick={() => { onOpenLatestRelease(); closeMenu() }}>{t('app.menu.help.changelog')}{shortcutHint('openLatestRelease')}</button><button onClick={() => { onOpenUsageStatistics(); closeMenu() }}>{t('usageStats.title')}</button><button onClick={() => { onOpenDiagnostics(); closeMenu() }}>{t('app.menu.help.diagnostics')}</button><button onClick={() => { onOpenAbout(); closeMenu() }}>{t('app.menu.help.about')}{shortcutHint('openAbout')}</button>{renderExistingMenuContributions('help', 'end')}</div>}</div>
      {renderExtensionTopMenusAt('after:help')}
      {renderExtensionTopMenusAt('end')}
    </nav>
    <div className="top-actions">
      <button className="icon-button" title={`${t('app.menu.file.new')} ${shortcutFor('newDocument')}`.trim()} aria-label={t('app.menu.file.new')} onClick={onNew}><PixelUtilityIcon kind="plus" /></button>
      <button className="icon-button" title={`${t('app.menu.file.open')} ${shortcutFor('openDocument')}`.trim()} aria-label={t('app.menu.file.open')} onClick={onOpen}><PixelUtilityIcon kind="folderOpen" /></button>
      <button className="icon-button" title={`${t('app.menu.file.save')} ${shortcutFor('save')}`.trim()} aria-label={t('app.menu.file.save')} disabled={!session} onClick={onSave}><PixelUtilityIcon kind="save" /></button>
      <button className="icon-button" title={`${t('app.menu.file.timelapse')} ${shortcutFor('openTimelapse')}`.trim()} aria-label={t('app.menu.file.timelapse')} disabled={!session} onClick={onOpenTimelapse}><PixelUtilityIcon kind="timelapse" /></button>
      <button className="top-export-button" title={`${t('app.menu.file.export')} ${shortcutFor('exportDocument')}`.trim()} disabled={!session} onClick={onExport}><PixelUtilityIcon kind="export" /><span>{t('app.menu.file.export')}</span></button>
    </div>
  </header></PerformanceProfiler>
}
