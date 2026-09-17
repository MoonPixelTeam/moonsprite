import { useCallback, useEffect, useMemo, useState } from 'react'
import type { StoredExtension, ExtensionPackagePreview } from '@shared/types-extensions'
import {
  listExtensionPanelContributions,
  listExtensionTopMenuContributions,
  reconcileExtensionPanelVisibility,
  saveExtensionPanelVisibility
} from '@/core/extension-contributions'
import { useWorkspace } from '@/store/workspace'
import { useI18n } from '@/components/I18nProvider'

export function useAppExtensions({
  openMenu,
  setOpenMenu,
  refreshLuaScripts
}: {
  openMenu: string | null
  setOpenMenu: (menu: string | null) => void
  refreshLuaScripts: () => Promise<void>
}) {
  const { t } = useI18n()
  const workspace = useWorkspace.getState()
  const [extensions, setExtensions] = useState<StoredExtension[]>([])

  const [extensionPanelVisibility, setExtensionPanelVisibility] = useState<Record<string, boolean>>({})

  const refreshExtensions = useCallback(async (): Promise<void> => {
    try {
      const listing = await window.moonSprite.listExtensions()
      setExtensions(listing.extensions)
      setExtensionPanelVisibility((current) => reconcileExtensionPanelVisibility(listing.extensions, current))
    } catch {
      setExtensions([])
      setExtensionPanelVisibility({})
    }
  }, [])

  useEffect(() => {
    void refreshLuaScripts()
    void refreshExtensions()
  }, [refreshExtensions, refreshLuaScripts])

  useEffect(() => {
    if (openMenu === 'file') void refreshLuaScripts()
  }, [openMenu, refreshLuaScripts])

  useEffect(() => {
    if (!openMenu?.startsWith('extension-menu:')) return
    if (listExtensionTopMenuContributions(extensions).some((contribution) => contribution.openMenuId === openMenu)) return
    setOpenMenu(null)
  }, [extensions, openMenu])

  useEffect(() => {
    const onExtensionsChanged = (): void => {
      void refreshLuaScripts()
      void refreshExtensions()
    }
    window.addEventListener('moonsprite:extensions-changed', onExtensionsChanged)
    return () => window.removeEventListener('moonsprite:extensions-changed', onExtensionsChanged)
  }, [refreshExtensions, refreshLuaScripts])

  const extensionPanelContributions = useMemo(() => listExtensionPanelContributions(extensions), [extensions])

  const setExtensionPanelVisible = useCallback((key: string, visible: boolean): void => {
    setExtensionPanelVisibility((current) => ({ ...current, [key]: visible }))
    saveExtensionPanelVisibility(key, visible)
  }, [])

  const toggleExtensionPanel = useCallback((key: string): void => {
    setExtensionPanelVisibility((current) => {
      const visible = !current[key]
      saveExtensionPanelVisibility(key, visible)
      return { ...current, [key]: visible }
    })
  }, [])

  const openLuaScriptFolder = async (): Promise<void> => {
    try {
      await window.moonSprite.openLuaScriptFolder()
    } catch (error) {
      useWorkspace.getState().setMessage(error instanceof Error ? error.message : t('script.folderOpenFailed'))
    }
  }

  const confirmExtensionInstall = async (preview: ExtensionPackagePreview): Promise<boolean> => {
    const detail = [
      `作者：${preview.author || '未提供'}　版本：${preview.version || '未提供'}`,
      `标识：${preview.id}`,
      preview.description || '此扩展未提供描述。',
      `包含：命令 ${preview.commandCount} · 面板 ${preview.panelCount} · 菜单 ${preview.menuCount}`
    ]
      .filter(Boolean)
      .join('\n')
    const choice = await workspace.requestDialog({
      title: '安装扩展',
      message: `是否安装“${preview.name}”？`,
      detail,
      choices: [
        { id: 'cancel', label: t('common.cancel'), tone: 'quiet' },
        { id: 'install', label: '安装', tone: 'primary' }
      ]
    })
    return choice === 'install'
  }

  const installExtensionPackage = async (filePath: string): Promise<boolean> => {
    try {
      const preview = await window.moonSprite.inspectExtensionPackage(filePath)
      if (!(await confirmExtensionInstall(preview))) return false
      const extension = await window.moonSprite.installExtension(filePath)
      window.dispatchEvent(new Event('moonsprite:extensions-changed'))
      useWorkspace.getState().setMessage(t('preferences.extensions.installSuccess', { name: extension.name }))
      return true
    } catch (error) {
      useWorkspace.getState().setMessage(error instanceof Error ? error.message : t('preferences.extensions.installFailed'))
      return false
    }
  }
  return {
    extensions,
    extensionPanelVisibility,
    extensionPanelContributions,
    setExtensionPanelVisible,
    toggleExtensionPanel,
    openLuaScriptFolder,
    installExtensionPackage
  }
}
