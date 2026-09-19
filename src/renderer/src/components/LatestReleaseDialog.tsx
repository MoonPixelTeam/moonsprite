import { useI18n } from '@/components/I18nProvider'
import { DialogHeader } from '@/components/DialogHeader'
import { ModalShell } from '@/components/ModalShell'
import { latestRelease, type LatestReleaseDefinition } from '@/core/latest-release'

export function LatestReleaseDialog({ onClose, release = latestRelease }: { onClose: () => void; release?: LatestReleaseDefinition }) {
  const { locale, t } = useI18n()
  const publishedAt = new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'long', day: 'numeric' }).format(new Date(`${release.publishedAt}T00:00:00`))
  return <div className="modal-backdrop modal-overlay-backdrop" role="presentation" onPointerDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <ModalShell storageKey="latest-release" defaultWidth={720} defaultHeight={620} minWidth={480} minHeight={420} maxWidth={820} maxHeight={800} className="latest-release-modal" role="dialog" aria-modal="true" aria-labelledby="latest-release-title">
      <DialogHeader eyebrow={`MOONSPRITE ${release.version}`} title={t('latestRelease.title')} titleId="latest-release-title" closeLabel={t('common.close')} onClose={onClose} />
      <div className="latest-release-body">
        <section className="latest-release-overview">
          <div className="latest-release-overview-heading"><strong>{t('latestRelease.version', { version: release.version })}</strong><time dateTime={release.publishedAt}>{publishedAt}</time></div>
          <p>{t(release.homeSummary)}</p>
        </section>
        <div className="latest-release-section-grid">{release.sections.map((section) => <section className="latest-release-section" key={section.title}>
          <header><h3>{t(section.title)}</h3><span>{t('latestRelease.itemCount', { count: section.items.length })}</span></header>
          <ul>{section.items.map((item) => <li key={item}><i aria-hidden="true" /><span>{t(item)}</span></li>)}</ul>
        </section>)}</div>
      </div>
      <footer><button type="button" className="primary-button" onClick={onClose}>{t('common.done')}</button></footer>
    </ModalShell>
  </div>
}
