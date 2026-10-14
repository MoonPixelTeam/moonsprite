import { useI18n } from '@/components/I18nProvider'
import { DialogHeader } from '@/components/DialogHeader'
import { ModalShell } from '@/components/ModalShell'
import { PixelUtilityIcon } from '@/components/PixelUtilityIcon'
import type { TranslationKey } from '@/core/localization'

const roadmapItems: Array<{ id: string; label: TranslationKey; category: TranslationKey; completed: boolean }> = [
  { id: 'animation', label: 'roadmap.item.animation', category: 'roadmap.category.animation', completed: true },
  { id: 'gradient', label: 'roadmap.item.gradient', category: 'roadmap.category.tools', completed: true },
  { id: 'symmetry', label: 'roadmap.item.symmetry', category: 'roadmap.category.tools', completed: true },
  { id: 'grid', label: 'roadmap.item.grid', category: 'roadmap.category.canvas', completed: true },
  { id: 'clipping-mask', label: 'roadmap.item.clippingMask', category: 'roadmap.category.masksLayers', completed: true },
  { id: 'mask', label: 'roadmap.item.mask', category: 'roadmap.category.masksLayers', completed: true },
  { id: 'layer-style', label: 'roadmap.item.layerStyle', category: 'roadmap.category.masksLayers', completed: true },
  { id: 'linked-layers', label: 'roadmap.item.linkedLayers', category: 'roadmap.category.masksLayers', completed: true },
  { id: 'dither-brush', label: 'roadmap.item.ditherBrush', category: 'roadmap.category.tools', completed: true },
  { id: 'text', label: 'roadmap.item.text', category: 'roadmap.category.tools', completed: true },
  { id: 'pressure', label: 'roadmap.item.pressure', category: 'roadmap.category.input', completed: true },
  { id: 'slice', label: 'roadmap.item.slice', category: 'roadmap.category.tools', completed: true },
  { id: 'tile', label: 'roadmap.item.tile', category: 'roadmap.category.canvas', completed: true },
  { id: 'gif-bead-export', label: 'roadmap.item.beadExport', category: 'roadmap.category.export', completed: false },
  { id: 'theme', label: 'roadmap.item.theme', category: 'roadmap.category.interface', completed: true },
  { id: 'extension-support', label: 'roadmap.item.extensionSupport', category: 'roadmap.category.ecosystem', completed: false },
  { id: 'indexed-mode', label: 'roadmap.item.indexedMode', category: 'roadmap.category.export', completed: true },
  { id: 'timelapse-animation', label: 'roadmap.item.timelapseAnimation', category: 'roadmap.category.animation', completed: true },
  { id: 'custom-brush', label: 'roadmap.item.customBrush', category: 'roadmap.category.input', completed: true },
  { id: 'sprite-sheet', label: 'roadmap.item.spriteSheet', category: 'roadmap.category.export', completed: true },
  { id: 'animation-loop-sections', label: 'roadmap.item.animationLoopSections', category: 'roadmap.category.animation', completed: true }
]

export function FutureRoadmapDialog({ onClose }: { onClose: () => void }) {
  const { t } = useI18n()
  return <div className="modal-backdrop" role="presentation" onPointerDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <ModalShell storageKey="future-roadmap" defaultWidth={480} defaultHeight={520} minWidth={400} minHeight={400} maxWidth={640} maxHeight={720} className="roadmap-modal" role="dialog" aria-modal="true" aria-labelledby="future-roadmap-title">
      <DialogHeader eyebrow="MOONSPRITE ROADMAP" title={t('roadmap.title')} titleId="future-roadmap-title" closeLabel={t('common.close')} onClose={onClose} />
      <div className="roadmap-body component-scrollbar"><p>{t('roadmap.description')}</p><ul>{[...roadmapItems].sort((a, b) => Number(b.completed) - Number(a.completed)).map((item) => <li key={item.id} className={item.completed ? 'completed' : ''}><span className="roadmap-status-icon" aria-hidden="true"><PixelUtilityIcon kind={item.completed ? 'roadmapCompleted' : 'roadmapPlanned'} /></span><span className="roadmap-category">{t(item.category)}</span><strong>{t(item.label)}</strong><span>{t(item.completed ? 'roadmap.completed' : 'roadmap.planned')}</span></li>)}</ul></div>
      <footer><button type="button" className="primary-button" onClick={onClose}>{t('common.done')}</button></footer>
    </ModalShell>
  </div>
}
