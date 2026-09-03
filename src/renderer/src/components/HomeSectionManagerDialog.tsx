import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import type { HomeSectionDefinition } from '@/core/home-sections'
import { reorderHomeSections } from '@/core/home-sections'
import { HOME_FILE_DISPLAY_FORMATS, type HomeFileDisplayFormat } from '@/core/home-file-display'
import { DialogHeader } from './DialogHeader'
import { ModalShell } from './ModalShell'
import { PixelCheckbox } from './PixelCheckbox'
import { PixelUtilityIcon, type PixelUtilityIconKind } from './PixelUtilityIcon'
import { useI18n } from './I18nProvider'

interface HomeSectionManagerDialogProps {
  activeSectionId: string
  fileDisplayFormats: HomeFileDisplayFormat[]
  sections: HomeSectionDefinition[]
  onAddFolder(): void | Promise<void>
  onChange(sections: HomeSectionDefinition[]): void
  onClose(): void
  onFileDisplayFormatsChange(formats: HomeFileDisplayFormat[]): void
  onRemove(sectionId: string): void
  onSelect(sectionId: string): void
}

interface SectionPointerDrag {
  id: string
  pointerId: number
  captureTarget: HTMLElement
}

const sectionIcon = (section: HomeSectionDefinition): PixelUtilityIconKind => {
  if (section.kind === 'recovery') return 'restore'
  if (section.kind === 'folder') return 'folder'
  return 'image'
}

