import type { InkMode } from '@shared/types-brush'
import inkCopyAlphaColorIcon from '@/assets/pixel-icons/ink-copy-alpha-color.svg?raw'
import inkLockAlphaIcon from '@/assets/pixel-icons/ink-lock-alpha.svg?raw'
import inkSimpleIcon from '@/assets/pixel-icons/ink-simple.svg?raw'

const inkModeSources: Record<InkMode, string> = {
  simple: inkSimpleIcon,
  'copy-alpha-color': inkCopyAlphaColorIcon,
  'lock-alpha': inkLockAlphaIcon
}

export function PixelInkIcon({ mode, className = '' }: { mode: InkMode; className?: string }) {
  return <span className={`pixel-asset-icon pixel-ink-icon ${className}`.trim()} dangerouslySetInnerHTML={{ __html: inkModeSources[mode] }} aria-hidden="true" />
}
