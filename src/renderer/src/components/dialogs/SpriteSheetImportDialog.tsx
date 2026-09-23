import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { DocumentSession } from '@/store/workspace'
import { useWorkspace } from '@/store/workspace'
import { DEFAULT_SPRITE_SHEET_IMPORT, spriteSheetImportPlan, spriteSheetFrameSizeFromCount, type SpriteSheetImportOptions, type SpriteSheetImportLayout } from '@/core/sprite-sheet-import'
import { useI18n } from '../I18nProvider'
import { ModalShell } from '../ModalShell'
import { DialogHeader } from '../DialogHeader'
import { FormField } from '../FormField'
import { NumberInput } from '../NumberInput'
import { ThemedSelect } from '../ThemedSelect'
import { CheckboxField } from '../CheckboxField'
import { Button } from '../Button'
import { SpriteSheetImportPreview } from './SpriteSheetImportPreview'
import './sprite-sheet-import.css'

const remembered = new WeakMap<object, SpriteSheetImportOptions>()
interface Props { session: DocumentSession | null; onChoose(): Promise<void>; onClose(): void }
export function SpriteSheetImportDialog({ session, onChoose, onClose }: Props) {
  const { t } = useI18n()
  const busyRef = useRef(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [options, setOptions] = useState<SpriteSheetImportOptions>(() => {
    if (!session) return DEFAULT_SPRITE_SHEET_IMPORT
    const saved = remembered.get(session.document)
    const rect = session.selection ?? session.view.grid
    return saved ?? { ...DEFAULT_SPRITE_SHEET_IMPORT, x: rect?.x ?? 0, y: rect?.y ?? 0, width: rect?.width ?? 16, height: rect?.height ?? 16 }
  })
  const [padding, setPadding] = useState(options.paddingX !== 0 || options.paddingY !== 0)
  const effective = useMemo(() => ({ ...options, paddingX: padding ? options.paddingX : 0, paddingY: padding ? options.paddingY : 0 }), [options, padding])
  const plan = useMemo(() => {
    try { return { value: session ? spriteSheetImportPlan(session.document, effective) : null, error: '' } }
    catch (cause) { return { value: null, error: cause instanceof Error ? cause.message : String(cause) } }
  }, [session?.document.width, session?.document.height, effective])
  const update = <K extends keyof SpriteSheetImportOptions>(key: K, value: SpriteSheetImportOptions[K]) => { setError(''); setOptions(current => ({ ...current, [key]: value })) }
  const number = (key: 'x' | 'y' | 'width' | 'height' | 'paddingX' | 'paddingY', min: number) => <FormField label={t(`spriteSheetImport.${key}`)}><NumberInput aria-label={t(`spriteSheetImport.${key}`)} value={options[key]} min={min} max={262144} disabled={busy} onValueChange={value => update(key, Math.round(value))} suffix="px" /></FormField>
  const close = () => { if (!busyRef.current) onClose() }
  useEffect(() => {
    const listener = () => { if (!busyRef.current) onClose() }
    window.addEventListener('moonsprite:close-sprite-sheet-import', listener)
    return () => window.removeEventListener('moonsprite:close-sprite-sheet-import', listener)
  }, [onClose])
  const submit = async () => {
    if (busyRef.current || !session || !plan.value?.count) return
    busyRef.current = true; setBusy(true); setError('')
    try {
      const ok = await useWorkspace.getState().importSpriteSheet(session.document.id, effective)
      if (ok) { remembered.set(session.document, effective); onClose() }
      else setError(useWorkspace.getState().message ?? t('spriteSheetImport.invalid'))
    } finally { busyRef.current = false; setBusy(false) }
  }
  return createPortal(<div className="modal-backdrop sprite-sheet-import-backdrop" role="presentation">
    <ModalShell as="form" role="dialog" aria-modal="true" aria-label={t('spriteSheetImport.title')} className="layer-modal sprite-sheet-import-dialog" storageKey="sprite-sheet-import" defaultWidth={1080} defaultHeight={740} minWidth={640} minHeight={500} maxWidth={1800} maxHeight={1200} fitContent={false} onSubmit={event => { event.preventDefault(); void submit() }} onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); close() } }}>
      <DialogHeader title={t('spriteSheetImport.title')} closeLabel={t('common.close')} closeDisabled={busy} onClose={close} />
      <div className="sprite-sheet-import-body">
        <div className="sprite-sheet-import-settings component-scrollbar">
          <Button disabled={busy} onClick={() => { if (busyRef.current) return; busyRef.current = true; setBusy(true); void onChoose().finally(() => { busyRef.current = false; setBusy(false) }) }}>{t('spriteSheetImport.choose')}</Button>
          <p className="modal-note">{session?.document.name ?? t('spriteSheetImport.noSource')}</p>
          <FormField label={t('spriteSheetImport.layout')}><ThemedSelect<SpriteSheetImportLayout> label={t('spriteSheetImport.layout')} disabled={busy} value={options.layout} groups={[{ label: t('spriteSheetImport.layout'), options: (['horizontal', 'vertical', 'rows', 'columns'] as const).map(value => ({ value, label: t(`spriteSheet.layout.${value}`) })) }]} onChange={value => update('layout', value)} /></FormField>
          <div className="sprite-sheet-import-fields">{number('x', -262144)}{number('y', -262144)}{number('width', 1)}{number('height', 1)}
            {(['columns', 'rows'] as const).map(axis => <FormField key={axis} label={t(`spriteSheetImport.${axis}`)}><NumberInput aria-label={t(`spriteSheetImport.${axis}`)} value={plan.value?.[axis] ?? 0} min={1} max={10000} disabled={busy || !session || (axis === 'columns' ? options.layout === 'vertical' : options.layout === 'horizontal')} onValueChange={count => {
              if (!session) return
              const horizontal = axis === 'columns'
              update(horizontal ? 'width' : 'height', spriteSheetFrameSizeFromCount(horizontal ? session.document.width : session.document.height, horizontal ? options.x : options.y, horizontal ? effective.paddingX : effective.paddingY, Math.round(count)))
            }} /></FormField>)}
          </div>
          <CheckboxField label={t('spriteSheetImport.padding')} checked={padding} disabled={busy} onChange={setPadding} />
          {padding && <div className="sprite-sheet-import-fields">{number('paddingX', 0)}{number('paddingY', 0)}</div>}
          <CheckboxField label={t('spriteSheetImport.partialTiles')} checked={options.partialTiles} disabled={busy} onChange={value => update('partialTiles', value)} />
          <p className="modal-note">{t('spriteSheetImport.hint')}</p>
        </div>
        {session ? <SpriteSheetImportPreview source={session.document} revision={session.contentRevision} options={effective} disabled={busy} onChange={next => { setOptions(next); setError('') }} /> : <div className="sprite-sheet-import-empty">{t('spriteSheetImport.noSource')}</div>}
      </div>
      {(error || plan.error) && <p role="alert" className="modal-note">{error || plan.error}</p>}
      <footer><output>{t('spriteSheetImport.count', { count: plan.value?.count ?? 0 })}</output><span className="modal-footer-spacer" /><Button disabled={busy} onClick={close}>{t('common.cancel')}</Button><Button type="submit" variant="primary" disabled={busy || !plan.value?.count}>{t('spriteSheetImport.import')}</Button></footer>
    </ModalShell>
  </div>, document.body)
}
