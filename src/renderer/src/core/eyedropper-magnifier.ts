const RELATIVE_MAGNIFICATION = 1.5

export interface EyedropperMagnifierViewTransform {
  rotationRadians: number
  cosine: number
  sine: number
  mirrored: boolean
  mirroredVertical: boolean
}

/**
 * Resolve the display transform used by the eyedropper lens.
 *
 * The canvas renderer applies mirror first and rotation second (the same
 * order as CanvasRenderingContext2D's transform chain). Keeping this as a
 * small pure helper lets the lens use the exact same convention without
 * coupling the magnifier to the canvas component or document state.
 */
export const eyedropperMagnifierViewTransform = (
  rotationDegrees: number,
  mirrored = false,
  mirroredVertical = false
): EyedropperMagnifierViewTransform => {
  const rotationRadians = (Number.isFinite(rotationDegrees) ? rotationDegrees : 0) * Math.PI / 180
  return {
    rotationRadians,
    cosine: Math.cos(rotationRadians),
    sine: Math.sin(rotationRadians),
    mirrored: Boolean(mirrored),
    mirroredVertical: Boolean(mirroredVertical)
  }
}

/**
 * Map a point in the lens viewport back to the untransformed sampled field.
 * This is the inverse of the canvas display transform around the lens center.
 */
export const eyedropperMagnifierContentPoint = (
  point: { x: number; y: number },
  center: { x: number; y: number },
  transform: EyedropperMagnifierViewTransform
): { x: number; y: number } => {
  const dx = point.x - center.x
  const dy = point.y - center.y
  // Undo rotation first, then undo the mirror (matching view-geometry.ts).
  const unrotatedX = transform.cosine * dx + transform.sine * dy
  const unrotatedY = -transform.sine * dx + transform.cosine * dy
  const mirroredX = transform.mirrored ? -unrotatedX : unrotatedX
  const mirroredY = transform.mirroredVertical ? -unrotatedY : unrotatedY
  return { x: center.x + mirroredX, y: center.y + mirroredY }
}

export const eyedropperMagnifierPixelScale = (viewZoom: number, lensSize = 204, baselinePixelCount = 17): number => {
  const baselineScale = lensSize / baselinePixelCount
  const safeZoom = Number.isFinite(viewZoom) ? Math.max(0, viewZoom) : 0
  return Math.max(baselineScale, safeZoom * RELATIVE_MAGNIFICATION)
}

/** Place the lens exactly like the canvas eyedropper: centered above the pointer, then below if needed. */
export const eyedropperMagnifierPosition = (
  point: { x: number; y: number },
  bounds: { width: number; height: number },
  displaySize: number
): { left: number; top: number } => {
  const horizontalInset = Math.min(6, Math.max(0, (bounds.width - displaySize) / 2))
  const verticalInset = Math.min(6, Math.max(0, (bounds.height - displaySize) / 2))
  const maxLeft = Math.max(horizontalInset, bounds.width - displaySize - horizontalInset)
  const maxTop = Math.max(verticalInset, bounds.height - displaySize - verticalInset)
  const left = Math.min(maxLeft, Math.max(horizontalInset, point.x - displaySize / 2))
  const preferredTop = point.y - displaySize - 18
  const top = preferredTop >= verticalInset
    ? preferredTop
    : Math.min(maxTop, Math.max(verticalInset, point.y + 18))
  return { left, top }
}
