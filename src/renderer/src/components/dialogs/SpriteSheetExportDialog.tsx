import { chooseExportLocation } from '@/platform/export-location'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { DocumentSession } from '@/store/workspace'
import type { SpriteSheetConstraint, SpriteSheetExportOptions, SpriteSheetFrameScope, SpriteSheetLayerScope, SpriteSheetLayout } from '@/core/sprite-sheet'
import { resolveSpriteSheetArea, resolveSpriteSheetLayerIds } from '@/core/sprite-sheet'
import { CheckboxField } from '@/components/CheckboxField'
import { DialogHeader } from '@/components/DialogHeader'
import { FormField } from '@/components/FormField'
import { LivePreviewToggle } from '@/components/LivePreviewToggle'
import { ModalShell } from '@/components/ModalShell'
import { NumberInput } from '@/components/NumberInput'
import { PixelUtilityIcon } from '@/components/PixelUtilityIcon'
import { SegmentedControl } from '@/components/SegmentedControl'
import { SettingsSection } from '@/components/SettingsSection'
import { TextInput } from '@/components/TextInput'
import { ThemedSelect } from '@/components/ThemedSelect'
import { useI18n } from '@/components/I18nProvider'
import { FileLocationPicker } from '@/components/FileLocationPicker'

interface SpriteSheetExportDialogProps {
  defaultDirectory: string
  localGalleryDirectory?: string
  projectRootDirectory?: string
  onClose: () => void
  onClosePreview: (documentIds: readonly string[], preferredActiveId: string) => void
  onExport: (options: SpriteSheetExportOptions) => Promise<boolean>
  onPreview: (sourceDocumentId: string, options: SpriteSheetExportOptions, previousPreviewDocumentIds: readonly string[]) => Promise<string[] | null>
  session: DocumentSession
}

type SpriteSheetSettingsPage = 'layout' | 'sprite' | 'output'

const constraintForLayout = (layout: SpriteSheetLayout, constraint: SpriteSheetConstraint): SpriteSheetConstraint => {
  if (layout === 'rows') {
    if (constraint === 'fixed-rows') return 'fixed-columns'
    if (constraint === 'fixed-height') return 'fixed-width'
    return constraint === 'fixed-columns' || constraint === 'fixed-width' ? constraint : 'none'
  }
  if (layout === 'columns') {
    if (constraint === 'fixed-columns') return 'fixed-rows'
    if (constraint === 'fixed-width') return 'fixed-height'
    return constraint === 'fixed-rows' || constraint === 'fixed-height' ? constraint : 'none'
  }
  return 'none'
}

