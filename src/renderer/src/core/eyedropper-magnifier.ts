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
