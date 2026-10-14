/** Dirty notifications coalesce into the next display frame, without a second
 * refresh clock or an artificial delay after input has already been rendered. */
export function createPreviewDrawScheduler(draw: () => void) {
  let frame: number | null = null
  const cancel = () => {
    if (frame !== null) window.cancelAnimationFrame(frame)
    frame = null
  }
  return {
    request(_final = false) {
      if (frame !== null) return
      frame = window.requestAnimationFrame(() => { frame = null; draw() })
    },
    cancel
  }
}