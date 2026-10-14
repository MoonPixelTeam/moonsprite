import { useEffect, useRef } from 'react'
import { BRUSH_SPEED_STOP_MS, PointerPressureAdapter, coalescedPointerClientPoints, updateBrushSpeedTracking, type BrushSpeedState } from '@/core/canvas-input'
import { clearBrushDynamicsTelemetry, publishBrushDynamicsTelemetry } from '@/core/brush-dynamics-telemetry'
import { calibrateBrushPressure } from '@/core/pressure'

export function BrushDynamicsTelemetryCapture({ documentId }: { documentId: string | null }) {
  const documentIdRef = useRef(documentId)
  const speedRef = useRef<BrushSpeedState | undefined>(undefined)
  const pressureAdapterRef = useRef(new PointerPressureAdapter())
  const pointerRef = useRef<{ pressure: number | null; pointerType: string | null }>({ pressure: null, pointerType: null })
  const stopTimerRef = useRef<number | null>(null)

  useEffect(() => {
    documentIdRef.current = documentId
    speedRef.current = undefined
    pressureAdapterRef.current.reset()
    pointerRef.current = { pressure: null, pointerType: null }
    if (stopTimerRef.current !== null) {
      window.clearTimeout(stopTimerRef.current)
      stopTimerRef.current = null
    }
    if (documentId) publishBrushDynamicsTelemetry({ documentId, pressure: null, speed: 0, pointerType: null, active: false })
    else clearBrushDynamicsTelemetry()
  }, [documentId])

  useEffect(() => {
    const clearStopTimer = (): void => {
      if (stopTimerRef.current === null) return
      window.clearTimeout(stopTimerRef.current)
      stopTimerRef.current = null
    }
    const publishInactive = (): void => {
      clearStopTimer()
      speedRef.current = undefined
      pressureAdapterRef.current.reset()
      pointerRef.current = { pressure: null, pointerType: null }
      const activeDocumentId = documentIdRef.current
      if (!activeDocumentId) {
        clearBrushDynamicsTelemetry()
        return
      }
      publishBrushDynamicsTelemetry({ documentId: activeDocumentId, pressure: null, speed: 0, pointerType: null, active: false })
    }
    const scheduleStoppedSpeed = (): void => {
      clearStopTimer()
      stopTimerRef.current = window.setTimeout(() => {
        stopTimerRef.current = null
        const activeDocumentId = documentIdRef.current
        if (!activeDocumentId) return
        if (speedRef.current) speedRef.current = { ...speedRef.current, speed: 0 }
        const latest = pointerRef.current
        publishBrushDynamicsTelemetry({ documentId: activeDocumentId, pressure: latest.pressure, speed: 0, pointerType: latest.pointerType, active: true })
      }, BRUSH_SPEED_STOP_MS)
    }
    const publishSample = (pointerId: number, buttons: number, sample: { clientX: number; clientY: number; timeStamp?: number; pressure?: number; pointerType?: string }): void => {
      const activeDocumentId = documentIdRef.current
      if (!activeDocumentId) return
      const tracked = updateBrushSpeedTracking(speedRef.current, sample)
      speedRef.current = tracked.state
      const adapted = pressureAdapterRef.current.adapt({
        pointerId,
        pointerType: sample.pointerType ?? pointerRef.current.pointerType ?? 'mouse',
        pressure: sample.pressure,
        buttons
      })
      const pressure = adapted.pressureAvailable ? calibrateBrushPressure(adapted.pressure) : null
      pointerRef.current = { pressure, pointerType: adapted.pointerType }
      publishBrushDynamicsTelemetry({ documentId: activeDocumentId, pressure, speed: tracked.speed, pointerType: adapted.pointerType, active: true })
      scheduleStoppedSpeed()
    }
    const pointerDown = (event: PointerEvent): void => {
      speedRef.current = undefined
      pressureAdapterRef.current.release(event.pointerId)
      for (const sample of coalescedPointerClientPoints(event)) publishSample(event.pointerId, event.buttons, { ...sample, pointerType: sample.pointerType ?? event.pointerType })
    }
    const pointerMove = (event: PointerEvent): void => {
      for (const sample of coalescedPointerClientPoints(event)) publishSample(event.pointerId, event.buttons, { ...sample, pointerType: sample.pointerType ?? event.pointerType })
    }
    const pointerUp = (event: PointerEvent): void => {
      clearStopTimer()
      if (speedRef.current) speedRef.current = { ...speedRef.current, speed: 0 }
      const adapted = pressureAdapterRef.current.adapt(event)
      const pointerType = adapted.pointerType || null
      const pressure = adapted.pressureAvailable ? 0 : null
      pressureAdapterRef.current.release(event.pointerId)
      const activeDocumentId = documentIdRef.current
      if (!activeDocumentId) return
      pointerRef.current = { pressure, pointerType }
      publishBrushDynamicsTelemetry({ documentId: activeDocumentId, pressure, speed: 0, pointerType, active: true })
    }
    const pointerOut = (event: PointerEvent): void => {
      if (event.relatedTarget === null) publishInactive()
    }
    const visibilityChange = (): void => {
      if (document.visibilityState === 'hidden') publishInactive()
    }

    window.addEventListener('pointerdown', pointerDown, true)
    window.addEventListener('pointermove', pointerMove, true)
    window.addEventListener('pointerup', pointerUp, true)
    const pointerCancel = (event: PointerEvent): void => {
      pressureAdapterRef.current.release(event.pointerId)
      publishInactive()
    }
    window.addEventListener('pointercancel', pointerCancel, true)
    window.addEventListener('pointerout', pointerOut, true)
    window.addEventListener('blur', publishInactive)
    document.addEventListener('visibilitychange', visibilityChange)
    return () => {
      window.removeEventListener('pointerdown', pointerDown, true)
      window.removeEventListener('pointermove', pointerMove, true)
      window.removeEventListener('pointerup', pointerUp, true)
      window.removeEventListener('pointercancel', pointerCancel, true)
      window.removeEventListener('pointerout', pointerOut, true)
      window.removeEventListener('blur', publishInactive)
      document.removeEventListener('visibilitychange', visibilityChange)
      clearStopTimer()
      pressureAdapterRef.current.reset()
      clearBrushDynamicsTelemetry()
    }
  }, [])

  return null
}
