import type { AppShortcutContext } from './app-shortcut-context'

export function handleViewShortcuts(context: Pick<AppShortcutContext, 'event' | 'workspace' | 'session' | 'matches' | 'runCommand' | 'uiCommands'>): boolean {
  const { event, workspace, session, matches, runCommand, uiCommands } = context
  if (runCommand('relativeLuminance', () => { if (session) workspace.setView({ relativeLuminance: !session.view.relativeLuminance }) }))
    return true
  if (runCommand('mirrorView', () => uiCommands['mirrorView']?.()))
    return true
  if (runCommand('mirrorViewVertical', () => uiCommands['mirrorViewVertical']?.()))
    return true
  if (runCommand('toggleGrid', () => { if (session) workspace.togglePixelGrid() }))
    return true
  if (runCommand('toggleCustomGrid', () => { if (session) workspace.toggleGrid() }))
    return true
  if (runCommand('toggleIsoView', () => { if (session) workspace.setView({ isoViewEnabled: session.view.isoViewEnabled !== true }) }))
    return true
  if (runCommand('toggleSliceOutlines', () => uiCommands['toggleSliceOutlines']?.()))
    return true
  if (runCommand('openGridSettings', () => uiCommands['openGridSettings']?.()))
    return true
  if (runCommand('openIsoViewSettings', () => uiCommands['openIsoViewSettings']?.()))
    return true
  const tileRepeatShortcut = ([
    ['tileRepeatOff', 'off'],
    ['tileRepeatBoth', 'both'],
    ['tileRepeatX', 'x'],
    ['tileRepeatY', 'y']
  ] as const).find(([id]) => matches(id))
  if (tileRepeatShortcut) {
    event.preventDefault()
    event.stopPropagation()
    if (session && !event.repeat) workspace.setTileRepeatMode(tileRepeatShortcut[1])
    return true
  }
  if (runCommand('toggleSelectionOutline', () => { if (session) workspace.toggleSelectionOutline() }))
    return true
  if (runCommand('rotateViewClockwise90', () => { if (session) workspace.setView({ rotation: (session.view.rotation + 90) % 360 }) }))
    return true
  if (runCommand('rotateViewCounterClockwise90', () => { if (session) workspace.setView({ rotation: (session.view.rotation + 270) % 360 }) }))
    return true
  if (runCommand('resetView', () => { if (session) workspace.setView({ zoom: 16, panX: 0, panY: 0, rotation: 0, mirrored: false, mirroredVertical: false }) }))
    return true
  if (runCommand('toggleColorPanel', () => uiCommands['toggleColorPanel']?.()))
    return true
  if (runCommand('togglePalettePanel', () => uiCommands['togglePalettePanel']?.()))
    return true
  if (runCommand('toggleLayersPanel', () => uiCommands['toggleLayersPanel']?.()))
    return true
  if (runCommand('togglePreviewPanel', () => uiCommands['togglePreviewPanel']?.()))
    return true
  if (runCommand('toggleTilesetPanel', () => uiCommands['toggleTilesetPanel']?.()))
    return true
  if (runCommand('toggleBrushLibraryPanel', () => uiCommands['toggleBrushLibraryPanel']?.()))
    return true
  if (runCommand('popupColorPanel', () => uiCommands['popupColorPanel']?.()))
    return true
  if (runCommand('popupPalettePanel', () => uiCommands['popupPalettePanel']?.()))
    return true
  if (runCommand('popupLayersPanel', () => uiCommands['popupLayersPanel']?.()))
    return true
  if (runCommand('popupPreviewPanel', () => uiCommands['popupPreviewPanel']?.()))
    return true
  if (runCommand('popupTilesetPanel', () => uiCommands['popupTilesetPanel']?.()))
    return true
  if (runCommand('popupBrushLibraryPanel', () => uiCommands['popupBrushLibraryPanel']?.()))
    return true
  if (runCommand('toggleTimeline', () => uiCommands['toggleTimeline']?.()))
    return true
  if (runCommand('toolRailLeft', () => uiCommands['toolRailLeft']?.()))
    return true
  if (runCommand('toolRailRight', () => uiCommands['toolRailRight']?.()))
    return true
  if (runCommand('toolRailTop', () => uiCommands['toolRailTop']?.()))
    return true
  if (runCommand('toolRailBottom', () => uiCommands['toolRailBottom']?.()))
    return true
  if (runCommand('saveWorkspaceLayout', () => uiCommands['saveWorkspaceLayout']?.()))
    return true
  if (runCommand('resetWorkspaceLayout', () => uiCommands['resetWorkspaceLayout']?.()))
    return true
  if (runCommand('openWorkspaceManager', () => uiCommands['openWorkspaceManager']?.()))
    return true
  if (runCommand('openComponentLibrary', () => uiCommands['openComponentLibrary']?.()))
    return true
  if (runCommand('openLatestRelease', () => uiCommands['openLatestRelease']?.()))
    return true
  if (runCommand('openAbout', () => uiCommands['openAbout']?.()))
    return true
  return false
}
