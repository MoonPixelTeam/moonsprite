import { type ReactNode } from 'react'
import { PixelUtilityIcon, type PixelUtilityIconKind } from '@/components/PixelUtilityIcon'
export function LayerContextMenuItem({
  icon,
  label,
  shortcut,
  onClick,
  danger = false,
  disabled = false
}: {
  icon: PixelUtilityIconKind
  label: ReactNode
  shortcut?: ReactNode
  onClick: () => void
  danger?: boolean
  disabled?: boolean
}) {
  return (
    <button role="menuitem" className={danger ? 'danger' : undefined} disabled={disabled} onClick={onClick}>
      <span className="layer-context-icon">
        <PixelUtilityIcon kind={icon} />
      </span>
      <span className="layer-context-label">{label}</span>
      {shortcut}
    </button>
  )
}
