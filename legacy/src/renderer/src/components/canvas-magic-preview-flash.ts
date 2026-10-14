import type { CanvasDragState } from '@/core/canvas-input'

type Preview = Pick<CanvasDragState, 'kind' | 'last' | 'previewSelection' | 'magicPreviewBitmap' | 'magicPreviewRectangles'>

/** Owns only the completed preview, independently of pointer capture or selection history. */
export class CanvasMagicPreviewFlash {
  current: Preview | null = null
  private timer: ReturnType<typeof setTimeout> | null = null
  private isValid: () => boolean = () => true

  constructor(private readonly scheduleDraw: () => void) {}

  retain(drag: CanvasDragState, isValid: () => boolean): void {
    this.clear(false)
    this.current = {
      kind: 'magic-preview', last: { ...drag.last }, previewSelection: drag.previewSelection,
      magicPreviewBitmap: drag.magicPreviewBitmap, magicPreviewRectangles: drag.magicPreviewRectangles
    }
    // Transfer ownership; gesture cleanup must not close the retained bitmap.
    drag.magicPreviewBitmap = null
    drag.magicPreviewRectangles = null
    this.isValid = isValid
    if (!this.current.previewSelection || !isValid()) this.clear(false)
  }

  validate(): void {
    if (this.current && !this.isValid()) this.clear()
  }

  presented(): void {
    // A slow worker/commit must not consume the flash lifetime before its first paint.
    if (this.current && this.timer === null) this.timer = setTimeout(() => this.clear(), 140)
  }

  clear(redraw = true): void {
    if (this.timer !== null) clearTimeout(this.timer)
    this.timer = null
    const previous = this.current
    this.current = null
    this.isValid = () => true
    previous?.magicPreviewBitmap?.close()
    if (previous && redraw) this.scheduleDraw()
  }
}
