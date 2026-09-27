import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { IconButton } from './primitives'
import { PixelChevronLeft, PixelChevronRight, PixelX } from './icons'

export type PreviewSlide = { src: string; title: string }
export type PreviewMedia = { src?: string; slides?: PreviewSlide[]; title: string; description?: string }
/** Native modal supplies focus containment, Escape handling and an inert background. */
export function MediaPreview({ media, closeLabel, previousLabel = 'Previous', nextLabel = 'Next', onClose }: { media: PreviewMedia | null; closeLabel: string; previousLabel?: string; nextLabel?: string; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const [slide, setSlide] = useState(0)
  useEffect(() => {
    if (!media) return
    const element = dialog.current
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const overflow = document.body.style.overflow
    element?.showModal()
    document.body.style.overflow = 'hidden'
    setSlide(0)
    return () => { element?.close(); document.body.style.overflow = overflow; previous?.focus() }
  }, [media])
  if (!media) return null
  const slides = media.slides?.length ? media.slides : media.src ? [{ src: media.src, title: media.title }] : []
  const active = slides[slide]
  const changeSlide = (offset: number) => setSlide((current) => (current + offset + slides.length) % slides.length)
  const title = active?.title ?? media.title
  return createPortal(<dialog ref={dialog} className="media-preview-dialog" aria-labelledby={titleId} onCancel={onClose} onClick={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <div className="media-preview-content">
      <header><h2 id={titleId}>{title}</h2><div className="media-preview-controls">
        {slides.length > 1 && <>
          <IconButton className="hero-arrow" label={previousLabel} onClick={() => changeSlide(-1)} icon={<PixelChevronLeft aria-hidden="true" />} />
          <span aria-live="polite">{slide + 1} / {slides.length}</span>
          <IconButton className="hero-arrow" label={nextLabel} onClick={() => changeSlide(1)} icon={<PixelChevronRight aria-hidden="true" />} />
        </>}
        <IconButton className="hero-arrow media-preview-close" label={closeLabel} onClick={onClose} icon={<PixelX aria-hidden="true" />} />
      </div></header>
      <div className="media-preview-frame">
        {active ? <img key={active.src} src={active.src} alt={title} /> : <span className="media-preview-placeholder">GIF</span>}
      </div>
      {media.description && <p>{media.description}</p>}
    </div>
  </dialog>, document.body)
}
