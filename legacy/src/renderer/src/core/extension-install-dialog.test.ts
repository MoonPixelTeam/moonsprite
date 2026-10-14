import { describe, expect, it } from 'vitest'
import { extensionInstallDialogContent } from './extension-install-dialog'
import type { ExtensionPackagePreview, StoredExtension } from '@shared/types-extensions'

const preview: ExtensionPackagePreview = {
  id: 'com.example.sample', name: 'Sample', version: '2.0.0', author: 'MoonSprite', description: 'Sample extension', commandCount: 2, panelCount: 1, menuCount: 3
}

const installed: StoredExtension = {
  id: preview.id, name: preview.name, version: '1.0.0', description: '', author: '', hasLuaEntry: false, hasSettings: false,
  commands: [], panels: [], menuItems: [], topMenus: [], enabled: false
}

describe('extensionInstallDialogContent', () => {
  it('shows both versions and replacement consequences for an installed extension id', () => {
    expect(extensionInstallDialogContent(preview, installed)).toMatchObject({
      title: '扩展版本冲突',
      confirmLabel: '替换安装'
    })
    expect(extensionInstallDialogContent(preview, installed).detailSections[0].lines).toContain('版本冲突：当前已安装 1.0.0，待安装 2.0.0。')
    expect(extensionInstallDialogContent(preview, installed).detailSections[0].lines).toContain('继续后将替换现有扩展；启用状态和扩展设置会保留。')
  })

  it('uses the ordinary install copy when the extension id is new', () => {
    expect(extensionInstallDialogContent(preview)).toMatchObject({
      title: '安装扩展',
      message: '是否安装“Sample”？',
      confirmLabel: '安装'
    })
    expect(extensionInstallDialogContent(preview).detailSections).toEqual([
      { lines: ['作者：MoonSprite　版本：2.0.0', '标识：com.example.sample'] },
      { lines: ['Sample extension'] }
    ])
  })
})
