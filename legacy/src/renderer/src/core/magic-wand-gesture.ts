/** Separates pointer release from async completion. Only the latest sample may
 * preview/commit, and cancellation permanently invalidates outstanding replies. */
export class MagicWandGesture<T> {
  private sequence = 0
  private released = false
  private ended = false
  private ready = false
  private value!: T
  constructor(private readonly preview: (value: T) => void, private readonly commit: (value: T) => void, private readonly discard: (value: T) => void) {}
  request(): (value: T) => void {
    const sequence = ++this.sequence
    this.ready = false
    return (value) => {
      if (this.ended || sequence !== this.sequence) { this.discard(value); return }
      this.value = value
      this.ready = true
      if (this.released) this.finish()
      else this.preview(value)
    }
  }
  release(): void { if (this.ended) return; this.released = true; if (this.ready) this.finish() }
  cancel(): void { this.ended = true }
  private finish(): void { this.ended = true; this.commit(this.value) }
}
