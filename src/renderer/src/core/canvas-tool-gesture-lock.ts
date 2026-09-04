const activePointers = new Set<number>()

export const beginCanvasToolGesture = (pointerId: number): void => {
  activePointers.add(pointerId)
}

export const endCanvasToolGesture = (pointerId: number): void => {
  activePointers.delete(pointerId)
}

export const clearCanvasToolGestures = (): void => {
  activePointers.clear()
}

export const isCanvasToolGestureLocked = (): boolean => activePointers.size > 0
