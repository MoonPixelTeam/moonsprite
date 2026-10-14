import autoLinkOffSvg from '@/assets/pixel-icons/animation-auto-link-off.svg?raw'
import autoLinkOnSvg from '@/assets/pixel-icons/animation-auto-link-on.svg?raw'

const currentColorSvg = (source: string): string => source.replaceAll('#9098a6', 'currentColor')
const autoLinkOffMarkup = currentColorSvg(autoLinkOffSvg)
const autoLinkOnMarkup = currentColorSvg(autoLinkOnSvg)

/** Asset-backed auto-link glyphs. The source SVGs preserve the authored
 * pixels/alpha instead of recolouring them through a CSS mask. */
export function PixelAutoLinkIcon({ enabled }: { enabled: boolean }) {
  return <span className="pixel-auto-link-icon" aria-hidden="true" dangerouslySetInnerHTML={{ __html: enabled ? autoLinkOnMarkup : autoLinkOffMarkup }} />
}
