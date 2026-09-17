import type { ShapeRatio } from '@shared/types-brush'
import type { SelectionMode, SelectionRect } from '@shared/types-selection'
import { type CanvasPoint, type MarqueeTemporaryCenterRestore, type CanvasDragState, type SelectionHandle } from './canvas-input-contracts'

export const temporaryTransformOffset = (start: { pointer: CanvasPoint; offset: CanvasPoint }, point: CanvasPoint): CanvasPoint => ({
  x: start.offset.x + point.x - start.pointer.x,
  y: start.offset.y + point.y - start.pointer.y
})

export const createMarqueeResizeStart = (bounds: SelectionRect, pointer: CanvasPoint, fromCenter = true): { pointer: CanvasPoint; bounds: SelectionRect; fromCenter: boolean } => ({
  pointer: { ...pointer },
  bounds: { ...bounds },
  fromCenter
})

export const centerMarqueeBoundsAtCreationPoint = (bounds: SelectionRect, creationPoint: CanvasPoint): SelectionRect => {
  return {
    ...bounds,
    x: creationPoint.x - Math.floor(bounds.width / 2),
    y: creationPoint.y - Math.floor(bounds.height / 2)
  }
}

export const beginTemporaryCenteredMarqueeResize = (
  bounds: SelectionRect,
  creationPoint: CanvasPoint,
  pointer: CanvasPoint,
  direction?: { x: -1 | 1; y: -1 | 1 },
  restoreFromCenter = true
): {
  bounds: SelectionRect
  resizeStart: {
    pointer: CanvasPoint
    bounds: SelectionRect
    fromCenter: boolean
  }
  restore: MarqueeTemporaryCenterRestore
} => {
  const centeredBounds = centerMarqueeBoundsAtCreationPoint(bounds, creationPoint)
  return {
    bounds: centeredBounds,
    resizeStart: createMarqueeResizeStart(centeredBounds, pointer),
    restore: {
      bounds: { ...bounds },
      direction: direction ? { ...direction } : undefined,
      fromCenter: restoreFromCenter
    }
  }
}

export const restoreTemporaryCenteredMarqueeResize = (
  restore: MarqueeTemporaryCenterRestore,
  pointer: CanvasPoint
): {
  bounds: SelectionRect
  resizeStart: {
    pointer: CanvasPoint
    bounds: SelectionRect
    fromCenter: boolean
  }
  direction?: { x: -1 | 1; y: -1 | 1 }
} => ({
  bounds: { ...restore.bounds },
  resizeStart: createMarqueeResizeStart(restore.bounds, pointer, restore.fromCenter),
  direction: restore.direction ? { ...restore.direction } : undefined
})

export const resizeRotatedMarqueeBounds = (
  start: SelectionRect,
  pointerDelta: CanvasPoint,
  angle: number,
  direction: { x: -1 | 1; y: -1 | 1 },
  fromCenter = false,
  proportional = false,
  fixedRatio: ShapeRatio | null = null
): SelectionRect => {
  const radians = (angle * Math.PI) / 180
  const cosine = Math.cos(radians)
  const sine = Math.sin(radians)
  const localX = pointerDelta.x * cosine + pointerDelta.y * sine
  const localY = -pointerDelta.x * sine + pointerDelta.y * cosine
  const centeredSize = (size: number, localDelta: number, axisDirection: -1 | 1): number => {
    const minimum = size % 2 === 0 ? 2 : 1
    return Math.max(minimum, size + Math.round(localDelta * axisDirection) * 2)
  }
  let width = fromCenter ? centeredSize(start.width, localX, direction.x) : Math.max(1, Math.round(start.width + localX * direction.x))
  let height = fromCenter ? centeredSize(start.height, localY, direction.y) : Math.max(1, Math.round(start.height + localY * direction.y))
  const ratio = fixedRatio && Number.isFinite(fixedRatio.width) && Number.isFinite(fixedRatio.height) ? Math.max(0.001, fixedRatio.width / fixedRatio.height) : proportional ? 1 : null
  if (ratio !== null) {
    const widthDriven = Math.abs(localX) / ratio >= Math.abs(localY)
    if (widthDriven) height = Math.max(1, Math.round(width / ratio))
    else width = Math.max(1, Math.round(height * ratio))
    if (fromCenter) {
      const matchParity = (size: number, startSize: number): number => {
        const minimum = startSize % 2 === 0 ? 2 : 1
        let matched = Math.max(minimum, size)
        if (Math.abs(matched - startSize) % 2 !== 0) matched = matched > minimum ? matched - 1 : matched + 1
        return matched
      }
      width = matchParity(width, start.width)
      height = matchParity(height, start.height)
    }
  }
  if (fromCenter) {
    const centerX = start.x + start.width / 2
    const centerY = start.y + start.height / 2
    return { x: centerX - width / 2, y: centerY - height / 2, width, height }
  }
  return {
    x: direction.x < 0 ? start.x + start.width - width : start.x,
    y: direction.y < 0 ? start.y + start.height - height : start.y,
    width,
    height
  }
}

