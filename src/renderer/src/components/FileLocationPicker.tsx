import { createPortal } from 'react-dom'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { PixelUtilityIcon } from '@/components/PixelUtilityIcon'
import { useI18n } from '@/components/I18nProvider'
import { RECENT_EXPORTS_CHANGED_EVENT, loadRecentExportPaths, loadRecentSavePaths, parentDirectoryFromPath, type RecentExportPath } from '@/core/export-settings'

interface FileLocationPickerProps {
  directory: string
  defaultDirectory: string
  localGalleryDirectory: string
  projectRootDirectory?: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onChooseDirectory: (directory: string) => Promise<void> | void
  onSelectDirectory: (directory: string) => void
  recentPathKind?: 'save' | 'export'
  disabled?: boolean
}

/** Shared location menu used by export and Save As dialogs. */
export function FileLocationPicker({ directory, defaultDirectory, localGalleryDirectory, projectRootDirectory = '', open, onOpenChange, onChooseDirectory, onSelectDirectory, recentPathKind = 'export', disabled = false }: FileLocationPickerProps) {
  const { t } = useI18n()
  const loadRecentPaths = (): RecentExportPath[] => recentPathKind === 'save' ? loadRecentSavePaths() : loadRecentExportPaths()
  const [recentPaths, setRecentPaths] = useState<RecentExportPath[]>(loadRecentPaths)
  const [choosing, setChoosing] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const [position, setPosition] = useState({ left: 8, top: 8, width: 280 })

  useEffect(() => {
    const sync = (): void => setRecentPaths(loadRecentPaths())
    window.addEventListener(RECENT_EXPORTS_CHANGED_EVENT, sync)
    return () => window.removeEventListener(RECENT_EXPORTS_CHANGED_EVENT, sync)
  }, [recentPathKind])

  useEffect(() => {
    if (!open) return
    const closeMenu = (event: PointerEvent): void => {
      const target = event.target
      if (!(target instanceof Element) || !target.closest('.export-file-control, .export-path-menu')) onOpenChange(false)
    }
    window.addEventListener('pointerdown', closeMenu)
    return () => window.removeEventListener('pointerdown', closeMenu)
  }, [onOpenChange, open])

  useLayoutEffect(() => {
    if (!open) return
    const place = (): void => {
      const trigger = triggerRef.current?.getBoundingClientRect()
      if (!trigger) return
      const width = Math.min(380, Math.max(1, window.innerWidth - 16))
      const left = Math.max(8, Math.min(window.innerWidth - width - 8, trigger.right - width))
      const top = window.innerHeight - trigger.bottom >= 220 ? trigger.bottom + 4 : Math.max(8, trigger.top - 220 - 4)
      setPosition({ left, top, width })
    }
    place()
    window.addEventListener('resize', place)
    return () => window.removeEventListener('resize', place)
  }, [open])

  const chooseDirectory = async (): Promise<void> => {
    if (disabled || choosing) return
    setChoosing(true)
    try {
      await onChooseDirectory(directory || defaultDirectory)
    } finally {
      setChoosing(false)
      onOpenChange(false)
    }
  }

  const selectDirectory = (nextDirectory: string): void => {
    onSelectDirectory(nextDirectory)
    onOpenChange(false)
  }

  return <>
    <button ref={triggerRef} type="button" className={open ? 'icon-button selected' : 'icon-button'} disabled={disabled || choosing} title={t('app.export.pathMenu')} aria-label={t('app.export.pathMenu')} aria-expanded={open} onClick={() => onOpenChange(!open)}><PixelUtilityIcon kind="folderOpen" /></button>
    {open && createPortal(<div className="export-path-menu context-menu" role="menu" aria-label={t('app.export.pathMenu')} style={position}>
      <button type="button" className="context-menu-item" role="menuitem" onClick={() => void chooseDirectory()}><PixelUtilityIcon kind="folderOpen" /><span>{t('app.export.choosePath')}</span></button>
      <button type="button" className="context-menu-item" role="menuitem" onClick={() => selectDirectory(localGalleryDirectory)}><PixelUtilityIcon kind="image" /><span>{t('app.export.localGallery')}</span></button>
      {recentPathKind === 'export' && projectRootDirectory && <button type="button" className="context-menu-item export-project-root" role="menuitem" onClick={() => selectDirectory(projectRootDirectory)}><PixelUtilityIcon kind="folderOpen" /><span title={t('app.export.projectRootDirectory', { path: projectRootDirectory })}>{t('app.export.projectRootDirectory', { path: projectRootDirectory })}</span></button>}
      <span className="context-menu-divider" />
      <strong className="export-path-menu-heading">{t('app.export.recentPaths')}</strong>
      {recentPaths.length === 0 ? <span className="export-path-menu-empty">{t('app.export.noRecentPaths')}</span> : recentPaths.map((item) => <button type="button" className="context-menu-item export-recent-path" role="menuitem" key={item.filePath.toLocaleLowerCase()} title={item.filePath} onClick={() => selectDirectory(parentDirectoryFromPath(item.filePath))}><PixelUtilityIcon kind="export" /><span>{item.filePath}</span></button>)}
    </div>, document.body)}
  </>
}
