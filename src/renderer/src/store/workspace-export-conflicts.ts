import { fileNameFromPath } from '@/core/document-files'
import { type FileOperationLifecycle } from './document-file-service'
import type { WorkspaceState } from './workspace-state'
import { tr } from './workspace-translation'

export type ExportConflictPolicy = 'overwrite' | 'rename' | null

export const createExportConflictHandler = (
  requestDialog: WorkspaceState['requestDialog'],
  allowBulk: boolean
): NonNullable<FileOperationLifecycle['onConflict']> => {
  let policy: ExportConflictPolicy = null

  return async (filePath, suggestedPath) => {
    if (policy) return policy

    const choice = await requestDialog({
      title: tr('file.export.conflictTitle'),
      message: tr('file.export.conflictMessage', { name: fileNameFromPath(filePath) }),
      detail: tr('file.export.conflictDetail', { suggestedName: fileNameFromPath(suggestedPath) }),
      choices: [
        { id: 'overwrite', label: tr('file.export.conflictOverwrite'), tone: 'danger' },
        { id: 'rename', label: tr('file.export.conflictRename'), tone: 'primary' },
        ...(allowBulk ? [
          { id: 'overwrite-all', label: tr('file.export.conflictOverwriteAll'), tone: 'danger' as const },
          { id: 'rename-all', label: tr('file.export.conflictRenameAll'), tone: 'primary' as const }
        ] : []),
        { id: 'cancel', label: tr('file.export.conflictCancel'), tone: 'quiet' }
      ]
    })

    if (choice === 'overwrite-all') {
      policy = 'overwrite'
      return policy
    }
    if (choice === 'rename-all') {
      policy = 'rename'
      return policy
    }
    return choice === 'overwrite' || choice === 'rename' ? choice : 'cancel'
  }
}
