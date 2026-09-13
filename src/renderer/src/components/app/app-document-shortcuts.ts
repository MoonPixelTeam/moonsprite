import type { AppShortcutContext } from './app-shortcut-context'
import type { ColorMode } from '@shared/types-raster'
import type { AdjustmentKind } from '@/core/adjustments'
import { resolveCopyCommand } from '@/core/command-context'
import { type ShortcutId } from '@/core/shortcuts'

export function handleDocumentShortcuts(context: Pick<AppShortcutContext, 'openAdjustment' | 'event' | 'target' | 'workspace' | 'session' | 't' | 'matches' | 'runCommand' | 'commandScope' | 'selectionOverride' | 'uiCommands' | 'publishShortcutCommand'>): boolean {
  const { openAdjustment, event, workspace, session, t, matches, runCommand, commandScope, selectionOverride, uiCommands, publishShortcutCommand } = context
  if (runCommand('openHome', () => uiCommands['openHome']?.()))
    return true
  if (runCommand('newDocument', () => uiCommands['newDocument']?.()))
    return true
  if (runCommand('openDocument', () => uiCommands['openDocument']?.()))
    return true
  if (runCommand('save', () => { void workspace.saveActive() }))
    return true
  if (runCommand('exportDocument', () => uiCommands['exportDocument']?.()))
    return true
  if (runCommand('exportAllFrames', () => uiCommands['exportAllFrames']?.()))
    return true
  if (runCommand('exportSpriteSheet', () => uiCommands['exportSpriteSheet']?.()))
    return true
  if (runCommand('closeDocument', () => { if (workspace.activeId) void workspace.closeDocument(workspace.activeId) }))
    return true
  if (runCommand('openProjectFolder', () => uiCommands['openProjectFolder']?.()))
    return true
  if (runCommand('openTimelapse', () => uiCommands['openTimelapse']?.()))
    return true
  if (runCommand('openProjectInfo', () => uiCommands['openProjectInfo']?.()))
    return true
  if (runCommand('openScriptFolder', () => uiCommands['openScriptFolder']?.()))
    return true
  if (commandScope() === 'layers' && session?.freeTileInstanceLayerId && session.selectedFreeTileInstanceId
    && runCommand('copy', () => { workspace.copyFreeTileInstances() })) return true
  if (session?.selectedAnimationMaskCellKeys.length && !selectionOverride() && runCommand('copy', () => workspace.copySelectedAnimationMasks()))
    return true
  if (session?.selectedAnimationCellKeys.length && !selectionOverride() && runCommand('copy', () => workspace.copySelectedAnimationCels()))
    return true
  if (session?.selectedAnimationFrameIds.length && runCommand('copy', () => workspace.copySelectedAnimationFrames()))
    return true
  if (runCommand('copy', () => {
    const target = selectionOverride() && session?.selection
    ? 'selection'
    : resolveCopyCommand(commandScope(), Boolean(session?.selection))
    if (target === 'layers') workspace.copySelectedLayersToClipboard()
    else if (target === 'selection') workspace.copySelection()
    else if (commandScope() === 'palette') workspace.setMessage(t('app.palette.copyUnsupported'))
    else if (session?.selectedLayerIds.length || session?.selectedGroupIds.length) workspace.copySelectedLayersToClipboard()
    else workspace.setMessage(t('app.copy.required'))
  }))
    return true
  if (runCommand('cut', () => workspace.cutSelection()))
    return true
  if (runCommand('paste', () => {
    const hasAnimationTarget = Boolean(session && (session.selectedAnimationMaskCellKeys.length || session.selectedAnimationCellKeys.length || session.selectedAnimationFrameIds.length))
    if (!session || (!hasAnimationTarget && !session.activeLayerMaskId && session.selectedLayerIds.length === 0 && session.selectedGroupIds.length === 0 && !session.selectedGroupId)) {
      workspace.setMessage(t('workspace.clipboard.selectTarget'))
      return
    }
    if (commandScope() === 'palette') { workspace.setMessage(t('app.palette.pasteUnsupported')); return }
    // Centralize clipboard precedence (OS image first, then animation or
    // internal layer payload) so every paste entry point sees the latest
    // copy source regardless of the active panel.
    void workspace.pasteClipboard()
  }))
    return true
  if (runCommand('pasteAsNewLayer', () => { void workspace.pasteAsNewLayer() }))
    return true
  if (runCommand('pasteAsNewDocument', () => { void workspace.pasteAsNewDocument() }))
    return true
  if (runCommand('swapForegroundBackground', () => workspace.swapPrimarySecondaryColors()))
    return true
  if (runCommand('replaceColor', () => uiCommands['replaceColor']?.()))
    return true
  const adjustmentShortcuts: Array<[ShortcutId, AdjustmentKind]> = [
    ['adjustmentColorBalance', 'color-balance'],
    ['adjustmentBrightnessContrast', 'brightness-contrast'],
    ['adjustmentHueSaturation', 'hue-saturation'],
    ['adjustmentCurves', 'curves']
  ]
  const adjustment = adjustmentShortcuts.find(([action]) => matches(action))
  if (adjustment) {
    event.preventDefault()
    event.stopPropagation()
    if (session && !event.repeat) { openAdjustment(adjustment[1]) }
    return true
  }
  const paletteShortcut = ([
    'togglePaletteEditLock', 'extractPaletteColors', 'togglePaletteColorSync', 'reversePaletteColors',
    'createPaletteGradient', 'createPaletteHueGradient', 'sortPaletteHue', 'sortPaletteSaturation',
    'sortPaletteBrightness', 'sortPaletteLuminance', 'sortPaletteRed', 'sortPaletteGreen',
    'sortPaletteBlue', 'sortPaletteAlpha', 'paletteSortAscending', 'paletteSortDescending',
    'paletteSwatchTiny', 'paletteSwatchSmall', 'paletteSwatchMedium', 'paletteSwatchLarge',
    'paletteSwatchHuge', 'savePalette', 'openPaletteFolder', 'refreshPalettes'
  ] as const).find((id) => matches(id))
  if (paletteShortcut) {
    event.preventDefault()
    event.stopPropagation()
    if (!event.repeat) publishShortcutCommand(paletteShortcut, 'palette')
    return true
  }
  if (runCommand('openShortcutSettings', () => uiCommands['openShortcutSettings']?.()))
    return true
  if (runCommand('openPreferences', () => uiCommands['openPreferences']?.()))
    return true
  if (runCommand('canvasResize', () => uiCommands['canvasResize']?.()))
    return true
  if (runCommand('imageResize', () => uiCommands['imageResize']?.()))
    return true
  if (runCommand('convertColorMode', () => {
    if (!session) return
    const modes: ColorMode[] = ['rgba', 'indexed', 'grayscale']
    void workspace.convertColorMode(modes[(modes.indexOf(session.document.colorMode) + 1) % modes.length])
  }))
    return true
  const colorModeShortcut = ([
    ['convertColorModeRgba', 'rgba'],
    ['convertColorModeIndexed', 'indexed'],
    ['convertColorModeGrayscale', 'grayscale']
  ] as const).find(([id]) => matches(id))
  if (colorModeShortcut) {
    event.preventDefault()
    event.stopPropagation()
    if (session && !event.repeat) void workspace.convertColorMode(colorModeShortcut[1])
    return true
  }
  if (runCommand('cropCanvas', () => { if (session?.selection) void workspace.cropActiveCanvas() }))
    return true
  if (runCommand('trimCanvas', () => { if (session) void workspace.trimActiveCanvas() }))
    return true
  return false
}
