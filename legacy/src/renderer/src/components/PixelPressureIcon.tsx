import pressureDynamicsSvg from '@/assets/pixel-icons/pressure-dynamics.svg?raw'

const pressureDynamicsMarkup = pressureDynamicsSvg.replaceAll('#9098a6', 'currentColor')

/** Source-authored 11×11 pressure glyph, rendered with theme currentColor. */
export function PixelPressureIcon() {
  return <span className="pixel-pressure-icon" aria-hidden="true" dangerouslySetInnerHTML={{ __html: pressureDynamicsMarkup }} />
}
