import type { AppShortcutContext } from './app-shortcut-context'

export function handleLayersShortcuts(context: Pick<AppShortcutContext, 'event' | 'workspace' | 'session' | 'matches' | 'runCommand' | 'timelineHidden' | 'publishShortcutCommand'>): boolean {
  const { event, workspace, session, matches, runCommand, timelineHidden, publishShortcutCommand } = context
  const layerPanelShortcut = ([
    'newTilemapLayer', 'newFreeTileLayer', 'newBackgroundLayer', 'createLinkedLayer',
    'convertLayerToBackground', 'convertLayerToTilemap', 'convertLayerToRaster', 'openLayerProperties',
    'toggleLayerMask', 'toggleGroupMask', 'openLayerStyles', 'toggleLayerStyles', 'copyLayerStyles',
    'pasteLayerStyles', 'clearLayerStyles', 'openLayerSettings', 'copyAnimationFrames',
    'pasteAnimationFrames', 'pasteAnimationCels', 'copyAnimationMasks', 'pasteAnimationMasks',
    'connectAnimationCels', 'disconnectAnimationCels', 'connectAnimationMasks', 'disconnectAnimationMasks',
    'toggleAnimationMask', 'createAnimationLoopSection', 'openAnimationFrameProperties',
    'enableAnimationFrames', 'disableAnimationFrames', 'toggleAnimationFramesDisabled',
    'toggleOnionSkin',
    'playAnimationLoopSection', 'openAnimationLoopSectionProperties', 'deleteAnimationLoopSection',
    'openAnimationCelProperties', 'showOnlyFreeTileInstance', 'openFreeTileInstanceProperties',
    'rotateFreeTileInstance90', 'mirrorFreeTileInstanceHorizontal', 'mirrorFreeTileInstanceVertical',
    'deleteFreeTileInstances'
  ] as const).find((id) => matches(id))
  if (layerPanelShortcut) {
    event.preventDefault()
    event.stopPropagation()
    if (!event.repeat) publishShortcutCommand(layerPanelShortcut, 'layers')
    return true
  }
  const tilesetPanelShortcut = ([
    'tilemapModeEdit', 'tilemapModeCreate', 'tilemapModeHybrid', 'tilemapModePaint',
    'freeTileModeEdit', 'freeTileModePaint', 'addFreeTileSource', 'deleteTilesetSelection',
    'openFreeTileSourceProperties'
  ] as const).find((id) => matches(id))
  if (tilesetPanelShortcut) {
    event.preventDefault()
    event.stopPropagation()
    if (!event.repeat) publishShortcutCommand(tilesetPanelShortcut, 'tileset')
    return true
  }
  const brushPanelShortcut = ([
    'importBrushImage', 'createBrushFolder', 'openBrushFolder', 'refreshBrushLibrary',
    'brushLibraryParentFolder', 'brushSwatchSmall', 'brushSwatchMedium', 'brushSwatchLarge',
    'deleteBrushSelection'
  ] as const).find((id) => matches(id))
  if (brushPanelShortcut) {
    event.preventDefault()
    event.stopPropagation()
    if (!event.repeat) publishShortcutCommand(brushPanelShortcut, 'brushes')
    return true
  }
  if (runCommand('createLayerGroup', () => workspace.createLayerGroup()))
    return true
  if (runCommand('toggleClippingMask', () => workspace.toggleActiveClippingMask()))
    return true
  if (runCommand('toggleSelectedLayerVisibility', () => {
    if (!session) return
    const layerIds = session.selectedLayerIds.length > 0 ? session.selectedLayerIds : [session.document.activeLayerId]
    for (const layerId of layerIds) workspace.toggleLayerVisibility(layerId)
    for (const groupId of session.selectedGroupIds) workspace.toggleGroupVisibility(groupId)
  }))
    return true
  if (runCommand('toggleSelectedLayerLock', () => {
    if (!session) return
    const layerIds = session.selectedLayerIds.length > 0 ? session.selectedLayerIds : [session.document.activeLayerId]
    for (const layerId of layerIds) {
      const layer = session.document.layers.find((candidate) => candidate.id === layerId)
      if (layer) workspace.setLayerPropertiesWithBlend(layer.id, layer.name, layer.opacity, layer.blendMode, !layer.locked, layer.displayColor, layer.description)
    }
    for (const groupId of session.selectedGroupIds) {
      const group = session.document.groups.find((candidate) => candidate.id === groupId)
      if (group) workspace.setGroupProperties(group.id, group.name, group.opacity, group.blendMode, !group.locked, group.displayColor, group.description, group.cumulativeBlend)
    }
  }))
    return true
  if (runCommand('toggleSelectedGroupCollapsed', () => {
    if (!session) return
    for (const groupId of session.selectedGroupIds) workspace.toggleGroupCollapsed(groupId)
  }))
    return true
  if (runCommand('newLayer', () => { void workspace.addLayer() }))
    return true
  const playbackModeShortcut = ([
    ['animationPlaybackOnce', 'once'],
    ['animationPlaybackAll', 'all'],
    ['animationPlaybackTag', 'tag']
  ] as const).find(([id]) => matches(id))
  if (playbackModeShortcut) {
    event.preventDefault()
    event.stopPropagation()
    if (session && !event.repeat) workspace.setAnimationPlaybackMode(playbackModeShortcut[1])
    return true
  }
  const playbackRateShortcut = ([
    ['animationPlaybackSpeed025', 0.25],
    ['animationPlaybackSpeed050', 0.5],
    ['animationPlaybackSpeed100', 1],
    ['animationPlaybackSpeed150', 1.5],
    ['animationPlaybackSpeed200', 2],
    ['animationPlaybackSpeed300', 3]
  ] as const).find(([id]) => matches(id))
  if (playbackRateShortcut) {
    event.preventDefault()
    event.stopPropagation()
    if (session && !event.repeat) workspace.setAnimationPlaybackRate(playbackRateShortcut[1])
    return true
  }
  if (runCommand('toggleAnimationReturnToStart', () => {
    if (session) workspace.setAnimationReturnToStart(!session.animationReturnToStart)
  }))
    return true
  if (runCommand('previousAnimationFrame', () => { if (session && !timelineHidden) workspace.stepAnimationFrame(-1) }))
    return true
  if (runCommand('nextAnimationFrame', () => { if (session && !timelineHidden) workspace.stepAnimationFrame(1) }))
    return true
  if (runCommand('addAnimationFrame', () => { if (session && !timelineHidden) workspace.duplicateAnimationFrame() }))
    return true
  if (runCommand('addLinkedAnimationFrame', () => { if (session && !timelineHidden) workspace.addLinkedAnimationFrame() }))
    return true
  if (runCommand('addBlankAnimationFrame', () => { if (session && !timelineHidden) workspace.addAnimationFrame() }))
    return true
  if (runCommand('deleteAnimationFrame', () => { if (session && !timelineHidden) workspace.deleteSelectedAnimationItems() }))
    return true
  if (runCommand('duplicateLayer', () => workspace.duplicateActiveLayer()))
    return true
  if (runCommand('mergeLayerDown', () => workspace.mergeActiveLayerDown()))
    return true
  if (runCommand('mergeSelectedLayers', () => workspace.mergeSelectedLayers()))
    return true
  if (runCommand('mergeLayerGroup', () => workspace.mergeSelectedGroup()))
    return true
  if (runCommand('mergeVisibleLayers', () => workspace.mergeVisibleLayers()))
    return true
  if (runCommand('ungroupLayers', () => workspace.ungroupSelected()))
    return true
  return false
}
