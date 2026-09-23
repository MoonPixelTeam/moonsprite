import { editCommandIcons } from './edit-command-icons'
import type { PixelUtilityIconKind } from '@/components/PixelUtilityIcon'
import type { QuickCommandId } from '@/core/file-preferences'
import type { TranslationKey } from '@/core/localization'
import type { ShortcutId } from '@/core/shortcuts'
import quickAntiAliasIcon from '@/assets/pixel-icons/quick-command-anti-alias.svg'

export type QuickCommandSettingsTarget = 'grid' | 'appearance'

export interface QuickCommandMetadata {
  id: QuickCommandId
  label: TranslationKey
  description: TranslationKey
  icon: PixelUtilityIconKind
  iconSource?: string
  shortcutId?: ShortcutId
  settingsTarget?: QuickCommandSettingsTarget
}

export const QUICK_COMMAND_METADATA: Record<QuickCommandId, QuickCommandMetadata> = {
  cut: { id: 'cut', iconSource: editCommandIcons.cut, label: 'quickCommands.cut', description: 'quickCommands.cut', icon: 'delete', shortcutId: 'cut' },
  copy: { id: 'copy', label: 'common.copy', description: 'common.copy', icon: 'copy', shortcutId: 'copy' },
  copyMerged: { id: 'copyMerged', iconSource: editCommandIcons.copyMerged, label: 'quickCommands.copyMerged', description: 'quickCommands.copyMerged', icon: 'mergeVisible', shortcutId: 'copyMerged' },
  paste: { id: 'paste', label: 'common.paste', description: 'common.paste', icon: 'paste', shortcutId: 'paste' },
  pasteToCurrentCell: { id: 'pasteToCurrentCell', iconSource: editCommandIcons.pasteToCurrentCell, label: 'app.menu.edit.pasteToCurrentCell', description: 'app.menu.edit.pasteToCurrentCell', icon: 'paste' },
  pasteAsNewDocument: { id: 'pasteAsNewDocument', label: 'app.menu.edit.pasteAsDocument', description: 'app.menu.edit.pasteAsDocument', icon: 'plus', shortcutId: 'pasteAsNewDocument' },
  pasteAsNewLayer: { id: 'pasteAsNewLayer', iconSource: editCommandIcons.pasteAsNewLayer, label: 'app.menu.edit.pasteAsLayer', description: 'app.menu.edit.pasteAsLayer', icon: 'paste', shortcutId: 'pasteAsNewLayer' },
  deleteContent: { id: 'deleteContent', iconSource: editCommandIcons.deleteContent, label: 'common.delete', description: 'common.delete', icon: 'delete', shortcutId: 'deleteLayer' },
  quickOutline: { id: 'quickOutline', iconSource: editCommandIcons.quickOutline, label: 'quickCommands.quickOutline', description: 'quickCommands.quickOutline', icon: 'selectionOutline', shortcutId: 'quickOutline' },
  outline: { id: 'outline', iconSource: editCommandIcons.outline, label: 'app.menu.select.outline', description: 'app.menu.select.outline', icon: 'properties', shortcutId: 'outline' },
  selectionFlipHorizontal: { id: 'selectionFlipHorizontal', label: 'quickCommands.selectionFlipHorizontal', description: 'quickCommands.selectionFlipHorizontalDescription', icon: 'selectionFlipHorizontal', shortcutId: 'flipHorizontal' },
  selectionFlipVertical: { id: 'selectionFlipVertical', label: 'quickCommands.selectionFlipVertical', description: 'quickCommands.selectionFlipVerticalDescription', icon: 'selectionFlipVertical', shortcutId: 'flipVertical' },
  canvasMirrorHorizontal: { id: 'canvasMirrorHorizontal', label: 'quickCommands.canvasMirrorHorizontal', description: 'quickCommands.canvasMirrorHorizontalDescription', icon: 'canvasMirrorHorizontal', shortcutId: 'mirrorView' },
  canvasMirrorVertical: { id: 'canvasMirrorVertical', label: 'quickCommands.canvasMirrorVertical', description: 'quickCommands.canvasMirrorVerticalDescription', icon: 'canvasMirrorVertical', shortcutId: 'mirrorViewVertical' },
  invertSelection: { id: 'invertSelection', label: 'quickCommands.invertSelection', description: 'quickCommands.invertSelectionDescription', icon: 'selectAll', shortcutId: 'invertSelection' },
  customGrid: { id: 'customGrid', label: 'quickCommands.customGrid', description: 'quickCommands.customGridDescription', icon: 'grid', shortcutId: 'toggleCustomGrid', settingsTarget: 'grid' },
  tileRepeatX: { id: 'tileRepeatX', label: 'quickCommands.tileRepeatX', description: 'quickCommands.tileRepeatXDescription', icon: 'tileRepeatX', shortcutId: 'tileRepeatX' },
  tileRepeatY: { id: 'tileRepeatY', label: 'quickCommands.tileRepeatY', description: 'quickCommands.tileRepeatYDescription', icon: 'tileRepeatY', shortcutId: 'tileRepeatY' },
  tileRepeatBoth: { id: 'tileRepeatBoth', label: 'quickCommands.tileRepeatBoth', description: 'quickCommands.tileRepeatBothDescription', icon: 'tileRepeatBoth', shortcutId: 'tileRepeatBoth' },
  undo: { id: 'undo', label: 'quickCommands.undo', description: 'quickCommands.undoDescription', icon: 'undo', shortcutId: 'undo' },
  redo: { id: 'redo', label: 'quickCommands.redo', description: 'quickCommands.redoDescription', icon: 'redo', shortcutId: 'redo' },
  selectAll: { id: 'selectAll', label: 'quickCommands.selectAll', description: 'quickCommands.selectAllDescription', icon: 'invertSelection', shortcutId: 'selectAll' },
  deselect: { id: 'deselect', label: 'quickCommands.deselect', description: 'quickCommands.deselectDescription', icon: 'deselect', shortcutId: 'deselect' },
  pixelGrid: { id: 'pixelGrid', label: 'quickCommands.pixelGrid', description: 'quickCommands.pixelGridDescription', icon: 'grid', shortcutId: 'toggleGrid', settingsTarget: 'appearance' },
  selectionOutline: { id: 'selectionOutline', label: 'quickCommands.selectionOutline', description: 'quickCommands.selectionOutlineDescription', icon: 'selectionOutline', shortcutId: 'toggleSelectionOutline' },
  relativeLuminance: { id: 'relativeLuminance', label: 'quickCommands.relativeLuminance', description: 'quickCommands.relativeLuminanceDescription', icon: 'image', shortcutId: 'relativeLuminance', settingsTarget: 'appearance' },
  resetView: { id: 'resetView', label: 'quickCommands.resetView', description: 'quickCommands.resetViewDescription', icon: 'resetView', shortcutId: 'resetView' },
  fillForeground: { id: 'fillForeground', label: 'quickCommands.fillForeground', description: 'quickCommands.fillForegroundDescription', icon: 'paletteLocal', shortcutId: 'fillForeground' },
  deleteSelection: { id: 'deleteSelection', label: 'quickCommands.deleteSelection', description: 'quickCommands.deleteSelectionDescription', icon: 'deleteSelection', shortcutId: 'deleteSelection' },
  quickAntiAlias: { id: 'quickAntiAlias', label: 'quickCommands.quickAntiAlias', description: 'quickCommands.quickAntiAliasDescription', icon: 'selectionOutline', iconSource: quickAntiAliasIcon },
  swapForegroundBackground: { id: 'swapForegroundBackground', label: 'quickCommands.swapForegroundBackground', description: 'quickCommands.swapForegroundBackgroundDescription', icon: 'refresh', shortcutId: 'swapForegroundBackground' },
  createBrushFromSelection: { id: 'createBrushFromSelection', label: 'quickCommands.createBrushFromSelection', description: 'quickCommands.createBrushFromSelectionDescription', icon: 'plus', shortcutId: 'createBrushFromSelection' },
  rotateViewClockwise90: { id: 'rotateViewClockwise90', label: 'quickCommands.rotateViewClockwise90', description: 'quickCommands.rotateViewClockwise90Description', icon: 'rotateClockwise90', shortcutId: 'rotateViewClockwise90' },
  rotateViewCounterClockwise90: { id: 'rotateViewCounterClockwise90', label: 'quickCommands.rotateViewCounterClockwise90', description: 'quickCommands.rotateViewCounterClockwise90Description', icon: 'rotateCounterClockwise90', shortcutId: 'rotateViewCounterClockwise90' },
  detectImageScale: { id: 'detectImageScale', label: 'quickCommands.detectImageScale', description: 'quickCommands.detectImageScaleDescription', icon: 'detectImageScale' },
  centerSelectionBoth: { id: 'centerSelectionBoth', label: 'quickCommands.centerSelectionBoth', description: 'quickCommands.centerSelectionBothDescription', icon: 'canvasCenter' },
  centerSelectionHorizontal: { id: 'centerSelectionHorizontal', label: 'quickCommands.centerSelectionHorizontal', description: 'quickCommands.centerSelectionHorizontalDescription', icon: 'canvasHorizontalCenter' },
  centerSelectionVertical: { id: 'centerSelectionVertical', label: 'quickCommands.centerSelectionVertical', description: 'quickCommands.centerSelectionVerticalDescription', icon: 'canvasVerticalCenter' }
}
