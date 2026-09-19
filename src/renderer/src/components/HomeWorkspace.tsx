import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from 'react'
import { createPortal } from 'react-dom'
import { Plus, TriangleAlert } from 'lucide-react'
import type { ColorMode } from '@shared/types-raster'
import type { ProjectPreview, RecoveryRecord } from '@shared/types-files'
import { APP_CHANNEL_LABEL } from '@/core/app-meta'
import { decodeDocumentFileAsync, isMoonSpriteProjectPath } from '@/core/document-files'
import { loadEditorPreferences, saveEditorPreferences } from '@/core/file-preferences'
import { readProjectGalleryMetadataAsync } from '@/core/project-gallery'
import { encodeProjectPreview } from '@/core/project-format'
import { createRasterImagePreview, rasterImageMimeType } from '@/core/raster-image'
import { homeAnnouncementsForDisplay, latestReleases, type LatestReleaseDefinition } from '@/core/latest-release'
import { clearRecentProjects, getGalleryPins, getRecentProjects, recordRecentProject, removeGalleryPin, removeRecentProject, reorderRecentProjects, toggleGalleryPin, toggleRecentProjectPinned, type RecentProject } from '@/core/home-history'
import { getHomeFileDisplayFormats, matchesHomeFileDisplayFormats, saveHomeFileDisplayFormats, type HomeFileDisplayFormat } from '@/core/home-file-display'
import { createFolderHomeSection, findFolderHomeSection, getHomeSections, saveHomeSections, type HomeSectionDefinition } from '@/core/home-sections'
import { homeBannerDefinitions, resolveHomeBanners, type HomeBannerDefinition } from '@/core/home-banner'
import { useWorkspace } from '@/store/workspace'
import { useI18n } from '@/components/I18nProvider'
import { AVAILABLE_APP_LOCALES, localeDisplayName, translate, type AppLocale } from '@/core/localization'
import moonspriteLogo from '@/assets/moonsprite-logo.svg'
import homeBannerFire from '@/assets/home-banner-fire.png'
import homeBannerCrystal from '@/assets/home-banner-crystal.png'
import homeBannerCoast from '@/assets/home-banner-coast.png'
import homeBannerHall from '@/assets/home-banner-hall.png'
import { PixelCloseIcon as X, PixelUtilityIcon } from '@/components/PixelUtilityIcon'
import { DialogHeader } from '@/components/DialogHeader'
import { ModalShell } from '@/components/ModalShell'
import { HomeSectionManagerDialog } from '@/components/HomeSectionManagerDialog'
import { Tooltip } from '@/components/Tooltip'

interface ProjectCard extends RecentProject {
  previewUrl?: string
  width?: number
  height?: number
  colorMode?: ColorMode
  previewLoading?: boolean
  error?: string
}

interface BannerProjectCard {
  id: string
  author: string
  authorUrl: string
  name: string
  filePath?: string
  previewUrl?: string
  imageUrl?: string
}

interface HomeWorkspaceProps {
  onNew(): void
  onOpen(): void
  onOpenProject(filePath: string, keepHomeOpen?: boolean): Promise<boolean>
  onOpenImage(imageUrl: string, name: string): Promise<boolean>
  onRestoreRecovery(id: string): Promise<boolean>
  onOpenLatestRelease?(release?: LatestReleaseDefinition): void
}

type HomeProjectLayout = 'small' | 'medium' | 'large'
type HomeLinkIconKind = 'qq' | 'community' | 'steam' | 'github' | 'language'
const homeSectionStorageKey = 'moonsprite.home-section.v1'
const homeProjectLayoutStorageKey = 'moonsprite.home-project-layout.v1'
const homeRecentPrivacyStorageKey = 'moonsprite.home-recent-privacy.v1'
const homeProjectLayoutOrder: readonly HomeProjectLayout[] = ['small', 'medium', 'large']
const recoveryDayMilliseconds = 24 * 60 * 60 * 1_000
const logoSpinClickThreshold = 5
const logoSpinClickWindowMs = 850
const logoSpinDurationMs = 2_000
const homeExternalLinks = {
  qq: 'https://qm.qq.com/q/3OUXtFg4lW',
  community: 'https://moonpx.art/',
  steam: 'https://store.steampowered.com/search/?term=MoonSprite',
  github: 'https://github.com/MoonPixelTeam/moonsprite'
} as const
const homeLinkIconPaths: Record<HomeLinkIconKind, { solid: string; soft: string }> = {
  qq: {
    solid: 'M4 0h3v1h-3zM2 1h2v1h-2zM7 1h2v1h-2zM1 2h2v1h-2zM8 2h2v1h-2zM1 3h2v1h-2zM8 3h2v1h-2zM0 4h3v1h-3zM8 4h3v1h-3zM0 5h2v1h-2zM5 5h2v1h-2zM9 5h2v1h-2zM0 6h2v1h-2zM4 6h3v1h-3zM9 6h2v1h-2zM1 7h2v1h-2zM4 7h1v1h-1zM6 7h1v1h-1zM8 7h2v1h-2zM1 8h1v1h-1zM9 8h1v1h-1zM2 9h7v1h-7zM4 10h3v1h-3z',
    soft: 'M3 0h1v1h-1zM7 0h1v1h-1zM4 2h1v1h-1zM6 2h1v1h-1zM0 3h1v1h-1zM4 3h3v1h-3zM10 3h1v1h-1zM3 4h5v1h-5zM4 5h1v1h-1zM2 6h1v1h-1zM8 6h1v1h-1zM0 7h1v1h-1zM5 7h1v1h-1zM10 7h1v1h-1zM2 8h1v1h-1zM5 8h1v1h-1zM8 8h1v1h-1zM3 10h1v1h-1zM7 10h1v1h-1z'
  },
  community: {
    solid: 'M4 0h3v1H4zM2 1h3v1H2zM6 1h3v1H6zM1 2h3v1H1zM7 2h3v1H7zM1 3h2v1H1zM8 3h2v1H8zM0 4h2v1H0zM9 4h2v1H9zM0 5h2v1H0zM9 5h2v1H9zM0 6h3v1H0zM4 6h1v1H4zM6 6h1v1H6zM8 6h3v1H8zM1 7h2v1H1zM5 7h1v1H5zM8 7h2v1H8zM1 8h2v1H1zM8 8h2v1H8zM2 9h7v1H2zM4 10h3v1H4z',
    soft: 'M3 0h1v1H3zM7 0h1v1H7zM5 1h1v1H5zM0 3h1v1H0zM3 3h1v1H3zM7 3h1v1H7zM10 3h1v1H10zM2 5h1v1H2zM4 5h1v1H4zM6 5h1v1H6zM8 5h1v1H8zM0 7h1v1H0zM4 7h1v1H4zM6 7h1v1H6zM10 7h1v1H10zM3 8h1v1H3zM7 8h1v1H7zM3 10h1v1H3zM7 10h1v1H7z'
  },
  steam: {
    solid: 'M4 0h3v1h-3zM2 1h7v1h-7zM1 2h5v1h-5zM9 2h1v1h-1zM1 3h4v1h-4zM7 3h1v1h-1zM0 4h5v1h-5zM6 4h1v1h-1zM8 4h1v1h-1zM10 4h1v1h-1zM1 5h4v1h-4zM7 5h1v1h-1zM10 5h1v1h-1zM3 6h1v1h-1zM9 6h2v1h-2zM8 7h2v1h-2zM1 8h1v1h-1zM6 8h4v1h-4zM2 9h1v1h-1zM5 9h4v1h-4zM4 10h3v1h-3z',
    soft: 'M3 0h1v1h-1zM7 0h1v1h-1zM0 3h1v1h-1zM6 3h1v1h-1zM8 3h1v1h-1zM10 3h1v1h-1zM8 5h1v1h-1zM4 6h1v1h-1zM0 7h1v1h-1zM4 7h2v1h-2zM7 7h1v1h-1zM10 7h1v1h-1zM5 8h1v1h-1zM4 9h1v1h-1zM3 10h1v1h-1zM7 10h1v1h-1z'
  },
  github: {
    solid: 'M4 0h3v1h-3zM2 1h7v1h-7zM1 2h2v1h-2zM4 2h3v1h-3zM8 2h2v1h-2zM1 3h1v1h-1zM9 3h1v1h-1zM0 4h2v1h-2zM9 4h2v1h-2zM0 5h2v1h-2zM9 5h2v1h-2zM0 6h2v1h-2zM9 6h2v1h-2zM1 7h2v1h-2zM8 7h2v1h-2zM1 8h1v1h-1zM3 8h1v1h-1zM7 8h3v1h-3zM7 9h2v1h-2z',
    soft: 'M3 0h1v1h-1zM7 0h1v1h-1zM0 3h1v1h-1zM2 3h1v1h-1zM8 3h1v1h-1zM10 3h1v1h-1zM2 6h1v1h-1zM8 6h1v1h-1zM0 7h1v1h-1zM3 7h1v1h-1zM7 7h1v1h-1zM10 7h1v1h-1zM2 9h1v1h-1zM3 10h1v1h-1zM7 10h1v1h-1z'
  },
  language: {
    solid: 'M7 1h2v1h-2zM1 2h3v1h-3zM7 2h3v1h-3zM1 3h1v1h-1zM6 3h4v1h-4zM1 4h3v1h-3zM6 4h1v1h-1zM8 4h3v1h-3zM1 5h1v1h-1zM10 5h1v1h-1zM1 6h3v1h-3zM6 6h1v1h-1zM8 6h1v1h-1zM10 6h1v1h-1zM4 8h3v1h-3zM8 8h2v1h-2zM4 9h3v1h-3zM8 9h1v1h-1zM4 10h3v1h-3z',
    soft: 'M3 0h5v1h-5zM2 1h1v1h-1zM6 2h1v1h-1zM0 3h1v1h-1zM10 3h1v1h-1zM0 4h1v1h-1zM5 4h1v1h-1zM0 5h1v1h-1zM4 5h1v1h-1zM0 6h1v1h-1zM4 6h1v1h-1zM0 7h1v1h-1zM4 7h1v1h-1zM10 7h1v1h-1zM1 8h1v1h-1zM2 9h1v1h-1zM3 10h1v1h-1zM7 10h1v1h-1z'
  }
}

