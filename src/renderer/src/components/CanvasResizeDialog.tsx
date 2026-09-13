import { useEffect, useRef, useState } from 'react'
import type { CanvasAnchor } from '@shared/types'
import type { CanvasResizePreview } from '@/store/workspace'
import { DialogHeader } from './DialogHeader'
import { ModalShell } from './ModalShell'
import { NumberInput } from './NumberInput'
import { useI18n } from './I18nProvider'
import { PixelUtilityIcon, type PixelUtilityIconKind } from './PixelUtilityIcon'
import { CheckboxField } from './CheckboxField'
import { FormField } from './FormField'
import type { TranslationKey } from '@/core/localization'
import { registerCanvasResizePreviewHistory } from '@/core/canvas-resize-preview'

const anchors: Array<{ id: CanvasAnchor; labelKey: TranslationKey; icon: PixelUtilityIconKind }> = [
  { id: 'nw', labelKey: 'canvasResize.anchor.nw', icon: 'canvasTopLeft' }, { id: 'n', labelKey: 'canvasResize.anchor.n', icon: 'canvasTop' }, { id: 'ne', labelKey: 'canvasResize.anchor.ne', icon: 'canvasTopRight' },
  { id: 'w', labelKey: 'canvasResize.anchor.w', icon: 'canvasLeft' }, { id: 'center', labelKey: 'canvasResize.anchor.center', icon: 'canvasAnchorCenter' }, { id: 'e', labelKey: 'canvasResize.anchor.e', icon: 'canvasRight' },
  { id: 'sw', labelKey: 'canvasResize.anchor.sw', icon: 'canvasBottomLeft' }, { id: 's', labelKey: 'canvasResize.anchor.s', icon: 'canvasBottom' }, { id: 'se', labelKey: 'canvasResize.anchor.se', icon: 'canvasBottomRight' }
]

type Edge = 'left' | 'right' | 'top' | 'bottom'

