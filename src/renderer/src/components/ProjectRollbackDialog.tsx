import { useCallback, useEffect, useState } from 'react'
import type { ProjectBackupRecord } from '@shared/types-files'
import { formatBytes } from '@/core/resource-policy'
import { projectRollbackProgress } from '@/core/project-rollback-progress'
import { DialogHeader } from './DialogHeader'
import { ModalShell } from './ModalShell'
import { PixelUtilityIcon } from './PixelUtilityIcon'

interface ProjectRollbackDialogProps {
  projectPath: string
  onClose: () => void
  onRestore: (record: ProjectBackupRecord) => Promise<boolean>
}

const formatDate = (value: number): string => {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleString()
}

export function ProjectRollbackDialog({ projectPath, onClose, onRestore }: ProjectRollbackDialogProps) {
  const [records, setRecords] = useState<ProjectBackupRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [restoringPath, setRestoringPath] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const refresh = useCallback(async (): Promise<void> => {
    setLoading(true)
    setError(null)
    try {
      setRecords(await window.moonSprite.listProjectBackups(projectPath))
    } catch (reason) {
      setRecords([])
      setError(reason instanceof Error ? reason.message : '无法读取工程备份。')
    } finally {
      setLoading(false)
    }
  }, [projectPath])
  useEffect(() => { void refresh() }, [refresh])
  const restore = async (record: ProjectBackupRecord): Promise<void> => {
    setRestoringPath(record.filePath)
    setError(null)
    projectRollbackProgress.begin()
    try {
      if (await onRestore(record)) onClose()
      else setError('无法回档工程备份。')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '无法回档工程备份。')
    } finally {
      setRestoringPath(null)
      projectRollbackProgress.end()
    }
  }
  return <div className="modal-backdrop" role="presentation" onPointerDown={(event) => { if (event.target === event.currentTarget && !restoringPath) onClose() }}>
    <ModalShell storageKey="project-rollback" defaultWidth={520} defaultHeight={430} minWidth={400} minHeight={280} fitContent={false} className="project-rollback-modal" role="dialog" aria-modal="true" aria-labelledby="project-rollback-title">
      <DialogHeader title="回档" titleId="project-rollback-title" closeDisabled={Boolean(restoringPath)} closeLabel="关闭" onClose={onClose} />
      <div className="project-rollback-content component-scrollbar">
        <p className="project-rollback-description">选择保存前自动保留的工程版本。回档后的内容仍可通过历史记录撤销。</p>
        {loading && <div className="project-rollback-empty">正在读取工程备份...</div>}
        {!loading && error && <div className="project-rollback-error">{error}</div>}
        {!loading && !error && records.length === 0 && <div className="project-rollback-empty">当前工程没有可用的备份版本。</div>}
        {!loading && records.map((record, index) => <article className="project-rollback-record" key={record.filePath}>
          <div className="project-rollback-record-icon" aria-hidden="true"><PixelUtilityIcon kind="restore" /></div>
          <div className="project-rollback-record-copy"><strong>存档 {records.length - index}</strong><span>{formatDate(record.modifiedAt)} · {formatBytes(record.sizeBytes)}</span></div>
          <button type="button" className="quiet-button project-rollback-action" disabled={Boolean(restoringPath)} onClick={() => void restore(record)}>{restoringPath === record.filePath ? '回档中...' : '回档'}</button>
        </article>)}
      </div>
      <footer><button type="button" className="quiet-button" disabled={Boolean(restoringPath) || loading} onClick={() => void refresh()}><PixelUtilityIcon kind="refresh" />刷新</button><button type="button" className="quiet-button" disabled={Boolean(restoringPath)} onClick={onClose}>关闭</button></footer>
    </ModalShell>
  </div>
}
