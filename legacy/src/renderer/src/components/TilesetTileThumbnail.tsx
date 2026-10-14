import { useEffect, useRef } from 'react'
import type { Tileset } from '@shared/types-tiles'
import { getRasterContentRevision } from '@/core/document-model'
import { readTilesetTilePixels } from '@/core/tilemap'

export function TilesetTileThumbnail({ tileset, tileId, previewPixels, className, renderRevision }: { tileset: Tileset; tileId: string; previewPixels?: Uint8ClampedArray; className?: string; renderRevision?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const revision = getRasterContentRevision(tileset.pixels)

  useEffect(() => {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    const pixels = previewPixels ?? readTilesetTilePixels(tileset, tileId)
    if (!canvas || !context || !pixels) return
    const image = context.createImageData(tileset.tileWidth, tileset.tileHeight)
    image.data.set(pixels)
    context.putImageData(image, 0, 0)
  }, [previewPixels, revision, renderRevision, tileId, tileset])

  return <canvas
    ref={canvasRef}
    className={className}
    width={tileset.tileWidth}
    height={tileset.tileHeight}
    style={tileset.tileWidth >= tileset.tileHeight ? { width: '100%', height: 'auto' } : { width: 'auto', height: '100%' }}
    aria-hidden="true"
  />
}