function HomeLinkIcon({ kind }: { kind: HomeLinkIconKind }) {
  const paths = homeLinkIconPaths[kind]
  return <svg className="start-screen-link-icon" viewBox="0 0 11 11" width="22" height="22" shapeRendering="crispEdges" aria-hidden="true">
    <path d={paths.solid} fill="currentColor" />
    <path d={paths.soft} fill="currentColor" opacity={107 / 255} />
  </svg>
}
interface CachedProjectPreview {
  bytes: Uint8Array
  width: number
  height: number
  colorMode: ColorMode
}
const projectPreviewCache = new Map<string, CachedProjectPreview>()
const maxCachedProjectPreviews = 48
let projectPreviewFallbackQueue = Promise.resolve()
const previewCacheKey = (record: RecentProject): string => `${record.filePath}\u0000${record.lastOpened}`
const recoveryPreviewCacheKey = (record: RecoveryRecord): string => `recovery\u0000${record.id}\u0000${record.updatedAt}`
const cacheProjectPreview = (key: string, preview: CachedProjectPreview): void => {
  projectPreviewCache.delete(key)
  projectPreviewCache.set(key, preview)
  while (projectPreviewCache.size > maxCachedProjectPreviews) projectPreviewCache.delete(projectPreviewCache.keys().next().value!)
}
const createPreviewUrl = (bytes: Uint8Array): string => {
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
  return URL.createObjectURL(new Blob([buffer], { type: 'image/png' }))
}
const runProjectPreviewFallback = <T,>(task: () => Promise<T>): Promise<T> => {
  const result = projectPreviewFallbackQueue.then(task, task)
  projectPreviewFallbackQueue = result.then(() => undefined, () => undefined)
  return result
}
const loadHomeSection = (sections: readonly HomeSectionDefinition[]): string => {
  try {
    const stored = localStorage.getItem(homeSectionStorageKey)
    return stored && sections.some((section) => section.id === stored) ? stored : sections[0]?.id ?? 'recent'
  } catch {
    return sections[0]?.id ?? 'recent'
  }
}
const loadHomeProjectLayout = (): HomeProjectLayout => {
  try {
    const stored = localStorage.getItem(homeProjectLayoutStorageKey)
    return stored === 'small' || stored === 'large' ? stored : 'medium'
  } catch {
    return 'medium'
  }
}
const loadRecentProjectsHidden = (): boolean => {
  try {
    return localStorage.getItem(homeRecentPrivacyStorageKey) === 'hidden'
  } catch {
    return false
  }
}

