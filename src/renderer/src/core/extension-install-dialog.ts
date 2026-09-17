import type { ExtensionPackagePreview, StoredExtension } from '@shared/types-extensions'

export interface ExtensionInstallDialogContent {
  title: string
  message: string
  detailSections: Array<{ lines: string[] }>
  confirmLabel: string
}

export function extensionInstallDialogContent(preview: ExtensionPackagePreview, installed?: StoredExtension): ExtensionInstallDialogContent {
  const replacesInstalledExtension = Boolean(installed)
  const detailSections = [
    replacesInstalledExtension
      ? { lines: [`版本冲突：当前已安装 ${installed!.version || '未提供'}，待安装 ${preview.version || '未提供'}。`, '继续后将替换现有扩展；启用状态和扩展设置会保留。'] }
      : null,
    { lines: [`作者：${preview.author || '未提供'}　版本：${preview.version || '未提供'}`, `标识：${preview.id}`] },
    { lines: [preview.description || '此扩展未提供描述。'] }
  ].filter((section): section is { lines: string[] } => section !== null)

  return {
    title: replacesInstalledExtension ? '扩展版本冲突' : '安装扩展',
    message: replacesInstalledExtension
      ? `“${preview.name}”已安装，是否替换为待安装版本？`
      : `是否安装“${preview.name}”？`,
    detailSections,
    confirmLabel: replacesInstalledExtension ? '替换安装' : '安装'
  }
}
