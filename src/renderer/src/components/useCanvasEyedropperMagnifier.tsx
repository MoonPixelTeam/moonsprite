import type { ViewState } from '@shared/types-view'
import { useEffect, useRef, useState } from 'react'
import type { RgbaColor } from '@shared/types-color'
import { renderLayerMaskRegion } from '@/core/document-model'
import { compositeRegion } from '@/core/document-composite'
import { blendOver, colorEquals as sameRgbaColor } from '@/core/raster'
import { useWorkspace, type DocumentSession } from '@/store/workspace'
import { activeLayerMask } from '@/store/workspace-session'
import { loadEditorPreferences, type CheckerboardPreferences, type EyedropperMagnifierStyle } from '@/core/file-preferences'
import { colorLuminance, transparencyColorAt } from '@/core/canvas-visuals'
import { publishCanvasColorSample } from '@/components/color-sampling-events'
import { eyedropperMagnifierContentPoint, eyedropperMagnifierPixelScale, eyedropperMagnifierPosition, eyedropperMagnifierViewTransform } from '@/core/eyedropper-magnifier'
import { EyedropperMagnifier } from '@/components/EyedropperMagnifier'
import { EYEDROPPER_MAGNIFIER_BASE_SIZE, EYEDROPPER_MAGNIFIER_VIEWPORT_SIZE } from './canvas-stage-helpers'

interface Options {
  documentId: string
  stageBounds(): DOMRect
  localContinuousPointAt(x: number, y: number): {x: number; y: number} | null
  readView(): Pick<ViewState, 'zoom' | 'rotation' | 'mirrored' | 'mirroredVertical'>
  checkerboard: CheckerboardPreferences
}