export function SpriteSheetExportDialog({ defaultDirectory, localGalleryDirectory = defaultDirectory, projectRootDirectory = '', onClose, onClosePreview, onExport, onPreview, session }: SpriteSheetExportDialogProps) {
  const { t } = useI18n()
  const document = session.document
  const [busy, setBusy] = useState(false)
  const [pathMenuOpen, setPathMenuOpen] = useState(false)
  const [page, setPage] = useState<SpriteSheetSettingsPage>('layout')
  const [previewEnabled, setPreviewEnabled] = useState(false)
  const previewEnabledRef = useRef(false)
  const previewDocumentIdsRef = useRef<string[]>([])
  const previewGenerationRef = useRef(0)
  const [options, setOptions] = useState<SpriteSheetExportOptions>(() => ({
    layout: 'rows',
    constraint: 'none',
    fixedColumns: 4,
    fixedWidth: Math.max(document.width, document.width * 4),
    fixedRows: 4,
    fixedHeight: Math.max(document.height, document.height * 4),
    mergeDuplicates: false,
    ignoreEmpty: false,
    area: 'canvas',
    layerScope: 'visible',
    splitLayers: false,
    frameScope: 'all',
    splitLoopSections: false,
    openAfterExport: false,
    outputFile: false,
    name: t('spriteSheet.output.defaultName', { name: document.name }),
    directory: defaultDirectory
  }))
  const previewOptions = useMemo<SpriteSheetExportOptions>(() => ({
    layout: options.layout,
    constraint: options.constraint,
    fixedColumns: options.fixedColumns,
    fixedWidth: options.fixedWidth,
    fixedRows: options.fixedRows,
    fixedHeight: options.fixedHeight,
    mergeDuplicates: options.mergeDuplicates,
    ignoreEmpty: options.ignoreEmpty,
    area: options.area,
    layerScope: options.layerScope,
    splitLayers: options.splitLayers,
    frameScope: options.frameScope,
    splitLoopSections: options.splitLoopSections,
    openAfterExport: false,
    outputFile: false,
    name: '',
    directory: ''
  }), [options.area, options.constraint, options.fixedColumns, options.fixedHeight, options.fixedRows, options.fixedWidth, options.frameScope, options.ignoreEmpty, options.layerScope, options.layout, options.mergeDuplicates, options.splitLayers, options.splitLoopSections])
  const update = <K extends keyof SpriteSheetExportOptions>(key: K, value: SpriteSheetExportOptions[K]): void => {
    setOptions((current) => ({ ...current, [key]: value }))
  }
  useEffect(() => {
    if (options.area === 'selection' && !session.selection) update('area', 'canvas')
  }, [options.area, session.selection])
  const loopSections = document.animation?.loopSections ?? []
  const gridLayout = options.layout === 'rows' || options.layout === 'columns'
  const selectedArea = useMemo(() => resolveSpriteSheetArea(document, options.area, session.selection), [document, options.area, session.selection])
  const layerCount = useMemo(() => resolveSpriteSheetLayerIds(document, options.layerScope, {
    selectedLayerIds: session.selectedLayerIds,
    selectedGroupIds: session.selectedGroupIds
  }).length, [document, options.layerScope, session.selectedGroupIds, session.selectedLayerIds])
  const layoutOptions = [
    { value: 'horizontal' as const, label: t('spriteSheet.layout.horizontal') },
    { value: 'vertical' as const, label: t('spriteSheet.layout.vertical') },
    { value: 'rows' as const, label: t('spriteSheet.layout.rows') },
    { value: 'columns' as const, label: t('spriteSheet.layout.columns') }
  ]
  const areaOptions = [
    { value: 'canvas' as const, label: t('spriteSheet.area.canvas') },
    { value: 'selection' as const, label: t('spriteSheet.area.selection') },
    ...(document.slices ?? []).map((slice) => ({ value: `slice:${slice.id}` as const, label: slice.name }))
  ]
  const layerOptions = [
    { value: 'visible' as const, label: t('spriteSheet.layers.visible') },
    { value: 'all' as const, label: t('spriteSheet.layers.all') },
    { value: 'selected' as const, label: t('spriteSheet.layers.selected') }
  ]
  const frameOptions = [
    { value: 'all' as const, label: t('spriteSheet.frames.all') },
    { value: 'selected' as const, label: t('spriteSheet.frames.selected') },
    ...loopSections.map((section) => ({ value: `loop:${section.id}` as const, label: section.name }))
  ]
  const pageOptions = [
    { value: 'layout' as const, label: t('spriteSheet.section.layout') },
    { value: 'sprite' as const, label: t('spriteSheet.section.sprite') },
    { value: 'output' as const, label: t('spriteSheet.section.output') }
  ]
  const constraintOptions = options.layout === 'columns'
    ? [
        { value: 'none' as const, label: t('spriteSheet.constraint.none') },
        { value: 'fixed-rows' as const, label: t('spriteSheet.constraint.fixedRows') },
        { value: 'fixed-height' as const, label: t('spriteSheet.constraint.fixedHeight') }
      ]
    : [
        { value: 'none' as const, label: t('spriteSheet.constraint.none') },
        { value: 'fixed-columns' as const, label: t('spriteSheet.constraint.fixedColumns') },
        { value: 'fixed-width' as const, label: t('spriteSheet.constraint.fixedWidth') }
      ]
  const chooseDirectory = async (directory: string): Promise<void> => {
    const result = await chooseExportLocation(window.moonSprite, directory || defaultDirectory, options.name, 'png')
    if (result) setOptions(current => ({ ...current, ...result }))
  }
  const submit = async (): Promise<void> => {
    if (busy || (options.outputFile && (!options.name.trim() || !options.directory.trim()))) return
    setBusy(true)
    try {
      if (await onExport(options)) closeDialog()
    } finally {
      setBusy(false)
    }
  }
  const closePreviewDocuments = (preferredActiveId = session.document.id): void => {
    const documentIds = previewDocumentIdsRef.current
    previewDocumentIdsRef.current = []
    if (documentIds.length > 0) onClosePreview(documentIds, preferredActiveId)
  }
  const togglePreview = (checked: boolean): void => {
    previewEnabledRef.current = checked
    setPreviewEnabled(checked)
    if (checked) return
    previewGenerationRef.current += 1
    closePreviewDocuments()
  }
  const closeDialog = (): void => {
    previewEnabledRef.current = false
    previewGenerationRef.current += 1
    closePreviewDocuments()
    onClose()
  }

  useEffect(() => {
    if (!previewEnabled) return
    const generation = ++previewGenerationRef.current
    const timeout = window.setTimeout(() => {
      const previousPreviewDocumentIds = [...previewDocumentIdsRef.current]
      void onPreview(session.document.id, previewOptions, previousPreviewDocumentIds).then((documentIds) => {
        if (!documentIds) {
          if (generation !== previewGenerationRef.current || !previewEnabledRef.current) return
          previewEnabledRef.current = false
          setPreviewEnabled(false)
          closePreviewDocuments()
          return
        }
        if (generation !== previewGenerationRef.current || !previewEnabledRef.current) {
          onClosePreview(documentIds, previewDocumentIdsRef.current.at(-1) ?? session.document.id)
          return
        }
        previewDocumentIdsRef.current = documentIds
      })
    }, 80)
    return () => window.clearTimeout(timeout)
  }, [onClosePreview, onPreview, previewEnabled, previewOptions, session.document.id])

  useEffect(() => () => {
    previewEnabledRef.current = false
    previewGenerationRef.current += 1
    const documentIds = previewDocumentIdsRef.current
    previewDocumentIdsRef.current = []
    if (documentIds.length > 0) onClosePreview(documentIds, session.document.id)
  }, [onClosePreview, session.document.id])

  return <div className="modal-backdrop" role="presentation" onPointerDown={(event) => { if (event.target === event.currentTarget && !busy) closeDialog() }}>
    <ModalShell as="form" storageKey="sprite-sheet-export-v1" fitContentKey={`${page}:${options.constraint}:${options.outputFile}`} defaultWidth={560} defaultHeight={470} minWidth={440} minHeight={370} maxWidth={700} maxHeight={680} className="sprite-sheet-export-modal" aria-labelledby="sprite-sheet-export-title" onSubmit={(event) => { event.preventDefault(); void submit() }}>
      <DialogHeader eyebrow="SPRITE SHEET" title={t('spriteSheet.title')} titleId="sprite-sheet-export-title" closeLabel={t('common.close')} closeDisabled={busy} onClose={closeDialog} />
      <div className="modal-body component-scrollbar sprite-sheet-export-body">
        <SegmentedControl<SpriteSheetSettingsPage> className="sprite-sheet-page-control" label={t('spriteSheet.title')} options={pageOptions} value={page} onChange={setPage} />

        {page === 'layout' && <SettingsSection title={t('spriteSheet.section.layout')}>
          <div className="settings-section-body">
            <FormField label={t('spriteSheet.layout.type')}>
              <SegmentedControl<SpriteSheetLayout> className="sprite-sheet-layout-control" label={t('spriteSheet.layout.type')} options={layoutOptions} value={options.layout} onChange={(layout) => setOptions((current) => ({ ...current, layout, constraint: constraintForLayout(layout, current.constraint) }))} />
            </FormField>
            <div className="sprite-sheet-constraint-row">
              <FormField label={t('spriteSheet.constraint.label')}>
                <ThemedSelect<SpriteSheetConstraint> disabled={!gridLayout} label={t('spriteSheet.constraint.label')} value={options.constraint} groups={[{ label: t('spriteSheet.constraint.group'), options: constraintOptions }]} onChange={(constraint) => update('constraint', constraint)} />
              </FormField>
              {options.constraint === 'fixed-columns' && <FormField label={t('spriteSheet.constraint.columns')}><NumberInput min={1} max={16384} value={options.fixedColumns} onValueChange={(value) => update('fixedColumns', Math.round(value))} /></FormField>}
              {options.constraint === 'fixed-rows' && <FormField label={t('spriteSheet.constraint.rows')}><NumberInput min={1} max={16384} value={options.fixedRows} onValueChange={(value) => update('fixedRows', Math.round(value))} /></FormField>}
              {options.constraint === 'fixed-width' && <FormField label={t('spriteSheet.constraint.width')}><NumberInput min={selectedArea.width} max={262144} suffix="px" value={options.fixedWidth} onValueChange={(value) => update('fixedWidth', Math.max(selectedArea.width, Math.round(value)))} /></FormField>}
              {options.constraint === 'fixed-height' && <FormField label={t('spriteSheet.constraint.height')}><NumberInput min={selectedArea.height} max={262144} suffix="px" value={options.fixedHeight} onValueChange={(value) => update('fixedHeight', Math.max(selectedArea.height, Math.round(value)))} /></FormField>}
            </div>
            <div className="sprite-sheet-check-row">
              <CheckboxField checked={options.mergeDuplicates} label={t('spriteSheet.mergeDuplicates')} tooltip={t('spriteSheet.mergeDuplicatesHint')} onChange={(checked) => update('mergeDuplicates', checked)} />
              <CheckboxField checked={options.ignoreEmpty} label={t('spriteSheet.ignoreEmpty')} tooltip={t('spriteSheet.ignoreEmptyHint')} onChange={(checked) => update('ignoreEmpty', checked)} />
            </div>
          </div>
        </SettingsSection>}

        {page === 'sprite' && <SettingsSection title={t('spriteSheet.section.sprite')}>
          <div className="settings-section-body sprite-sheet-source-fields">
            <FormField layout="inline" label={t('spriteSheet.area.label')}><ThemedSelect label={t('spriteSheet.area.label')} value={options.area} groups={[{ label: t('spriteSheet.area.group'), options: areaOptions }]} onChange={(area) => update('area', area)} /></FormField>
            <div className="sprite-sheet-source-row">
              <FormField label={t('spriteSheet.layers.label')}><ThemedSelect<SpriteSheetLayerScope> label={t('spriteSheet.layers.label')} value={options.layerScope} groups={[{ label: t('spriteSheet.layers.group'), options: layerOptions }]} onChange={(layerScope) => update('layerScope', layerScope)} /></FormField>
              <CheckboxField controlPosition="end" checked={options.splitLayers} disabled={layerCount < 2} label={t('spriteSheet.layers.split')} tooltip={t('spriteSheet.layers.splitHint')} onChange={(checked) => update('splitLayers', checked)} />
            </div>
            <div className="sprite-sheet-source-row">
              <FormField label={t('spriteSheet.frames.label')}><ThemedSelect<SpriteSheetFrameScope> disabled={options.splitLoopSections} label={t('spriteSheet.frames.label')} value={options.frameScope} groups={[{ label: t('spriteSheet.frames.group'), options: frameOptions }]} onChange={(frameScope) => update('frameScope', frameScope)} /></FormField>
              <CheckboxField controlPosition="end" checked={options.splitLoopSections} disabled={loopSections.length === 0} label={t('spriteSheet.frames.splitLoops')} tooltip={t('spriteSheet.frames.splitLoopsHint')} onChange={(checked) => update('splitLoopSections', checked)} />
            </div>
          </div>
        </SettingsSection>}

        {page === 'output' && <SettingsSection title={t('spriteSheet.section.output')} actions={<CheckboxField controlPosition="end" checked={options.outputFile} label={t('spriteSheet.output.file')} onChange={(checked) => update('outputFile', checked)} />}>
          {options.outputFile && <div className="settings-section-body sprite-sheet-output-fields">
            <CheckboxField checked={options.openAfterExport === true} label={t('spriteSheet.output.openAfterExport')} onChange={(checked) => update('openAfterExport', checked)} />
            <FormField className="export-file-field" label={t('spriteSheet.output.name')} hint={<span className="export-selected-directory" title={options.directory}>{t('spriteSheet.output.selectedDirectory', { path: options.directory })}</span>}>
              <div className="export-file-control">
                <TextInput autoFocus aria-label={t('spriteSheet.output.name')} value={options.name} maxLength={160} onChange={(event) => update('name', event.target.value)} />
                <FileLocationPicker directory={options.directory || defaultDirectory} defaultDirectory={defaultDirectory} localGalleryDirectory={localGalleryDirectory} projectRootDirectory={projectRootDirectory} open={pathMenuOpen} onOpenChange={setPathMenuOpen} onChooseDirectory={chooseDirectory} onSelectDirectory={(directory) => update('directory', directory)} disabled={busy} />
              </div>
            </FormField>
          </div>}
        </SettingsSection>}
      </div>
      <footer><LivePreviewToggle checked={previewEnabled} label={t('spriteSheet.preview')} onChange={togglePreview} /><span className="modal-footer-spacer" /><button type="button" className="quiet-button" disabled={busy} onClick={closeDialog}>{t('common.cancel')}</button><button type="submit" className="primary-button" disabled={busy || (options.outputFile && (!options.name.trim() || !options.directory.trim()))}><PixelUtilityIcon kind="export" />{t(options.outputFile ? 'spriteSheet.action.export' : 'spriteSheet.action.create')}</button></footer>
    </ModalShell>
  </div>
}
