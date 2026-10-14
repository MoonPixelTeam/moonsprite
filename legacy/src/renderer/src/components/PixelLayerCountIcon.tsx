import layerCountSvg from '@/assets/pixel-icons/project-layer-count.svg?raw'

const layerCountMarkup = layerCountSvg.replaceAll('#9098A6', 'currentColor').replaceAll('#9098a6', 'currentColor')

/** Source-authored 11×11 layer-count glyph, preserving pixels and alpha while following the theme color. */
export function PixelLayerCountIcon() {
  return <span className="pixel-layer-count-icon" aria-hidden="true" dangerouslySetInnerHTML={{ __html: layerCountMarkup }} />
}