/** Owns lens DOM, sampling cache, preferences and deferred color submission. */
export function useCanvasEyedropperMagnifier(options: Options) {
  const optionsRef = useRef(options)
  optionsRef.current = options
  const eyedropperMagnifierRef = useRef<HTMLDivElement>(null)
  const eyedropperMagnifierCanvasRef = useRef<HTMLCanvasElement>(null)
  const eyedropperMagnifierSourceRef = useRef<OffscreenCanvas | null>(null)
  const eyedropperMagnifierSampleRef = useRef<{ document: DocumentSession['document']; revision: number; mask: ReturnType<typeof activeLayerMask>; startX: number; startY: number; pixels: Uint8ClampedArray } | null>(null)
  const eyedropperMagnifierFrameRef = useRef<number | null>(null)
  const eyedropperMagnifierPendingRef = useRef<{ clientX: number; clientY: number; sampled: RgbaColor } | null>(null)
  const eyedropperPendingSampleColorRef = useRef<{ color: RgbaColor; secondary: boolean } | null>(null)
  const eyedropperMagnifierSampledMaskRef = useRef<HTMLSpanElement>(null)
  const eyedropperMagnifierPreviousMaskRef = useRef<HTMLSpanElement>(null)
  const eyedropperPointerDarkRef = useRef<HTMLImageElement>(null)
  const eyedropperPointerLightRef = useRef<HTMLImageElement>(null)
  const eyedropperOriginalColorRef = useRef<RgbaColor | null>(null)
  const [eyedropperMagnifierEnabled, setEyedropperMagnifierEnabled] = useState(() => loadEditorPreferences().eyedropperMagnifierEnabled)
  const [eyedropperMagnifierStyle, setEyedropperMagnifierStyle] = useState<EyedropperMagnifierStyle>(() => loadEditorPreferences().eyedropperMagnifierStyle)
  const [eyedropperMagnifierSize, setEyedropperMagnifierSize] = useState(() => loadEditorPreferences().eyedropperMagnifierSize)
  const [eyedropperMagnifierDistortionEnabled, setEyedropperMagnifierDistortionEnabled] = useState(() => loadEditorPreferences().eyedropperMagnifierDistortionEnabled)
  const hideEyedropperMagnifier = (): void => {
    if (eyedropperMagnifierFrameRef.current !== null) {
      window.cancelAnimationFrame(eyedropperMagnifierFrameRef.current)
      eyedropperMagnifierFrameRef.current = null
    }
    eyedropperMagnifierPendingRef.current = null
    if (eyedropperMagnifierRef.current) eyedropperMagnifierRef.current.hidden = true
  }

  const queueEyedropperSampleColor = (sampled: RgbaColor, secondary: boolean): void => {
    const pending = eyedropperPendingSampleColorRef.current
    if (pending && pending.secondary === secondary && sameRgbaColor(pending.color, sampled)) return
    eyedropperPendingSampleColorRef.current = { color: { ...sampled }, secondary }
  }

  const flushEyedropperSampleColor = (): void => {
    const pending = eyedropperPendingSampleColorRef.current
    if (!pending) return
    eyedropperPendingSampleColorRef.current = null
    const liveSamplingSession = useWorkspace.getState().sessions.find((item) => item.document.id === optionsRef.current.documentId)
    if (!liveSamplingSession) return
    const previousSampledColor = pending.secondary ? liveSamplingSession.secondaryColor : liveSamplingSession.primaryColor
    if (sameRgbaColor(previousSampledColor, pending.color)) return
    const workspace = useWorkspace.getState()
    if (pending.secondary) workspace.setSecondaryColor(pending.color)
    else workspace.setPrimaryColor(pending.color)
    publishCanvasColorSample(pending.color, pending.secondary)
  }

  const renderEyedropperMagnifier = (clientX: number, clientY: number, sampled: RgbaColor): void => {
    const { documentId, stageBounds, localContinuousPointAt, readView, checkerboard } = optionsRef.current
    const session = useWorkspace.getState().sessions.find(item => item.document.id === documentId)
    if (!session) return
    const view = readView()
    const magnifier = eyedropperMagnifierRef.current
    const magnifierCanvas = eyedropperMagnifierCanvasRef.current
    if (!eyedropperMagnifierEnabled || !magnifier || !magnifierCanvas) return
    magnifier.dataset.style = eyedropperMagnifierStyle
    const previousColor = eyedropperOriginalColorRef.current
    const colorCss = (color: RgbaColor): string => `rgba(${color.r}, ${color.g}, ${color.b}, ${color.a / 255})`
    const sampledMask = eyedropperMagnifierSampledMaskRef.current
    const previousMask = eyedropperMagnifierPreviousMaskRef.current
    if (sampledMask) sampledMask.style.color = colorCss(sampled)
    if (previousMask && previousColor) previousMask.style.color = colorCss(previousColor)
    magnifier.style.setProperty('--eyedropper-sampled-color', colorCss(sampled))
    magnifier.style.setProperty('--eyedropper-previous-color', colorCss(previousColor ?? sampled))
    const bounds = stageBounds()
    const localX = clientX - bounds.left
    const localY = clientY - bounds.top
    if (localX < 0 || localY < 0 || localX > bounds.width || localY > bounds.height) {
      hideEyedropperMagnifier()
      return
    }
    const magnifierWidth = EYEDROPPER_MAGNIFIER_BASE_SIZE * eyedropperMagnifierSize
    const { left, top } = eyedropperMagnifierPosition({ x: localX, y: localY }, bounds, magnifierWidth)
    magnifier.style.left = `${left}px`
    magnifier.style.top = `${top}px`
    const context = magnifierCanvas.getContext('2d')
    if (!context) return
    const dpr = window.devicePixelRatio || 1
    const size = EYEDROPPER_MAGNIFIER_VIEWPORT_SIZE
    const sourcePixelCount = 25
    const pixelScale = eyedropperMagnifierPixelScale(view.zoom, size)
    const point = localContinuousPointAt(clientX, clientY)
    if (!point) { hideEyedropperMagnifier(); return }
    const centerX = Math.floor(point.x)
    const centerY = Math.floor(point.y)
    const startX = centerX - Math.floor(sourcePixelCount / 2)
    const startY = centerY - Math.floor(sourcePixelCount / 2)
    const mask = activeLayerMask(session)
    const cachedSample = eyedropperMagnifierSampleRef.current
    const sampleCacheMatches = cachedSample
      && cachedSample.document === session.document
      && cachedSample.revision === session.revision
      && cachedSample.mask === mask
      && cachedSample.startX === startX
      && cachedSample.startY === startY
    const pixels = sampleCacheMatches
      ? cachedSample.pixels
      : mask
        ? renderLayerMaskRegion(mask, startX, startY, sourcePixelCount, sourcePixelCount)
        : compositeRegion(session.document, startX, startY, sourcePixelCount, sourcePixelCount)
    if (!sampleCacheMatches) eyedropperMagnifierSampleRef.current = { document: session.document, revision: session.revision, mask, startX, startY, pixels }
    magnifierCanvas.width = size * dpr
    magnifierCanvas.height = size * dpr
    context.setTransform(dpr, 0, 0, dpr, 0, 0)
    context.clearRect(0, 0, size, size)
    context.imageSmoothingEnabled = false
    let sourceCanvas = eyedropperMagnifierSourceRef.current
    if (!sourceCanvas || sourceCanvas.width !== sourcePixelCount || sourceCanvas.height !== sourcePixelCount) {
      sourceCanvas = new OffscreenCanvas(sourcePixelCount, sourcePixelCount)
      eyedropperMagnifierSourceRef.current = sourceCanvas
    }
    const sourceContext = sourceCanvas.getContext('2d')
    if (!sourceContext) return
    const displayPixels = new Uint8ClampedArray(pixels.length)
    for (let y = 0; y < sourcePixelCount; y += 1) for (let x = 0; x < sourcePixelCount; x += 1) {
      const offset = (y * sourcePixelCount + x) * 4
      const color = { r: pixels[offset], g: pixels[offset + 1], b: pixels[offset + 2], a: pixels[offset + 3] }
      const displayColor = color.a < 255 ? blendOver(transparencyColorAt(startX + x, startY + y, checkerboard), color) : color
      displayPixels[offset] = displayColor.r
      displayPixels[offset + 1] = displayColor.g
      displayPixels[offset + 2] = displayColor.b
      displayPixels[offset + 3] = displayColor.a
    }
    sourceContext.putImageData(new ImageData(displayPixels as Uint8ClampedArray<ArrayBuffer>, sourcePixelCount, sourcePixelCount), 0, 0)
    // Keep the sampled point fixed under the center pointer while the pixel
    // field follows sub-pixel pointer movement continuously. Drawing one
    // nearest-neighbour source bitmap avoids antialiased gaps between blocks.
    const sourceLeft = size / 2 + (startX - point.x) * pixelScale
    const sourceTop = size / 2 + (startY - point.y) * pixelScale
    const magnifierCenter = { x: size / 2, y: size / 2 }
    const magnifierTransform = eyedropperMagnifierViewTransform(
      view.rotation,
      view.mirrored,
      view.mirroredVertical
    )
    const drawTransformedContent = (draw: () => void): void => {
      const hasTransform = Math.abs(magnifierTransform.rotationRadians) > 0.000001
        || magnifierTransform.mirrored
        || magnifierTransform.mirroredVertical
      if (!hasTransform) {
        draw()
        return
      }
      context.save()
      context.translate(magnifierCenter.x, magnifierCenter.y)
      context.rotate(magnifierTransform.rotationRadians)
      context.scale(magnifierTransform.mirrored ? -1 : 1, magnifierTransform.mirroredVertical ? -1 : 1)
      context.translate(-magnifierCenter.x, -magnifierCenter.y)
      draw()
      context.restore()
    }
    if (!eyedropperMagnifierDistortionEnabled) {
      drawTransformedContent(() => context.drawImage(sourceCanvas, sourceLeft, sourceTop, sourcePixelCount * pixelScale, sourcePixelCount * pixelScale))
    } else {
      const outputWidth = magnifierCanvas.width
      const outputHeight = magnifierCanvas.height
      const distortedPixels = new Uint8ClampedArray(outputWidth * outputHeight * 4)
      const outputCenter = size / 2
      // The 64 px material is displayed at an exact 4x scale. Its inner
      // opening has a 25 px radius, so the lens edge is exactly 100 CSS px.
      const outputRadius = 100
      for (let y = 0; y < outputHeight; y += 1) for (let x = 0; x < outputWidth; x += 1) {
        const outputX = (x + 0.5) / dpr
        const outputY = (y + 0.5) / dpr
        const normalizedX = (outputX - outputCenter) / outputRadius
        const normalizedY = (outputY - outputCenter) / outputRadius
        const rawRadius = Math.hypot(normalizedX, normalizedY)
        const radius = Math.min(1, rawRadius)
        const outputOffset = (y * outputWidth + x) * 4
        if (rawRadius <= 0.82) {
          const contentPoint = eyedropperMagnifierContentPoint({ x: outputX, y: outputY }, magnifierCenter, magnifierTransform)
          const directSourceX = Math.floor((contentPoint.x - sourceLeft) / pixelScale)
          const directSourceY = Math.floor((contentPoint.y - sourceTop) / pixelScale)
          if (directSourceX < 0 || directSourceY < 0 || directSourceX >= sourcePixelCount || directSourceY >= sourcePixelCount) continue
          const directOffset = (directSourceY * sourcePixelCount + directSourceX) * 4
          distortedPixels[outputOffset] = displayPixels[directOffset]
          distortedPixels[outputOffset + 1] = displayPixels[directOffset + 1]
          distortedPixels[outputOffset + 2] = displayPixels[directOffset + 2]
          distortedPixels[outputOffset + 3] = displayPixels[directOffset + 3]
          continue
        }
        // Preserve most of the lens as an exact hard-edge magnification. Optical
        // distortion, dispersion and diffuse light are restricted to the rim.
        const edgeProgress = Math.max(0, Math.min(1, (radius - 0.82) / 0.18))
        const edgeCurve = edgeProgress * edgeProgress * (3 - 2 * edgeProgress)
        const lensFactor = 1 + edgeCurve * 0.14
        const mappedX = outputCenter + (outputX - outputCenter) * lensFactor
        const mappedY = outputCenter + (outputY - outputCenter) * lensFactor
        const contentPoint = eyedropperMagnifierContentPoint({ x: mappedX, y: mappedY }, magnifierCenter, magnifierTransform)
        const sourceX = Math.floor((contentPoint.x - sourceLeft) / pixelScale)
        const sourceY = Math.floor((contentPoint.y - sourceTop) / pixelScale)
        if (sourceX < 0 || sourceY < 0 || sourceX >= sourcePixelCount || sourceY >= sourcePixelCount) continue
        const sourceOffset = (sourceY * sourcePixelCount + sourceX) * 4
        let red = displayPixels[sourceOffset]
        let green = displayPixels[sourceOffset + 1]
        let blue = displayPixels[sourceOffset + 2]
        if (edgeCurve > 0 && radius > 0) {
          const radialX = normalizedX / radius
          const radialY = normalizedY / radius
          const scatterDistance = edgeCurve * 6
          const redPoint = eyedropperMagnifierContentPoint({ x: mappedX + radialX * scatterDistance, y: mappedY + radialY * scatterDistance }, magnifierCenter, magnifierTransform)
          const bluePoint = eyedropperMagnifierContentPoint({ x: mappedX - radialX * scatterDistance, y: mappedY - radialY * scatterDistance }, magnifierCenter, magnifierTransform)
          const redX = Math.floor((redPoint.x - sourceLeft) / pixelScale)
          const redY = Math.floor((redPoint.y - sourceTop) / pixelScale)
          const blueX = Math.floor((bluePoint.x - sourceLeft) / pixelScale)
          const blueY = Math.floor((bluePoint.y - sourceTop) / pixelScale)
          if (redX >= 0 && redY >= 0 && redX < sourcePixelCount && redY < sourcePixelCount) red = displayPixels[(redY * sourcePixelCount + redX) * 4]
          if (blueX >= 0 && blueY >= 0 && blueX < sourcePixelCount && blueY < sourcePixelCount) blue = displayPixels[(blueY * sourcePixelCount + blueX) * 4 + 2]
          // Add a restrained inner-rim shadow. It starts outside the untouched
          // center and is slightly heavier toward the lower-right edge.
          const directionalShade = Math.max(0, (radialX + radialY) * Math.SQRT1_2)
          const lowerEdgeShade = Math.max(0, radialY)
          const rimShadow = edgeCurve * (0.028 + directionalShade * 0.09 + lowerEdgeShade * 0.035)
          red *= 1 - rimShadow
          green *= 1 - rimShadow
          blue *= 1 - rimShadow
        }
        distortedPixels[outputOffset] = red
        distortedPixels[outputOffset + 1] = green
        distortedPixels[outputOffset + 2] = blue
        distortedPixels[outputOffset + 3] = displayPixels[sourceOffset + 3]
      }
      context.putImageData(new ImageData(distortedPixels as Uint8ClampedArray<ArrayBuffer>, outputWidth, outputHeight), 0, 0)
      // Composite the untouched center with the same scale as the rim sampler.
      // Using a fixed 17-pixel crop here made the lens shrink once the canvas
      // itself was zoomed beyond the old baseline magnification.
      context.save()
      context.beginPath()
      context.arc(outputCenter, outputCenter, 82, 0, Math.PI * 2)
      context.clip()
      drawTransformedContent(() => context.drawImage(sourceCanvas, sourceLeft, sourceTop, sourcePixelCount * pixelScale, sourcePixelCount * pixelScale))
      context.restore()
    }
    const pointerImage = colorLuminance(sampled) < 145 ? eyedropperPointerLightRef.current : eyedropperPointerDarkRef.current
    if (pointerImage?.complete && pointerImage.naturalWidth > 0) {
      context.globalAlpha = .5
      context.drawImage(pointerImage, Math.round(size / 2 - pointerImage.naturalWidth / 2), Math.round(size / 2 - pointerImage.naturalHeight / 2))
      context.globalAlpha = 1
    } else {
      context.fillStyle = colorLuminance(sampled) < 145 ? 'rgba(255, 255, 255, .5)' : 'rgba(0, 0, 0, .5)'
      context.fillRect(Math.floor(size / 2), Math.floor(size / 2) - 5, 1, 11)
      context.fillRect(Math.floor(size / 2) - 5, Math.floor(size / 2), 11, 1)
    }
    magnifier.hidden = false
  }

  // Pointer events can arrive faster than the lens can rasterize its 204px
  // viewport (especially with distortion enabled). Coalesce pending samples
  // to one render per animation frame so input handling never queues a long
  // synchronous paint backlog.
  const updateEyedropperMagnifier = (clientX: number, clientY: number, sampled: RgbaColor): void => {
    eyedropperMagnifierPendingRef.current = { clientX, clientY, sampled: { ...sampled } }
    if (eyedropperMagnifierFrameRef.current !== null) return
    eyedropperMagnifierFrameRef.current = window.requestAnimationFrame(() => {
      eyedropperMagnifierFrameRef.current = null
      flushEyedropperSampleColor()
      const pending = eyedropperMagnifierPendingRef.current
      eyedropperMagnifierPendingRef.current = null
      if (pending) renderLatestRef.current(pending.clientX, pending.clientY, pending.sampled)
    })
  }
  const renderLatestRef = useRef(renderEyedropperMagnifier)
  renderLatestRef.current = renderEyedropperMagnifier
  useEffect(() => {
    const sync = (): void => {
      const preferences = loadEditorPreferences()
      setEyedropperMagnifierEnabled(preferences.eyedropperMagnifierEnabled)
      setEyedropperMagnifierStyle(preferences.eyedropperMagnifierStyle)
      setEyedropperMagnifierSize(preferences.eyedropperMagnifierSize)
      setEyedropperMagnifierDistortionEnabled(preferences.eyedropperMagnifierDistortionEnabled)
      if (!preferences.eyedropperMagnifierEnabled && eyedropperMagnifierRef.current) eyedropperMagnifierRef.current.hidden = true
      if (eyedropperMagnifierRef.current) eyedropperMagnifierRef.current.dataset.style = preferences.eyedropperMagnifierStyle
    }
    window.addEventListener('moonsprite:preferences-changed', sync)
    return () => window.removeEventListener('moonsprite:preferences-changed', sync)
  }, [])
  useEffect(() => () => {
    hideEyedropperMagnifier()
    eyedropperPendingSampleColorRef.current = null
    eyedropperMagnifierSampleRef.current = null
    eyedropperMagnifierSourceRef.current = null
    eyedropperOriginalColorRef.current = null
  }, [options.documentId])
  return {
    begin: (color: RgbaColor): void => { eyedropperOriginalColorRef.current = { ...color } },
    clearOriginalColor: (): void => { eyedropperOriginalColorRef.current = null },
    cancelPendingColor: (): void => { eyedropperPendingSampleColorRef.current = null },
    hide: hideEyedropperMagnifier,
    queueColor: queueEyedropperSampleColor,
    flushColor: flushEyedropperSampleColor,
    preview: updateEyedropperMagnifier,
    overlay: <>          <EyedropperMagnifier
            magnifierRef={eyedropperMagnifierRef}
            canvasRef={eyedropperMagnifierCanvasRef}
            canvasSize={EYEDROPPER_MAGNIFIER_VIEWPORT_SIZE}
            sampledMaskRef={eyedropperMagnifierSampledMaskRef}
            previousMaskRef={eyedropperMagnifierPreviousMaskRef}
            pointerDarkRef={eyedropperPointerDarkRef}
            pointerLightRef={eyedropperPointerLightRef}
            styleMode={eyedropperMagnifierStyle}
            size={eyedropperMagnifierSize}
            hidden
          /></>
  }
}
