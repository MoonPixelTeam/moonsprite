const scope = globalThis as unknown as { onmessage: ((event: MessageEvent<any>) => void) | null; postMessage: (value: any, transfer?: Transferable[]) => void }
let source = new Uint8ClampedArray(0)
let sourceWidth = 0
let sourceHeight = 0
let sourceOffsetX = 0
let sourceOffsetY = 0
let sourceFormat: 'rgba' | 'indexed' = 'rgba'
let indexedSource = new Uint32Array(0)
let sourcePalette = new Map<number, [number, number, number, number]>()
let runtimeData = new Uint8Array(0)
let runtimeTileOffsets = new Int32Array(0)
let runtimeTileSize = 0

interface CompactFloodResult {
  region: Uint8Array
  width: number
  height: number
  x: number
  y: number
}

const floodCompact = (width: number, height: number, startX: number, startY: number, matches: (index: number) => boolean): CompactFloodResult | null => {
  if (width < 1 || height < 1 || startX < 0 || startY < 0 || startX >= width || startY >= height) return null
  const rowVisited: Array<Uint8Array | undefined> = new Array(height)
  const row = (y: number): Uint8Array => {
    let values = rowVisited[y]
    if (!values) { values = new Uint8Array(width); rowVisited[y] = values }
    return values
  }
  const allowed = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < width && y < height && rowVisited[y]?.[x] !== 1 && matches(y * width + x)
  if (!allowed(startX, startY)) return null
  const queue: Array<{ y: number; left: number; right: number }> = [{ y: startY, left: startX, right: startX + 1 }]
  const spans: Array<{ y: number; left: number; right: number }> = []
  let minX = startX, maxX = startX, minY = startY, maxY = startY
  const enqueueRuns = (y: number, from: number, to: number): void => {
    if (y < 0 || y >= height) return
    let x = Math.max(0, from)
    const end = Math.min(width, to)
    while (x < end) {
      if (!allowed(x, y)) { x += 1; continue }
      const left = x
      while (x < end && allowed(x, y)) x += 1
      queue.push({ y, left, right: x })
    }
  }
  while (queue.length > 0) {
    const seed = queue.pop()!
    const y = seed.y
    if (!allowed(seed.left, y)) continue
    let left = seed.left
    let right = seed.right
    while (left > 0 && allowed(left - 1, y)) left -= 1
    while (right < width && allowed(right, y)) right += 1
    row(y).fill(1, left, right)
    spans.push({ y, left, right })
    minX = Math.min(minX, left); maxX = Math.max(maxX, right - 1)
    minY = Math.min(minY, y); maxY = Math.max(maxY, y)
    enqueueRuns(y - 1, left, right)
    enqueueRuns(y + 1, left, right)
  }
  const resultWidth = maxX - minX + 1
  const resultHeight = maxY - minY + 1
  const region = new Uint8Array(resultWidth * resultHeight)
  for (const span of spans) region.fill(1, (span.y - minY) * resultWidth + span.left - minX, (span.y - minY) * resultWidth + span.right - minX)
  return { region, width: resultWidth, height: resultHeight, x: minX, y: minY }
}

