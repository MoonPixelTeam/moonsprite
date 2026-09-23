import type { ReactNode } from 'react'
import { MenuItemButton } from '@/components/MenuItemButton'
import { PixelRightIcon } from '@/components/PixelUtilityIcon'
import { useI18n } from '@/components/I18nProvider'
import { shortcutLabels } from '@/locales/shortcut-labels'
import { translateSourceText } from '@/core/localization'
import type { ShortcutId } from '@/core/shortcuts'
import { useWorkspace } from '@/store/workspace'
import { cutWorkspaceItems } from '@/store/workspace-cut'
import { invertWorkspaceColors, rotateWorkspaceContent } from '@/store/workspace-edit-actions'

export function EditMenuCommands({ shortcutFor, closeMenu, onOpenOutline, pasteSpecial }: { shortcutFor: (id: ShortcutId) => string; closeMenu: () => void; onOpenOutline: () => void; pasteSpecial: ReactNode }) {
  const { locale, t } = useI18n()
  const state = useWorkspace.getState()
  const session = state.sessions.find(item => item.document.id === state.activeId)
  const labels = shortcutLabels(locale)
  const item = (id: ShortcutId, run: () => void, label = labels[id]) => <MenuItemButton disabled={!session} onClick={() => { run(); closeMenu() }}>{label}{shortcutFor(id) && <kbd>{shortcutFor(id)}</kbd>}</MenuItemButton>
  const submenu = (label: string, children: ReactNode) => <div className="menu-submenu"><MenuItemButton className="menu-submenu-trigger" disabled={!session}><span className="menu-submenu-label">{label}</span><span className="menu-submenu-arrow" aria-hidden="true"><PixelRightIcon /></span></MenuItemButton><div className="menu-popover menu-submenu-popover">{children}</div></div>
  const clipboardTarget = () => session?.selection ? 'selection' : session?.selectedAnimationMaskCellKeys.length ? 'masks' : session?.selectedAnimationCellKeys.length ? 'cels' : session?.selectedAnimationFrameIds.length ? 'frames' : 'layers'
  const copy = () => {
    switch (clipboardTarget()) {
      case 'selection': state.copySelection(); break
      case 'masks': state.copySelectedAnimationMasks(); break
      case 'cels': state.copySelectedAnimationCels(); break
      case 'frames': state.copySelectedAnimationFrames(); break
      default: state.copySelectedLayersToClipboard()
    }
  }
  return <>
    <span className="menu-divider" />
    {item('cut', () => cutWorkspaceItems(clipboardTarget()))}
    {item('copy', copy)}
    {item('copyMerged', () => state.copySelection(true))}
    {item('paste', () => { void state.pasteClipboard() })}
    {pasteSpecial}
    {item('deleteLayer', () => { if (session?.selection) state.deleteSelection(); else state.deleteActiveLayer() }, t('common.delete'))}
    <span className="menu-divider" />
    {item('fillForeground', state.fillForeground, (translateSourceText(locale, '填充') || (locale === 'zh-CN' ? '填充' : 'Fill')))}
    {submenu(t('app.menu.select.outline'), <>{item('quickOutline', () => { state.quickOutlineActiveSelection() })}{item('outline', onOpenOutline)}</>)}
    <span className="menu-divider" />
    {item('transform', state.beginLayerTransform)}
    {submenu((translateSourceText(locale, '旋转') || (locale === 'zh-CN' ? '旋转' : 'Rotate')), <>{item('rotateContent180', () => rotateWorkspaceContent(180))}{item('rotateContentCounterClockwise', () => rotateWorkspaceContent(-90))}{item('rotateContentClockwise', () => rotateWorkspaceContent(90))}</>)}
    {submenu((translateSourceText(locale, '镜像') || (locale === 'zh-CN' ? '镜像' : 'Mirror')), <>{item('flipHorizontal', () => state.flipActiveSelection('horizontal'))}{item('flipVertical', () => state.flipActiveSelection('vertical'))}</>)}
    {submenu(t('canvasResize.anchor.center'), <>{item('centerContentBoth', () => state.centerActiveContent('both'))}{item('centerContentHorizontal', () => state.centerActiveContent('horizontal'))}{item('centerContentVertical', () => state.centerActiveContent('vertical'))}</>)}
    <span className="menu-divider" />
    {item('invertColors', invertWorkspaceColors)}
  </>
}