export const selectionRotationAngle = (selection: SelectionRect, start: CanvasPoint, point: CanvasPoint, snap = false, pivot?: CanvasPoint): number => {
  const centerX = pivot?.x ?? selection.x + selection.width / 2
  const centerY = pivot?.y ?? selection.y + selection.height / 2
  const startAngle = Math.atan2(start.y - centerY, start.x - centerX)
  const rawAngle = ((Math.atan2(point.y - centerY, point.x - centerX) - startAngle) * 180) / Math.PI
  return snapSelectionRotation(rawAngle, snap)
}

export const selectionMarqueeUsesConstraint = (modifiers: { ctrlKey: boolean; metaKey?: boolean; shiftKey: boolean }, hasSelection: boolean, mode: SelectionMode, afterRotation = false): boolean => {
  if (afterRotation && !modifiers.shiftKey) return false
  return modifiers.shiftKey && (!hasSelection || mode !== 'add')
}

export const snapSelectionRotation = (angle: number, enabled: boolean): number => (enabled ? Math.round(angle / 45) * 45 : angle)

export const shapeBounds = (start: CanvasPoint, end: CanvasPoint, constrain = false, fixedRatio: ShapeRatio | null = null): SelectionRect => {
  const ratio = fixedRatio && Number.isFinite(fixedRatio.width) && Number.isFinite(fixedRatio.height) ? Math.max(0.001, fixedRatio.width / fixedRatio.height) : constrain ? 1 : null
  if (ratio === null) {
    const x = Math.min(start.x, end.x)
    const y = Math.min(start.y, end.y)
    return {
      x,
      y,
      width: Math.abs(end.x - start.x) + 1,
      height: Math.abs(end.y - start.y) + 1
    }
  }
  const deltaX = end.x - start.x
  const deltaY = end.y - start.y
  const absoluteX = Math.abs(deltaX)
  const absoluteY = Math.abs(deltaY)
  const widthMajor = absoluteX / ratio >= absoluteY
  const widthDistance = widthMajor ? absoluteX : Math.round(absoluteY * ratio)
  const heightDistance = widthMajor ? Math.round(absoluteX / ratio) : absoluteY
  return shapeBounds(start, {
    x: start.x + (deltaX < 0 ? -widthDistance : widthDistance),
    y: start.y + (deltaY < 0 ? -heightDistance : heightDistance)
  })
}

export const centeredShapeBounds = (center: CanvasPoint, end: CanvasPoint, constrain = false, fixedRatio: ShapeRatio | null = null): SelectionRect => {
  const ratio = fixedRatio && Number.isFinite(fixedRatio.width) && Number.isFinite(fixedRatio.height) ? Math.max(0.001, fixedRatio.width / fixedRatio.height) : constrain ? 1 : null
  let distanceX = Math.abs(end.x - center.x)
  let distanceY = Math.abs(end.y - center.y)
  if (ratio !== null) {
    const widthMajor = distanceX / ratio >= distanceY
    if (widthMajor) distanceY = Math.round(distanceX / ratio)
    else distanceX = Math.round(distanceY * ratio)
  }
  const directionX = end.x < center.x ? -1 : 1
  const directionY = end.y < center.y ? -1 : 1
  const adjustedEnd = {
    x: center.x + directionX * distanceX,
    y: center.y + directionY * distanceY
  }
  return shapeBounds({ x: center.x * 2 - adjustedEnd.x, y: center.y * 2 - adjustedEnd.y }, adjustedEnd)
}