const formatTime = (value: number, locale: AppLocale): string => {
  if (!Number.isFinite(value) || value <= 0 || Number.isNaN(new Date(value).getTime())) return translate(locale, 'home.unknownTime')
  return new Intl.DateTimeFormat(locale, { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(value))
}

const formatReleaseDate = (value: string, locale: AppLocale): string => new Intl.DateTimeFormat(locale, {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
}).format(new Date(`${value}T00:00:00`))

const formatProjectType = (filePath: string): string => {
  if (isMoonSpriteProjectPath(filePath)) return 'MoonSprite'
  const extension = filePath.match(/\.([^./\\]+)$/)?.[1]
  if (!extension) return 'FILE'
  return extension.toUpperCase()
}

function parseRecoveryTimestamp(value: string): number {
  const numeric = Number(value)
  if (Number.isFinite(numeric)) {
    // Older builds stored nanoseconds, while the browser Date API expects milliseconds.
    if (Math.abs(numeric) >= 100_000_000_000_000_000) return Math.trunc(numeric / 1_000_000)
    if (Math.abs(numeric) >= 100_000_000_000_000) return Math.trunc(numeric / 1_000)
    if (Math.abs(numeric) > 0 && Math.abs(numeric) < 100_000_000_000) return Math.trunc(numeric * 1_000)
    return Math.trunc(numeric)
  }
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : 0
}

interface ProjectFileRowProps {
  project: ProjectCard
  concealed: boolean
  reorderable: boolean
  dragging: boolean
  removePending: boolean
  onOpen(): void
  onOpenInBackground(): void
  onPin(): void
  onDelete?(): void
  onRemoveFromRecent?(): void
  onOpenFolder(): void
  onReorderStart(event: ReactPointerEvent<HTMLButtonElement>, filePath: string): void
}

function ProjectFileRow({ project, concealed, reorderable, dragging, removePending, onOpen, onOpenInBackground, onPin, onDelete, onRemoveFromRecent, onOpenFolder, onReorderStart }: ProjectFileRowProps) {
  const { locale, t } = useI18n()
  const invalid = Boolean(project.error)
  return <article className={`recent-file-row ${concealed ? 'concealed' : ''} ${reorderable ? 'reorderable reorderable-list-row' : ''} ${invalid ? 'invalid' : ''} ${project.pinned ? 'pinned' : ''} ${onDelete ? 'deletable' : ''} ${onRemoveFromRecent ? 'removable' : ''} ${dragging ? 'dragging' : ''} ${removePending ? 'remove-pending' : ''}`} data-recent-path={project.filePath} onContextMenu={(event) => { event.preventDefault(); onOpenFolder() }}>
    <button type="button" className="recent-file-open" data-moon-tooltip-disabled onPointerDown={(event) => { if (event.button === 1) event.preventDefault() }} onClick={onOpen} onAuxClick={(event) => { if (event.button !== 1) return; event.preventDefault(); event.stopPropagation(); onOpenInBackground() }}>
      <span className="recent-file-preview">{concealed ? <PixelUtilityIcon kind="eyeOff" /> : project.previewUrl ? <img src={project.previewUrl} alt="" /> : invalid ? <TriangleAlert size={21} /> : <PixelUtilityIcon kind="image" />}</span>
      <span className="recent-file-copy"><strong>{concealed ? t('home.hiddenProject') : project.name}</strong><small>{concealed ? t('home.hiddenProjectDetail') : invalid ? t('home.previewReadFailed') : project.width && project.height ? `${project.width} x ${project.height} · ${t(`colorMode.${project.colorMode ?? 'rgba'}`)}` : project.previewLoading ? t('home.readingPreview') : formatProjectType(project.filePath)}</small><span>{concealed ? '********' : project.filePath}</span></span>
      <time>{concealed ? '--/-- --:--' : formatTime(project.lastOpened, locale)}</time>
    </button>
    <button className="recent-file-pin" type="button" onClick={onPin} aria-label={t(project.pinned ? 'home.unpinProject' : 'home.pinProject', { name: project.name })} title={t(project.pinned ? 'home.unpin' : 'home.pin')}><PixelUtilityIcon kind="pin" /></button>
    {onDelete && <button className="recent-file-delete" type="button" onClick={onDelete} aria-label={t('home.deleteProjectAria', { name: project.name })} title={t('home.deleteProject')}><PixelUtilityIcon kind="delete" /></button>}
    {onRemoveFromRecent && <button className="recent-file-remove" type="button" onClick={onRemoveFromRecent} aria-label={t('home.removeRecentAria', { name: project.name })} title={t('home.removeRecentHint')}><X size={15} /></button>}
    {reorderable && <button className="recent-file-reorder reorderable-list-handle" type="button" onPointerDown={(event) => onReorderStart(event, project.filePath)} aria-label={t('home.reorderAria', { name: project.name })} title={t('home.reorderHint')}><PixelUtilityIcon kind="move" /></button>}
  </article>
}

interface RecoveryPreviewState {
  previewUrl?: string
  width?: number
  height?: number
  colorMode?: ColorMode
  loading: boolean
  error?: string
}

function RecoveryFileRow({ record, retentionDays, onRestore, onDiscard }: { record: RecoveryRecord; retentionDays: number; onRestore(): void; onDiscard(): void }) {
  const { locale, t } = useI18n()
  const updatedAt = parseRecoveryTimestamp(record.updatedAt)
  const remainingDays = Math.max(0, Math.ceil((updatedAt + retentionDays * recoveryDayMilliseconds - Date.now()) / recoveryDayMilliseconds))
  const [preview, setPreview] = useState<RecoveryPreviewState>({ loading: true })
  useEffect(() => {
    let disposed = false
    let previewUrl: string | undefined
    const applyPreview = (value: CachedProjectPreview): void => {
      previewUrl = createPreviewUrl(value.bytes)
      if (disposed) {
        URL.revokeObjectURL(previewUrl)
        return
      }
      setPreview({ previewUrl, width: value.width, height: value.height, colorMode: value.colorMode, loading: false })
    }
    setPreview({ loading: true })
    const cacheKey = recoveryPreviewCacheKey(record)
    const cached = projectPreviewCache.get(cacheKey)
    if (cached) {
      projectPreviewCache.delete(cacheKey)
      projectPreviewCache.set(cacheKey, cached)
      applyPreview(cached)
    } else {
      void runProjectPreviewFallback(async () => {
        const bytes = await window.moonSprite.readRecovery(record.id)
        return readProjectGalleryMetadataAsync(bytes)
      }).then((metadata) => {
        const cachedPreview = { bytes: metadata.preview.slice(), width: metadata.width, height: metadata.height, colorMode: metadata.colorMode }
        cacheProjectPreview(cacheKey, cachedPreview)
        applyPreview(cachedPreview)
      }).catch((error) => {
        if (!disposed) setPreview({ loading: false, error: error instanceof Error ? error.message : t('home.projectUnreadable') })
      })
    }
    return () => {
      disposed = true
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [record.id, record.updatedAt, t])
  const previewLabel = preview.width && preview.height
    ? `${preview.width} x ${preview.height} · ${t(`colorMode.${preview.colorMode ?? 'rgba'}`)}`
    : preview.loading ? t('home.readingPreview') : t('home.recoveryDescription')
  return <article className="recent-file-row recovery-file-row">
    <button type="button" className="recent-file-open" onClick={onRestore} title={t('home.restoreProject', { name: record.name })}>
      <span className="recent-file-preview">{preview.previewUrl ? <img src={preview.previewUrl} alt="" /> : preview.error ? <TriangleAlert size={21} /> : <span className="save-progress-animation recovery-preview-spinner" aria-hidden="true" />}</span>
      <span className="recent-file-copy"><strong>{t('home.recoveryTitle', { name: record.name })}</strong><small>{previewLabel}</small><span>{t('home.lastSaved', { time: formatTime(updatedAt, locale) })}</span><span className="recovery-file-expiry">{t('home.recoveryDaysRemaining', { days: remainingDays })}</span></span>
      <time>{formatTime(updatedAt, locale)}</time>
    </button>
    <button type="button" className="recent-file-discard" onClick={onDiscard} aria-label={t('home.discardRecoveryAria', { name: record.name })} title={t('home.discardRecoveryHint')}><PixelUtilityIcon kind="delete" /></button>
  </article>
}

function HomeLanguageDialog({ current, onApply, onClose }: { current: AppLocale; onApply(locale: AppLocale): void; onClose(): void }) {
  const { locale, t } = useI18n()
  const [selected, setSelected] = useState<AppLocale>(current)
  return <div className="modal-backdrop modal-overlay-backdrop" role="presentation" onPointerDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <ModalShell storageKey="home-language-v3" defaultWidth={380} defaultHeight={540} minWidth={340} minHeight={360} maxWidth={480} maxHeight={620} className="home-language-modal" role="dialog" aria-modal="true" aria-labelledby="home-language-title">
      <DialogHeader title={t('home.languageDialogTitle')} titleId="home-language-title" closeLabel={t('common.close')} onClose={onClose} />
      <div className="modal-body home-language-dialog-body">
        <p className="home-language-description">{t('home.languageDialogDescription')}</p>
        <div className="home-language-options" role="radiogroup" aria-label={t('home.languageOptionsAria')}>
          {AVAILABLE_APP_LOCALES.map((option) => <button key={option} type="button" role="radio" aria-checked={selected === option} className={selected === option ? 'selected' : ''} onClick={() => setSelected(option)}><span lang={option}>{localeDisplayName(option, locale)}</span><small>{option}</small></button>)}
        </div>
      </div>
      <footer><button type="button" className="quiet-button" onClick={onClose}>{t('common.cancel')}</button><button type="button" className="primary-button" onClick={() => onApply(selected)}>{t('preferences.confirm')}</button></footer>
    </ModalShell>
  </div>
}

interface HomeSectionTabEntry {
  id: string
  kind: HomeSectionDefinition['kind']
  label: string
  title: string
  recoveryCount?: number
}

const sameSectionIds = (left: readonly string[], right: readonly string[]): boolean => left.length === right.length && left.every((id, index) => id === right[index])

function HomeSectionTabs({ entries, activeId, ariaLabel, moreLabel, onSelect }: { entries: readonly HomeSectionTabEntry[]; activeId: string; ariaLabel: string; moreLabel: string; onSelect(id: string): void }) {
  const navigationRef = useRef<HTMLDivElement>(null)
  const measurementsRef = useRef<HTMLDivElement>(null)
  const overflowMeasureRef = useRef<HTMLButtonElement>(null)
  const overflowButtonRef = useRef<HTMLButtonElement>(null)
  const overflowMenuRef = useRef<HTMLDivElement>(null)
  const [visibleIds, setVisibleIds] = useState(() => entries.map((entry) => entry.id))
  const [overflowMenuOpen, setOverflowMenuOpen] = useState(false)
  const [overflowMenuPosition, setOverflowMenuPosition] = useState({ left: 8, top: 8 })
  const entriesSignature = entries.map((entry) => `${entry.id}\u0001${entry.label}\u0001${entry.recoveryCount ?? ''}`).join('\u0002')

  useLayoutEffect(() => {
    const navigation = navigationRef.current
    const measurements = measurementsRef.current
    if (!navigation || !measurements) return

    const updateVisibleSections = (): void => {
      const allIds = entries.map((entry) => entry.id)
      const availableWidth = navigation.clientWidth
      if (availableWidth <= 0) {
        setVisibleIds((current) => sameSectionIds(current, allIds) ? current : allIds)
        return
      }

      const widths = new Map<string, number>()
      for (const element of measurements.querySelectorAll<HTMLElement>('[data-home-section-measure-id]')) {
        const id = element.dataset.homeSectionMeasureId
        if (id) widths.set(id, Math.ceil(element.getBoundingClientRect().width || element.offsetWidth))
      }
      if (entries.some((entry) => !widths.get(entry.id))) return

      const totalWidth = entries.reduce((sum, entry) => sum + (widths.get(entry.id) ?? 0), 0)
      if (totalWidth <= availableWidth) {
        setVisibleIds((current) => sameSectionIds(current, allIds) ? current : allIds)
        return
      }

      const overflowWidth = Math.ceil(overflowMeasureRef.current?.getBoundingClientRect().width || overflowMeasureRef.current?.offsetWidth || 0)
      const tabBudget = Math.max(0, availableWidth - overflowWidth)
      const nextVisibleIds: string[] = []
      let usedWidth = 0
      for (const entry of entries) {
        const width = widths.get(entry.id) ?? 0
        if (usedWidth + width > tabBudget) break
        nextVisibleIds.push(entry.id)
        usedWidth += width
      }

      const activeEntry = entries.find((entry) => entry.id === activeId)
      if (activeEntry && !nextVisibleIds.includes(activeEntry.id)) {
        const activeWidth = widths.get(activeEntry.id) ?? 0
        while (nextVisibleIds.length > 0 && usedWidth + activeWidth > tabBudget) {
          const removedId = nextVisibleIds.pop()
          usedWidth -= removedId ? widths.get(removedId) ?? 0 : 0
        }
        nextVisibleIds.push(activeEntry.id)
      }

      setVisibleIds((current) => sameSectionIds(current, nextVisibleIds) ? current : nextVisibleIds)
    }

    updateVisibleSections()
    window.addEventListener('resize', updateVisibleSections)
    if (typeof ResizeObserver === 'undefined') return () => window.removeEventListener('resize', updateVisibleSections)
    const observer = new ResizeObserver(updateVisibleSections)
    observer.observe(navigation)
    observer.observe(measurements)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', updateVisibleSections)
    }
  }, [activeId, entriesSignature])

  const visibleIdSet = new Set(visibleIds)
  const visibleEntries = entries.filter((entry) => visibleIdSet.has(entry.id))
  const overflowEntries = entries.filter((entry) => !visibleIdSet.has(entry.id))

  useEffect(() => {
    if (overflowEntries.length === 0) setOverflowMenuOpen(false)
  }, [overflowEntries.length])

  useEffect(() => {
    if (!overflowMenuOpen) return
    const closeOnOutsidePointer = (event: PointerEvent): void => {
      const target = event.target as Node | null
      if (target && (overflowButtonRef.current?.contains(target) || overflowMenuRef.current?.contains(target))) return
      setOverflowMenuOpen(false)
    }
    const closeOnKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      setOverflowMenuOpen(false)
      overflowButtonRef.current?.focus()
    }
    const closeOnResize = (): void => setOverflowMenuOpen(false)
    window.addEventListener('pointerdown', closeOnOutsidePointer, true)
    window.addEventListener('keydown', closeOnKey)
    window.addEventListener('resize', closeOnResize)
    return () => {
      window.removeEventListener('pointerdown', closeOnOutsidePointer, true)
      window.removeEventListener('keydown', closeOnKey)
      window.removeEventListener('resize', closeOnResize)
    }
  }, [overflowMenuOpen])

  const toggleOverflowMenu = (): void => {
    if (overflowMenuOpen) {
      setOverflowMenuOpen(false)
      return
    }
    const bounds = overflowButtonRef.current?.getBoundingClientRect()
    if (bounds) {
      const menuWidth = 240
      const estimatedHeight = Math.min(320, overflowEntries.length * 33 + 16)
      const left = Math.max(8, Math.min(bounds.right - menuWidth, window.innerWidth - menuWidth - 8))
      const belowTop = bounds.bottom + 4
      const top = belowTop + estimatedHeight <= window.innerHeight - 8 ? belowTop : Math.max(8, bounds.top - estimatedHeight - 4)
      setOverflowMenuPosition({ left, top })
    }
    setOverflowMenuOpen(true)
  }

  const renderTabContent = (entry: HomeSectionTabEntry) => <><span className="home-section-tab-label">{entry.label}</span>{entry.recoveryCount !== undefined && <span className="recovery-count">{entry.recoveryCount}</span>}</>

  return <div ref={navigationRef} className="home-section-navigation">
    <div className="home-section-tabs" role="tablist" aria-label={ariaLabel}>
      {visibleEntries.map((entry) => <button key={entry.id} type="button" role="tab" aria-selected={activeId === entry.id} data-moon-tooltip-disabled className={`home-section-tab ${activeId === entry.id ? 'selected' : ''}`} onClick={() => onSelect(entry.id)}>{renderTabContent(entry)}</button>)}
    </div>
    {overflowEntries.length > 0 && <button ref={overflowButtonRef} className="home-section-overflow-button icon-button" type="button" aria-label={moreLabel} title={moreLabel} aria-haspopup="menu" aria-expanded={overflowMenuOpen} onClick={toggleOverflowMenu}><PixelUtilityIcon kind={overflowMenuOpen ? 'up' : 'down'} /></button>}
    <div ref={measurementsRef} className="home-section-measurements" aria-hidden="true">
      {entries.map((entry) => <button key={entry.id} type="button" tabIndex={-1} className="home-section-tab" data-home-section-measure-id={entry.id}>{renderTabContent(entry)}</button>)}
      <button ref={overflowMeasureRef} className="home-section-overflow-button icon-button" type="button" tabIndex={-1}><PixelUtilityIcon kind="down" /></button>
    </div>
    {overflowMenuOpen && createPortal(<div ref={overflowMenuRef} className="context-menu home-section-overflow-menu component-scrollbar" role="menu" aria-label={moreLabel} style={overflowMenuPosition} onPointerDown={(event) => event.stopPropagation()}>
      {overflowEntries.map((entry) => <button key={entry.id} className="context-menu-item" type="button" role="menuitem" data-moon-tooltip-disabled onClick={() => { setOverflowMenuOpen(false); onSelect(entry.id) }}><PixelUtilityIcon kind={entry.kind === 'folder' ? 'folder' : entry.kind === 'recovery' ? 'refresh' : 'image'} /><span className="home-section-overflow-label">{entry.label}</span>{entry.recoveryCount !== undefined && <span className="recovery-count">{entry.recoveryCount}</span>}</button>)}
    </div>, document.body)}
  </div>
}

export function HomeWorkspace({ onNew, onOpen, onOpenProject, onOpenImage, onRestoreRecovery, onOpenLatestRelease }: HomeWorkspaceProps) {
  const { locale, t } = useI18n()
  const [homeSections, setHomeSections] = useState(getHomeSections)
  const [fileDisplayFormats, setFileDisplayFormats] = useState(getHomeFileDisplayFormats)
  const [section, setSection] = useState(() => loadHomeSection(getHomeSections()))
  const [projectLayout, setProjectLayout] = useState<HomeProjectLayout>(loadHomeProjectLayout)
  const [recentProjectsHidden, setRecentProjectsHidden] = useState(loadRecentProjectsHidden)
  const [projects, setProjects] = useState<ProjectCard[]>([])
  const [bannerProjects, setBannerProjects] = useState<BannerProjectCard[]>([])
  const [bannerIndex, setBannerIndex] = useState(0)
  const [sectionDirectory, setSectionDirectory] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [hasFilesHiddenByFormat, setHasFilesHiddenByFormat] = useState(false)
  const objectUrls = useRef<string[]>([])
  const bannerObjectUrls = useRef<string[]>([])
  const loadGeneration = useRef(0)
  const projectsRef = useRef<ProjectCard[]>([])
  const recentListRef = useRef<HTMLDivElement>(null)
  const reorderRef = useRef<{ filePath: string; pointerId: number; outsideList: boolean; captureTarget: HTMLElement | null } | null>(null)
  const [draggingProjectPath, setDraggingProjectPath] = useState('')
  const [removePendingProjectPath, setRemovePendingProjectPath] = useState('')
  const [languageDialogOpen, setLanguageDialogOpen] = useState(false)
  const [sectionManagerOpen, setSectionManagerOpen] = useState(false)
  const [recoveryRetentionDays, setRecoveryRetentionDays] = useState(() => loadEditorPreferences().recoveryRetentionDays)
  const [logoSpinActive, setLogoSpinActive] = useState(false)
  const logoClickRef = useRef({ count: 0, lastClickAt: 0 })
  const setMessage = useWorkspace((state) => state.setMessage)
  const recoveryRecords = useWorkspace((state) => state.recoveryRecords)
  const discardRecovery = useWorkspace((state) => state.discardRecovery)
  const requestDialog = useWorkspace((state) => state.requestDialog)
  const activeSection = homeSections.find((candidate) => candidate.id === section) ?? homeSections[0] ?? { id: 'recent', kind: 'recent' }
  const activeSectionReloadKey = activeSection.kind === 'folder' ? `${activeSection.id}\u0000${activeSection.directoryPath}` : activeSection.id
  const fileDisplayFormatsKey = fileDisplayFormats.join(',')

  const triggerLogoSpin = (): void => {
    const now = Date.now()
    const clicks = logoClickRef.current
    if (now - clicks.lastClickAt > logoSpinClickWindowMs) clicks.count = 0
    clicks.count += 1
    clicks.lastClickAt = now
    if (clicks.count < logoSpinClickThreshold) return
    clicks.count = 0
    setLogoSpinActive(true)
  }

  useEffect(() => {
    if (!logoSpinActive) return
    const finishTimer = window.setTimeout(() => {
      setLogoSpinActive(false)
    }, logoSpinDurationMs)
    return () => {
      window.clearTimeout(finishTimer)
    }
  }, [logoSpinActive])

  const releaseObjectUrls = (): void => {
    for (const url of objectUrls.current) URL.revokeObjectURL(url)
    objectUrls.current = []
  }

  const releaseBannerObjectUrls = (): void => {
    for (const url of bannerObjectUrls.current) URL.revokeObjectURL(url)
    bannerObjectUrls.current = []
  }

  const sectionName = (target: HomeSectionDefinition): string => {
    if (target.kind === 'recent') return t('home.section.recent')
    if (target.kind === 'gallery') return t('home.section.galleryTab')
    if (target.kind === 'recovery') return t('home.section.recovery')
    return target.name
  }

  const readCard = async (record: RecentProject): Promise<ProjectCard> => {
    try {
      const cacheKey = previewCacheKey(record)
      const cached = projectPreviewCache.get(cacheKey)
      if (cached) {
        projectPreviewCache.delete(cacheKey)
        projectPreviewCache.set(cacheKey, cached)
        return { ...record, name: record.fileName, previewUrl: createPreviewUrl(cached.bytes), width: cached.width, height: cached.height, colorMode: cached.colorMode }
      }
      let metadata: ProjectPreview
      try {
        metadata = await window.moonSprite.readProjectPreview(record.filePath)
      } catch {
        metadata = await runProjectPreviewFallback(async () => {
          const bytes = await window.moonSprite.readBinary(record.filePath)
          const mimeType = rasterImageMimeType(record.filePath)
          let generated: ProjectPreview
          if (isMoonSpriteProjectPath(record.filePath)) generated = await readProjectGalleryMetadataAsync(bytes)
          else if (mimeType) {
            const preview = await createRasterImagePreview(bytes, mimeType)
            generated = { ...preview, colorMode: 'rgba' }
          } else {
            const document = await decodeDocumentFileAsync(bytes, record.filePath)
            generated = { preview: encodeProjectPreview(document), width: document.width, height: document.height, colorMode: document.colorMode }
          }
          await window.moonSprite.cacheProjectPreview(record.filePath, generated).catch(() => {
            // A cache write failure must not hide an otherwise valid thumbnail.
          })
          return generated
        })
      }
      const previewBytes = metadata.preview.slice()
      cacheProjectPreview(cacheKey, { bytes: previewBytes, width: metadata.width, height: metadata.height, colorMode: metadata.colorMode })
      const previewUrl = createPreviewUrl(previewBytes)
      return { ...record, name: record.fileName, previewUrl, width: metadata.width, height: metadata.height, colorMode: metadata.colorMode }
    } catch (error) {
      return { ...record, name: record.fileName, error: error instanceof Error ? error.message : t('home.projectUnreadable') }
    }
  }

  useEffect(() => {
    let disposed = false
    const loadBanners = async (): Promise<void> => {
      try {
        let galleryProjects: Awaited<ReturnType<typeof window.moonSprite.listGalleryProjects>>['projects'] = []
        try {
          galleryProjects = (await window.moonSprite.listGalleryProjects()).projects
        } catch {
          // Bundled image banners remain available if the optional gallery is unavailable.
        }
        const matches = resolveHomeBanners(homeBannerDefinitions, galleryProjects)
        const cards = await Promise.all(matches.map(async (match): Promise<BannerProjectCard> => {
          if (match.kind === 'image') return { id: match.id, author: match.author, authorUrl: match.authorUrl, name: match.imageName ?? match.id, imageUrl: match.imageAssetKey === 'home-banner-fire' ? homeBannerFire : match.imageAssetKey === 'home-banner-crystal' ? homeBannerCrystal : match.imageAssetKey === 'home-banner-coast' ? homeBannerCoast : match.imageAssetKey === 'home-banner-hall' ? homeBannerHall : undefined }
          const card = await readCard({
            filePath: match.filePath!,
            fileName: match.fileName ?? match.projectFileName ?? match.id,
            name: match.fileName ?? match.projectFileName ?? match.id,
            lastOpened: match.modifiedAt ?? 0,
            pinned: false
          })
          return { ...card, id: match.id, author: match.author, authorUrl: match.authorUrl }
        }))
        if (disposed) {
          for (const card of cards) if (card.previewUrl) URL.revokeObjectURL(card.previewUrl)
          return
        }
        releaseBannerObjectUrls()
        for (const card of cards) if (card.previewUrl) bannerObjectUrls.current.push(card.previewUrl)
        // Pick a fresh starting banner for each home-screen entry.
        setBannerIndex(cards.length > 0 ? Math.floor(Math.random() * cards.length) : 0)
        setBannerProjects(cards)
      } catch {
        if (!disposed) setBannerProjects([])
      }
    }
    void loadBanners()
    return () => {
      disposed = true
      releaseBannerObjectUrls()
    }
    // Banner metadata is static for the lifetime of the start screen; gallery
    // paths are resolved once and refreshed when the home screen is remounted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (bannerProjects.length < 2) return
    const timer = window.setInterval(() => setBannerIndex((current) => (current + 1) % bannerProjects.length), 8_000)
    return () => window.clearInterval(timer)
  }, [bannerProjects])

  const loadSection = async (target: HomeSectionDefinition): Promise<void> => {
    const generation = ++loadGeneration.current
    releaseObjectUrls()
    setProjects([])
    setLoadError('')
    setHasFilesHiddenByFormat(false)
    setSectionDirectory(target.kind === 'folder' ? target.directoryPath : '')
    if (target.kind === 'recovery') { setLoading(false); return }
    setLoading(true)
    try {
      let records: RecentProject[]
      if (target.kind === 'gallery' || target.kind === 'folder') {
        const listing = target.kind === 'gallery'
          ? await window.moonSprite.listGalleryProjects()
          : await window.moonSprite.listFolderProjects(target.directoryPath)
        const pins = new Set(getGalleryPins())
        setSectionDirectory(listing.directoryPath)
        records = listing.projects.map((project) => ({ filePath: project.filePath, fileName: project.fileName, name: project.fileName, lastOpened: project.modifiedAt, pinned: pins.has(project.filePath) }))
          .sort((left, right) => Number(right.pinned) - Number(left.pinned) || right.lastOpened - left.lastOpened)
      } else records = getRecentProjects()
      const visibleRecords = records.filter((record) => matchesHomeFileDisplayFormats(record.filePath, fileDisplayFormats))
      if (generation !== loadGeneration.current) return
      setHasFilesHiddenByFormat(visibleRecords.length < records.length)
      records = visibleRecords
      const initialCards = records.map((record): ProjectCard => ({ ...record, name: record.fileName, previewLoading: true }))
      projectsRef.current = initialCards
      setProjects(initialCards)
      setLoading(false)
      let nextIndex = 0
      const loadNext = async (): Promise<void> => {
        while (nextIndex < records.length) {
          const index = nextIndex
          nextIndex += 1
          const record = records[index]
          const card = await readCard(record)
          if (generation !== loadGeneration.current) {
            if (card.previewUrl) URL.revokeObjectURL(card.previewUrl)
            return
          }
          if (card.previewUrl) objectUrls.current.push(card.previewUrl)
          setProjects((items) => {
            const next = items.map((item) => item.filePath === card.filePath ? card : item)
            projectsRef.current = next
            return next
          })
        }
      }
      await Promise.all(Array.from({ length: Math.min(3, records.length) }, () => loadNext()))
    } catch (error) {
      if (generation === loadGeneration.current) setLoadError(error instanceof Error ? error.message : t('home.sectionReadFailed', { section: sectionName(target) }))
    } finally {
      if (generation === loadGeneration.current) setLoading(false)
    }
  }

  useEffect(() => {
    projectsRef.current = projects
  }, [projects])

  useEffect(() => {
    const syncPreferences = (): void => setRecoveryRetentionDays(loadEditorPreferences().recoveryRetentionDays)
    window.addEventListener('moonsprite:preferences-changed', syncPreferences)
    return () => window.removeEventListener('moonsprite:preferences-changed', syncPreferences)
  }, [])

  useEffect(() => {
    void loadSection(activeSection)
    return () => { loadGeneration.current += 1; releaseObjectUrls() }
  }, [activeSectionReloadKey, fileDisplayFormatsKey])

  useEffect(() => {
    let disposed = false
    void window.moonSprite.ensureBuiltinExample().then((filePath) => {
      if (disposed || !filePath) return
      const existing = getRecentProjects().find((project) => project.filePath === filePath)
      if (!existing) {
        recordRecentProject(filePath, t('home.exampleName'))
        toggleRecentProjectPinned(filePath)
        void loadSection(activeSection)
      }
    }).catch(() => {
      // A missing bundled example must not block the start screen.
    })
    return () => { disposed = true }
  // The example is seeded once per start-screen mount; section changes reload normally above.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const selectSection = (target: string): void => {
    setSection(target)
    try { localStorage.setItem(homeSectionStorageKey, target) } catch { /* Keep the selected home section for this session. */ }
  }

  const updateHomeSections = (next: HomeSectionDefinition[]): void => {
    setHomeSections(saveHomeSections(next))
  }

  const updateFileDisplayFormats = (next: HomeFileDisplayFormat[]): void => {
    setFileDisplayFormats(saveHomeFileDisplayFormats(next))
  }

  const addHomeFolderSection = async (): Promise<void> => {
    try {
      const result = await window.moonSprite.chooseDirectory(activeSection.kind === 'folder' ? activeSection.directoryPath : undefined)
      if (result.canceled || !result.directoryPath) return
      const existing = findFolderHomeSection(homeSections, result.directoryPath)
      if (existing) {
        selectSection(existing.id)
        return
      }
      const folder = createFolderHomeSection(result.directoryPath)
      const next = saveHomeSections([...homeSections, folder])
      setHomeSections(next)
      selectSection(folder.id)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t('home.folderSelectFailed'))
    }
  }

  const removeHomeFolderSection = (sectionId: string): void => {
    const index = homeSections.findIndex((candidate) => candidate.id === sectionId)
    const next = saveHomeSections(homeSections.filter((candidate) => candidate.id !== sectionId))
    setHomeSections(next)
    if (section === sectionId) selectSection(next[Math.min(Math.max(index, 0), next.length - 1)]?.id ?? 'recent')
  }

  const changeProjectLayout = (direction: -1 | 1): void => {
    setProjectLayout((current) => {
      const currentIndex = homeProjectLayoutOrder.indexOf(current)
      const next = homeProjectLayoutOrder[Math.max(0, Math.min(homeProjectLayoutOrder.length - 1, currentIndex + direction))]
      if (next === current) return current
      try { localStorage.setItem(homeProjectLayoutStorageKey, next) } catch { /* Keep the layout for this session. */ }
      return next
    })
  }

  const toggleRecentProjectsHidden = (): void => {
    setRecentProjectsHidden((current) => {
      const next = !current
      try { localStorage.setItem(homeRecentPrivacyStorageKey, next ? 'hidden' : 'visible') } catch { /* Keep privacy mode for this session. */ }
      return next
    })
  }

  const handleProjectLayoutWheel = (event: ReactWheelEvent<HTMLElement>): void => {
    if ((!event.ctrlKey && !event.metaKey) || event.deltaY === 0) return
    event.preventDefault()
    event.stopPropagation()
    changeProjectLayout(event.deltaY < 0 ? 1 : -1)
  }

  const openExternalLink = (url: string): void => {
    void window.moonSprite.openExternalUrl(url).catch((error) => {
      setMessage(error instanceof Error ? error.message : t('home.openLinkFailed'))
    })
  }

  const applyLanguage = (nextLocale: AppLocale): void => {
    try {
      saveEditorPreferences({ ...loadEditorPreferences(), language: nextLocale })
      window.dispatchEvent(new Event('moonsprite:preferences-changed'))
      setLanguageDialogOpen(false)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t('home.switchLanguageFailed'))
    }
  }

  const openProjectFolder = (project: ProjectCard): void => {
    void window.moonSprite.openProjectInFolder(project.filePath).catch((error) => {
      setMessage(error instanceof Error ? error.message : t('home.openProjectFolderFailed'))
    })
  }

  const openSectionFolder = (): void => {
    const request = activeSection.kind === 'gallery'
      ? window.moonSprite.openGalleryFolder()
      : activeSection.kind === 'folder'
        ? window.moonSprite.openDirectory(activeSection.directoryPath)
        : null
    if (!request) return
    void request.catch((error) => {
      setMessage(error instanceof Error ? error.message : t('home.openSectionFolderFailed'))
    })
  }

  const clearRecent = (): void => {
    const retainedPaths = new Set(clearRecentProjects().map((project) => project.filePath))
    setProjects((items) => {
      const removedUrls = new Set(items.flatMap((item) => !retainedPaths.has(item.filePath) && item.previewUrl ? [item.previewUrl] : []))
      for (const url of removedUrls) URL.revokeObjectURL(url)
      objectUrls.current = objectUrls.current.filter((url) => !removedUrls.has(url))
      const next = items.filter((item) => retainedPaths.has(item.filePath))
      projectsRef.current = next
      return next
    })
  }

  const pinProject = (filePath: string): void => {
    if (activeSection.kind !== 'recent') {
      const pinned = new Set(toggleGalleryPin(filePath))
      setProjects((items) => {
        const next = items.map((item) => ({ ...item, pinned: pinned.has(item.filePath) })).sort((left, right) => Number(right.pinned) - Number(left.pinned) || right.lastOpened - left.lastOpened)
        projectsRef.current = next
        return next
      })
      return
    }
    const ordered = toggleRecentProjectPinned(filePath)
    const records = new Map(ordered.map((item, index) => [item.filePath, { pinned: item.pinned, index }]))
    setProjects((items) => {
      const next = items.map((item) => ({ ...item, pinned: records.get(item.filePath)?.pinned === true }))
        .sort((left, right) => (records.get(left.filePath)?.index ?? Number.MAX_SAFE_INTEGER) - (records.get(right.filePath)?.index ?? Number.MAX_SAFE_INTEGER))
      projectsRef.current = next
      return next
    })
  }

  const removeProjectFromView = (filePath: string): void => {
    setProjects((items) => {
      const removed = items.find((item) => item.filePath === filePath)
      if (removed?.previewUrl) {
        URL.revokeObjectURL(removed.previewUrl)
        objectUrls.current = objectUrls.current.filter((url) => url !== removed.previewUrl)
      }
      const next = items.filter((item) => item.filePath !== filePath)
      projectsRef.current = next
      return next
    })
  }

  const deleteGalleryProject = async (project: ProjectCard): Promise<void> => {
    const choice = await requestDialog({
      title: t('home.deleteProject'),
      message: t('home.deleteConfirm', { name: project.name }),
      detail: t('home.deleteDetail'),
      choices: [
        { id: 'cancel', label: t('common.cancel'), tone: 'quiet' },
        { id: 'delete', label: t('home.deleteProject'), tone: 'danger' }
      ]
    })
    if (choice !== 'delete') return

    try {
      const fileName = project.filePath.split(/[\\/]/).pop() ?? project.fileName
      await window.moonSprite.deleteGalleryProject(fileName)
      removeGalleryPin(project.filePath)
      removeRecentProject(project.filePath)
      removeProjectFromView(project.filePath)
      setMessage(t('home.deletedMessage', { name: project.name }))
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t('home.deleteFailed'))
    }
  }

  const removeFromRecent = (project: ProjectCard): void => {
    removeRecentProject(project.filePath)
    removeProjectFromView(project.filePath)
    setMessage(t('home.removedRecentMessage', { name: project.name }))
  }

  const openProject = async (project: Pick<ProjectCard, 'filePath' | 'name'>, keepHomeOpen = false): Promise<void> => {
    const opened = await onOpenProject(project.filePath, keepHomeOpen)
    if (opened) return
    const error = t('home.openFailed')
    setProjects((items) => items.map((item) => item.filePath === project.filePath ? { ...item, error } : item))
    setMessage(`${project.name}：${error}`)
  }

  const startRecentReorder = (event: ReactPointerEvent<HTMLButtonElement>, filePath: string): void => {
    if (activeSection.kind !== 'recent' || event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    reorderRef.current = { filePath, pointerId: event.pointerId, outsideList: false, captureTarget: event.currentTarget }
    setDraggingProjectPath(filePath)
    setRemovePendingProjectPath('')
  }

  const pointIsInsideRecentList = (clientX: number, clientY: number): boolean => {
    const bounds = recentListRef.current?.getBoundingClientRect()
    return Boolean(bounds && clientX >= bounds.left && clientX <= bounds.right && clientY >= bounds.top && clientY <= bounds.bottom)
  }

  const moveRecentReorder = (clientX: number, clientY: number, pointerId: number): void => {
    const drag = reorderRef.current
    if (!drag || drag.pointerId !== pointerId) return
    const outsideList = !pointIsInsideRecentList(clientX, clientY)
    if (outsideList !== drag.outsideList) {
      drag.outsideList = outsideList
      setRemovePendingProjectPath(outsideList ? drag.filePath : '')
    }
    if (outsideList) return
    const targetRow = document.elementsFromPoint(clientX, clientY)
      .map((element) => element.closest<HTMLElement>('.recent-file-row[data-recent-path]'))
      .find((element): element is HTMLElement => Boolean(element))
    const targetPath = targetRow?.dataset.recentPath
    if (!targetPath || targetPath === drag.filePath) return
    const items = projectsRef.current
    const source = items.find((item) => item.filePath === drag.filePath)
    const target = items.find((item) => item.filePath === targetPath)
    if (!source || !target || source.pinned !== target.pinned) return
    const remaining = items.filter((item) => item.filePath !== drag.filePath)
    const targetIndex = remaining.findIndex((item) => item.filePath === targetPath)
    if (targetIndex < 0) return
    const targetBounds = targetRow.getBoundingClientRect()
    const insertAfter = projectLayout === 'large'
      ? clientX >= targetBounds.left + targetBounds.width / 2
      : clientY >= targetBounds.top + targetBounds.height / 2
    remaining.splice(targetIndex + (insertAfter ? 1 : 0), 0, source)
    if (remaining.every((item, index) => item.filePath === items[index]?.filePath)) return
    projectsRef.current = remaining
    setProjects(remaining)
  }

  const endRecentReorder = (pointerId: number, clientX: number, clientY: number, eventType: string): void => {
    const drag = reorderRef.current
    if (!drag || drag.pointerId !== pointerId) return
    if (drag.captureTarget?.hasPointerCapture(pointerId)) drag.captureTarget.releasePointerCapture(pointerId)
    reorderRef.current = null
    setDraggingProjectPath('')
    setRemovePendingProjectPath('')
    const removeFromRecent = eventType !== 'pointercancel' && !pointIsInsideRecentList(clientX, clientY)
    if (removeFromRecent) {
      const project = projectsRef.current.find((item) => item.filePath === drag.filePath)
      removeRecentProject(drag.filePath)
      removeProjectFromView(drag.filePath)
      setMessage(t('home.removedRecentMessage', { name: project?.name ?? t('home.projectFallback') }))
      return
    }
    reorderRecentProjects(projectsRef.current.map((project) => project.filePath))
  }

  useEffect(() => {
    const move = (event: PointerEvent): void => {
      if (!reorderRef.current || reorderRef.current.pointerId !== event.pointerId) return
      event.preventDefault()
      moveRecentReorder(event.clientX, event.clientY, event.pointerId)
    }
    const end = (event: PointerEvent): void => {
      if (!reorderRef.current || reorderRef.current.pointerId !== event.pointerId) return
      event.preventDefault()
      endRecentReorder(event.pointerId, event.clientX, event.clientY, event.type)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', end)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', end)
      window.removeEventListener('pointercancel', end)
    }
  }, [activeSection.kind, projectLayout])

  const emptyState = hasFilesHiddenByFormat && activeSection.kind !== 'recovery'
    ? { icon: <PixelUtilityIcon kind="image" />, title: t('home.emptyFileFilter'), detail: t('home.emptyFileFilterDetail') }
    : activeSection.kind === 'gallery'
    ? { icon: <PixelUtilityIcon kind="image" />, title: t('home.emptyGallery'), detail: t('home.emptyGalleryDetail') }
    : activeSection.kind === 'recovery'
      ? { icon: <PixelUtilityIcon kind="refresh" />, title: t('home.emptyRecovery'), detail: t('home.emptyRecoveryDetail') }
      : activeSection.kind === 'folder'
        ? { icon: <PixelUtilityIcon kind="folder" />, title: t('home.emptyFolder'), detail: t('home.emptyFolderDetail') }
        : { icon: <PixelUtilityIcon kind="image" />, title: t('home.emptyRecent'), detail: t('home.emptyRecentDetail') }
  const visibleHomeSections = homeSections.filter((candidate) => candidate.kind !== 'recovery' || recoveryRecords.length > 0)
  const homeSectionTabEntries: HomeSectionTabEntry[] = visibleHomeSections.map((candidate) => {
    const label = sectionName(candidate)
    return {
      id: candidate.id,
      kind: candidate.kind,
      label,
      title: candidate.kind === 'folder' ? candidate.directoryPath : label,
      recoveryCount: candidate.kind === 'recovery' ? recoveryRecords.length : undefined
    }
  })
  const activeBanner = bannerProjects.length > 0 ? bannerProjects[bannerIndex % bannerProjects.length] : undefined

  return <section className="aseprite-home" aria-label={t('home.aria')} onWheel={handleProjectLayoutWheel}>
    <div className="aseprite-home-inner">
      <header className="start-screen-header">
        <button className={`start-screen-mark ${logoSpinActive ? 'logo-spin-playing' : ''}`} type="button" aria-label="MoonSprite" onClick={triggerLogoSpin}>
          <img className="start-screen-mark-logo" src={moonspriteLogo} alt="" />
        </button>
        <div><h1>MOONSPRITE</h1><p>{t('home.tagline')}</p></div>
        <div className="start-screen-meta">
          <div className="start-screen-links" aria-label={t('home.linksAria')}>
            <Tooltip content={<><strong>{t('home.qq')}</strong><span>{t('home.qqDescription')}</span></>}>
              <button className="start-screen-link" type="button" onClick={() => openExternalLink(homeExternalLinks.qq)} aria-label={t('home.qq')}><HomeLinkIcon kind="qq" /></button>
            </Tooltip>
            <Tooltip content={<><strong>{t('home.community')}</strong><span>{t('home.communityDescription')}</span></>}>
              <button className="start-screen-link" type="button" onClick={() => openExternalLink(homeExternalLinks.community)} aria-label={t('home.community')}><HomeLinkIcon kind="community" /></button>
            </Tooltip>
            <Tooltip content={<><strong>{t('home.steam')}</strong><span>{t('home.steamDescription')}</span></>}>
              <button className="start-screen-link" type="button" onClick={() => openExternalLink(homeExternalLinks.steam)} aria-label={t('home.steam')}><HomeLinkIcon kind="steam" /></button>
            </Tooltip>
            <Tooltip content={<><strong>{t('home.github')}</strong><span>{t('home.githubDescription')}</span></>}>
              <button className="start-screen-link" type="button" onClick={() => openExternalLink(homeExternalLinks.github)} aria-label={t('home.github')}><HomeLinkIcon kind="github" /></button>
            </Tooltip>
            <Tooltip content={<><strong>{t('home.language')}</strong><span>{t('home.languageDescription')}</span></>}>
              <button className="start-screen-link" type="button" onClick={() => setLanguageDialogOpen(true)} aria-label={t('home.language')}><HomeLinkIcon kind="language" /></button>
            </Tooltip>
          </div>
        </div>
      </header>
      <div className="start-screen-rule" />
      {activeBanner && <section className="home-feature-banner" aria-label={t('home.featureBanner')}>
        <div className="home-feature-banner-grid">
          {bannerProjects.map((project, index) => {
            const isActive = index === bannerIndex % bannerProjects.length
            return <article key={project.id} className={`home-feature-banner-item ${isActive ? 'active' : ''}`} aria-hidden={!isActive}>
              <div className="home-feature-banner-art-frame">
                <button className="home-feature-banner-art" type="button" tabIndex={isActive ? undefined : -1} onClick={() => {
                  if (project.imageUrl) void onOpenImage(project.imageUrl, project.name)
                  else if (project.filePath) void openProject({ filePath: project.filePath, name: project.name })
                }} aria-label={t('home.openArtwork', { name: project.name })}>
                  {project.imageUrl ? <img src={project.imageUrl} alt={project.name} /> : project.previewUrl ? <img src={project.previewUrl} alt={project.name} /> : <PixelUtilityIcon kind="image" />}
                </button>
                <span className="home-feature-banner-title">{project.name}</span>
                <button type="button" className="home-feature-banner-author" tabIndex={isActive ? undefined : -1} onClick={() => openExternalLink(project.authorUrl)} aria-label={t('home.openAuthor', { name: project.author })}>{t('home.author', { name: project.author })}</button>
                {bannerProjects.length > 1 && <div className="home-feature-banner-dots" role="tablist" aria-label={t('home.featureBannerPages')}>
                  {bannerProjects.map((_, dotIndex) => <button key={dotIndex} type="button" tabIndex={isActive ? undefined : -1} role="tab" aria-selected={isActive && dotIndex === bannerIndex} aria-label={t('home.bannerImage', { index: dotIndex + 1 })} className={`home-feature-banner-dot ${isActive && dotIndex === bannerIndex ? 'active' : ''}`} onClick={() => setBannerIndex(dotIndex)} />)}
                </div>}
              </div>
            </article>
          })}
        </div>
      </section>}
      <div className="start-screen-layout">
        <aside className="start-actions" aria-label={t('home.actionsAria')}>
          <button className="start-action primary-button" type="button" onClick={onNew}><Plus size={20} /><span><strong>{t('home.newSprite')}</strong><small>{t('home.newSpriteDetail')}</small></span></button>
          <button className="start-action quiet-button" type="button" onClick={onOpen}><PixelUtilityIcon kind="folderOpen" /><span><strong>{t('home.openSprite')}</strong><small>{t('home.openSpriteDetail')}</small></span></button>
          <button className="start-action quiet-button" type="button" onClick={() => { void window.moonSprite.openProjectBackupFolder().catch((error) => setMessage(error instanceof Error ? error.message : t('home.openProjectBackupsFailed'))) }}><PixelUtilityIcon kind="save" /><span><strong>{t('home.projectBackups')}</strong><small>{t('home.openProjectBackups')}</small></span></button>
          <section className="start-screen-news" aria-label={t('home.news')}>
            <article className="home-steam-card" aria-label={`${t('home.steam')} · MoonSprite`}>
              <header className="home-steam-card-heading">
                <div><strong>MoonSprite</strong><span>{t('home.steam')}</span></div>
                <HomeLinkIcon kind="steam" />
              </header>
              <div className="home-steam-card-main">
                <div className="home-steam-card-art"><img src={moonspriteLogo} alt="MoonSprite" /></div>
                <p>{t('home.steamDescription')}</p>
              </div>
              <button type="button" className="quiet-button home-steam-card-action" onClick={() => openExternalLink(homeExternalLinks.steam)}>{t('home.steamWishlist')}</button>
            </article>
            {homeAnnouncementsForDisplay(latestReleases).map((release) => <button key={`${release.version}:${release.publishedAt}`} className="start-screen-news-item" type="button" onClick={() => onOpenLatestRelease?.(release)} aria-label={t('home.newsOpenAria', { version: release.version })}>
              <span className="start-screen-news-title"><strong>{t('home.newsReleaseTitle', { version: release.version })}</strong><time dateTime={release.publishedAt}>{formatReleaseDate(release.publishedAt, locale)}</time></span>
              <p>{t(release.homeSummary)}</p>
            </button>)}
          </section>
        </aside>
        <section className="recent-files-panel" aria-label={sectionName(activeSection)}>
          <header className="recent-files-header">
            <HomeSectionTabs entries={homeSectionTabEntries} activeId={section} ariaLabel={t('home.sectionsAria')} moreLabel={t('home.moreSections')} onSelect={selectSection} />
            <div className="recent-file-tools">
              {(activeSection.kind === 'gallery' || activeSection.kind === 'folder') && <button className="icon-button" type="button" onClick={openSectionFolder} aria-label={t('home.openSectionFolder')} title={sectionDirectory || (activeSection.kind === 'folder' ? activeSection.directoryPath : t('home.openGalleryFolder'))}><PixelUtilityIcon kind="folderOpen" /></button>}
              {activeSection.kind === 'recent' && <button className="icon-button" type="button" aria-pressed={recentProjectsHidden} onClick={toggleRecentProjectsHidden} aria-label={t(recentProjectsHidden ? 'home.showRecentProjects' : 'home.hideRecentProjects')} title={t(recentProjectsHidden ? 'home.showRecentProjects' : 'home.hideRecentProjects')}><PixelUtilityIcon kind={recentProjectsHidden ? 'eyeOff' : 'eye'} /></button>}
              <button className="icon-button" type="button" onClick={() => void loadSection(activeSection)} disabled={loading || activeSection.kind === 'recovery'} aria-label={t('home.refreshSection')} title={t('common.refresh')}><PixelUtilityIcon kind="refresh" /></button>
              {activeSection.kind === 'recent' && <button className="icon-button" type="button" onClick={clearRecent} disabled={!projects.some((project) => !project.pinned)} aria-label={t('home.clearUnpinned')} title={t('home.clearUnpinned')}><PixelUtilityIcon kind="clearRecords" /></button>}
              <button className="icon-button" type="button" onClick={() => setSectionManagerOpen(true)} aria-label={t('home.manageSections')} title={t('home.manageSections')}><PixelUtilityIcon kind="properties" /></button>
            </div>
          </header>
          <div ref={recentListRef} className={`recent-files-list component-scrollbar home-project-layout-${projectLayout}${draggingProjectPath ? ' recent-files-list-reordering' : ''}`}>
            {loading && <div className="start-screen-state"><PixelUtilityIcon kind="refresh" className="spin" /><span>{t('home.readingProjects')}</span></div>}
            {!loading && loadError && <div className="start-screen-state error"><TriangleAlert size={22} /><strong>{t('home.readSectionFailed')}</strong><span>{loadError}</span><button className="quiet-button" type="button" onClick={() => void loadSection(activeSection)}>{t('home.retry')}</button></div>}
            {!loading && !loadError && ((activeSection.kind !== 'recovery' && projects.length === 0) || (activeSection.kind === 'recovery' && recoveryRecords.length === 0)) && <div className="start-screen-state">{emptyState.icon}<strong>{emptyState.title}</strong><span>{emptyState.detail}</span></div>}
            {!loading && !loadError && activeSection.kind === 'recovery' && recoveryRecords.map((record) => <RecoveryFileRow key={record.id} record={record} retentionDays={recoveryRetentionDays} onRestore={() => void onRestoreRecovery(record.id)} onDiscard={() => void discardRecovery(record.id)} />)}
             {!loading && !loadError && activeSection.kind !== 'recovery' && projects.map((project) => <ProjectFileRow key={project.filePath} project={project} concealed={activeSection.kind === 'recent' && recentProjectsHidden} reorderable={activeSection.kind === 'recent'} dragging={draggingProjectPath === project.filePath} removePending={removePendingProjectPath === project.filePath} onOpen={() => void openProject(project)} onOpenInBackground={() => void openProject(project, true)} onPin={() => pinProject(project.filePath)} onDelete={activeSection.kind === 'gallery' ? () => void deleteGalleryProject(project) : undefined} onRemoveFromRecent={activeSection.kind === 'recent' && project.error ? () => removeFromRecent(project) : undefined} onOpenFolder={() => openProjectFolder(project)} onReorderStart={startRecentReorder} />)}
          </div>
        </section>
      </div>
      <footer className="start-screen-footer"><span className="start-screen-build-status"><span>MoonSprite</span><strong>{APP_CHANNEL_LABEL}</strong></span><small className="start-screen-development-notice">{t('home.internalUseOnly')}{' '}{t('home.doNotDistribute')}</small></footer>
    </div>
    {languageDialogOpen && <HomeLanguageDialog current={locale} onApply={applyLanguage} onClose={() => setLanguageDialogOpen(false)} />}
    {sectionManagerOpen && <HomeSectionManagerDialog activeSectionId={section} fileDisplayFormats={fileDisplayFormats} sections={homeSections} onAddFolder={addHomeFolderSection} onChange={updateHomeSections} onClose={() => setSectionManagerOpen(false)} onFileDisplayFormatsChange={updateFileDisplayFormats} onRemove={removeHomeFolderSection} onSelect={selectSection} />}
  </section>
}