export function HomeSectionManagerDialog({ activeSectionId, fileDisplayFormats, sections, onAddFolder, onChange, onClose, onFileDisplayFormatsChange, onRemove, onSelect }: HomeSectionManagerDialogProps) {
  const { t } = useI18n()
  const [draggedSectionId, setDraggedSectionId] = useState('')
  const dragRef = useRef<SectionPointerDrag | null>(null)
  const sectionsRef = useRef(sections)
  const onChangeRef = useRef(onChange)
  sectionsRef.current = sections
  onChangeRef.current = onChange

  const sectionName = (section: HomeSectionDefinition): string => {
    if (section.kind === 'recent') return t('home.section.recent')
    if (section.kind === 'gallery') return t('home.section.galleryTab')
    if (section.kind === 'recovery') return t('home.section.recovery')
    return section.name
  }

  const formatLabel = (format: HomeFileDisplayFormat): string => {
    if (format === 'project') return t('home.fileDisplayFormatProject')
    if (format === 'jpg') return 'JPG / JPEG'
    return format.toUpperCase()
  }

  const toggleFileDisplayFormat = (format: HomeFileDisplayFormat, checked: boolean): void => {
    const selected = new Set(fileDisplayFormats)
    if (checked) selected.add(format)
    else selected.delete(format)
    onFileDisplayFormatsChange(HOME_FILE_DISPLAY_FORMATS.filter((candidate) => selected.has(candidate)))
  }

  const beginDrag = (event: ReactPointerEvent<HTMLButtonElement>, sectionId: string): void => {
    if (event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = { id: sectionId, pointerId: event.pointerId, captureTarget: event.currentTarget }
    setDraggedSectionId(sectionId)
  }

  useEffect(() => {
    const move = (event: PointerEvent): void => {
      const drag = dragRef.current
      if (!drag || drag.pointerId !== event.pointerId) return
      const row = (typeof document.elementsFromPoint === 'function' ? document.elementsFromPoint(event.clientX, event.clientY) : [])
        .map((element) => element.closest<HTMLElement>('[data-home-section-row]'))
        .find((element): element is HTMLElement => Boolean(element))
        ?? (event.target instanceof Element ? event.target.closest<HTMLElement>('[data-home-section-row]') : null)
      const targetId = row?.dataset.homeSectionId
      if (!row || !targetId || targetId === drag.id) return
      const bounds = row.getBoundingClientRect()
      const next = reorderHomeSections(sectionsRef.current, drag.id, targetId, event.clientY >= bounds.top + bounds.height / 2)
      if (next.every((section, index) => section.id === sectionsRef.current[index]?.id)) return
      sectionsRef.current = next
      onChangeRef.current(next)
      event.preventDefault()
    }
    const end = (event: PointerEvent): void => {
      const drag = dragRef.current
      if (!drag || drag.pointerId !== event.pointerId) return
      if (drag.captureTarget.hasPointerCapture(event.pointerId)) drag.captureTarget.releasePointerCapture(event.pointerId)
      dragRef.current = null
      setDraggedSectionId('')
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', end)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', end)
      window.removeEventListener('pointercancel', end)
    }
  }, [])

  return <div className="modal-backdrop" role="presentation" onPointerDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <ModalShell storageKey="home-section-manager-v1" defaultWidth={520} defaultHeight={500} minWidth={420} minHeight={380} maxWidth={680} maxHeight={760} className="home-section-manager-modal" role="dialog" aria-modal="true" aria-labelledby="home-section-manager-title">
      <DialogHeader title={t('home.sectionManagerTitle')} titleId="home-section-manager-title" closeLabel={t('common.close')} onClose={onClose} />
      <div className="home-section-manager-body">
        <div className="home-section-manager-list component-scrollbar" role="list" aria-label={t('home.sectionManagerListAria')}>
          {sections.map((section) => {
            const name = sectionName(section)
            const custom = section.kind === 'folder'
            return <div key={section.id} className={`home-section-manager-row reorderable-list-row ${section.id === activeSectionId ? 'selected' : ''} ${draggedSectionId === section.id ? 'dragging' : ''}`} data-home-section-row data-home-section-id={section.id} role="listitem">
              <button type="button" className="home-section-drag-handle reorderable-list-handle" onPointerDown={(event) => beginDrag(event, section.id)} aria-label={t('home.reorderAria', { name })} title={t('home.reorderHint')}><PixelUtilityIcon kind="move" /></button>
              <button type="button" className="home-section-manager-select" onClick={() => onSelect(section.id)} title={custom ? section.directoryPath : name}>
                <span className="home-section-manager-icon"><PixelUtilityIcon kind={sectionIcon(section)} /></span>
                <span className="home-section-manager-copy"><strong>{name}</strong><small>{custom ? section.directoryPath : t('home.builtInSection')}</small></span>
              </button>
              {custom
                ? <button type="button" className="home-section-manager-remove recent-file-delete" aria-label={t('home.removeFolderSection', { name })} title={t('home.removeFolderSection', { name })} onClick={() => onRemove(section.id)}><PixelUtilityIcon kind="delete" /></button>
                : <span className="home-section-manager-fixed" aria-hidden="true"><PixelUtilityIcon kind="lock" /></span>}
            </div>
          })}
        </div>
        <section className="home-file-format-settings" aria-labelledby="home-file-format-settings-title">
          <div className="home-file-format-heading">
            <strong id="home-file-format-settings-title">{t('home.fileDisplayFormats')}</strong>
            <small>{t('home.fileDisplayFormatsDetail')}</small>
          </div>
          <div className="home-file-format-options" role="group" aria-label={t('home.fileDisplayFormats')}>
            {HOME_FILE_DISPLAY_FORMATS.map((format) => {
              const label = formatLabel(format)
              return <label key={format} className="home-file-format-option">
                <PixelCheckbox checked={fileDisplayFormats.includes(format)} onChange={(event) => toggleFileDisplayFormat(format, event.target.checked)} aria-label={label} />
                <span>{label}</span>
              </label>
            })}
          </div>
        </section>
      </div>
      <footer className="home-section-manager-footer">
        <button type="button" className="quiet-button" onClick={onClose}>{t('common.done')}</button>
        <button type="button" className="primary-button home-section-manager-add" onClick={() => { void onAddFolder() }}><PixelUtilityIcon kind="newFolder" />{t('home.addFolderSection')}</button>
      </footer>
    </ModalShell>
  </div>
}
