import { PixelUtilityIcon } from './PixelUtilityIcon'
import { useI18n } from './I18nProvider'
import { PreferenceToggle } from './PreferenceToggle'

interface LivePreviewToggleProps {
  checked: boolean
  onChange: (checked: boolean) => void
  className?: string
  description?: string
  label?: string
}

export function LivePreviewToggle({ checked, onChange, className = '', description, label }: LivePreviewToggleProps) {
  const { t } = useI18n()
  return <PreferenceToggle className={`live-preview-toggle ${className}`.trim()} copyClassName="live-preview-copy" checked={checked} onChange={onChange} label={<>
      <span className="live-preview-label"><PixelUtilityIcon kind="eye" />{label ?? t('common.livePreview')}</span>
      {description && <small>{description}</small>}
    </>} />
}