export const constrainedTranslation = (drag: CanvasDragState, deltaX: number, deltaY: number, shift: boolean): CanvasPoint => {
  if (!shift) {
    drag.axisLock = undefined
    return { x: deltaX, y: deltaY }
  }
  const absoluteX = Math.abs(deltaX)
  const absoluteY = Math.abs(deltaY)
  if (!drag.axisLock && (absoluteX !== 0 || absoluteY !== 0)) drag.axisLock = absoluteX >= absoluteY ? 'x' : 'y'
  if (drag.axisLock === 'x' && absoluteY > absoluteX * 1.2) drag.axisLock = 'y'
  if (drag.axisLock === 'y' && absoluteX > absoluteY * 1.2) drag.axisLock = 'x'
  return drag.axisLock === 'x' ? { x: deltaX, y: 0 } : { x: 0, y: deltaY }
}

export const selectionMovePointerDelta = (drag: Pick<CanvasDragState, 'start' | 'tileRepeatStart'>, point: CanvasPoint, repeatedPoint?: CanvasPoint | null): CanvasPoint => {
  const useRepeatedPoint = Boolean(drag.tileRepeatStart && repeatedPoint)
  const start = useRepeatedPoint ? drag.tileRepeatStart! : drag.start
  const current = useRepeatedPoint ? repeatedPoint! : point
  return {
    x: Math.floor(current.x) - Math.floor(start.x),
    y: Math.floor(current.y) - Math.floor(start.y)
  }
}

