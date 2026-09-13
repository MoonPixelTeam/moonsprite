import drawingTimeSvg from '@/assets/pixel-icons/project-drawing-time.svg?raw'

const drawingTimeMarkup = drawingTimeSvg.replaceAll('#9098A6', 'currentColor').replaceAll('#9098a6', 'currentColor')

/** Source-authored 11×11 active drawing time glyph, preserving pixels and alpha while following the theme color. */
export function PixelDrawingTimeIcon() {
  return <span className="pixel-drawing-time-icon" aria-hidden="true" dangerouslySetInnerHTML={{ __html: drawingTimeMarkup }} />
}
