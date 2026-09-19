import { useI18n } from '@/components/I18nProvider'
import { useSyncExternalStore, type ReactElement } from 'react'
import { createPortal } from 'react-dom'
import { projectRollbackProgress } from '@/core/project-rollback-progress'

export function ProjectRollbackProgressOverlay(): ReactElement | null {
  const { t } = useI18n()
  const snapshot = useSyncExternalStore(projectRollbackProgress.subscribe, projectRollbackProgress.getSnapshot, projectRollbackProgress.getSnapshot)
  if (!snapshot.active) return null
  return createPortal(<div className="modal-backdrop save-progress-backdrop project-rollback-progress-backdrop is-running" role="presentation">
    <section className="modal save-progress-modal simulated-progress-modal save-simulated-progress-modal" role="dialog" aria-modal="true" aria-live="polite" aria-labelledby="project-rollback-progress-title">
      <header><div className="save-progress-heading"><span className="save-progress-icon" aria-hidden="true"><span className="save-progress-animation" /></span><div><span className="eyebrow">{t('home.projectBackups')}</span><h2 id="project-rollback-progress-title">{t('rollback.progressTitle')}</h2></div></div></header>
      <div className="save-progress-body"><strong>{t('rollback.progressDescription')}</strong><div className="save-progress-track simulated-progress-track" aria-label={t('rollback.progressAria')}><i /></div><div className="save-progress-meta"><span>{t('common.processing')}</span></div></div>
    </section>
  </div>, document.body)
}
