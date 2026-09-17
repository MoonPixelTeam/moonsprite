import type { StoredWorkspace } from '@shared/types-workspace'
import { DeleteIconButton } from './DeleteIconButton'
import { DialogHeader } from './DialogHeader'
import { ModalShell } from './ModalShell'
import { PixelUtilityIcon } from './PixelUtilityIcon'
import { useI18n } from './I18nProvider'

interface WorkspaceManagerDialogProps {
  activeWorkspaceId: string | null
  directory: string
  onClose: () => void
  onCreate: () => void
  onDelete: (workspace: StoredWorkspace) => void
  onLoad: (workspace: StoredWorkspace) => void
  onOpenFolder: () => void
  workspaces: StoredWorkspace[]
}

export function WorkspaceManagerDialog({ activeWorkspaceId, directory, onClose, onCreate, onDelete, onLoad, onOpenFolder, workspaces }: WorkspaceManagerDialogProps) {
  const { t } = useI18n()
  return <div className="modal-backdrop" role="presentation" onPointerDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <ModalShell storageKey="workspace-manager-v2" defaultWidth={560} defaultHeight={400} fitContentKey={String(workspaces.length)} minWidth={440} minHeight={260} maxWidth={720} maxHeight={620} className="workspace-manager-dialog" role="dialog" aria-modal="true" aria-labelledby="workspace-manager-title">
      <DialogHeader eyebrow="WORKSPACE" title={t('app.workspace.managerTitle')} titleId="workspace-manager-title" closeLabel={t('common.close')} onClose={onClose} />
      <div className="workspace-manager-body">
        <div className="workspace-manager-list component-scrollbar" role="list">
          {workspaces.length === 0 && <p>{t('app.workspace.empty')}</p>}
          {workspaces.map((saved) => {
            const active = saved.id === activeWorkspaceId
            const rowClassName = ['workspace-manager-row', active ? 'active' : '', saved.builtIn ? 'built-in' : ''].filter(Boolean).join(' ')
            return <div key={saved.id} className={rowClassName} role="listitem">
              <button type="button" className="workspace-manager-load" title={t('app.workspace.loadTitle', { name: saved.name })} onClick={() => onLoad(saved)}>
                <span className="workspace-manager-row-icon" aria-hidden="true"><PixelUtilityIcon kind="workspace" /></span>
                <span className="workspace-manager-row-copy"><strong>{saved.name}</strong><small>{t(saved.builtIn ? 'app.workspace.builtIn' : 'app.workspace.custom')}</small></span>
              </button>
              {!saved.builtIn && <DeleteIconButton size="regular" className="workspace-manager-delete" title={t('app.workspace.delete', { name: saved.name })} aria-label={t('app.workspace.delete', { name: saved.name })} onClick={() => onDelete(saved)} />}
            </div>
          })}
        </div>
      </div>
      <footer className="workspace-manager-footer">
        <button type="button" className="quiet-button" title={directory || undefined} onClick={onOpenFolder}><PixelUtilityIcon kind="folderOpen" />{t('app.workspace.openFolder')}</button>
        <button type="button" className="primary-button" onClick={onCreate}><PixelUtilityIcon kind="plus" />{t('app.workspace.create')}</button>
      </footer>
    </ModalShell>
  </div>
}