export function CanvasResizeDialog({ open, documentId, currentWidth, currentHeight, onClose, onResize, onPreview, preview }: { open: boolean; documentId: string; currentWidth: number; currentHeight: number; onClose: () => void; onResize: (width: number, height: number, anchor: CanvasAnchor, offsetX?: number, offsetY?: number, trimOutside?: boolean) => Promise<void>; onPreview: (preview: CanvasResizePreview | null) => void; preview: CanvasResizePreview | null }) {
  const { t } = useI18n()
  const [anchor, setAnchor] = useState<CanvasAnchor>('center')
  const [aspectRatioLocked, setAspectRatioLocked] = useState(true)
  const [syncEdges, setSyncEdges] = useState(false)
  const [trimOutside, setTrimOutside] = useState(true)
  const [value, setValue] = useState<CanvasResizePreview>({ width: currentWidth, height: currentHeight, offsetX: 0, offsetY: 0 })
  const onPreviewRef = useRef(onPreview)
  const valueRef = useRef(value)
  const pendingPreviewRef = useRef<CanvasResizePreview | null>(null)
  const previewFrameRef = useRef<number | null>(null)
  const undoStackRef = useRef<CanvasResizePreview[]>([])
  const redoStackRef = useRef<CanvasResizePreview[]>([])
  const historyGroupRef = useRef<string | null>(null)
  const externalHistoryTimerRef = useRef<number | null>(null)
  const restorePreviewRef = useRef<(direction: 'undo' | 'redo') => void>(() => {})
  onPreviewRef.current = onPreview
  valueRef.current = value

  const flushPreview = (): void => {
    if (previewFrameRef.current !== null) {
      window.cancelAnimationFrame(previewFrameRef.current)
      previewFrameRef.current = null
    }
    const pending = pendingPreviewRef.current
    pendingPreviewRef.current = null
    if (pending) onPreviewRef.current(pending)
  }

  const queuePreview = (next: CanvasResizePreview): void => {
    setValue(next)
    valueRef.current = next
    pendingPreviewRef.current = next
    if (previewFrameRef.current !== null) return
    previewFrameRef.current = window.requestAnimationFrame(() => {
      previewFrameRef.current = null
      const pending = pendingPreviewRef.current
      pendingPreviewRef.current = null
      if (pending) onPreviewRef.current(pending)
    })
  }

  const samePreview = (left: CanvasResizePreview, right: CanvasResizePreview): boolean => left.width === right.width && left.height === right.height && left.offsetX === right.offsetX && left.offsetY === right.offsetY
  const updateValue = (next: CanvasResizePreview, historyGroup: string | null = null): void => {
    const current = valueRef.current
    if (samePreview(current, next)) return
    if (!historyGroup || historyGroupRef.current !== historyGroup) undoStackRef.current.push({ ...current })
    historyGroupRef.current = historyGroup
    redoStackRef.current = []
    queuePreview(next)
  }
  const restorePreview = (direction: 'undo' | 'redo'): void => {
    const source = direction === 'undo' ? undoStackRef.current : redoStackRef.current
    const target = source.pop()
    if (!target) return
    const destination = direction === 'undo' ? redoStackRef.current : undoStackRef.current
    destination.push({ ...valueRef.current })
    historyGroupRef.current = null
    queuePreview({ ...target })
  }
  restorePreviewRef.current = restorePreview
  const finishHistoryGroup = (): void => { historyGroupRef.current = null }

  useEffect(() => {
    if (!open) return
    return registerCanvasResizePreviewHistory(documentId, {
      undo: () => restorePreviewRef.current('undo'),
      redo: () => restorePreviewRef.current('redo')
    })
  }, [documentId, open])

  useEffect(() => {
    if (open) {
      setAnchor('center')
      setAspectRatioLocked(true)
      setSyncEdges(false)
      setTrimOutside(true)
      const initial = { width: currentWidth, height: currentHeight, offsetX: 0, offsetY: 0 }
      setValue(initial)
      valueRef.current = initial
      undoStackRef.current = []
      redoStackRef.current = []
      historyGroupRef.current = null
      onPreviewRef.current(initial)
    } else {
      if (previewFrameRef.current !== null) window.cancelAnimationFrame(previewFrameRef.current)
      previewFrameRef.current = null
      pendingPreviewRef.current = null
      if (externalHistoryTimerRef.current !== null) window.clearTimeout(externalHistoryTimerRef.current)
      externalHistoryTimerRef.current = null
      onPreviewRef.current(null)
    }
    return () => { if (previewFrameRef.current !== null) window.cancelAnimationFrame(previewFrameRef.current); if (externalHistoryTimerRef.current !== null) window.clearTimeout(externalHistoryTimerRef.current) }
  }, [open, currentWidth, currentHeight])

  useEffect(() => {
    if (!open || !preview) return
    if (samePreview(valueRef.current, preview)) return
    updateValue({ ...preview }, 'external-preview')
    if (externalHistoryTimerRef.current !== null) window.clearTimeout(externalHistoryTimerRef.current)
    externalHistoryTimerRef.current = window.setTimeout(() => { externalHistoryTimerRef.current = null; finishHistoryGroup() }, 180)
  }, [open, preview?.width, preview?.height, preview?.offsetX, preview?.offsetY])

  if (!open) return null

  const applyAnchor = (width: number, height: number, nextAnchor: CanvasAnchor): void => {
    const deltaX = width - currentWidth; const deltaY = height - currentHeight
    const offsetX = nextAnchor === 'nw' || nextAnchor === 'w' || nextAnchor === 'sw' ? 0 : nextAnchor === 'ne' || nextAnchor === 'e' || nextAnchor === 'se' ? deltaX : Math.floor(deltaX / 2)
    const offsetY = nextAnchor === 'nw' || nextAnchor === 'n' || nextAnchor === 'ne' ? 0 : nextAnchor === 'sw' || nextAnchor === 's' || nextAnchor === 'se' ? deltaY : Math.floor(deltaY / 2)
    updateValue({ width, height, offsetX, offsetY }, `anchor-${nextAnchor}`)
  }
  const setDimension = (dimension: 'width' | 'height', raw: number): void => {
    const next = Math.max(1, Math.floor(raw) || 1)
    const width = dimension === 'width'
      ? next
      : aspectRatioLocked ? Math.max(1, Math.round(next * currentWidth / currentHeight)) : value.width
    const height = dimension === 'height'
      ? next
      : aspectRatioLocked ? Math.max(1, Math.round(next * currentHeight / currentWidth)) : value.height
    const deltaX = width - currentWidth; const deltaY = height - currentHeight
    const offsetX = anchor === 'nw' || anchor === 'w' || anchor === 'sw' ? 0 : anchor === 'ne' || anchor === 'e' || anchor === 'se' ? deltaX : Math.floor(deltaX / 2)
    const offsetY = anchor === 'nw' || anchor === 'n' || anchor === 'ne' ? 0 : anchor === 'sw' || anchor === 's' || anchor === 'se' ? deltaY : Math.floor(deltaY / 2)
    updateValue({ width, height, offsetX, offsetY }, `dimension-${dimension}`)
  }
  const setEdge = (edge: Edge, raw: number): void => {
    const next = Math.trunc(raw) || 0
    if (syncEdges) {
      const minimum = Math.max(Math.ceil((1 - currentWidth) / 2), Math.ceil((1 - currentHeight) / 2))
      const synced = Math.max(minimum, next)
      updateValue({ width: currentWidth + synced * 2, height: currentHeight + synced * 2, offsetX: synced, offsetY: synced }, 'edge-synced')
      return
    }
    const left = value.offsetX; const top = value.offsetY
    const right = value.width - currentWidth - left; const bottom = value.height - currentHeight - top
    if (edge === 'left') updateValue({ width: Math.max(1, currentWidth + next + right), height: value.height, offsetX: next, offsetY: top }, `edge-${edge}`)
    if (edge === 'right') updateValue({ width: Math.max(1, currentWidth + left + next), height: value.height, offsetX: left, offsetY: top }, `edge-${edge}`)
    if (edge === 'top') updateValue({ width: value.width, height: Math.max(1, currentHeight + next + bottom), offsetX: left, offsetY: next }, `edge-${edge}`)
    if (edge === 'bottom') updateValue({ width: value.width, height: Math.max(1, currentHeight + top + next), offsetX: left, offsetY: top }, `edge-${edge}`)
  }
  const submit = (event: React.FormEvent): void => {
    event.preventDefault()
    flushPreview()
    void onResize(value.width, value.height, anchor, value.offsetX, value.offsetY, trimOutside).then(onClose)
  }
  const left = value.offsetX; const top = value.offsetY
  const right = value.width - currentWidth - left; const bottom = value.height - currentHeight - top

  return <div className="modal-backdrop" role="presentation">
    <ModalShell as="form" storageKey="canvas-resize-v5" placement="right" defaultWidth={340} defaultHeight={500} minWidth={320} minHeight={430} maxWidth={400} maxHeight={720} className="canvas-resize-modal" onSubmit={submit} onKeyDown={(event) => { if (!(event.ctrlKey || event.metaKey) || event.altKey) return; if (event.key.toLowerCase() === 'z') { event.preventDefault(); event.stopPropagation(); restorePreview(event.shiftKey ? 'redo' : 'undo') } else if (event.key.toLowerCase() === 'y') { event.preventDefault(); event.stopPropagation(); restorePreview('redo') } }} aria-label={t('canvasResize.aria')}>
      <DialogHeader eyebrow={t('canvasResize.eyebrow')} title={t('canvasResize.title')} closeLabel={t('common.close')} onClose={onClose} />
      <div className="modal-body canvas-resize-body">
        <section><div className="canvas-resize-section-heading"><h3>{t('canvasResize.size')}</h3><button type="button" className="icon-button" aria-label={t(aspectRatioLocked ? 'imageResize.unlockRatio' : 'imageResize.lockRatio')} aria-pressed={aspectRatioLocked} title={t(aspectRatioLocked ? 'imageResize.unlockRatio' : 'imageResize.lockRatio')} onClick={() => { finishHistoryGroup(); setAspectRatioLocked((locked) => !locked) }}>{aspectRatioLocked ? <PixelUtilityIcon kind="lock" /> : <PixelUtilityIcon kind="unlock" />}</button></div><div className="canvas-size-grid"><div className="resize-fields"><FormField className="canvas-resize-number-row" layout="inline" label={t('common.width')}><NumberInput live autoFocus onFocus={(event) => { finishHistoryGroup(); event.currentTarget.select() }} onBlur={finishHistoryGroup} aria-label={t('newDocument.widthAria')} min={1} suffix="px" value={value.width} onValueChange={(next) => setDimension('width', next)} /></FormField><FormField className="canvas-resize-number-row" layout="inline" label={t('common.height')}><NumberInput live onFocus={finishHistoryGroup} onBlur={finishHistoryGroup} aria-label={t('newDocument.heightAria')} min={1} suffix="px" value={value.height} onValueChange={(next) => setDimension('height', next)} /></FormField></div><div className="anchor-grid" aria-label={t('canvasResize.anchorAria')}>{anchors.map((item) => { const label = t(item.labelKey); return <button type="button" key={item.id} aria-label={label} title={label} className={`icon-button ${anchor === item.id ? 'selected' : ''}`} onClick={() => { finishHistoryGroup(); setAnchor(item.id); applyAnchor(value.width, value.height, item.id); finishHistoryGroup() }}><PixelUtilityIcon kind={item.icon} /></button> })}</div></div></section>
        <section><h3>{t('canvasResize.boundary')}</h3><div className="canvas-edge-grid"><FormField className="canvas-resize-number-row" layout="inline" label={t('common.left')}><NumberInput live onFocus={finishHistoryGroup} onBlur={finishHistoryGroup} aria-label={t('canvasResize.leftMargin')} suffix="px" value={left} onValueChange={(next) => setEdge('left', next)} /></FormField><FormField className="canvas-resize-number-row" layout="inline" label={t('common.top')}><NumberInput live onFocus={finishHistoryGroup} onBlur={finishHistoryGroup} aria-label={t('canvasResize.topMargin')} suffix="px" value={top} onValueChange={(next) => setEdge('top', next)} /></FormField><FormField className="canvas-resize-number-row" layout="inline" label={t('common.right')}><NumberInput live onFocus={finishHistoryGroup} onBlur={finishHistoryGroup} aria-label={t('canvasResize.rightMargin')} suffix="px" value={right} onValueChange={(next) => setEdge('right', next)} /></FormField><FormField className="canvas-resize-number-row" layout="inline" label={t('common.bottom')}><NumberInput live onFocus={finishHistoryGroup} onBlur={finishHistoryGroup} aria-label={t('canvasResize.bottomMargin')} suffix="px" value={bottom} onValueChange={(next) => setEdge('bottom', next)} /></FormField></div></section>
        <div className="canvas-resize-options-row"><CheckboxField className="tool-checkbox trim-canvas-checkbox" checked={trimOutside} label={<>{t('canvasResize.trim')}<span className="setting-help" title={t('canvasResize.trimHint')}><PixelUtilityIcon kind="info" /></span></>} onChange={setTrimOutside} /><CheckboxField className="canvas-edge-sync" checked={syncEdges} label={t('canvasResize.syncEdges')} onChange={(checked) => { finishHistoryGroup(); setSyncEdges(checked) }} /></div>
      </div>
      <footer><button type="button" className="quiet-button" onClick={onClose}>{t('common.cancel')}</button><button className="primary-button" type="submit">{t('common.done')}</button></footer>
    </ModalShell>
  </div>
}
