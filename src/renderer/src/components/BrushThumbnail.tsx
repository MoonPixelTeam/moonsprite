import { useEffect, useRef } from 'react'
import type { ImageBrush } from '@shared/types'
import { unpackColor } from '@/core/raster'
import type { PixelSource } from './pixel-source'

export function BrushThumbnail({ source, className = '' }: { source: PixelSource<ImageBrush>; className?: string }) {
  const brush = source()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const context = canvasRef.current?.getContext('2d')
    if (!context) return
    const image = context.createImageData(brush.width, brush.height)
    const colors = brush.paintColors ?? brush.colors
    for (let index = 0; index < brush.width * brush.height; index += 1) {
      const offset = index * 4
      if (colors?.length === brush.width * brush.height) {
        const color = unpackColor(colors[index] ?? 0)
        image.data[offset] = color.r
        image.data[offset + 1] = color.g
        image.data[offset + 2] = color.b
        image.data[offset + 3] = color.a
      } else {
        const coverage = brush.coverage[index] ?? 0
        image.data[offset] = 255
        image.data[offset + 1] = 255
        image.data[offset + 2] = 255
        image.data[offset + 3] = coverage
      }
    }
    context.putImageData(image, 0, 0)
  }, [brush])
  return <canvas ref={canvasRef} className={`brush-thumbnail ${className}`.trim()} width={brush.width} height={brush.height} aria-hidden="true" />
}