export const resizeSelectionBounds = (start: SelectionRect, point: CanvasPoint, handle: SelectionHandle, _bounds: { width: number; height: number }, proportional = false, integerScale = false, fromCenter = false): SelectionRect => {
  const originalLeft = start.x
  const originalTop = start.y
  const originalRight = start.x + start.width
  const originalBottom = start.y + start.height
  const targetX = point.x
  const targetY = point.y
  let left = originalLeft
  let top = originalTop
  let right = originalRight
  let bottom = originalBottom
  let flipHorizontal = Boolean(start.flipHorizontal)
  let flipVertical = Boolean(start.flipVertical)
  let flipOriginX = start.flipOriginX
  let flipOriginY = start.flipOriginY
  let crossedHorizontal = false
  let crossedVertical = false
  if (fromCenter && (handle.includes('w') || handle.includes('e'))) {
    const center = (originalLeft + originalRight) / 2
    const signedWidth = handle.includes('w') ? start.width + (originalLeft - targetX) * 2 : start.width + (targetX - originalRight) * 2
    const minimum = start.width % 2 === 0 ? 2 : 1
    const width = Math.max(minimum, Math.abs(Math.round(signedWidth)))
    crossedHorizontal = signedWidth < 0
    left = center - width / 2
    right = center + width / 2
    flipHorizontal = crossedHorizontal ? !Boolean(start.flipHorizontal) : Boolean(start.flipHorizontal)
    flipOriginX = crossedHorizontal ? center : flipHorizontal ? start.flipOriginX : undefined
  } else if (handle.includes('w')) {
    crossedHorizontal = targetX > originalRight
    left = crossedHorizontal ? originalRight : Math.min(originalRight - 1, targetX)
    right = crossedHorizontal ? Math.max(originalRight + 1, targetX) : originalRight
    flipHorizontal = crossedHorizontal ? !Boolean(start.flipHorizontal) : Boolean(start.flipHorizontal)
    flipOriginX = crossedHorizontal ? targetX : flipHorizontal ? start.flipOriginX : undefined
  } else if (handle.includes('e')) {
    crossedHorizontal = targetX < originalLeft
    left = crossedHorizontal ? Math.min(originalLeft - 1, targetX) : originalLeft
    right = crossedHorizontal ? originalLeft : Math.max(originalLeft + 1, targetX)
    flipHorizontal = crossedHorizontal ? !Boolean(start.flipHorizontal) : Boolean(start.flipHorizontal)
    flipOriginX = crossedHorizontal ? targetX : flipHorizontal ? start.flipOriginX : undefined
  }
  if (fromCenter && (handle.includes('n') || handle.includes('s'))) {
    const center = (originalTop + originalBottom) / 2
    const signedHeight = handle.includes('n') ? start.height + (originalTop - targetY) * 2 : start.height + (targetY - originalBottom) * 2
    const minimum = start.height % 2 === 0 ? 2 : 1
    const height = Math.max(minimum, Math.abs(Math.round(signedHeight)))
    crossedVertical = signedHeight < 0
    top = center - height / 2
    bottom = center + height / 2
    flipVertical = crossedVertical ? !Boolean(start.flipVertical) : Boolean(start.flipVertical)
    flipOriginY = crossedVertical ? center : flipVertical ? start.flipOriginY : undefined
  } else if (handle.includes('n')) {
    crossedVertical = targetY > originalBottom
    top = crossedVertical ? originalBottom : Math.min(originalBottom - 1, targetY)
    bottom = crossedVertical ? Math.max(originalBottom + 1, targetY) : originalBottom
    flipVertical = crossedVertical ? !Boolean(start.flipVertical) : Boolean(start.flipVertical)
    flipOriginY = crossedVertical ? targetY : flipVertical ? start.flipOriginY : undefined
  } else if (handle.includes('s')) {
    crossedVertical = targetY < originalTop
    top = crossedVertical ? Math.min(originalTop - 1, targetY) : originalTop
    bottom = crossedVertical ? originalTop : Math.max(originalTop + 1, targetY)
    flipVertical = crossedVertical ? !Boolean(start.flipVertical) : Boolean(start.flipVertical)
    flipOriginY = crossedVertical ? targetY : flipVertical ? start.flipOriginY : undefined
  }

  if (proportional || integerScale) {
    const rawWidth = right - left
    const rawHeight = bottom - top
    const aspect = start.width / start.height
    const horizontalHandle = handle.includes('w') || handle.includes('e')
    const verticalHandle = handle.includes('n') || handle.includes('s')
    const widthDriven = horizontalHandle && !verticalHandle ? true : verticalHandle && !horizontalHandle ? false : rawWidth / start.width >= rawHeight / start.height
    let width = proportional ? (widthDriven ? rawWidth : Math.max(1, Math.round(rawHeight * aspect))) : rawWidth
    let height = proportional ? (widthDriven ? Math.max(1, Math.round(rawWidth / aspect)) : rawHeight) : rawHeight
    if (integerScale) {
      if (proportional) {
        const scale = Math.max(1, Math.round(widthDriven ? (rawWidth + (fromCenter ? 0 : 1)) / start.width : (rawHeight + (fromCenter ? 0 : 1)) / start.height))
        width = start.width * scale
        height = start.height * scale
      } else {
        if (horizontalHandle) width = start.width * Math.max(1, Math.round((rawWidth + (fromCenter ? 0 : 1)) / start.width))
        if (verticalHandle) height = start.height * Math.max(1, Math.round((rawHeight + (fromCenter ? 0 : 1)) / start.height))
      }
    }

    if (fromCenter) {
      const matchParity = (size: number, startSize: number): number => {
        const minimum = startSize % 2 === 0 ? 2 : 1
        let matched = Math.max(minimum, Math.round(size))
        if (Math.abs(matched - startSize) % 2 !== 0) matched = matched > minimum ? matched - 1 : matched + 1
        return matched
      }
      width = matchParity(width, start.width)
      height = matchParity(height, start.height)
      const centerX = (originalLeft + originalRight) / 2
      const centerY = (originalTop + originalBottom) / 2
      left = centerX - width / 2
      right = centerX + width / 2
      top = centerY - height / 2
      bottom = centerY + height / 2
    } else {
      if (handle.includes('w')) {
        if (crossedHorizontal) {
          left = originalRight
          right = originalRight + width
        } else {
          left = originalRight - width
          right = originalRight
        }
      } else if (handle.includes('e')) {
        if (crossedHorizontal) {
          left = originalLeft - width
          right = originalLeft
        } else {
          left = originalLeft
          right = originalLeft + width
        }
      } else {
        const center = (left + right) / 2
        left = Math.round(center - width / 2)
        right = left + width
      }
      if (handle.includes('n')) {
        if (crossedVertical) {
          top = originalBottom
          bottom = originalBottom + height
        } else {
          top = originalBottom - height
          bottom = originalBottom
        }
      } else if (handle.includes('s')) {
        if (crossedVertical) {
          top = originalTop - height
          bottom = originalTop
        } else {
          top = originalTop
          bottom = originalTop + height
        }
      } else {
        const center = (top + bottom) / 2
        top = Math.round(center - height / 2)
        bottom = top + height
      }
    }
  }
  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
    ...(flipHorizontal ? { flipHorizontal: true } : {}),
    ...(flipVertical ? { flipVertical: true } : {}),
    ...(flipHorizontal && Number.isFinite(flipOriginX) ? { flipOriginX } : {}),
    ...(flipVertical && Number.isFinite(flipOriginY) ? { flipOriginY } : {})
  }
}