scope.onmessage = (event) => {
  if (event.data.type === 'initialize') {
    source = new Uint8ClampedArray(event.data.pixels)
    sourceWidth = event.data.width
    sourceHeight = event.data.height
    sourceOffsetX = event.data.offsetX
    sourceOffsetY = event.data.offsetY
    sourceFormat = event.data.format
    indexedSource = sourceFormat === 'indexed' ? new Uint32Array(event.data.pixels) : new Uint32Array(0)
    sourcePalette = new Map((event.data.palette ?? []).map((entry: any) => [entry.id, [entry.color.r, entry.color.g, entry.color.b, entry.color.a]]))
    runtimeData = event.data.runtime?.data ? new Uint8Array(event.data.runtime.data) : new Uint8Array(0)
    runtimeTileOffsets = event.data.runtime?.tileOffsets ? new Int32Array(event.data.runtime.tileOffsets) : new Int32Array(0)
    runtimeTileSize = event.data.runtime?.tileSize ?? 0
    return
  }
  const { id, width, height, x, y, tolerance = 0 } = event.data as { id: number; width: number; height: number; x: number; y: number; tolerance?: number }
  if (source.length === 0 && runtimeData.length === 0) { scope.postMessage({ id, selection: null }); return }
  const readPacked = (px: number, py: number): number => {
    const lx = px - sourceOffsetX, ly = py - sourceOffsetY
    if (lx < 0 || ly < 0 || lx >= sourceWidth || ly >= sourceHeight) return 0
    if (runtimeData.length > 0 && runtimeTileSize > 0) {
      const tileColumns = Math.ceil(sourceWidth / runtimeTileSize)
      const tileX = Math.floor(lx / runtimeTileSize)
      const tileY = Math.floor(ly / runtimeTileSize)
      const encodedOffset = runtimeTileOffsets[tileY * tileColumns + tileX]
      if (encodedOffset === 0) return 0
      const tileWidth = Math.min(runtimeTileSize, sourceWidth - tileX * runtimeTileSize)
      const offset = encodedOffset - 1 + ((ly % runtimeTileSize) * tileWidth + lx % runtimeTileSize) * 4
      return (runtimeData[offset] | (runtimeData[offset + 1] << 8) | (runtimeData[offset + 2] << 16) | (runtimeData[offset + 3] << 24)) >>> 0
    }
    if (sourceFormat === 'indexed') {
      const color = sourcePalette.get(indexedSource[ly * sourceWidth + lx])
      return color ? (color[0] | (color[1] << 8) | (color[2] << 16) | (color[3] << 24)) >>> 0 : 0
    }
    const o = (ly * sourceWidth + lx) * 4
    return (source[o] | (source[o + 1] << 8) | (source[o + 2] << 16) | (source[o + 3] << 24)) >>> 0
  }
  const target = readPacked(x, y)
  const matches = (i: number): boolean => {
    const color = readPacked(i % width, Math.floor(i / width))
    return Math.max(Math.abs((color & 0xff) - (target & 0xff)), Math.abs(((color >>> 8) & 0xff) - ((target >>> 8) & 0xff)), Math.abs(((color >>> 16) & 0xff) - ((target >>> 16) & 0xff)), Math.abs((color >>> 24) - (target >>> 24))) <= tolerance
  }
  const targetAlpha = target >>> 24
  const layerLeft = Math.max(0, sourceOffsetX)
  const layerTop = Math.max(0, sourceOffsetY)
  const layerRight = Math.min(width, sourceOffsetX + sourceWidth)
  const layerBottom = Math.min(height, sourceOffsetY + sourceHeight)
  const bounded = targetAlpha > tolerance && layerRight > layerLeft && layerBottom > layerTop
  const regionOriginX = bounded ? layerLeft : 0
  const regionOriginY = bounded ? layerTop : 0
  const regionWidth = bounded ? layerRight - layerLeft : width
  const regionHeight = bounded ? layerBottom - layerTop : height
  const local = floodCompact(regionWidth, regionHeight, x - regionOriginX, y - regionOriginY, (index) => {
    const globalX = regionOriginX + index % regionWidth
    const globalY = regionOriginY + Math.floor(index / regionWidth)
    return matches(globalY * width + globalX)
  })
  if (!local) { scope.postMessage({ id, selection: null }); return }
  if (local.width === regionWidth && local.height === regionHeight && local.x === 0 && local.y === 0 && local.region.every((value) => value === 1)) {
    scope.postMessage({ id, selection: { x: regionOriginX, y: regionOriginY, width: regionWidth, height: regionHeight } })
    return
  }
  const selection = { x: regionOriginX + local.x, y: regionOriginY + local.y, width: local.width, height: local.height, mask: local.region }
  scope.postMessage({ id, selection }, [local.region.buffer])
}
