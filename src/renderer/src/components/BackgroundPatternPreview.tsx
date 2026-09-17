import { useEffect, useRef } from 'react'
import type { BackgroundPatternId } from '@shared/types-layer'
import { renderBackgroundPatternRgba, renderBackgroundTileRgba, type BackgroundPatternTile } from '@/core/background-patterns'

/** Preview at 100%: a larger card reveals more repeats instead of stretching the tile. */
export function BackgroundPatternPreview({ source }: { source: BackgroundPatternId | BackgroundPatternTile }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current
    const host = canvas?.parentElement
    const context = canvas?.getContext('2d')
    if (!canvas || !host || !context) return
    let width = 0, height = 0
    const draw = (): void => {
      const nextWidth = host.clientWidth, nextHeight = host.clientHeight
      if (nextWidth < 1 || nextHeight < 1 || (width === nextWidth && height === nextHeight)) return
      width = nextWidth; height = nextHeight
      canvas.width = width; canvas.height = height
      const image = context.createImageData(width, height)
      image.data.set(typeof source === 'string'
        ? renderBackgroundPatternRgba(width, height, source)
        : renderBackgroundTileRgba(width, height, source))
      context.putImageData(image, 0, 0)
    }
    draw()
    const observer = new ResizeObserver(draw)
    observer.observe(host)
    return () => observer.disconnect()
  }, [source])
  return <canvas ref={ref} width={64} height={64} aria-hidden="true" />
}
