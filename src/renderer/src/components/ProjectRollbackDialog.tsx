import { useI18n } from '@/components/I18nProvider'
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

const formatDate = (value: number, locale: string): string => {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleString(locale)
}

export function ProjectRollbackDialog({ projectPath, onClose, onRestore }: ProjectRollbackDialogProps) {
  const { t, locale } = useI18n()
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
      setError(reason instanceof Error ? reason.message : t('rollback.readFailed'))
    } finally {
      setLoading(false)
    }
  }, [projectPath, t])
  useEffect(() => { void refresh() }, [refresh])
  const restore = async (record: ProjectBackupRecord): Promise<void> => {
    setRestoringPath(record.filePath)
    setError(null)
    projectRollbackProgress.begin()
    try {
      if (await onRestore(record)) onClose()
      else setError(t('rollback.restoreFailed'))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t('rollback.restoreFailed'))
    } finally {
      setRestoringPath(null)
      projectRollbackProgress.end()
    }
  }
  return <div className="modal-backdrop" role="presentation" onPointerDown={(event) => { if (event.target === event.currentTarget && !restoringPath) onClose() }}>
    <ModalShell storageKey="project-rollback" defaultWidth={520} defaultHeight={430} minWidth={400} minHeight={280} fitContent={false} className="project-rollback-modal" role="dialog" aria-modal="true" aria-labelledby="project-rollback-title">
      <DialogHeader title={t('rollback.title')} titleId="project-rollback-title" closeDisabled={Boolean(restoringPath)} closeLabel={t('componentLibrary.preview.close')} onClose={onClose} />
      <div className="project-rollback-content component-scrollbar">
        <p className="project-rollback-description">{t('rollback.description')}</p>
        {loading && <div className="project-rollback-empty">{t('rollback.loading')}</div>}
        {!loading && error && <div className="project-rollback-error">{error}</div>}
        {!loading && !error && records.length === 0 && <div className="project-rollback-empty">{t('rollback.empty')}</div>}
        {!loading && records.map((record, index) => <article className="project-rollback-record" key={record.filePath}>
          <div className="project-rollback-record-icon" aria-hidden="true"><PixelUtilityIcon kind="restore" /></div>
          <div className="project-rollback-record-copy"><strong>{t('rollback.version', { index: records.length - index })}</strong><span>{formatDate(record.modifiedAt, locale)} · {formatBytes(record.sizeBytes)}</span></div>
          <button type="button" className="quiet-button project-rollback-action" disabled={Boolean(restoringPath)} onClick={() => void restore(record)}>{restoringPath === record.filePath ? t('rollback.restoring') : t('rollback.title')}</button>
        </article>)}
      </div>
      <footer><button type="button" className="quiet-button" disabled={Boolean(restoringPath) || loading} onClick={() => void refresh()}><PixelUtilityIcon kind="refresh" />{t('palette.refresh')}</button><button type="button" className="quiet-button" disabled={Boolean(restoringPath)} onClick={onClose}>{t('componentLibrary.preview.close')}</button></footer>
    </ModalShell>
  </div>
}
