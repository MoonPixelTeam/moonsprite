import { useSyncExternalStore, type ReactElement } from 'react'
import { createPortal } from 'react-dom'
import { saveProgress } from '@/core/save-progress'
import { useI18n } from './I18nProvider'
import { PixelUtilityIcon } from './PixelUtilityIcon'

export function SaveProgressOverlay(): ReactElement | null {
  const { t } = useI18n()
  const snapshot = useSyncExternalStore(saveProgress.subscribe, saveProgress.getSnapshot, saveProgress.getSnapshot)
  if (snapshot.phase === 'hidden') return null
  const complete = snapshot.phase === 'complete'
  const saveAs = snapshot.kind === 'saveAs'
  const title = t(saveAs ? 'workspace.saveAs.progressTitle' : 'workspace.save.progressTitle')

  return createPortal(
    <div className={`modal-backdrop save-progress-backdrop simulated-progress-backdrop ${complete ? 'is-complete' : 'is-running'}`} role="presentation">
      <section className={`modal save-progress-modal simulated-progress-modal save-simulated-progress-modal ${!saveAs ? 'save-progress-notice-position' : ''} ${complete ? 'is-complete' : ''}`} role="dialog" aria-modal="true" aria-live="polite" aria-labelledby="save-simulated-progress-title">
        <header>
          <div className="save-progress-heading">
            <span className="save-progress-icon" aria-hidden="true"><span className="save-progress-animation" /></span>
            <div><span className="eyebrow">FILE OPERATION</span><h2 id="save-simulated-progress-title">{title}</h2></div>
          </div>
          {!complete && <button type="button" className="icon-button" aria-label={t('app.progress.close', { title })} onClick={saveProgress.dismiss}><PixelUtilityIcon kind="close" /></button>}
        </header>
        <div className="save-progress-body">
          <strong>{t(complete ? (saveAs ? 'workspace.saveAs.progressDone' : 'workspace.save.progressDone') : 'workspace.save.encodingProject')}</strong>
          <div className={`save-progress-track simulated-progress-track ${complete ? 'is-full' : ''}`} aria-label={title}><i /></div>
          <div className="save-progress-meta"><span>{t(complete ? 'app.progress.complete' : 'app.progress.processing')}</span></div>
        </div>
      </section>
    </div>,
    document.body
  )
}
