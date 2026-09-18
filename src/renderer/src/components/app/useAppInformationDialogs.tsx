import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { ExternalLink, GitFork } from 'lucide-react'
import { LatestReleaseDialog } from '@/components/LatestReleaseDialog'
import { UsageStatisticsDialog } from '@/components/dialogs/UsageStatisticsDialog'
import { DialogHeader } from '@/components/DialogHeader'
import { ModalShell } from '@/components/ModalShell'
import { APP_CHANNEL_LABEL } from '@/core/app-meta'
import { latestRelease, shouldShowLatestRelease, type LatestReleaseDefinition } from '@/core/latest-release'
import moonspriteLogo from '@/assets/moonsprite-logo.svg'
import { useWorkspace } from '@/store/workspace'
import { useI18n } from '@/components/I18nProvider'
const LazyComponentLibrary = lazy(() => import('@/components/ComponentLibrary').then(({ ComponentLibrary }) => ({ default: ComponentLibrary })))

export function useAppInformationDialogs() {
  const { t } = useI18n()
  const workspace = useWorkspace.getState()
  const [aboutOpen, setAboutOpen] = useState(false)
  const [componentLibraryOpen, setComponentLibraryOpen] = useState(false)
  const [latestReleaseOpen, setLatestReleaseOpen] = useState(false)
  const [usageStatisticsOpen, setUsageStatisticsOpen] = useState(false)
  const [latestReleaseSelection, setLatestReleaseSelection] = useState<LatestReleaseDefinition | null>(null)
  const latestReleaseNoticeHandledRef = useRef(false)
  const openLatestRelease = useCallback((release?: LatestReleaseDefinition): void => {
    setLatestReleaseSelection(release ?? null)
    setLatestReleaseOpen(true)
  }, [])
  useEffect(() => {
    if (latestReleaseNoticeHandledRef.current) return
    latestReleaseNoticeHandledRef.current = true
    if (shouldShowLatestRelease()) openLatestRelease(latestRelease)
  }, [openLatestRelease])
  const appInformationDialogsSurface = (
    <>
      {aboutOpen && (
        <div
          className="modal-backdrop modal-overlay-backdrop"
          role="presentation"
          onPointerDown={(event) => {
            if (event.target === event.currentTarget) setAboutOpen(false)
          }}
        >
          <ModalShell
            storageKey="about-v2"
            defaultWidth={460}
            defaultHeight={360}
            minWidth={380}
            minHeight={310}
            maxWidth={620}
            maxHeight={520}
            className="about-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="about-title"
          >
            <DialogHeader title={t('app.about.title')} titleId="about-title" closeLabel={t('common.close')} onClose={() => setAboutOpen(false)} />
            <div className="about-content">
              <section className="about-brand">
                <span className="about-logo" aria-hidden="true">
                  <img src={moonspriteLogo} alt="" />
                </span>
                <div>
                  <strong>MoonSprite</strong>
                  <p className="about-description">{t('app.about.description')}</p>
                </div>
              </section>
              <dl className="about-details">
                <div>
                  <dt>{t('app.about.version')}</dt>
                  <dd>{APP_CHANNEL_LABEL}</dd>
                </div>
                <div>
                  <dt>{t('app.about.author')}</dt>
                  <dd>MoonPixel Studio & MoonSprite Contributors</dd>
                </div>
                <div>
                  <dt>{t('app.about.license')}</dt>
                  <dd>{t('app.about.licenseName')}</dd>
                </div>
              </dl>
              <button
                className="about-link"
                type="button"
                onClick={() => {
                  void window.moonSprite
                    .openExternalUrl('https://github.com/MoonPixelTeam/moonsprite')
                    .catch((error) => workspace.setMessage(error instanceof Error ? error.message : t('home.openLinkFailed')))
                }}
              >
                <GitFork size={15} />
                <span>github.com/MoonPixelTeam/moonsprite</span>
                <ExternalLink size={13} />
              </button>
            </div>
            <footer>
              <button className="primary-button" onClick={() => setAboutOpen(false)}>
                {t('common.done')}
              </button>
            </footer>
          </ModalShell>
        </div>
      )}
      {componentLibraryOpen && (
        <Suspense fallback={null}>
          <LazyComponentLibrary onClose={() => setComponentLibraryOpen(false)} />
        </Suspense>
      )}
      {latestReleaseOpen && <LatestReleaseDialog release={latestReleaseSelection ?? undefined} onClose={() => setLatestReleaseOpen(false)} />}
      {usageStatisticsOpen && <UsageStatisticsDialog onClose={() => setUsageStatisticsOpen(false)} />}
    </>
  )
  return {
    aboutOpen,
    setAboutOpen,
    componentLibraryOpen,
    setComponentLibraryOpen,
    latestReleaseOpen,
    setLatestReleaseOpen,
    setUsageStatisticsOpen,
    openLatestRelease,
    appInformationDialogsSurface
  }
}
