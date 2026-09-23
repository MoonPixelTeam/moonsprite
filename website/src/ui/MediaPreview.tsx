import { useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Button } from './primitives'
export type PreviewMedia = { src?: string; title: string; description?: string }
/** Native modal supplies focus containment, Escape handling and an inert background. */
export function MediaPreview({ media, closeLabel, onClose }: { media: PreviewMedia | null; closeLabel: string; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  useEffect(() => {
    if (!media) return
    const element = dialog.current
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const overflow = document.body.style.overflow
    element?.showModal()
    document.body.style.overflow = 'hidden'
    return () => { element?.close(); document.body.style.overflow = overflow; previous?.focus() }
  }, [media])
  if (!media) return null
  return createPortal(<dialog ref={dialog} className="media-preview-dialog" aria-labelledby={titleId} onCancel={onClose} onClick={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <div className="media-preview-content">
      <header><h2 id={titleId}>{media.title}</h2><Button size="compact" onClick={onClose}>{closeLabel}</Button></header>
      <div className="media-preview-frame">{media.src ? <img src={media.src} alt={media.title} /> : <span className="media-preview-placeholder">GIF</span>}</div>
      {media.description && <p>{media.description}</p>}
    </div>
  </dialog>, document.body)
}
