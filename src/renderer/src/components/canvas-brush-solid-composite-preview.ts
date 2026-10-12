import type { RgbaColor } from '@shared/types-color'

/** Stream solid rows without constructing per-pixel masks or repeated-copy maps. */
export function solidCompositePreviewRects(
  rows: ReadonlyArray<{ y: number; left: number; right: number }>,
  width: number,
  height: number,
  colorAt: (x: number, y: number) => RgbaColor,
  rectAt: (x: number, y: number) => { x: number; y: number; width: number; height: number }
) {
  const entries: Array<{ pixelRect: ReturnType<typeof rectAt>; sampleX: number; sampleY: number; color: RgbaColor }> = []
  for (const row of rows) {
    if (row.y < 0 || row.y >= height) continue
    const left = Math.max(0, row.left), right = Math.min(width - 1, row.right)
    let run: (typeof entries)[number] | undefined
    for (let x = left; x <= right; x++) {
      const color = colorAt(x, row.y)
      if (run && color.a === 255 && run.color.a === 255 && color.r === run.color.r && color.g === run.color.g && color.b === run.color.b) {
        const last = rectAt(x, row.y)
        run.pixelRect.width = last.x + last.width - run.pixelRect.x
      } else {
        // Translucent colors retain individual samples: the checkerboard can
        // change within a row. Opaque runs have exactly one display color.
        run = { pixelRect: { ...rectAt(x, row.y) }, sampleX: x, sampleY: row.y, color }
        entries.push(run)
      }
    }
  }
  return entries
}