export const resizeTransformedSelectionBounds = (
  start: SelectionRect,
  pointerDelta: CanvasPoint,
  angle: number,
  handle: SelectionHandle,
  proportional = false,
  integerScale = false,
  fromCenter = false,
  pivot?: CanvasPoint
): SelectionRect => {
  const radians = (angle * Math.PI) / 180
  const cosine = Math.cos(radians)
  const sine = Math.sin(radians)
  const localDelta = {
    x: pointerDelta.x * cosine + pointerDelta.y * sine,
    y: -pointerDelta.x * sine + pointerDelta.y * cosine
  }
  const handlePoint = {
    x: handle.includes('w') ? 0 : handle.includes('e') ? start.width : start.width / 2,
    y: handle.includes('n') ? 0 : handle.includes('s') ? start.height : start.height / 2
  }
  if (fromCenter && pivot) {
    const startCenter = {
      x: start.x + start.width / 2,
      y: start.y + start.height / 2
    }
    const pivotOffset = {
      x: pivot.x - startCenter.x,
      y: pivot.y - startCenter.y
    }
    const localPivot = {
      x: start.width / 2 + pivotOffset.x * cosine + pivotOffset.y * sine,
      y: start.height / 2 - pivotOffset.x * sine + pivotOffset.y * cosine
    }
    const horizontalHandle = handle.includes('w') || handle.includes('e')
    const verticalHandle = handle.includes('n') || handle.includes('s')
    const axisScale = (handleCoordinate: number, delta: number, pivotCoordinate: number, affected: boolean): number => {
      if (!affected) return 1
      const startDistance = handleCoordinate - pivotCoordinate
      return Math.abs(startDistance) < 1e-9 ? 1 : (handleCoordinate + delta - pivotCoordinate) / startDistance
    }
    const rawScaleX = axisScale(handlePoint.x, localDelta.x, localPivot.x, horizontalHandle)
    const rawScaleY = axisScale(handlePoint.y, localDelta.y, localPivot.y, verticalHandle)
    const scaleSign = (value: number): number => (value < 0 ? -1 : 1)
    let width: number
    let height: number
    let signX = scaleSign(rawScaleX)
    let signY = scaleSign(rawScaleY)
    if (proportional) {
      const widthDriven = horizontalHandle && !verticalHandle ? true : verticalHandle && !horizontalHandle ? false : Math.abs(rawScaleX) >= Math.abs(rawScaleY)
      let magnitude = Math.abs(widthDriven ? rawScaleX : rawScaleY)
      if (integerScale) magnitude = Math.max(1, Math.round(magnitude))
      width = integerScale ? start.width * magnitude : Math.max(1, Math.round(start.width * magnitude))
      height = integerScale ? start.height * magnitude : Math.max(1, Math.round(start.height * magnitude))
      if (!horizontalHandle) signX = 1
      if (!verticalHandle) signY = 1
    } else {
      const widthMagnitude = integerScale && horizontalHandle ? Math.max(1, Math.round(Math.abs(rawScaleX))) : Math.abs(rawScaleX)
      const heightMagnitude = integerScale && verticalHandle ? Math.max(1, Math.round(Math.abs(rawScaleY))) : Math.abs(rawScaleY)
      width = horizontalHandle ? Math.max(1, Math.round(start.width * widthMagnitude)) : start.width
      height = verticalHandle ? Math.max(1, Math.round(start.height * heightMagnitude)) : start.height
    }
    const signedScaleX = (signX * width) / start.width
    const signedScaleY = (signY * height) / start.height
    const localCenterFromPivot = {
      x: (start.width / 2 - localPivot.x) * signedScaleX,
      y: (start.height / 2 - localPivot.y) * signedScaleY
    }
    const center = {
      x: pivot.x + localCenterFromPivot.x * cosine - localCenterFromPivot.y * sine,
      y: pivot.y + localCenterFromPivot.x * sine + localCenterFromPivot.y * cosine
    }
    const flipHorizontal = signX < 0 ? !Boolean(start.flipHorizontal) : Boolean(start.flipHorizontal)
    const flipVertical = signY < 0 ? !Boolean(start.flipVertical) : Boolean(start.flipVertical)
    const target: SelectionRect = {
      x: center.x - width / 2,
      y: center.y - height / 2,
      width,
      height,
      ...(flipHorizontal ? { flipHorizontal: true } : {}),
      ...(flipVertical ? { flipVertical: true } : {})
    }
    if (flipHorizontal) target.flipOriginX = signX < 0 ? target.x + target.width / 2 : Number.isFinite(start.flipOriginX) && start.flipOriginX! <= startCenter.x ? target.x : target.x + target.width
    if (flipVertical) target.flipOriginY = signY < 0 ? target.y + target.height / 2 : Number.isFinite(start.flipOriginY) && start.flipOriginY! <= startCenter.y ? target.y : target.y + target.height
    return target
  }
  const localStart: SelectionRect = {
    x: 0,
    y: 0,
    width: start.width,
    height: start.height,
    ...(start.flipHorizontal
      ? {
          flipHorizontal: true,
          flipOriginX: Number.isFinite(start.flipOriginX) && start.flipOriginX! <= start.x + start.width / 2 ? 0 : start.width
        }
      : {}),
    ...(start.flipVertical
      ? {
          flipVertical: true,
          flipOriginY: Number.isFinite(start.flipOriginY) && start.flipOriginY! <= start.y + start.height / 2 ? 0 : start.height
        }
      : {})
  }
  const resized = resizeSelectionBounds(localStart, { x: handlePoint.x + localDelta.x, y: handlePoint.y + localDelta.y }, handle, { width: Number.POSITIVE_INFINITY, height: Number.POSITIVE_INFINITY }, proportional, integerScale, fromCenter)
  const localCenterShift = {
    x: resized.x + resized.width / 2 - start.width / 2,
    y: resized.y + resized.height / 2 - start.height / 2
  }
  const center = {
    x: start.x + start.width / 2 + localCenterShift.x * cosine - localCenterShift.y * sine,
    y: start.y + start.height / 2 + localCenterShift.x * sine + localCenterShift.y * cosine
  }
  const target: SelectionRect = {
    x: center.x - resized.width / 2,
    y: center.y - resized.height / 2,
    width: resized.width,
    height: resized.height,
    ...(resized.flipHorizontal ? { flipHorizontal: true } : {}),
    ...(resized.flipVertical ? { flipVertical: true } : {})
  }
  if (resized.flipHorizontal) target.flipOriginX = resized.flipOriginX! <= resized.x + resized.width / 2 ? target.x : target.x + target.width
  if (resized.flipVertical) target.flipOriginY = resized.flipOriginY! <= resized.y + resized.height / 2 ? target.y : target.y + target.height
  return target
}
