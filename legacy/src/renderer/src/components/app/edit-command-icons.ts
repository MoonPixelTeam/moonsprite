import cutIcon from '@/assets/pixel-icons/quick-command-cut.svg'
import copyMergedIcon from '@/assets/pixel-icons/quick-command-copy-merged.svg'
import pasteAsNewLayerIcon from '@/assets/pixel-icons/quick-command-paste-as-new-layer.svg'
import deleteContentIcon from '@/assets/pixel-icons/quick-command-delete-content.svg'
import quickOutlineIcon from '@/assets/pixel-icons/quick-command-quick-outline.svg'
import outlineIcon from '@/assets/pixel-icons/quick-command-outline.svg'
import pasteToCurrentCellIcon from '@/assets/pixel-icons/quick-command-paste-to-current-cell.svg'

export const editCommandIcons = {
  pasteToCurrentCell: pasteToCurrentCellIcon,
  cut: cutIcon,
  copyMerged: copyMergedIcon,
  pasteAsNewLayer: pasteAsNewLayerIcon,
  deleteContent: deleteContentIcon,
  quickOutline: quickOutlineIcon,
  outline: outlineIcon,
} as const
