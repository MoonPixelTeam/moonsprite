import type { SpriteDocument } from '@shared/types-document'
import { DialogHeader } from './DialogHeader'
import { ModalShell } from './ModalShell'
import { PixelUtilityIcon, type PixelUtilityIconKind } from './PixelUtilityIcon'
import { PixelDrawingTimeIcon } from './PixelDrawingTimeIcon'
import { PixelLayerCountIcon } from './PixelLayerCountIcon'
import { PixelAssetIcon } from './app/editor-tools'
import pencilNormalIcon from '@/assets/tool-icons/tool-pencil-normal.svg'
import { useI18n } from './I18nProvider'

interface ProjectInfoDialogProps {
  document: SpriteDocument
  onClose: () => void
}

const formatDuration = (milliseconds: number): string => {
  const totalSeconds = Math.floor(Math.max(0, milliseconds) / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  return [hours, minutes, seconds].map((part) => String(part).padStart(2, '0')).join(':')
}

const formatDate = (value: string): string => {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleString()
}

const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB']
  let value = bytes
  let unit = units[0]
  for (let index = 0; index < units.length && value >= 1024; index += 1) {
    value /= 1024
    unit = units[index] ?? unit
  }
  return `${value >= 100 ? value.toFixed(0) : value.toFixed(1)} ${unit}`
}

export function ProjectInfoDialog({ document, onClose }: ProjectInfoDialogProps) {
  const { t } = useI18n()
  const statistics = document.statistics ?? { strokeCount: 0, operationCount: 0, drawingTimeMs: 0 }
  const timeline = document.animation
  const timelapseFrames = document.timelapse?.snapshots.length ?? 0
  const timelapseBytes = document.timelapse?.snapshots.reduce((total, snapshot) => total + snapshot.data.byteLength, 0) ?? 0
  const highlights: Array<{ label: string; value: string; suffix?: string; icon: PixelUtilityIconKind | 'pencil' | 'drawingTime' | 'layerCount' }> = [
    { label: t('projectInfo.strokes'), value: statistics.strokeCount.toLocaleString(), icon: 'pencil' },
    { label: t('projectInfo.drawingTime'), value: formatDuration(statistics.drawingTimeMs), icon: 'drawingTime' },
    { label: t('projectInfo.canvas'), value: `${document.width} x ${document.height}`, suffix: 'px', icon: 'image' },
    { label: t('projectInfo.layers'), value: String(document.layers.length), icon: 'layerCount' }
  ]
  const details = [
    [t('projectInfo.name'), document.name],
    [t('projectInfo.colorMode'), t(`colorMode.${document.colorMode}`)],
    [t('projectInfo.groups'), String(document.groups.length)],
    [t('projectInfo.operations'), statistics.operationCount.toLocaleString()],
    [t('projectInfo.drawingTime'), formatDuration(statistics.drawingTimeMs)],
    [t('projectInfo.createdAt'), formatDate(document.createdAt)],
    [t('projectInfo.updatedAt'), formatDate(document.updatedAt)],
    [t('projectInfo.timelapseFrames'), timelapseFrames.toLocaleString()],
    [t('projectInfo.timelapseStorage'), formatBytes(timelapseBytes)]
  ]

  return <div className="modal-backdrop" role="presentation" onPointerDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <ModalShell storageKey="project-info" defaultWidth={430} defaultHeight={520} fitContentKey={`${document.id}:${document.layers.length}:${timeline?.frames.length ?? 1}`} minWidth={360} minHeight={360} className="project-info-modal" role="dialog" aria-modal="true" aria-labelledby="project-info-title">
      <DialogHeader title={t('projectInfo.title')} titleId="project-info-title" closeLabel={t('common.close')} onClose={onClose} />
      <div className="project-info-content component-scrollbar">
        <section className="project-info-highlights" aria-label={t('projectInfo.title')}>
          {highlights.map(({ label, value, suffix, icon }) => <div key={label} className="project-info-highlight">{icon === 'pencil' ? <PixelAssetIcon src={pencilNormalIcon} className="project-info-pencil-icon" /> : icon === 'drawingTime' ? <PixelDrawingTimeIcon /> : icon === 'layerCount' ? <PixelLayerCountIcon /> : <PixelUtilityIcon kind={icon} scale={2} />}<span>{label}</span><strong>{value}{suffix && <small>{suffix}</small>}</strong></div>)}
        </section>
        <dl className="project-info-details">{details.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
      </div>
      <footer><button className="primary-button" onClick={onClose}>{t('common.done')}</button></footer>
    </ModalShell>
  </div>
}
