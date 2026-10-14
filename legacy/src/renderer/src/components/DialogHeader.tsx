import type { ReactNode } from 'react'
import { PixelUtilityIcon } from './PixelUtilityIcon'

interface DialogHeaderProps {
  actions?: ReactNode
  className?: string
  closeDisabled?: boolean
  closeLabel?: string
  description?: ReactNode
  eyebrow?: ReactNode
  onClose?: () => void
  title: ReactNode
  titleId?: string
}

export function DialogHeader({ actions, className = '', closeDisabled = false, closeLabel, description, eyebrow, onClose, title, titleId }: DialogHeaderProps) {
  return <header className={`dialog-header ${className}`.trim()}>
    <div>{eyebrow && <span className="eyebrow">{eyebrow}</span>}<h2 id={titleId}>{title}</h2>{description && <p>{description}</p>}</div>
    {actions ?? (onClose && <button type="button" className="icon-button" aria-label={closeLabel} disabled={closeDisabled} onClick={onClose}><PixelUtilityIcon kind="close" /></button>)}
  </header>
}
