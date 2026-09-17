import type { AppLocale } from './contracts'
import type { ShortcutId, ShortcutGroupId } from '@/core/shortcut-contracts'
import { shortcutGroupLabelsByLocale, shortcutLabelsByLocale } from './shortcuts'

export const SHORTCUT_GROUP_LABELS = shortcutGroupLabelsByLocale['zh-CN']
export const SHORTCUT_LABELS = shortcutLabelsByLocale['zh-CN']
export const shortcutGroupLabels = (locale: AppLocale): Record<ShortcutGroupId, string> => shortcutGroupLabelsByLocale[locale]
export const shortcutLabels = (locale: AppLocale): Record<ShortcutId, string> => shortcutLabelsByLocale[locale]
